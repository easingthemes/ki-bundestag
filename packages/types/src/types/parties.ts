export interface InternalProposal {
  id: string;
  partyId: string;
  proposedBy: string;      // userId or "ai"
  proposerName: string;
  title: string;
  description: string;
  category: string;
  rationale: string | null;
  status: "open" | "reviewing" | "accepted" | "declined" | "expired";
  voteScore: number;
  totalVotes: number;
  createdOnDay: number;
  reviewByDay: number;
  reviewedOnDay: number | null;
  declineReason: string | null;
  bundestagseBillId: string | null;
}

// Policy priorities: each axis ranges from -1 to +1
export interface PolicyPriorities {
  economy: number;      // -1 = regulation, +1 = free market
  social: number;       // -1 = conservative, +1 = progressive
  environment: number;  // -1 = industry-first, +1 = green
  immigration: number;  // -1 = restrictive, +1 = open
  spending: number;     // -1 = austerity, +1 = spending
}

export type CoalitionRole = "leader" | "junior" | "opposition";

export interface Party {
  id: string;
  name: string;
  color: string;
  ideology: string;
  seatCount: number;
  approvalRating: number;
  policyPriorities: PolicyPriorities;
  coalitionRole: CoalitionRole;
  memberCount: number;
}
