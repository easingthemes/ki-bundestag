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

export type BillCategory =
  | "economy"
  | "social"
  | "environment"
  | "immigration"
  | "defense"
  | "education"
  | "healthcare"
  | "infrastructure";

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

export type BillStatus = "proposed" | "first_reading" | "committee" | "second_reading" | "third_reading" | "debate" | "passed" | "rejected" | "struck_down";

export type CommitteeRecommendation = "pass" | "amend" | "reject";

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

export type SimulationEventType =
  | "bill_proposed"
  | "bill_debate"
  | "bill_passed"
  | "bill_rejected"
  | "vote_cast"
  | "statement"
  | "economy_update"
  | "day_start"
  | "crisis_start"
  | "crisis_end"
  | "weekly_report"
  | "monthly_report"
  | "election_announced"
  | "election_campaign"
  | "election_result"
  | "government_formed"
  | "negotiation_round"
  | "negotiation_complete"
  | "fraktion_formed"
  | "fraktion_dissolved"
  | "bill_first_reading"
  | "bill_committee"
  | "bill_second_reading"
  | "bill_third_reading"
  | "amendment_proposed"
  | "amendment_voted"
  | "motion_submitted"
  | "motion_passed"
  | "motion_rejected"
  | "government_cabinet_formed"
  | "interpellation_filed"
  | "interpellation_answered"
  | "interpellation_expired"
  | "confidence_vote_filed"
  | "confidence_vote_passed"
  | "confidence_vote_failed"
  | "government_dissolved"
  | "constitutional_challenge_filed"
  | "constitutional_court_ruled"
  | "budget_proposed"
  | "budget_passed"
  | "budget_rejected"
  | "provisional_budget_started"
  | "budget_revision_rejected"
  | "presidential_veto"
  | "bill_committee_rejected"
  | "mdb_speech";

export interface SimulationEvent {
  id: string;
  dayNumber: number;
  type: SimulationEventType;
  actor: string;
  title: string;
  description: string;
  data?: Record<string, unknown>;
}

// Agent types

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

export interface SimulationMeta {
  currentDay: number;
  lastRunAt: string | null;
  nextElectionDay: number;
  lowSentimentStreak: number;
  dailySummary: string | null;
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

export interface PartyHistoryEntry {
  id: number;
  partyId: string;
  dayNumber: number;
  approvalRating: number;
  seatCount: number;
}

export interface CitizenQuestion {
  id: string;
  question: string;
  targetPartyId: string;
  response: string | null;
  respondedOnDay: number | null;
  createdOnDay: number;
  status: "pending" | "answered";
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

export interface PendingInjection {
  id: string;
  type: "crisis" | "election" | "economic_shock" | "invalidate_election" | "budget";
  data: Record<string, unknown>;
  consumed: boolean;
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

export interface Fraktion {
  id: string;
  partyId: string;
  leaderName: string;
  status: "active" | "dissolved";
  formedOnDay: number;
  dissolvedOnDay: number | null;
}

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

// Budget
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
