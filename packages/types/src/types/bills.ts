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
