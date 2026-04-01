import type { Party } from "./parties.js";
import type { NationalState, Crisis } from "./economy.js";
import type { BillCategory, BillImpact, VoteChoice, Bill, Motion, MotionType } from "./bills.js";
import type { Election, Government, MinistryPortfolio, ConfidenceVote } from "./elections.js";
import type { MediaArticle, Interpellation, ConstitutionalChallenge, InterpellationType } from "./parliament.js";
import type { SimulationEvent } from "./meta.js";

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
  eraSummaries?: Array<{ startDay: number; endDay: number; summary: string }>;

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
  | NothingAction;

export interface AgentResponse {
  actions: AgentAction[];
}
