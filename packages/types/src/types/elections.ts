import type { BillVote } from "./bills.js";

export type MinistryPortfolio =
  | "finance"
  | "labour"
  | "environment"
  | "interior"
  | "defence"
  | "education"
  | "health"
  | "infrastructure";

export interface Minister {
  name: string;
  partyId: string;
  portfolio: MinistryPortfolio;
}

export interface Government {
  id: string;
  electionId: string | null;
  chancellorName: string;
  chancellorPartyId: string;
  ministers: Minister[];
  formedOnDay: number;
  dissolvedOnDay: number | null;
  active: boolean;
}

export type ElectionStatus = "announced" | "campaign" | "voting" | "negotiation" | "completed";

export interface ElectionResult {
  partyId: string;
  votesPercent: number;
  seatsWon: number;
  seatDelta: number;
}

export interface NegotiationRound {
  roundNumber: number;
  partyId: string;
  position: string;
  concession: string;
  acceptablePartners: string[];
}

export interface CoalitionAgreement {
  parties: string[];
  keyPolicies: string[];
  summary: string;
  concessions: Record<string, string>;
}

export interface Election {
  id: string;
  triggerReason: string;
  announcedOnDay: number;
  campaignStartDay: number;
  electionDay: number;
  status: ElectionStatus;
  results: ElectionResult[] | null;
  newCoalition: string[] | null;
  newOpposition: string[] | null;
  negotiationRounds: NegotiationRound[][] | null;
  coalitionAgreement: CoalitionAgreement | null;
}

// Confidence Votes
export type ConfidenceVoteType = "vertrauensfrage" | "misstrauensvotum";

export interface ConfidenceVote {
  id: string;
  type: ConfidenceVoteType;
  governmentId: string;
  initiatedByPartyId: string;
  chancellorName: string;
  proposedChancellor: string | null;
  proposedChancellorPartyId: string | null;
  title: string;
  description: string;
  status: "passed" | "failed";
  votes: BillVote[];
  dayNumber: number;
  sentimentImpact: number | null;
}

export interface Fraktion {
  id: string;
  partyId: string;
  leaderName: string;
  status: "active" | "dissolved";
  formedOnDay: number;
  dissolvedOnDay: number | null;
}
