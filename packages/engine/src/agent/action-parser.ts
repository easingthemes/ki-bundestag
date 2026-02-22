import type { AgentAction, AgentResponse, Bill, BillCategory, Election, InterpellationType, MinistryPortfolio, MotionType } from "@ki-bundestag/types";

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
  // Try to extract JSON from the response (handle markdown code blocks)
  let jsonStr = raw.trim();
  const match = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (match) {
    jsonStr = match[1].trim();
  }

  const parsed = JSON.parse(jsonStr);

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
): AgentAction[] {
  const validated: AgentAction[] = [];
  let proposalCount = 0;
  let statementCount = 0;
  let campaignCount = 0;
  let amendmentCount = 0;
  let motionCount = 0;
  let interpellationCount = 0;
  let vertrauensfrageCount = 0;
  let misstrauensvotumCount = 0;
  let constitutionalChallengeCount = 0;
  const votedBills = new Set<string>();
  const inParliament = hasFraktion;

  for (const action of actions) {
    switch (action.type) {
      case "vote": {
        // Parliamentary action: requires seats
        if (!inParliament) {
          console.warn(`[${partyId}] Vote without Fraktion, skipping`);
          continue;
        }
        if (!action.billId || !VALID_VOTES.includes(action.vote)) {
          console.warn(`[${partyId}] Invalid vote action, skipping`);
          continue;
        }
        if (votedBills.has(action.billId)) {
          console.warn(`[${partyId}] Duplicate vote for ${action.billId}, skipping`);
          continue;
        }
        const billExists = votableBills.some(b => b.id === action.billId);
        if (!billExists) {
          console.warn(`[${partyId}] Vote for non-existent bill ${action.billId}, skipping`);
          continue;
        }
        votedBills.add(action.billId);
        validated.push(action);
        break;
      }

      case "propose_bill": {
        // Parliamentary action: requires seats
        if (!inParliament) {
          console.warn(`[${partyId}] Bill proposal without Fraktion, skipping`);
          continue;
        }
        if (proposalCount >= 1) {
          console.warn(`[${partyId}] More than 1 proposal, skipping`);
          continue;
        }
        if (!action.title || !action.description) {
          console.warn(`[${partyId}] Proposal missing title/description, skipping`);
          continue;
        }
        if (!VALID_CATEGORIES.includes(action.category)) {
          console.warn(`[${partyId}] Invalid category ${action.category}, defaulting to economy`);
          action.category = "economy";
        }
        proposalCount++;
        validated.push(action);
        break;
      }

      case "propose_amendment": {
        // Parliamentary action: requires Fraktion
        if (!inParliament) {
          console.warn(`[${partyId}] Amendment without Fraktion, skipping`);
          continue;
        }
        if (amendmentCount >= 1) {
          console.warn(`[${partyId}] More than 1 amendment, skipping`);
          continue;
        }
        if (!action.billId || !action.title || !action.description) {
          console.warn(`[${partyId}] Amendment missing fields, skipping`);
          continue;
        }
        if (!isBillImpact((action as any).impactChange)) {
          console.warn(`[${partyId}] Amendment missing/invalid impactChange, skipping`);
          continue;
        }
        // Must target a second_reading bill
        const targetBill = secondReadingBills?.some(b => b.id === action.billId);
        if (!targetBill) {
          console.warn(`[${partyId}] Amendment for non-second-reading bill ${action.billId}, skipping`);
          continue;
        }
        amendmentCount++;
        validated.push(action);
        break;
      }

      case "statement": {
        // Public action: any party can make statements
        if (statementCount >= 1) {
          console.warn(`[${partyId}] More than 1 statement, skipping`);
          continue;
        }
        if (!action.title || !action.statement) {
          console.warn(`[${partyId}] Statement missing fields, skipping`);
          continue;
        }
        statementCount++;
        validated.push(action);
        break;
      }

      case "campaign_statement": {
        // Public action: any party can campaign
        if (campaignCount >= 1) {
          console.warn(`[${partyId}] More than 1 campaign statement, skipping`);
          continue;
        }
        if (!activeElection || activeElection.status !== "campaign") {
          console.warn(`[${partyId}] Campaign statement outside campaign phase, skipping`);
          continue;
        }
        if (!action.title || !action.promise) {
          console.warn(`[${partyId}] Campaign statement missing fields, skipping`);
          continue;
        }
        campaignCount++;
        validated.push(action);
        break;
      }

      case "submit_motion": {
        // Parliamentary action: requires Fraktion
        if (!inParliament) {
          console.warn(`[${partyId}] Motion without Fraktion, skipping`);
          continue;
        }
        if (motionCount >= 1) {
          console.warn(`[${partyId}] More than 1 motion, skipping`);
          continue;
        }
        if (!VALID_MOTION_TYPES.includes(action.motionType)) {
          console.warn(`[${partyId}] Invalid motionType ${action.motionType}, skipping`);
          continue;
        }
        if (!action.title || !action.description) {
          console.warn(`[${partyId}] Motion missing title/description, skipping`);
          continue;
        }
        motionCount++;
        validated.push(action);
        break;
      }

      case "file_interpellation": {
        // Requires Fraktion + opposition
        if (!inParliament) {
          console.warn(`[${partyId}] Interpellation without Fraktion, skipping`);
          continue;
        }
        if (!isOpposition) {
          console.warn(`[${partyId}] Interpellation from non-opposition party, skipping`);
          continue;
        }
        if (interpellationCount >= 1) {
          console.warn(`[${partyId}] More than 1 interpellation, skipping`);
          continue;
        }
        if (!VALID_INTERPELLATION_TYPES.includes(action.interpellationType)) {
          console.warn(`[${partyId}] Invalid interpellationType ${action.interpellationType}, skipping`);
          continue;
        }
        if (!action.title || !action.question) {
          console.warn(`[${partyId}] Interpellation missing title/question, skipping`);
          continue;
        }
        if (!VALID_MINISTRY_PORTFOLIOS.includes(action.targetMinistry)) {
          console.warn(`[${partyId}] Invalid targetMinistry ${action.targetMinistry}, skipping`);
          continue;
        }
        interpellationCount++;
        validated.push(action);
        break;
      }

      case "call_vertrauensfrage": {
        if (!inParliament) {
          console.warn(`[${partyId}] Vertrauensfrage without Fraktion, skipping`);
          continue;
        }
        if (!isCoalitionLeader) {
          console.warn(`[${partyId}] Vertrauensfrage from non-coalition-leader, skipping`);
          continue;
        }
        if (activeElection) {
          console.warn(`[${partyId}] Vertrauensfrage during active election, skipping`);
          continue;
        }
        if (vertrauensfrageCount >= 1) {
          console.warn(`[${partyId}] More than 1 Vertrauensfrage, skipping`);
          continue;
        }
        if (!action.title || !action.description) {
          console.warn(`[${partyId}] Vertrauensfrage missing title/description, skipping`);
          continue;
        }
        vertrauensfrageCount++;
        validated.push(action);
        break;
      }

      case "file_misstrauensvotum": {
        if (!inParliament) {
          console.warn(`[${partyId}] Misstrauensvotum without Fraktion, skipping`);
          continue;
        }
        if (!isOpposition) {
          console.warn(`[${partyId}] Misstrauensvotum from non-opposition party, skipping`);
          continue;
        }
        if (activeElection) {
          console.warn(`[${partyId}] Misstrauensvotum during active election, skipping`);
          continue;
        }
        if (misstrauensvotumCount >= 1) {
          console.warn(`[${partyId}] More than 1 Misstrauensvotum, skipping`);
          continue;
        }
        if (!action.title || !action.description || !action.proposedChancellor || !action.proposedChancellorPartyId) {
          console.warn(`[${partyId}] Misstrauensvotum missing required fields, skipping`);
          continue;
        }
        misstrauensvotumCount++;
        validated.push(action);
        break;
      }

      case "file_constitutional_challenge": {
        if (!inParliament) {
          console.warn(`[${partyId}] Constitutional challenge without Fraktion, skipping`);
          continue;
        }
        if (activeElection) {
          console.warn(`[${partyId}] Constitutional challenge during active election, skipping`);
          continue;
        }
        if (constitutionalChallengeCount >= 1) {
          console.warn(`[${partyId}] More than 1 constitutional challenge, skipping`);
          continue;
        }
        if (!action.billId || !action.arguments) {
          console.warn(`[${partyId}] Constitutional challenge missing billId/arguments, skipping`);
          continue;
        }
        constitutionalChallengeCount++;
        validated.push(action);
        break;
      }

      case "nothing":
        validated.push(action);
        break;

      default:
        console.warn(`[${partyId}] Unknown action type, skipping`);
    }
  }

  // Check that all third-reading bills were voted on (only for parties in parliament)
  if (inParliament) {
    for (const bill of votableBills) {
      if (!votedBills.has(bill.id)) {
        console.warn(`[${partyId}] Missing vote for ${bill.id}, adding abstain`);
        validated.push({
          type: "vote",
          billId: bill.id,
          vote: "abstain",
          reason: "No explicit vote cast",
        });
      }
    }
  }

  return validated;
}
