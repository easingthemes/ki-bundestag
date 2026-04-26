import type { BillCategory, BillImpact } from "./bills.js";
import type { MinistryPortfolio } from "./elections.js";

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
