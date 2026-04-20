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

/** Zustimmungs- vs. Einspruchsgesetz classification (Cycle 2a S1). */
export type BundesratMode = "zustimmung" | "einspruch";

/** Per-Land bloc vote (Art. 51 Abs. 3 GG: einheitliche Stimmabgabe). */
export type LandVote = "ja" | "nein" | "enthaltung";

export interface BundesratLandResult {
  landId: string;
  landName: string;
  votes: number;
  vote: LandVote;
  coalitionPosition: {
    parties: string[];
    majoritySupport: number;
  };
}

export interface BundesratVoteResult {
  mode: BundesratMode;
  tally: { ja: number; nein: number; enthaltung: number };
  total: number;
  threshold: number;
  passed: boolean;
  landResults: BundesratLandResult[];
}

/** Vermittlungsausschuss outcome (Cycle 2a S4). */
export type VermittlungOutcome = "compromise" | "bundestag_rejects" | "bundesrat_rejects";

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
  /** Post-3rd-reading state. "voted" is transient (same-day flip); "vermittlung" means compromise negotiation pending. */
  bundesratState?: "pending" | "voted" | "vermittlung" | "cleared";
  /** Day the bill entered the Bundesrat phase (== day 3rd-reading vote passed). */
  bundesratEntryDay?: number;
  /** Scheduled Ausfertigung (Kanzler/Minister signature) day. */
  ausfertigungDay?: number;
  /** Day the bill takes effect (Inkrafttreten). bill_passed fires here. */
  inkrafttretenDay?: number;
  /** Zustimmungs- or Einspruchsgesetz classification (backfilled from category). */
  bundesratMode?: BundesratMode;
  /** Full Bundesrat vote breakdown with per-Land detail. Set when the vote is cast. */
  bundesratVoteResult?: BundesratVoteResult;
  /** Day the bill entered the Vermittlungsausschuss (null until invoked). */
  vermittlungEntryDay?: number;
  /** Drawn min-dwell for the Vermittlungs phase (14–56 days). */
  vermittlungMinDuration?: number;
  /** Outcome of the Vermittlungsausschuss once resolved. */
  vermittlungOutcome?: VermittlungOutcome;
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
