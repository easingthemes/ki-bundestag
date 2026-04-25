import type { AgentAction, AgentResponse, Bill, BillCategory, Election, InterpellationType, MinistryPortfolio, MotionType } from "@ki-bundestag/types";
import { extractJson, stripLeadingPlusInJsonNumbers, stripTrailingCommasInJson } from "./ai-json.js";

export interface ValidationError {
  /** Index of the action in the original actions array */
  actionIndex: number;
  /** The action type that failed (or "unknown" for unrecognized types) */
  actionType: string;
  /** Human-readable error message describing what went wrong */
  message: string;
  /** Whether this error is fixable by the LLM on retry */
  fixable: boolean;
}

export interface ValidationResult {
  /** Actions that passed validation */
  valid: AgentAction[];
  /** Structured errors for actions that failed */
  errors: ValidationError[];
  /** Bills that were auto-filled with abstain (missing votes) */
  autoAbstainBillIds: string[];
}

/**
 * Cycle 4 PR 1 — context required to validate `file_inquiry_committee`.
 *
 * Caller (loop.ts) computes these from current DB state once per day and passes
 * the same bag to every party's `validateActions` call. Computing them once
 * here rather than re-querying inside the validator keeps the parser DB-free
 * and unit-testable.
 *
 * Threshold: combined opposition Fraktion seat share ≥ 25% of `bundestagSize`
 * (real Bundestag rule for triggering an Untersuchungsausschuss).
 */
export interface InquiryValidationContext {
  /** Sum of `seatCount` across all opposition Fraktion-bearing parties. */
  oppositionSeats: number;
  /** Current sim day (for S8 rate-limit check). */
  currentDay: number;
  /** Active inquiry count globally (S9 cap). */
  activeInquiryCount: number;
  /** Active inquiry count for THIS party (R8 per-party cap). */
  partyActiveInquiryCount: number;
  /** Last sim day on which any inquiry was filed (S8 rate-limit). NULL = none yet. */
  lastInquiryFiledDay: number | null;
  /** BUNDESTAG_SIZE — for the 25% threshold calculation. */
  bundestagSize: number;
  /** S9 cap (for the error-message text — passed in to avoid coupling to constants). */
  maxActive: number;
  /** S8 cooldown days (for the error-message text). */
  minDaysBetweenFilings: number;
  /** S6 threshold percent — fraction (e.g. 0.25). */
  thresholdPercent: number;
}

/**
 * Cycle 4 PR 2 — context required to validate `propose_fiscal_emergency`.
 *
 * The justification gate matches the result of `findFiscalEmergencyOpportunity`
 * — if that helper returned null, the agent cannot file. The cooldown gate
 * blocks re-filing while a previous suspension is still in force (since
 * cooldown == suspension duration, a coalition leader can re-file the day
 * after expiry).
 */
export interface FiscalEmergencyValidationContext {
  /** Whether the justification gate is open (a high-severity crisis exists OR
   *  provisionalBudget streak ≥ 30 days). Computed by loop.ts. */
  justified: boolean;
  /** Sim day on which a previous Schuldenbremse-Aussetzung expires (or null). */
  schuldenbremseSuspendedUntilDay: number | null;
  /** Current sim day (for the cooldown check). */
  currentDay: number;
}

const VALID_CATEGORIES: BillCategory[] = [
  "economy", "social", "environment", "immigration",
  "defense", "education", "healthcare", "infrastructure",
];

const VALID_VOTES = ["yes", "no", "abstain"] as const;
const VALID_MOTION_TYPES: MotionType[] = ["motion", "resolution"];
const VALID_INTERPELLATION_TYPES: InterpellationType[] = ["kleine", "große"];
const VALID_MINISTRY_PORTFOLIOS: MinistryPortfolio[] = [
  "finance", "labour", "environment", "interior",
  "defence", "education", "health", "infrastructure",
];

function isBillImpact(value: unknown): boolean {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return false;
  const impact = value as Record<string, unknown>;
  const keys = ["budget", "unemployment", "inflation", "gdpGrowth", "publicSentiment"];
  for (const key of keys) {
    if (impact[key] != null && typeof impact[key] !== "number") {
      return false;
    }
  }
  return true;
}

export function parseAgentResponse(raw: string): AgentResponse {
  const jsonStr = extractJson(raw);

  let parsed: any;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (error) {
    let sanitized = stripLeadingPlusInJsonNumbers(jsonStr);
    sanitized = stripTrailingCommasInJson(sanitized);
    if (sanitized === jsonStr) throw error;
    parsed = JSON.parse(sanitized);
  }

  if (!parsed.actions || !Array.isArray(parsed.actions)) {
    throw new Error("Response must have an 'actions' array");
  }

  return { actions: parsed.actions };
}

export function validateActions(
  actions: AgentAction[],
  votableBills: Bill[],
  partyId: string,
  activeElection?: Election,
  hasFraktion: boolean = true,
  secondReadingBills?: Bill[],
  isOpposition: boolean = false,
  isCoalitionLeader: boolean = false,
  inquiryContext?: InquiryValidationContext,
  fiscalEmergencyContext?: FiscalEmergencyValidationContext,
): ValidationResult {
  const validated: AgentAction[] = [];
  const errors: ValidationError[] = [];
  const autoAbstainBillIds: string[] = [];
  let proposalCount = 0;
  let statementCount = 0;
  let campaignCount = 0;
  let amendmentCount = 0;
  let motionCount = 0;
  let interpellationCount = 0;
  let vertrauensfrageCount = 0;
  let misstrauensvotumCount = 0;
  let constitutionalChallengeCount = 0;
  let inquiryCount = 0;
  let fiscalEmergencyCount = 0;
  const votedBills = new Set<string>();
  const inParliament = hasFraktion;

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    switch (action.type) {
      case "vote": {
        if (!inParliament) {
          console.warn(`[${partyId}] Vote without Fraktion, skipping`);
          errors.push({ actionIndex: i, actionType: "vote", message: "Vote requires Fraktion (party has no seats in parliament)", fixable: false });
          continue;
        }
        if (!action.billId || !VALID_VOTES.includes(action.vote)) {
          console.warn(`[${partyId}] Invalid vote action, skipping`);
          errors.push({ actionIndex: i, actionType: "vote", message: `Invalid vote — billId or vote value missing/invalid (valid votes: ${VALID_VOTES.join(", ")})`, fixable: true });
          continue;
        }
        if (votedBills.has(action.billId)) {
          console.warn(`[${partyId}] Duplicate vote for ${action.billId}, skipping`);
          errors.push({ actionIndex: i, actionType: "vote", message: `Duplicate vote for bill ${action.billId}`, fixable: true });
          continue;
        }
        const billExists = votableBills.some(b => b.id === action.billId);
        if (!billExists) {
          const inSecondReading = secondReadingBills?.some(b => b.id === action.billId);
          if (inSecondReading) {
            console.warn(`[${partyId}] Vote for second-reading bill ${action.billId} (not yet in third reading), skipping`);
            errors.push({ actionIndex: i, actionType: "vote", message: `Bill ${action.billId} is in second reading, not third reading — valid bill IDs for voting: ${votableBills.map(b => b.id).join(", ") || "none"}`, fixable: true });
          } else {
            console.warn(`[${partyId}] Vote for non-existent bill ${action.billId}, skipping`);
            errors.push({ actionIndex: i, actionType: "vote", message: `Bill ${action.billId} does not exist — valid bill IDs for voting: ${votableBills.map(b => b.id).join(", ") || "none"}`, fixable: true });
          }
          continue;
        }
        votedBills.add(action.billId);
        validated.push(action);
        break;
      }

      case "propose_bill": {
        if (!inParliament) {
          console.warn(`[${partyId}] Bill proposal without Fraktion, skipping`);
          errors.push({ actionIndex: i, actionType: "propose_bill", message: "Bill proposals require Fraktion", fixable: false });
          continue;
        }
        if (proposalCount >= 1) {
          console.warn(`[${partyId}] More than 1 proposal, skipping`);
          errors.push({ actionIndex: i, actionType: "propose_bill", message: "Maximum 1 bill proposal per turn", fixable: true });
          continue;
        }
        if (!action.title || !action.description) {
          console.warn(`[${partyId}] Proposal missing title/description, skipping`);
          errors.push({ actionIndex: i, actionType: "propose_bill", message: "Proposal missing required title or description", fixable: false });
          continue;
        }
        if (!VALID_CATEGORIES.includes(action.category)) {
          console.warn(`[${partyId}] Invalid category ${action.category}, defaulting to economy`);
          errors.push({ actionIndex: i, actionType: "propose_bill", message: `Invalid category "${action.category}" — valid: ${VALID_CATEGORIES.join(", ")}. Defaulted to "economy"`, fixable: true });
          action.category = "economy";
        }
        proposalCount++;
        validated.push(action);
        break;
      }

      case "propose_amendment": {
        if (!inParliament) {
          console.warn(`[${partyId}] Amendment without Fraktion, skipping`);
          errors.push({ actionIndex: i, actionType: "propose_amendment", message: "Amendments require Fraktion", fixable: false });
          continue;
        }
        if (amendmentCount >= 1) {
          console.warn(`[${partyId}] More than 1 amendment, skipping`);
          errors.push({ actionIndex: i, actionType: "propose_amendment", message: "Maximum 1 amendment per turn", fixable: true });
          continue;
        }
        if (!action.billId || !action.title || !action.description) {
          console.warn(`[${partyId}] Amendment missing fields, skipping`);
          errors.push({ actionIndex: i, actionType: "propose_amendment", message: "Amendment missing required billId, title, or description", fixable: false });
          continue;
        }
        if (!isBillImpact((action as any).impactChange)) {
          console.warn(`[${partyId}] Amendment missing/invalid impactChange, skipping`);
          errors.push({ actionIndex: i, actionType: "propose_amendment", message: "Amendment missing or invalid impactChange object", fixable: true });
          continue;
        }
        const targetBill = secondReadingBills?.some(b => b.id === action.billId);
        if (!targetBill) {
          console.warn(`[${partyId}] Amendment for non-second-reading bill ${action.billId}, skipping`);
          errors.push({ actionIndex: i, actionType: "propose_amendment", message: `Bill ${action.billId} is not in second reading — valid bill IDs for amendments: ${secondReadingBills?.map(b => b.id).join(", ") || "none"}`, fixable: true });
          continue;
        }
        amendmentCount++;
        validated.push(action);
        break;
      }

      case "statement": {
        if (statementCount >= 1) {
          console.warn(`[${partyId}] More than 1 statement, skipping`);
          errors.push({ actionIndex: i, actionType: "statement", message: "Maximum 1 statement per turn", fixable: true });
          continue;
        }
        if (!action.title || !action.statement) {
          console.warn(`[${partyId}] Statement missing fields, skipping`);
          errors.push({ actionIndex: i, actionType: "statement", message: "Statement missing required title or statement text", fixable: false });
          continue;
        }
        statementCount++;
        validated.push(action);
        break;
      }

      case "campaign_statement": {
        if (campaignCount >= 1) {
          console.warn(`[${partyId}] More than 1 campaign statement, skipping`);
          errors.push({ actionIndex: i, actionType: "campaign_statement", message: "Maximum 1 campaign statement per turn", fixable: true });
          continue;
        }
        if (!activeElection || activeElection.status !== "campaign") {
          console.warn(`[${partyId}] Campaign statement outside campaign phase, skipping`);
          errors.push({ actionIndex: i, actionType: "campaign_statement", message: "Campaign statements only allowed during active campaign phase", fixable: false });
          continue;
        }
        if (!action.title || !action.promise) {
          console.warn(`[${partyId}] Campaign statement missing fields, skipping`);
          errors.push({ actionIndex: i, actionType: "campaign_statement", message: "Campaign statement missing required title or promise", fixable: false });
          continue;
        }
        campaignCount++;
        validated.push(action);
        break;
      }

      case "submit_motion": {
        if (!inParliament) {
          console.warn(`[${partyId}] Motion without Fraktion, skipping`);
          errors.push({ actionIndex: i, actionType: "submit_motion", message: "Motions require Fraktion", fixable: false });
          continue;
        }
        if (motionCount >= 1) {
          console.warn(`[${partyId}] More than 1 motion, skipping`);
          errors.push({ actionIndex: i, actionType: "submit_motion", message: "Maximum 1 motion per turn", fixable: true });
          continue;
        }
        if (!VALID_MOTION_TYPES.includes(action.motionType)) {
          console.warn(`[${partyId}] Invalid motionType ${action.motionType}, skipping`);
          errors.push({ actionIndex: i, actionType: "submit_motion", message: `Invalid motionType "${action.motionType}" — valid: ${VALID_MOTION_TYPES.join(", ")}`, fixable: true });
          continue;
        }
        if (!action.title || !action.description) {
          console.warn(`[${partyId}] Motion missing title/description, skipping`);
          errors.push({ actionIndex: i, actionType: "submit_motion", message: "Motion missing required title or description", fixable: false });
          continue;
        }
        motionCount++;
        validated.push(action);
        break;
      }

      case "file_interpellation": {
        if (!inParliament) {
          console.warn(`[${partyId}] Interpellation without Fraktion, skipping`);
          errors.push({ actionIndex: i, actionType: "file_interpellation", message: "Interpellations require Fraktion", fixable: false });
          continue;
        }
        if (!isOpposition) {
          console.warn(`[${partyId}] Interpellation from non-opposition party, skipping`);
          errors.push({ actionIndex: i, actionType: "file_interpellation", message: "Interpellations are only available to opposition parties", fixable: false });
          continue;
        }
        if (interpellationCount >= 1) {
          console.warn(`[${partyId}] More than 1 interpellation, skipping`);
          errors.push({ actionIndex: i, actionType: "file_interpellation", message: "Maximum 1 interpellation per turn", fixable: true });
          continue;
        }
        if (!VALID_INTERPELLATION_TYPES.includes(action.interpellationType)) {
          console.warn(`[${partyId}] Invalid interpellationType ${action.interpellationType}, skipping`);
          errors.push({ actionIndex: i, actionType: "file_interpellation", message: `Invalid interpellationType "${action.interpellationType}" — valid: ${VALID_INTERPELLATION_TYPES.join(", ")}`, fixable: true });
          continue;
        }
        if (!action.title || !action.question) {
          console.warn(`[${partyId}] Interpellation missing title/question, skipping`);
          errors.push({ actionIndex: i, actionType: "file_interpellation", message: "Interpellation missing required title or question", fixable: false });
          continue;
        }
        if (!VALID_MINISTRY_PORTFOLIOS.includes(action.targetMinistry)) {
          console.warn(`[${partyId}] Invalid targetMinistry ${action.targetMinistry}, skipping`);
          errors.push({ actionIndex: i, actionType: "file_interpellation", message: `Invalid targetMinistry "${action.targetMinistry}" — valid: ${VALID_MINISTRY_PORTFOLIOS.join(", ")}`, fixable: true });
          continue;
        }
        interpellationCount++;
        validated.push(action);
        break;
      }

      case "call_vertrauensfrage": {
        if (!inParliament) {
          console.warn(`[${partyId}] Vertrauensfrage without Fraktion, skipping`);
          errors.push({ actionIndex: i, actionType: "call_vertrauensfrage", message: "Vertrauensfrage requires Fraktion", fixable: false });
          continue;
        }
        if (!isCoalitionLeader) {
          console.warn(`[${partyId}] Vertrauensfrage from non-coalition-leader, skipping`);
          errors.push({ actionIndex: i, actionType: "call_vertrauensfrage", message: "Only the coalition leader may call a Vertrauensfrage", fixable: false });
          continue;
        }
        if (activeElection) {
          console.warn(`[${partyId}] Vertrauensfrage during active election, skipping`);
          errors.push({ actionIndex: i, actionType: "call_vertrauensfrage", message: "Vertrauensfrage not allowed during active election", fixable: false });
          continue;
        }
        if (vertrauensfrageCount >= 1) {
          console.warn(`[${partyId}] More than 1 Vertrauensfrage, skipping`);
          errors.push({ actionIndex: i, actionType: "call_vertrauensfrage", message: "Maximum 1 Vertrauensfrage per turn", fixable: true });
          continue;
        }
        if (!action.title || !action.description) {
          console.warn(`[${partyId}] Vertrauensfrage missing title/description, skipping`);
          errors.push({ actionIndex: i, actionType: "call_vertrauensfrage", message: "Vertrauensfrage missing required title or description", fixable: false });
          continue;
        }
        vertrauensfrageCount++;
        validated.push(action);
        break;
      }

      case "file_misstrauensvotum": {
        if (!inParliament) {
          console.warn(`[${partyId}] Misstrauensvotum without Fraktion, skipping`);
          errors.push({ actionIndex: i, actionType: "file_misstrauensvotum", message: "Misstrauensvotum requires Fraktion", fixable: false });
          continue;
        }
        if (!isOpposition) {
          console.warn(`[${partyId}] Misstrauensvotum from non-opposition party, skipping`);
          errors.push({ actionIndex: i, actionType: "file_misstrauensvotum", message: "Misstrauensvotum is only available to opposition parties", fixable: false });
          continue;
        }
        if (activeElection) {
          console.warn(`[${partyId}] Misstrauensvotum during active election, skipping`);
          errors.push({ actionIndex: i, actionType: "file_misstrauensvotum", message: "Misstrauensvotum not allowed during active election", fixable: false });
          continue;
        }
        if (misstrauensvotumCount >= 1) {
          console.warn(`[${partyId}] More than 1 Misstrauensvotum, skipping`);
          errors.push({ actionIndex: i, actionType: "file_misstrauensvotum", message: "Maximum 1 Misstrauensvotum per turn", fixable: true });
          continue;
        }
        if (!action.title || !action.description || !action.proposedChancellor || !action.proposedChancellorPartyId) {
          console.warn(`[${partyId}] Misstrauensvotum missing required fields, skipping`);
          errors.push({ actionIndex: i, actionType: "file_misstrauensvotum", message: "Misstrauensvotum missing required fields (title, description, proposedChancellor, proposedChancellorPartyId)", fixable: false });
          continue;
        }
        misstrauensvotumCount++;
        validated.push(action);
        break;
      }

      case "file_constitutional_challenge": {
        if (!inParliament) {
          console.warn(`[${partyId}] Constitutional challenge without Fraktion, skipping`);
          errors.push({ actionIndex: i, actionType: "file_constitutional_challenge", message: "Constitutional challenges require Fraktion", fixable: false });
          continue;
        }
        if (activeElection) {
          console.warn(`[${partyId}] Constitutional challenge during active election, skipping`);
          errors.push({ actionIndex: i, actionType: "file_constitutional_challenge", message: "Constitutional challenges not allowed during active election", fixable: false });
          continue;
        }
        if (constitutionalChallengeCount >= 1) {
          console.warn(`[${partyId}] More than 1 constitutional challenge, skipping`);
          errors.push({ actionIndex: i, actionType: "file_constitutional_challenge", message: "Maximum 1 constitutional challenge per turn", fixable: true });
          continue;
        }
        if (!action.billId || !action.arguments) {
          console.warn(`[${partyId}] Constitutional challenge missing billId/arguments, skipping`);
          errors.push({ actionIndex: i, actionType: "file_constitutional_challenge", message: "Constitutional challenge missing required billId or arguments", fixable: false });
          continue;
        }
        constitutionalChallengeCount++;
        validated.push(action);
        break;
      }

      case "file_inquiry_committee": {
        // Cycle 4 PR 1 — Untersuchungsausschuss filing. Mirrors the
        // `file_misstrauensvotum` validation pattern.
        if (!inParliament) {
          console.warn(`[${partyId}] Inquiry without Fraktion, skipping`);
          errors.push({ actionIndex: i, actionType: "file_inquiry_committee", message: "Inquiry committees require Fraktion (party has no seats in parliament)", fixable: false });
          continue;
        }
        if (!isOpposition) {
          console.warn(`[${partyId}] Inquiry from non-opposition party, skipping`);
          errors.push({ actionIndex: i, actionType: "file_inquiry_committee", message: "Inquiry committees can only be filed by opposition parties", fixable: false });
          continue;
        }
        if (activeElection) {
          console.warn(`[${partyId}] Inquiry during active election, skipping`);
          errors.push({ actionIndex: i, actionType: "file_inquiry_committee", message: "Inquiry committees not allowed during active election", fixable: false });
          continue;
        }
        if (inquiryCount >= 1) {
          console.warn(`[${partyId}] More than 1 inquiry, skipping`);
          errors.push({ actionIndex: i, actionType: "file_inquiry_committee", message: "Maximum 1 inquiry committee filing per turn", fixable: true });
          continue;
        }
        if (!action.subject || typeof action.subject !== "string") {
          console.warn(`[${partyId}] Inquiry missing subject, skipping`);
          errors.push({ actionIndex: i, actionType: "file_inquiry_committee", message: "Inquiry missing required subject", fixable: false });
          continue;
        }
        // S17 invariant: must target a party OR a ministry (or both — but at least one).
        if ((action.targetPartyId == null || action.targetPartyId === "") && (action.targetMinistry == null || (action.targetMinistry as unknown) === "")) {
          console.warn(`[${partyId}] Inquiry missing target, skipping`);
          errors.push({ actionIndex: i, actionType: "file_inquiry_committee", message: "Inquiry must specify targetPartyId or targetMinistry (at least one)", fixable: true });
          continue;
        }
        if (action.targetMinistry != null && !VALID_MINISTRY_PORTFOLIOS.includes(action.targetMinistry)) {
          console.warn(`[${partyId}] Invalid inquiry targetMinistry ${action.targetMinistry}, skipping`);
          errors.push({ actionIndex: i, actionType: "file_inquiry_committee", message: `Invalid targetMinistry "${action.targetMinistry}" — valid: ${VALID_MINISTRY_PORTFOLIOS.join(", ")}`, fixable: true });
          continue;
        }
        if (inquiryContext) {
          // Combined opposition seat threshold (Bundestag rule: 25%).
          const requiredSeats = inquiryContext.bundestagSize * inquiryContext.thresholdPercent;
          if (inquiryContext.oppositionSeats < requiredSeats) {
            console.warn(`[${partyId}] Inquiry below opposition seat threshold (${inquiryContext.oppositionSeats} < ${requiredSeats.toFixed(0)})`);
            errors.push({ actionIndex: i, actionType: "file_inquiry_committee", message: `Combined opposition Fraktion seats (${inquiryContext.oppositionSeats}) below ${(inquiryContext.thresholdPercent * 100).toFixed(0)}% threshold (${requiredSeats.toFixed(0)})`, fixable: false });
            continue;
          }
          // S9 active-cap (global).
          if (inquiryContext.activeInquiryCount >= inquiryContext.maxActive) {
            console.warn(`[${partyId}] Inquiry blocked by active-cap (${inquiryContext.activeInquiryCount}/${inquiryContext.maxActive})`);
            errors.push({ actionIndex: i, actionType: "file_inquiry_committee", message: `Inquiry committee cap reached: max ${inquiryContext.maxActive} active`, fixable: false });
            continue;
          }
          // R8 per-party cap.
          if (inquiryContext.partyActiveInquiryCount >= 1) {
            console.warn(`[${partyId}] Inquiry blocked by per-party cap`);
            errors.push({ actionIndex: i, actionType: "file_inquiry_committee", message: `Party ${partyId} already has 1 active inquiry`, fixable: false });
            continue;
          }
          // S8 rate-limit.
          if (inquiryContext.lastInquiryFiledDay != null
              && inquiryContext.currentDay - inquiryContext.lastInquiryFiledDay < inquiryContext.minDaysBetweenFilings) {
            const remaining = inquiryContext.minDaysBetweenFilings - (inquiryContext.currentDay - inquiryContext.lastInquiryFiledDay);
            console.warn(`[${partyId}] Inquiry blocked by ${inquiryContext.minDaysBetweenFilings}-day cooldown (${remaining}d remaining)`);
            errors.push({ actionIndex: i, actionType: "file_inquiry_committee", message: `Inquiry rate-limit: ${inquiryContext.minDaysBetweenFilings}-day cooldown (${remaining}d remaining)`, fixable: false });
            continue;
          }
        }
        inquiryCount++;
        validated.push(action);
        break;
      }

      case "propose_fiscal_emergency": {
        // Cycle 4 PR 2 — Schuldenbremse-Aussetzung (Art. 115 GG). Coalition
        // leader only; vote happens same day; pass triggers Nachtragshaushalt
        // (PR 3). Mirrors the `call_vertrauensfrage` validation shape.
        if (!inParliament) {
          console.warn(`[${partyId}] Fiscal emergency without Fraktion, skipping`);
          errors.push({ actionIndex: i, actionType: "propose_fiscal_emergency", message: "Fiscal emergency proposals require Fraktion", fixable: false });
          continue;
        }
        if (!isCoalitionLeader) {
          console.warn(`[${partyId}] Fiscal emergency from non-coalition-leader, skipping`);
          errors.push({ actionIndex: i, actionType: "propose_fiscal_emergency", message: "Only the coalition leader may propose Schuldenbremse-Aussetzung (Art. 115 GG)", fixable: false });
          continue;
        }
        if (activeElection) {
          console.warn(`[${partyId}] Fiscal emergency during active election, skipping`);
          errors.push({ actionIndex: i, actionType: "propose_fiscal_emergency", message: "Fiscal emergency proposals not allowed during active election", fixable: false });
          continue;
        }
        if (fiscalEmergencyCount >= 1) {
          console.warn(`[${partyId}] More than 1 fiscal emergency proposal, skipping`);
          errors.push({ actionIndex: i, actionType: "propose_fiscal_emergency", message: "Maximum 1 fiscal emergency proposal per turn", fixable: true });
          continue;
        }
        if (!action.title || !action.description || !action.justification) {
          console.warn(`[${partyId}] Fiscal emergency missing title/description/justification, skipping`);
          errors.push({ actionIndex: i, actionType: "propose_fiscal_emergency", message: "Fiscal emergency missing required title, description, or justification", fixable: false });
          continue;
        }
        if (fiscalEmergencyContext) {
          // Cooldown gate: can't re-file while a previous Aussetzung is still
          // in force. Once it expires, the gate opens immediately.
          if (fiscalEmergencyContext.schuldenbremseSuspendedUntilDay != null
              && fiscalEmergencyContext.currentDay < fiscalEmergencyContext.schuldenbremseSuspendedUntilDay) {
            const remaining = fiscalEmergencyContext.schuldenbremseSuspendedUntilDay - fiscalEmergencyContext.currentDay;
            console.warn(`[${partyId}] Fiscal emergency blocked by cooldown (${remaining}d remaining)`);
            errors.push({ actionIndex: i, actionType: "propose_fiscal_emergency", message: `Schuldenbremse already suspended until day ${fiscalEmergencyContext.schuldenbremseSuspendedUntilDay} (${remaining}d remaining); cannot re-file before expiry`, fixable: false });
            continue;
          }
          // Justification gate: must match findFiscalEmergencyOpportunity.
          if (!fiscalEmergencyContext.justified) {
            console.warn(`[${partyId}] Fiscal emergency rejected — no justification (no high-severity crisis AND provisionalBudget streak < 30 days)`);
            errors.push({ actionIndex: i, actionType: "propose_fiscal_emergency", message: "No fiscal emergency justification (requires high-severity crisis OR provisionalBudget streak ≥ 30 days)", fixable: false });
            continue;
          }
        }
        fiscalEmergencyCount++;
        validated.push(action);
        break;
      }

      case "nothing":
        validated.push(action);
        break;

      default:
        console.warn(`[${partyId}] Unknown action type, skipping`);
        errors.push({ actionIndex: i, actionType: (action as any).type ?? "unknown", message: `Unknown action type "${(action as any).type ?? "undefined"}"`, fixable: true });
    }
  }

  // Check that all third-reading bills were voted on (only for parties in parliament)
  if (inParliament) {
    for (const bill of votableBills) {
      if (!votedBills.has(bill.id)) {
        console.warn(`[${partyId}] Missing vote for ${bill.id}, adding abstain`);
        autoAbstainBillIds.push(bill.id);
        validated.push({
          type: "vote",
          billId: bill.id,
          vote: "abstain",
          reason: "No explicit vote cast",
        });
      }
    }
  }

  return { valid: validated, errors, autoAbstainBillIds };
}
