export type BillCategory =
  | "economy"
  | "social"
  | "environment"
  | "immigration"
  | "defense"
  | "education"
  | "healthcare"
  | "infrastructure";

export type BillStatus =
  | "proposed"
  | "first_reading"
  | "committee"
  | "second_reading"
  | "third_reading"
  | "debate"
  | "passed"
  | "rejected"
  | "struck_down";

export type CommitteeRecommendation = "pass" | "amend" | "reject";

export interface BillImpact {
  budget?: number;
  unemployment?: number;
  inflation?: number;
  gdpGrowth?: number;
  publicSentiment?: number;
}

export type VoteChoice = "yes" | "no" | "abstain";

export interface BillVote {
  partyId: string;
  vote: VoteChoice;
  reason: string;
}

export interface Amendment {
  id: string;
  billId: string;
  proposedBy: string;
  title: string;
  description: string;
  impactChange: BillImpact;
  accepted: boolean;
  votes: BillVote[];
}

export interface Bill {
  id: string;
  title: string;
  description: string;
  category: BillCategory;
  proposedBy: string;
  status: BillStatus;
  impact: BillImpact;
  votes: BillVote[];
  proposedOnDay: number;
  reading?: number;
  committeeName?: string;
  committeeRecommendation?: CommitteeRecommendation;
  amendments?: Amendment[];
  originalImpact?: BillImpact;
  statusChangedOnDay?: number;
  isGovernmentBill?: boolean;
  vetoedByPresident?: boolean;
  memberInitiative?: boolean;
  proposerDisplayName?: string;
  /** Day the bill entered its current stage. Drives min-dwell gating. */
  stageEntryDay?: number;
  /** Minimum days the bill must spend in the current stage (persisted per-bill). */
  stageMinDuration?: number;
  /** Soft cap on stage duration (informational; pipeline doesn't force-exit today). */
  stageMaxDuration?: number;
  /** True for bills drawn on the longer (complex) committee timing tier. */
  isComplexBill?: boolean;
  /** Post-3rd-reading state. Null until parliament passes the bill. */
  bundesratState?: "pending" | "cleared";
  /** Day the bill entered the Bundesrat phase (== day 3rd-reading vote passed). */
  bundesratEntryDay?: number;
  /** Scheduled Ausfertigung (Kanzler/Minister signature) day. */
  ausfertigungDay?: number;
  /** Day the bill takes effect (Inkrafttreten). bill_passed fires here. */
  inkrafttretenDay?: number;
}

// Motions & Resolutions
export type MotionType = "motion" | "resolution";
export type MotionStatus = "proposed" | "passed" | "rejected";

export interface Motion {
  id: string;
  type: MotionType;
  title: string;
  description: string;
  proposedBy: string;
  status: MotionStatus;
  votes: BillVote[];
  dayNumber: number;
  sentimentImpact?: number;
}
