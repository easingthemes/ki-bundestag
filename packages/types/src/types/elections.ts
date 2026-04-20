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

export interface ChancellorCandidate {
  partyId: string;
  name: string;
}

export interface CoalitionAgreement {
  parties: string[];
  keyPolicies: string[];
  summary: string;
  concessions: Record<string, string>;
  /** Chancellor-Kandidat named in the agreement (Cycle 2a S5). Optional — falls
   *  back to FRAKTION_LEADERS[parties[0]] when absent. */
  chancellorCandidate?: ChancellorCandidate;
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
  /** Day of the konstituierende Sitzung (Art. 39 Abs. 2 GG, ≤30 days post-election). */
  konstituierendeSitzungDay?: number | null;
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

// Kanzlerwahl (Art. 63 GG, Cycle 2a S5/S6) — 3-phase chancellor election.

export type KanzlerwahlPhase = 1 | 2 | 3;
export type KanzlerwahlOutcome = "elected" | "failed" | "pending";
export type KanzlerwahlStatus = "phase1" | "phase2" | "phase3" | "elected" | "failed";

export interface KanzlerwahlRound {
  phase: KanzlerwahlPhase;
  day: number;
  candidatePartyId: string;
  candidateName: string;
  votesYes: number;
  votesNo: number;
  votesAbstain: number;
  /** Required yes votes for this round to pass (Kanzlermehrheit for P1/P2,
   *  relative majority for P3). */
  required: number;
  outcome: KanzlerwahlOutcome;
}

export interface KanzlerwahlState {
  id: string;
  electionId: string;
  startedOnDay: number;
  phase1: KanzlerwahlRound | null;
  phase2Rounds: KanzlerwahlRound[];
  phase2WindowEndDay: number | null;
  phase3: KanzlerwahlRound | null;
  status: KanzlerwahlStatus;
  electedCandidatePartyId: string | null;
  electedCandidateName: string | null;
  /** Next Sitzungstag after a successful Kanzlerwahl; cabinet forms on this day. */
  amtseidDay: number | null;
}
