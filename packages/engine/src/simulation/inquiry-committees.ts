/**
 * Cycle 4 PR 1 — Untersuchungsausschuss (parliamentary inquiry committee).
 *
 * Mid-fidelity model (Q3=B): lifecycle table + state machine + AI hearing
 * summaries (1 batch item per active hearing) + AI final report at conclusion.
 * Court powers, scandal-severity axis, Enquete-Kommission, Ausschussanhörungen
 * are all deferred to Cycle 5+ pending an external-expert-witness actor model.
 *
 * Reuse note (S11): NOT reusing `committees.ts` / `committees` table — that
 * module models *standing* committees with a member roster + bill-routing role.
 * Inquiry committees are short-lived, party-level, no roster, no bill routing.
 * Module-level distinction matches the table-level distinction in schema-sim.ts.
 */

import type {
  Crisis, Government, MinistryPortfolio, Party, SimulationEvent,
} from "@ki-bundestag/types";
import type { BatchRequest, BatchResult } from "../agent/batch-client.js";
import { findResult } from "../agent/batch-client.js";
import { logAICall } from "../agent/ai-json.js";
import { getDb, getSqlite, schema } from "../db/index.js";
import { eq } from "drizzle-orm";
import { clampApproval } from "./opinion.js";
import {
  CRISIS_CATEGORY_TO_MINISTRY,
  INQUIRY_DURATION_MIN,
  INQUIRY_DURATION_MAX,
  INQUIRY_HEARING_INTERVAL,
  INQUIRY_MAX_ACTIVE,
  INQUIRY_MIN_DAYS_BETWEEN_FILINGS,
  INQUIRY_FILER_FILING_BONUS,
  INQUIRY_TARGET_DAILY_DRAG,
  INQUIRY_WRONGDOING_TARGET_IMPACT,
  INQUIRY_WRONGDOING_FILER_IMPACT,
  INQUIRY_CLEARED_TARGET_IMPACT,
  INQUIRY_CLEARED_FILER_IMPACT,
  INQUIRY_WATCHDOG_GRACE_DAYS,
  INQUIRY_WATCHDOG_HEARING_GAP_DAYS,
} from "../config/parliament.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type InquiryStatus = "active" | "concluded";
export type InquiryOutcome = "wrongdoing_found" | "cleared";

export interface InquiryCommittee {
  id: string;
  subject: string;
  filingPartyId: string;
  /** Either party-target OR ministry-target must be non-null at filing time (S17). */
  targetPartyId: string | null;
  /** One of MINISTRY_PORTFOLIOS values, or null. */
  targetMinistry: MinistryPortfolio | null;
  filedOnDay: number;
  scheduledEndDay: number;
  concludedOnDay: number | null;
  status: InquiryStatus;
  outcome: InquiryOutcome | null;
  finalReport: string | null;
  hearingCount: number;
  lastHearingDay: number | null;
}

export interface FileInquiryInput {
  filingPartyId: string;
  subject: string;
  targetPartyId: string | null;
  targetMinistry: MinistryPortfolio | null;
}

export interface InquiryOpportunity {
  triggerCrisisId: string;
  targetPartyId: string;
  severity: string;
}

// ---------------------------------------------------------------------------
// Pure helpers (testable, no DB)
// ---------------------------------------------------------------------------

/**
 * S1: deterministic outcome roll, weighted by govt approval at conclusion day.
 *   <30%       → 70% wrongdoing-found
 *   30..50% inc → 40% wrongdoing-found
 *   >50%       → 20% wrongdoing-found
 *
 * Pure for testability; `rng` defaults to `Math.random` in production.
 * Tested via 50_000-trial LCG convergence (project pattern).
 */
export function pickInquiryOutcome(
  govApproval: number,
  rng: () => number = Math.random,
): InquiryOutcome {
  let probWrongdoing: number;
  if (govApproval < 30) probWrongdoing = 0.7;
  else if (govApproval <= 50) probWrongdoing = 0.4;
  else probWrongdoing = 0.2;
  return rng() < probWrongdoing ? "wrongdoing_found" : "cleared";
}

/**
 * Hearings fire every `INQUIRY_HEARING_INTERVAL` sim days starting at
 * `filedOnDay + INQUIRY_HEARING_INTERVAL`. Stops on/after `scheduledEndDay`
 * (the scheduled-end conclusion replaces the hearing on that day).
 */
export function shouldFireHearing(
  inquiry: InquiryCommittee,
  currentDay: number,
): boolean {
  if (inquiry.status !== "active") return false;
  if (currentDay >= inquiry.scheduledEndDay) return false;
  if (inquiry.lastHearingDay == null) {
    return currentDay >= inquiry.filedOnDay + INQUIRY_HEARING_INTERVAL;
  }
  return currentDay - inquiry.lastHearingDay >= INQUIRY_HEARING_INTERVAL;
}

/**
 * Q9 watchdog: prevents stuck inquiries from clogging the active-cap when
 * the hearing-batch path silently fails or AI calls perpetually return empty.
 *
 * Fires when:
 *   currentDay > scheduledEndDay + INQUIRY_WATCHDOG_GRACE_DAYS
 *   AND no hearing in the prior INQUIRY_WATCHDOG_HEARING_GAP_DAYS days.
 *
 * Auto-concludes as `cleared` (defensive, not punitive).
 */
export function shouldWatchdogConclude(
  inquiry: InquiryCommittee,
  currentDay: number,
): boolean {
  if (inquiry.status !== "active") return false;
  if (currentDay <= inquiry.scheduledEndDay + INQUIRY_WATCHDOG_GRACE_DAYS) return false;
  const lastHearing = inquiry.lastHearingDay ?? inquiry.filedOnDay;
  return currentDay - lastHearing >= INQUIRY_WATCHDOG_HEARING_GAP_DAYS;
}

/**
 * R5 heuristic: "is filing an inquiry a politically valuable opportunity right now?"
 *
 * Returns the first high-severity active crisis whose category maps to a
 * coalition-held ministry portfolio. The opposition agent's `AgentContext`
 * gets this populated before action selection (loop.ts step 5).
 *
 * Returns null when:
 *   - no government,
 *   - no high-severity active crisis,
 *   - no crisis-category → coalition-ministry match.
 *
 * The returned `targetPartyId` is the coalition party that holds the mapped
 * ministry — i.e. the politically embarrassed government party.
 */
export function findInquiryOpportunity(
  crises: Crisis[],
  government: Government | null,
): InquiryOpportunity | null {
  if (!government) return null;
  for (const crisis of crises) {
    if (crisis.severity !== "high" || crisis.resolved) continue;
    const ministry = CRISIS_CATEGORY_TO_MINISTRY[crisis.category];
    if (!ministry) continue;
    const minister = government.ministers.find(m => m.portfolio === ministry);
    if (!minister) continue;
    return {
      triggerCrisisId: crisis.id,
      targetPartyId: minister.partyId,
      severity: crisis.severity,
    };
  }
  return null;
}

/** Per-day approval drag applied to the target party while inquiry is active (S2). */
export function inquiryDailyDrag(): number {
  return INQUIRY_TARGET_DAILY_DRAG;
}

/**
 * Compute the coalition's seat-weighted approval (used by `pickInquiryOutcome`
 * at scheduled-end conclusion). Mirrors the formula in
 * `confidence-votes.ts::nextLowGovernmentApprovalStreak` — kept consistent so
 * the gate semantics line up across cycle features.
 */
export function computeGovernmentApproval(
  parties: Party[],
  coalitionPartyIds: string[],
): number {
  const coalitionSet = new Set(coalitionPartyIds);
  const coalition = parties.filter(p => coalitionSet.has(p.id) && p.seatCount > 0);
  const totalSeats = coalition.reduce((s, p) => s + p.seatCount, 0);
  if (totalSeats === 0) return 0;
  return coalition.reduce((s, p) => s + p.approvalRating * p.seatCount, 0) / totalSeats;
}

// ---------------------------------------------------------------------------
// DB helpers (internal, but exported for tests)
// ---------------------------------------------------------------------------

interface InquiryRow {
  id: string;
  subject: string;
  filing_party_id: string;
  target_party_id: string | null;
  target_ministry: string | null;
  filed_on_day: number;
  scheduled_end_day: number;
  concluded_on_day: number | null;
  status: string;
  outcome: string | null;
  final_report: string | null;
  hearing_count: number;
  last_hearing_day: number | null;
}

function rowToInquiry(row: InquiryRow): InquiryCommittee {
  return {
    id: row.id,
    subject: row.subject,
    filingPartyId: row.filing_party_id,
    targetPartyId: row.target_party_id,
    targetMinistry: (row.target_ministry as MinistryPortfolio | null) ?? null,
    filedOnDay: row.filed_on_day,
    scheduledEndDay: row.scheduled_end_day,
    concludedOnDay: row.concluded_on_day,
    status: row.status as InquiryStatus,
    outcome: row.outcome as InquiryOutcome | null,
    finalReport: row.final_report,
    hearingCount: row.hearing_count,
    lastHearingDay: row.last_hearing_day,
  };
}

export function listActiveInquiries(): InquiryCommittee[] {
  const rows = getSqlite()
    .prepare("SELECT * FROM inquiry_committees WHERE status = 'active' ORDER BY filed_on_day ASC")
    .all() as InquiryRow[];
  return rows.map(rowToInquiry);
}

export function countActiveInquiries(): number {
  const row = getSqlite()
    .prepare("SELECT COUNT(*) AS n FROM inquiry_committees WHERE status = 'active'")
    .get() as { n: number };
  return row.n;
}

export function countActiveInquiriesByParty(filingPartyId: string): number {
  const row = getSqlite()
    .prepare("SELECT COUNT(*) AS n FROM inquiry_committees WHERE status = 'active' AND filing_party_id = ?")
    .get(filingPartyId) as { n: number };
  return row.n;
}

export function getInquiry(id: string): InquiryCommittee | null {
  const row = getSqlite().prepare("SELECT * FROM inquiry_committees WHERE id = ?").get(id) as InquiryRow | undefined;
  return row ? rowToInquiry(row) : null;
}

function readLastInquiryFiledDay(): number | null {
  const row = getSqlite()
    .prepare("SELECT last_inquiry_filed_day FROM simulation_meta LIMIT 1")
    .get() as { last_inquiry_filed_day: number | null } | undefined;
  return row?.last_inquiry_filed_day ?? null;
}

// ---------------------------------------------------------------------------
// Stateful lifecycle
// ---------------------------------------------------------------------------

function generateId(currentDay: number, filingPartyId: string, rng: () => number): string {
  return `inquiry-${currentDay}-${filingPartyId}-${Math.floor(rng() * 1e6).toString(36)}`;
}

/**
 * File a new Untersuchungsausschuss. Validates structural invariants
 * (S17 target, S8 rate-limit, S9 active-cap) BEFORE any DB write.
 *
 * Throws on invariant violation — the action-parser converts the throw to a
 * `fixable` validation error matching the existing `file_misstrauensvotum`
 * pattern. Rate-limit / cap also validated at action-parser level so the LLM
 * sees the rejection reason — this throw is defense-in-depth for callers that
 * skip the action-parser path (e.g. injection consumer in future cycles).
 *
 * Side effects (in a single SQLite transaction):
 *   1. INSERT inquiry_committees row
 *   2. UPDATE simulation_meta.last_inquiry_filed_day = currentDay (S8)
 *   3. Mutate filing party's `approvalRating` in-memory (+0.3, clamped). The
 *      DB-side write happens later in loop.ts step 13 (record history) along
 *      with all other approval changes for the day.
 */
export function fileInquiry(
  input: FileInquiryInput,
  currentDay: number,
  parties: Party[],
  rng: () => number = Math.random,
): { inquiry: InquiryCommittee; event: Omit<SimulationEvent, "id"> } {
  // R12 / S17 invariant: at least one of target_party_id / target_ministry
  // must be non-null. Enforced here AND asserted in tests.
  if (input.targetPartyId == null && input.targetMinistry == null) {
    throw new Error("Inquiry must target a party or a ministry");
  }
  // S8 rate-limit
  const lastFiled = readLastInquiryFiledDay();
  if (lastFiled != null && currentDay - lastFiled < INQUIRY_MIN_DAYS_BETWEEN_FILINGS) {
    throw new Error(`Inquiry rate-limit: ${INQUIRY_MIN_DAYS_BETWEEN_FILINGS}-day cooldown`);
  }
  // S9 active-cap
  if (countActiveInquiries() >= INQUIRY_MAX_ACTIVE) {
    throw new Error(`Inquiry cap: max ${INQUIRY_MAX_ACTIVE} active`);
  }

  const duration = INQUIRY_DURATION_MIN
    + Math.floor(rng() * (INQUIRY_DURATION_MAX - INQUIRY_DURATION_MIN + 1));
  const inquiry: InquiryCommittee = {
    id: generateId(currentDay, input.filingPartyId, rng),
    subject: input.subject,
    filingPartyId: input.filingPartyId,
    targetPartyId: input.targetPartyId,
    targetMinistry: input.targetMinistry,
    filedOnDay: currentDay,
    scheduledEndDay: currentDay + duration,
    concludedOnDay: null,
    status: "active",
    outcome: null,
    finalReport: null,
    hearingCount: 0,
    lastHearingDay: null,
  };

  getSqlite().transaction(() => {
    getDb().insert(schema.inquiryCommittees).values({
      id: inquiry.id,
      subject: inquiry.subject,
      filingPartyId: inquiry.filingPartyId,
      targetPartyId: inquiry.targetPartyId,
      targetMinistry: inquiry.targetMinistry,
      filedOnDay: inquiry.filedOnDay,
      scheduledEndDay: inquiry.scheduledEndDay,
      concludedOnDay: null,
      status: "active",
      outcome: null,
      finalReport: null,
      hearingCount: 0,
      lastHearingDay: null,
    }).run();
    getDb().update(schema.simulationMeta)
      .set({ lastInquiryFiledDay: currentDay })
      .run();
  })();

  // S2 filing bonus on filer (in-memory mutation; loop persists later).
  const filer = parties.find(p => p.id === input.filingPartyId);
  if (filer) {
    filer.approvalRating = clampApproval(filer.approvalRating + INQUIRY_FILER_FILING_BONUS);
  }

  const targetLabel = input.targetPartyId
    ? `Partei ${input.targetPartyId}`
    : `Ministerium ${input.targetMinistry}`;
  const event: Omit<SimulationEvent, "id"> = {
    dayNumber: currentDay,
    type: "inquiry_filed",
    actor: input.filingPartyId,
    title: `Untersuchungsausschuss eingesetzt: ${input.subject}`,
    description: `${input.filingPartyId} setzt Untersuchungsausschuss zu "${input.subject}" gegen ${targetLabel} ein. Geplante Dauer: ${duration} Tage.`,
    data: {
      inquiryId: inquiry.id,
      filingPartyId: inquiry.filingPartyId,
      targetPartyId: inquiry.targetPartyId,
      targetMinistry: inquiry.targetMinistry,
      scheduledEndDay: inquiry.scheduledEndDay,
    },
  };
  return { inquiry, event };
}

/**
 * Daily tick: applies the per-day target drag, fires watchdog auto-conclusions,
 * fires scheduled-end conclusions, and collects the list of active hearings
 * that should fire today (caller dispatches them via the AI batch builder).
 *
 * Returns:
 *   - `hearingsToBatch` — active inquiries that need a hearing summary today.
 *     Caller passes these to `buildInquiryHearingBatchRequest`.
 *   - `concludedToReport` — inquiries that just concluded (scheduled-end OR
 *     watchdog). Caller passes the non-watchdog subset to
 *     `buildInquiryFinalReportBatchRequest`.
 *   - `events` — `inquiry_concluded` events ready for `dayEvents`.
 *
 * The hearing event itself is emitted by `processInquiryHearingBatchResult`
 * once the batch returns (so the description carries the AI summary).
 *
 * R3: target party may have left coalition / merged / dissolved between
 * filing and conclusion. Approval impact is skipped if the party can't be
 * resolved in `parties`.
 */
export function tickActiveInquiries(
  currentDay: number,
  parties: Party[],
  coalitionPartyIds: string[],
  rng: () => number = Math.random,
): {
  hearingsToBatch: InquiryCommittee[];
  concludedToReport: Array<{ inquiry: InquiryCommittee; outcome: InquiryOutcome; watchdog: boolean }>;
  events: Array<Omit<SimulationEvent, "id">>;
} {
  const active = listActiveInquiries();
  const hearingsToBatch: InquiryCommittee[] = [];
  const concludedToReport: Array<{ inquiry: InquiryCommittee; outcome: InquiryOutcome; watchdog: boolean }> = [];
  const events: Array<Omit<SimulationEvent, "id">> = [];

  for (const inquiry of active) {
    // Watchdog (Q9): silent watchdog conclusion as `cleared`. Takes priority
    // over scheduled-end so a watchdog'd inquiry doesn't double-emit.
    if (shouldWatchdogConclude(inquiry, currentDay)) {
      const event = concludeInquiryRow(inquiry, currentDay, "cleared", /* watchdog */ true, parties);
      events.push(event);
      concludedToReport.push({ inquiry, outcome: "cleared", watchdog: true });
      continue;
    }

    // Scheduled-end conclusion: outcome roll on current government approval.
    if (currentDay >= inquiry.scheduledEndDay) {
      const govApproval = computeGovernmentApproval(parties, coalitionPartyIds);
      const outcome = pickInquiryOutcome(govApproval, rng);
      const event = concludeInquiryRow(inquiry, currentDay, outcome, /* watchdog */ false, parties);
      events.push(event);
      concludedToReport.push({ inquiry, outcome, watchdog: false });
      continue;
    }

    // Daily drag (R1: clamp handled by clampApproval; documented at
    //  INQUIRY_TARGET_DAILY_DRAG).
    if (inquiry.targetPartyId) {
      const target = parties.find(p => p.id === inquiry.targetPartyId);
      if (target) {
        target.approvalRating = clampApproval(target.approvalRating + INQUIRY_TARGET_DAILY_DRAG);
      }
      // R3: silently skip if target party no longer exists. Inquiry continues
      // as a procedural matter without a party-side approval impact.
    }

    if (shouldFireHearing(inquiry, currentDay)) {
      hearingsToBatch.push(inquiry);
    }
  }

  return { hearingsToBatch, concludedToReport, events };
}

/**
 * Internal: apply conclusion to a single inquiry row + impacts.
 * Returns the `inquiry_concluded` event for the day.
 *
 * Approval impacts (S2):
 *   - wrongdoing_found: target -1.5, filer +0.8
 *   - cleared:          target +0.5, filer -0.3
 *
 * R3: target party may not exist (left coalition / merged / dissolved). The
 * impact is skipped silently in that branch — log at info level via console.
 */
function concludeInquiryRow(
  inquiry: InquiryCommittee,
  currentDay: number,
  outcome: InquiryOutcome,
  watchdog: boolean,
  parties: Party[],
): Omit<SimulationEvent, "id"> {
  const target = inquiry.targetPartyId
    ? (parties.find(p => p.id === inquiry.targetPartyId) ?? null)
    : null;
  const filer = parties.find(p => p.id === inquiry.filingPartyId) ?? null;

  getSqlite().transaction(() => {
    getDb().update(schema.inquiryCommittees)
      .set({
        status: "concluded",
        outcome,
        concludedOnDay: currentDay,
      })
      .where(eq(schema.inquiryCommittees.id, inquiry.id))
      .run();
  })();

  if (outcome === "wrongdoing_found") {
    if (target) target.approvalRating = clampApproval(target.approvalRating + INQUIRY_WRONGDOING_TARGET_IMPACT);
    if (filer) filer.approvalRating = clampApproval(filer.approvalRating + INQUIRY_WRONGDOING_FILER_IMPACT);
  } else {
    if (target) target.approvalRating = clampApproval(target.approvalRating + INQUIRY_CLEARED_TARGET_IMPACT);
    if (filer) filer.approvalRating = clampApproval(filer.approvalRating + INQUIRY_CLEARED_FILER_IMPACT);
  }

  if (!target && inquiry.targetPartyId) {
    console.log(`  [Inquiry] R3: target party ${inquiry.targetPartyId} no longer exists — skipping target impact`);
  }

  const verdict = outcome === "wrongdoing_found"
    ? "Verfehlungen festgestellt"
    : "kein Fehlverhalten festgestellt";
  const description = watchdog
    ? `Untersuchungsausschuss "${inquiry.subject}" vorzeitig abgeschlossen (Verfahren versandet, ${inquiry.hearingCount} Anhörung(en)).`
    : `Untersuchungsausschuss "${inquiry.subject}" abgeschlossen — ${verdict}. ${inquiry.hearingCount} Anhörung(en).`;
  const title = outcome === "wrongdoing_found"
    ? `Untersuchungsausschuss: Verfehlungen festgestellt — ${inquiry.subject}`
    : `Untersuchungsausschuss abgeschlossen — ${inquiry.subject}`;
  return {
    dayNumber: currentDay,
    type: "inquiry_concluded",
    actor: inquiry.filingPartyId,
    title,
    description,
    data: {
      inquiryId: inquiry.id,
      outcome,
      watchdog,
      targetExists: target != null,
      hearingCount: inquiry.hearingCount,
    },
  };
}

/**
 * Public-facing conclusion entry point (used by tests and any future caller
 * that wants to force-conclude an inquiry outside the daily tick). Internal
 * loop integration calls `tickActiveInquiries` instead.
 */
export function concludeInquiry(
  inquiry: InquiryCommittee,
  currentDay: number,
  outcome: InquiryOutcome,
  watchdog: boolean,
  parties: Party[],
): Omit<SimulationEvent, "id"> {
  return concludeInquiryRow(inquiry, currentDay, outcome, watchdog, parties);
}

// ---------------------------------------------------------------------------
// AI batch builders / processors (S20, S21)
// ---------------------------------------------------------------------------

const HEARING_SYSTEM_PROMPT = `Du bist ein neutraler politischer Reporter im Stil eines Tagesschau-Faktenchecks. Schreibe eine 2–4-Satz-Zusammenfassung einer Anhörung im Untersuchungsausschuss des Bundestags.

REGELN:
- Auf Deutsch, sachlich-journalistischer Ton.
- 2–4 Sätze, keine Aufzählung, keine Markdown-Formatierung.
- Beziehe dich nur auf die genannten Fakten (Thema, einreichende Partei, Ziel, ggf. Krise).
- Erfinde keine Aussagen, Zeugen oder Beweise, die nicht im Kontext stehen.
- Keine Wertung des Ausgangs — die Anhörung läuft noch.`;

const FINAL_REPORT_SYSTEM_PROMPT = `Du bist ein neutraler politischer Reporter im Stil eines Tagesschau-Faktenchecks. Schreibe einen 4–6-Satz-Abschlussbericht eines Untersuchungsausschusses des Bundestags.

REGELN:
- Auf Deutsch, sachlich-journalistischer Ton.
- 4–6 Sätze, kein Markdown, keine Aufzählung.
- Der Ausgang ist im Kontext bereits festgelegt — du erzählst, du entscheidest nicht.
- Beziehe dich nur auf die genannten Fakten (Thema, einreichende Partei, Ziel, Ausgang, Anzahl Anhörungen).
- Keine erfundenen Zeugen, Beweise oder Akten.`;

function buildHearingPrompt(inquiry: InquiryCommittee, currentDay: number): string {
  const targetLabel = inquiry.targetPartyId
    ? `Partei ${inquiry.targetPartyId}`
    : `Ministerium ${inquiry.targetMinistry}`;
  const hearingNum = inquiry.hearingCount + 1;
  return [
    `SIMULATIONSTAG ${currentDay}`,
    `UNTERSUCHUNGSAUSSCHUSS: "${inquiry.subject}"`,
    `EINGESETZT VON: ${inquiry.filingPartyId}`,
    `ZIEL: ${targetLabel}`,
    `EINSETZUNGSTAG: ${inquiry.filedOnDay}`,
    `ANHÖRUNG NR.: ${hearingNum}`,
    "",
    "Schreibe eine 2–4 Sätze lange Zusammenfassung der heutigen Anhörung.",
  ].join("\n");
}

function buildFinalReportPrompt(inquiry: InquiryCommittee, outcome: InquiryOutcome, currentDay: number): string {
  const targetLabel = inquiry.targetPartyId
    ? `Partei ${inquiry.targetPartyId}`
    : `Ministerium ${inquiry.targetMinistry}`;
  const verdict = outcome === "wrongdoing_found"
    ? "Verfehlungen festgestellt"
    : "kein Fehlverhalten festgestellt";
  return [
    `SIMULATIONSTAG ${currentDay}`,
    `UNTERSUCHUNGSAUSSCHUSS: "${inquiry.subject}"`,
    `EINGESETZT VON: ${inquiry.filingPartyId}`,
    `ZIEL: ${targetLabel}`,
    `EINSETZUNGSTAG: ${inquiry.filedOnDay}`,
    `LAUFZEIT: ${currentDay - inquiry.filedOnDay} Tage`,
    `ANHÖRUNGEN: ${inquiry.hearingCount}`,
    `AUSGANG: ${verdict}`,
    "",
    "Schreibe einen 4–6 Sätze langen Abschlussbericht. Erzähle den festgelegten Ausgang — entscheide ihn nicht.",
  ].join("\n");
}

/** S20: builds the hearing-summary batch request (one item per active hearing). */
export function buildInquiryHearingBatchRequest(
  hearings: InquiryCommittee[],
  currentDay: number,
): BatchRequest[] {
  return hearings.map(h => ({
    customId: `inquiry-hearing-${h.id}-day${currentDay}`,
    system: HEARING_SYSTEM_PROMPT,
    prompt: buildHearingPrompt(h, currentDay),
    maxTokens: 200,
    roleKey: "daily",
  }));
}

/**
 * Process the hearing batch results: increments hearingCount + lastHearingDay
 * on each inquiry whose AI summary returned, and emits one
 * `inquiry_hearing_held` event per success. Failed batch items are silent —
 * the watchdog will sweep up any inquiry that goes 60 days without a hearing.
 */
export function processInquiryHearingBatchResult(
  results: BatchResult[],
  hearings: InquiryCommittee[],
  currentDay: number,
): Array<Omit<SimulationEvent, "id">> {
  const events: Array<Omit<SimulationEvent, "id">> = [];
  const t0 = Date.now();
  for (const inquiry of hearings) {
    const result = findResult(results, `inquiry-hearing-${inquiry.id}-day${currentDay}`);
    if (!result || !result.text) {
      logAICall({ task: "inquiry_hearing", model: result?.model, provider: result?.provider, latencyMs: Date.now() - t0, parseOk: false, validationOk: false, fallback: "skip" });
      continue;
    }
    const summary = result.text.trim();
    if (summary.length === 0) {
      logAICall({ task: "inquiry_hearing", model: result.model, provider: result.provider, latencyMs: Date.now() - t0, parseOk: false, validationOk: false, fallback: "skip" });
      continue;
    }
    const newCount = inquiry.hearingCount + 1;
    getSqlite().transaction(() => {
      getDb().update(schema.inquiryCommittees)
        .set({ hearingCount: newCount, lastHearingDay: currentDay })
        .where(eq(schema.inquiryCommittees.id, inquiry.id))
        .run();
    })();
    logAICall({ task: "inquiry_hearing", model: result.model, provider: result.provider, latencyMs: Date.now() - t0, parseOk: true, validationOk: true });
    events.push({
      dayNumber: currentDay,
      type: "inquiry_hearing_held",
      actor: inquiry.filingPartyId,
      title: `Anhörung im Untersuchungsausschuss: ${inquiry.subject}`,
      description: summary,
      data: { inquiryId: inquiry.id, hearingNumber: newCount },
    });
  }
  return events;
}

/** S21: builds the final-report batch request (one item per just-concluded inquiry). */
export function buildInquiryFinalReportBatchRequest(
  concluded: Array<{ inquiry: InquiryCommittee; outcome: InquiryOutcome }>,
  currentDay: number,
): BatchRequest[] {
  return concluded.map(({ inquiry, outcome }) => ({
    customId: `inquiry-final-${inquiry.id}`,
    system: FINAL_REPORT_SYSTEM_PROMPT,
    prompt: buildFinalReportPrompt(inquiry, outcome, currentDay),
    maxTokens: 350,
    roleKey: "daily",
  }));
}

/**
 * Process final-report batch results: store the AI report on the
 * `inquiry_committees.final_report` column. If the batch item failed,
 * the column stays NULL — graceful degrade (the inquiry_concluded event
 * still fired with a templated description).
 */
export function processInquiryFinalReportBatchResult(
  results: BatchResult[],
  concluded: Array<{ inquiry: InquiryCommittee; outcome: InquiryOutcome }>,
): void {
  const t0 = Date.now();
  for (const { inquiry } of concluded) {
    const result = findResult(results, `inquiry-final-${inquiry.id}`);
    if (!result || !result.text) {
      logAICall({ task: "inquiry_final_report", model: result?.model, provider: result?.provider, latencyMs: Date.now() - t0, parseOk: false, validationOk: false, fallback: "skip" });
      continue;
    }
    const report = result.text.trim();
    if (report.length === 0) {
      logAICall({ task: "inquiry_final_report", model: result.model, provider: result.provider, latencyMs: Date.now() - t0, parseOk: false, validationOk: false, fallback: "skip" });
      continue;
    }
    getDb().update(schema.inquiryCommittees)
      .set({ finalReport: report })
      .where(eq(schema.inquiryCommittees.id, inquiry.id))
      .run();
    logAICall({ task: "inquiry_final_report", model: result.model, provider: result.provider, latencyMs: Date.now() - t0, parseOk: true, validationOk: true });
  }
}

