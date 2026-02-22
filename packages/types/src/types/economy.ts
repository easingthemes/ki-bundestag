import type { BillCategory, BillImpact } from "./bills.js";

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
