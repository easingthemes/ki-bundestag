import type { BillImpact, VoteChoice } from "./bills.js";
import type { MinistryPortfolio } from "./elections.js";

// Interpellations (Anfragen)
export type InterpellationType = "kleine" | "große";
export type InterpellationStatus = "pending" | "answered" | "expired";

export interface Interpellation {
  id: string;
  type: InterpellationType;
  title: string;
  question: string;
  filedByPartyId: string;
  targetMinistry: MinistryPortfolio;
  targetMinisterName: string;
  targetPartyId: string;
  response: string | null;
  status: InterpellationStatus;
  dayNumber: number;
  respondedOnDay: number | null;
  sentimentImpact: number | null;
}

// Constitutional Court (Bundesverfassungsgericht)
export interface ConstitutionalChallenge {
  id: string;
  billId: string;
  billTitle: string;
  filedByPartyId: string;
  arguments: string;
  decision: "struck_down" | "upheld" | null;
  reasoning: string | null;
  status: "pending" | "ruled";
  dayNumber: number;
  ruledOnDay: number | null;
  sentimentImpact: number | null;
}

export interface Poll {
  id: string;
  question: string;
  options: string[];
  votes: Record<string, number>;
  createdOnDay: number;
  expiresOnDay: number | null;
  active: boolean;
  category: string;
}

export interface CitizenQuestion {
  id: string;
  question: string;
  targetPartyId: string;
  response: string | null;
  respondedOnDay: number | null;
  createdOnDay: number;
  status: "pending" | "answered";
  topic?: string | null;
  voteScore: number;
  totalVotes: number;
  userVote?: 1 | -1 | null;
}

export interface Referendum {
  id: string;
  title: string;
  description: string;
  options: string[];
  votes: Record<string, number>;
  createdOnDay: number;
  closesOnDay: number;
  status: "active" | "passed" | "rejected" | "expired";
  result: string | null;
  impact: BillImpact | null;
  category: string;
}

export interface MediaArticle {
  id: string;
  headline: string;
  summary: string;
  content: string;
  outlet: string;
  bias: string;
  category: string;
  dayNumber: number;
}

// MdB (Bundestag Member) types
export type SeatController = "human" | "ai";
export type ProxyDefault = "party_line" | "abstain";
export type MdbApplicationStatus = "pending" | "approved" | "rejected" | "expired";

export interface BundestagSeat {
  id: string;
  seatNumber: number;
  partyId: string;
  controller: SeatController;
  userId: string | null;
  electionId: string | null;
  active: boolean;
  proxyDefault: ProxyDefault;
  disciplineLevel: number;    // 0-3
  disciplineReason: string | null;
  allocatedOnDay: number;
}

export interface MdbApplication {
  id: string;
  userId: string;
  partyId: string;
  applicationText: string;
  policyFocus: string[] | null;
  status: MdbApplicationStatus;
  aiReasoning: string | null;
  priorityScore: number | null;
  createdOnDay: number;
  reviewedOnDay: number | null;
  cooldownUntilDay: number | null;
}

export interface MdbVote {
  id: string;
  seatId: string;
  billId: string;
  userId: string;
  vote: VoteChoice;
  createdAt: number;
}

export interface MdbSpeech {
  id: string;
  userId: string;
  billId: string;
  reading: number;
  content: string;
  sentimentImpact: number | null;
  dayNumber: number;
  createdAt: number;
}
