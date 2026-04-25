import type { Party } from "./parties.js";
import type { NationalState, Crisis } from "./economy.js";
import type { BillCategory, BillImpact, VoteChoice, Bill, Motion, MotionType } from "./bills.js";
import type { Election, Government, MinistryPortfolio, ConfidenceVote } from "./elections.js";
import type { MediaArticle, Interpellation, ConstitutionalChallenge, InterpellationType } from "./parliament.js";
import type { SimulationEvent } from "./meta.js";

export interface EraCaseFacts {
  economy: {
    budget: number;
    unemployment: number;
    inflation: number;
    gdpGrowth: number;
    publicSentiment: number;
  };
  coalitionPartyIds: string[];
  government?: {
    chancellorName: string;
    chancellorPartyId: string;
  };
  partyApprovals: Record<string, number>;
  partySeats: Record<string, number>;
  billsPassed: Array<{ id: string; title: string; category: string }>;
  billsRejected: Array<{ id: string; title: string }>;
  elections: Array<{ reason: string; day: number; outcome?: string }>;
  crises: Array<{ name: string; severity: string; resolved: boolean }>;
  governmentChanges: Array<{ type: string; day: number; description: string }>;
}

export interface AgentContext {
  party: Party;
  allParties: Party[];
  nationalState: NationalState;
  pendingBills: Bill[];
  recentEvents: SimulationEvent[];
  currentDay: number;
  activeCrises: Crisis[];
  activeElection?: Election;
  recentMedia?: MediaArticle[];
  recentMotions?: Motion[];
  recentInterpellations?: Interpellation[];
  recentConfidenceVotes?: ConfidenceVote[];
  recentConstitutionalChallenges?: ConstitutionalChallenge[];
  passedBillsForChallenge?: Bill[];
  hasFraktion?: boolean;
  fraktionLeader?: string;
  government?: Government;
  topInternalProposals?: Array<{ title: string; category: string; score: number; totalVotes: number }>;
  memberSignals?: Record<string, { yes: number; no: number }>;  // keyed by billId
  mdbVoteSummary?: Record<string, { yes: number; no: number; abstain: number; total: number }>;  // keyed by billId
  briefing?: string;
  recentOwnActions?: Array<{ day: number; type: string; title: string }>;
  realWorldContext?: string;
  realPartyPositions?: string;
  eraSummaries?: Array<{ startDay: number; endDay: number; summary: string; caseFacts?: EraCaseFacts }>;
  // Cycle 4 PR 1 — opposition-side flag set by loop.ts before agent dispatch when a
  // high-severity crisis maps to a coalition-held ministry (R5 heuristic). Absence
  // means agents should not file a Untersuchungsausschuss in a normal day.
  inquiryOpportunity?: { triggerCrisisId: string; targetPartyId: string; severity: string };
  // Cycle 4 PR 2 — coalition-leader-side flag set when a high-severity active
  // crisis exists OR provisionalBudget has been true for ≥ 30 sim days (Q5).
  // Absence means coalition leader should NOT propose Schuldenbremse-Aussetzung.
  fiscalEmergencyJustified?: { activeCrisisId?: string; provisionalBudgetDays: number };
}

export interface ProposeBillAction {
  type: "propose_bill";
  title: string;
  description: string;
  category: BillCategory;
  impact: BillImpact;
}

export interface VoteAction {
  type: "vote";
  billId: string;
  vote: VoteChoice;
  reason: string;
}

export interface StatementAction {
  type: "statement";
  title: string;
  statement: string;
}

export interface ProposeAmendmentAction {
  type: "propose_amendment";
  billId: string;
  title: string;
  description: string;
  impactChange: BillImpact;
}

export interface SubmitMotionAction {
  type: "submit_motion";
  motionType: MotionType;
  title: string;
  description: string;
}

export interface FileInterpellationAction {
  type: "file_interpellation";
  interpellationType: InterpellationType;
  title: string;
  question: string;
  targetMinistry: MinistryPortfolio;
}

export interface CallVertrauensfrageAction {
  type: "call_vertrauensfrage";
  title: string;
  description: string;
}

export interface FileMisstrauensvotumAction {
  type: "file_misstrauensvotum";
  title: string;
  description: string;
  proposedChancellor: string;
  proposedChancellorPartyId: string;
}

export interface FileConstitutionalChallengeAction {
  type: "file_constitutional_challenge";
  billId: string;
  title: string;
  arguments: string;
}

// Cycle 4 PR 1 — Untersuchungsausschuss agent action. At least one of
// targetPartyId / targetMinistry must be provided (S17 invariant).
export interface FileInquiryCommitteeAction {
  type: "file_inquiry_committee";
  subject: string;
  targetPartyId?: string | null;
  targetMinistry?: MinistryPortfolio | null;
}

// Cycle 4 PR 2 — Schuldenbremse-Aussetzung (Art. 115 GG fiscal emergency).
// Coalition leader proposes; vote happens same day; pass triggers a
// Nachtragshaushalt injection (consumed by PR 3).
export interface ProposeFiscalEmergencyAction {
  type: "propose_fiscal_emergency";
  title: string;
  description: string;
  /** Optional active-crisis ID that motivates the suspension. */
  activeCrisisId?: string | null;
  /** Free-text justification quoted in the proposal event. */
  justification: string;
}

export interface NothingAction {
  type: "nothing";
}

export interface CampaignAction {
  type: "campaign_statement";
  title: string;
  promise: string;
}

export interface NegotiationAction {
  type: "negotiation_position";
  position: string;
  acceptablePartners: string[];
  concession: string;
}

export type AgentAction =
  | ProposeBillAction
  | VoteAction
  | StatementAction
  | CampaignAction
  | NegotiationAction
  | ProposeAmendmentAction
  | SubmitMotionAction
  | FileInterpellationAction
  | CallVertrauensfrageAction
  | FileMisstrauensvotumAction
  | FileConstitutionalChallengeAction
  | FileInquiryCommitteeAction
  | ProposeFiscalEmergencyAction
  | NothingAction;

export interface AgentResponse {
  actions: AgentAction[];
}
