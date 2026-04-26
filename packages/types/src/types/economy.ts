import type { BillCategory, BillImpact, MotionType } from "./bills.js";
import type { MinistryPortfolio } from "./elections.js";
import type { InterpellationType } from "./parliament.js";

export interface EconomyState {
  budget: number;          // in billions EUR
  unemployment: number;    // percentage
  inflation: number;       // percentage
  gdpGrowth: number;       // percentage
}

export interface NationalState {
  coalitionParties: string[];
  oppositionParties: string[];
  economy: EconomyState;
  publicSentiment: number; // 0-100
  provisionalBudget: boolean;
  coalitionCohesion?: number | null;
  // Cycle 4 PR 2 — true while Schuldenbremse-Aussetzung (Art. 115 GG) is in force.
  // Auto-cleared on `schuldenbremseSuspendedUntilDay` by checkSchuldenbremseExpiry.
  // While true, the loop's provisional-budget GDP drag is suppressed.
  schuldenbremseSuspended?: boolean;
}

export type CrisisSeverity = "low" | "medium" | "high";
export type CrisisCategory = BillCategory;

export interface Crisis {
  id: string;
  templateId: string;
  name: string;
  description: string;
  category: CrisisCategory;
  severity: CrisisSeverity;
  startDay: number;
  endDay: number;
  dailyImpact: BillImpact;
  resolved: boolean;
}

export interface BudgetAllocations {
  finance: number;
  labour: number;
  environment: number;
  interior: number;
  defence: number;
  education: number;
  health: number;
  infrastructure: number;
}

export interface BudgetVote {
  partyId: string;
  vote: "yes" | "no";
  seats: number;
}

export interface Budget {
  id: string;
  cycleNumber: number;
  status: "passed" | "rejected";
  allocations: BudgetAllocations;
  totalAmount: number;
  proposedOnDay: number;
  votedOnDay: number | null;
  votes: BudgetVote[];
  yesSeats: number | null;
  noSeats: number | null;
  economicEffect: Record<string, number> | null;
  revisionAttempt: number;
}

// Cycle 5 PR 1 — Ausschussanhörungen (S2: experts seed table; S3: lifecycle).
// Q3=A: lightweight seed table with real names; expert rows are reused across
// hearings + (Cycle 5 PR 2) Enquete-Kommissionen.
export interface Expert {
  id: string;
  name: string;
  affiliation: string;
  /** Ministry portfolios this expert is qualified to advise on. */
  expertiseAreas: MinistryPortfolio[];
}

/** S3: AI parse/validation failure → 'lapsed' (tone=0, testimonies=[]). */
export type AusschussanhoerungStatus = "scheduled" | "held" | "lapsed";

export interface AusschussanhoerungTestimony {
  expertId: string;
  statement: string;
}

export interface AusschussanhoerungRow {
  id: string;
  billId: string;
  ministryFocus: MinistryPortfolio;
  expertIds: string[];
  testimonies: AusschussanhoerungTestimony[];
  /** [-1, +1]; 0 until AI lands or on lapse (read by bill-pipeline as no-nudge). */
  tone: number;
  heldOnDay: number;
  status: AusschussanhoerungStatus;
}

// Cycle 5 PR 2 — Enquete-Kommission (long-form policy commission).
// Q2=A: mid-fidelity — establish + AI Schlussbericht only. Bipartisan
// (S17 — visible to coalition + opposition agents). Lifecycle: proposed
// (Bundestag-Beschluss vote happens same tick) → active OR rejected;
// active rows transition to concluded via watchdog at scheduledEndDay.
export type EnqueteCommissionStatus =
  | "proposed"
  | "active"
  | "concluded"
  | "rejected"
  | "lapsed";

export interface EnqueteVoteResult {
  yes: number;
  no: number;
  abstain: number;
  passed: boolean;
}

// =============================================================================
// Cycle 5 PR 3 (S24, R10) — typed PendingInjection discriminated union
// =============================================================================
//
// Replaces the previous `data: Record<string, unknown>` shape so each variant
// carries a typed payload and TypeScript narrows correctly at consumption
// sites. Closes the `as any` cast in `loop.ts` step 10h + the inline casts
// in `processNachtragsInjection`.
//
// All currently-used variant strings (admin-injectable + system-internal +
// MdB-injectable) are enumerated here. Adding a new variant: extend the
// discriminated union and TypeScript will surface every caller that needs
// to handle it.

/** S24 — Crisis-template injection (admin-injectable, dispatched into pendingInjections). */
export interface CrisisInjectionPayload {
  templateId?: string;
  /** Optional admin-side narrative override; ignored by current consumer. */
  description?: string;
}

/** S24 — Snap-election trigger. Empty payload — type alone carries the signal. */
export type ElectionInjectionPayload = Record<string, never>;

/** S24 — Annul the most recent election + restore prior seat distribution. */
export type InvalidateElectionInjectionPayload = Record<string, never>;

/** S24 — Force a budget cycle on the next tick (admin-injectable). */
export type BudgetInjectionPayload = Record<string, never>;

/** S24 — Direct economic-impact pulse, applied immediately. */
export interface EconomicShockInjectionPayload {
  impact: BillImpact;
}

/**
 * S24 / R10 — Nachtragshaushalt (supplementary budget) injection. Queued by
 * loop.ts step 10h when a Schuldenbremse-Aussetzung passes; consumed by
 * `processNachtragsInjection`. Note: the row carries ONLY the originating
 * crisis ID; total/category/allocations are computed at consumption time
 * (the spec's example payload was incorrect).
 */
export interface NachtragsInjectionPayload {
  activeCrisisId: string | null;
}

/** S24 — User-driven (MdB) action: queue an amendment for the loop to draft. */
export interface MdbAmendmentInjectionPayload {
  billId: string;
  title: string;
  description: string;
  impactChange: BillImpact;
  partyId: string;
  userId: string;
  proposerName: string;
}

/** S24 — User-driven (MdB) action: queue a motion. */
export interface MdbMotionInjectionPayload {
  motionType: MotionType;
  title: string;
  description: string;
  partyId: string;
  userId: string;
  proposerName: string;
}

/** S24 — User-driven (MdB) action: queue an interpellation. */
export interface MdbInterpellationInjectionPayload {
  interpellationType: InterpellationType;
  title: string;
  question: string;
  targetMinistry: MinistryPortfolio;
  partyId: string;
  userId: string;
  proposerName: string;
}

/** Discriminant string union — re-exported from meta.ts for import stability. */
export type PendingInjectionType =
  | "crisis"
  | "election"
  | "invalidate_election"
  | "budget"
  | "economic_shock"
  | "nachtragshaushalt"
  | "mdb_amendment"
  | "mdb_motion"
  | "mdb_interpellation";

/**
 * S24 / R10 — Discriminated union by `type`. TypeScript narrows the `data`
 * field to the matching payload inside a switch on `injection.type`. Replaces
 * the previous `data: Record<string, unknown>` shape that forced `as any`
 * casts at every read/write site.
 */
export type PendingInjection =
  | { id: string; type: "crisis"; data: CrisisInjectionPayload; consumed: boolean }
  | { id: string; type: "election"; data: ElectionInjectionPayload; consumed: boolean }
  | { id: string; type: "invalidate_election"; data: InvalidateElectionInjectionPayload; consumed: boolean }
  | { id: string; type: "budget"; data: BudgetInjectionPayload; consumed: boolean }
  | { id: string; type: "economic_shock"; data: EconomicShockInjectionPayload; consumed: boolean }
  | { id: string; type: "nachtragshaushalt"; data: NachtragsInjectionPayload; consumed: boolean }
  | { id: string; type: "mdb_amendment"; data: MdbAmendmentInjectionPayload; consumed: boolean }
  | { id: string; type: "mdb_motion"; data: MdbMotionInjectionPayload; consumed: boolean }
  | { id: string; type: "mdb_interpellation"; data: MdbInterpellationInjectionPayload; consumed: boolean };

export interface EnqueteCommissionRow {
  id: string;
  topic: MinistryPortfolio;
  proposingPartyId: string;
  /** JSON: { [partyId]: number } — Σ === ENQUETE_MDB_SLOTS (largest-remainder method). */
  partyMemberIds: Record<string, number>;
  /** JSON: string[] of length [ENQUETE_EXPERT_SLOTS_MIN, ENQUETE_EXPERT_SLOTS_MAX]. */
  expertMemberIds: string[];
  formedOnDay: number;
  /** formedOnDay + uniform draw [ENQUETE_DURATION_MIN_DAYS, ENQUETE_DURATION_MAX_DAYS]. */
  scheduledEndDay: number;
  /** null while active. */
  concludedOnDay: number | null;
  status: EnqueteCommissionStatus;
  /** null until concluded; written by AI Schlussbericht batch processor. */
  finalReport: string | null;
  /** null until convened/rejected; same-tick simple-majority Bundestag-Beschluss tally. */
  voteResult: EnqueteVoteResult | null;
}
