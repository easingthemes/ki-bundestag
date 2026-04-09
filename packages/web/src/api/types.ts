// All TypeScript interface and type definitions — local copies of backend types.
// Web does not import @ki-bundestag/types directly.

export interface InternalProposal {
  id: string;
  partyId: string;
  proposedBy: string;   // userId or "ai"
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
  bundestagBillId: string | null;
  userVote?: 1 | -1 | null;
}

export interface User {
  id: string;
  displayName: string;
  partyId: string | null;
  avatarUrl: string | null;
  provider: string | null;       // "google" | "github" | null (legacy)
  createdAt: number;
  lastActive: number;
  switchCooldownUntil: number | null; // sim day
  isBot: boolean;
}

export interface Party {
  id: string;
  name: string;
  color: string;
  ideology: string;
  seatCount: number;
  approvalRating: number;
  policyPriorities: Record<string, number>;
  coalitionRole: string;
  recentApprovals: { day: number; approval: number }[];
  memberCount: number;
  inactiveDays: number;
}

export interface BillImpact {
  budget?: number;
  unemployment?: number;
  inflation?: number;
  gdpGrowth?: number;
  publicSentiment?: number;
}

export interface BillVote {
  partyId: string;
  vote: string;
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
  category: string;
  proposedBy: string;
  status: string;
  impact: BillImpact;
  votes: BillVote[];
  proposedOnDay: number;
  reading?: number;
  committeeName?: string;
  committeeRecommendation?: string;
  amendments?: Amendment[];
  originalImpact?: BillImpact;
  isGovernmentBill?: boolean;
  vetoedByPresident?: boolean;
  memberInitiative?: boolean;
  proposerDisplayName?: string;
  statusChangedOnDay?: number;
}

export interface NationalState {
  coalitionParties: string[];
  oppositionParties: string[];
  economy: {
    budget: number;
    unemployment: number;
    inflation: number;
    gdpGrowth: number;
  };
  publicSentiment: number;
  provisionalBudget: boolean;
  coalitionCohesion?: number | null;
}

export interface SimulationEvent {
  id: string;
  dayNumber: number;
  type: string;
  actor: string;
  title: string;
  description: string;
  data?: Record<string, unknown>;
}

export interface Crisis {
  id: string;
  templateId: string;
  name: string;
  description: string;
  category: string;
  severity: string;
  startDay: number;
  endDay: number;
  dailyImpact: BillImpact;
  resolved: boolean;
}

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
  status: string;
  results: ElectionResult[] | null;
  newCoalition: string[] | null;
  newOpposition: string[] | null;
  negotiationRounds: NegotiationRound[][] | null;
  coalitionAgreement: CoalitionAgreement | null;
}

export type TimingPreset = "ultra-fast" | "fast" | "normal" | "slow";

export type ContextDepth = "low" | "normal" | "high";

export interface ContextDepthInfo {
  contextDepth: ContextDepth;
  label: string;
  config: {
    contextTokenBudget: number;
    briefingEventLookbackDays: number;
    briefingTrendDays: number;
    ownActionsLookbackDays: number;
    ownActionsMaxItems: number;
    recentEventsMax: number;
    recentMediaMax: number;
    includeP3: boolean;
    enableBriefing: boolean;
    enrichSecondaryCalls: boolean;
  };
}

export interface PresetInfo {
  preset: TimingPreset;
  participatory: boolean;
  features: Record<string, boolean>;
  label: string;
}

export interface AppNotification {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  data: unknown;
  read: boolean;
  createdAt: string;
  dayNumber: number;
}

export interface SimulationStatus {
  currentDay: number;
  lastRunAt: string | null;
  dayStartedAt: string | null;
  heartbeatAt: string | null;
  dayProgress: number;
  nextElectionDay: number;
  budgetRetryDay: number | null;
  provisionalBudget: boolean;
  dailySummary: string | null;
  timingPreset: TimingPreset;
  contextDepth: ContextDepth;
  startDate: string | null;
  dayPreview: string | null;
  previousDaySummary: {
    dayNumber: number;
    narrative: string;
    mood: string | null;
  } | null;
}

export interface CalendarEvent {
  id: string;
  type: string;
  title: string;
  actor: string;
}

export interface CalendarDay {
  dayNumber: number;
  date: string;
  topEvents: CalendarEvent[];
  totalCount: number;
  narrative?: string | null;
  mood?: string | null;
  preview?: string | null;
}

export interface CalendarData {
  startDate: string;
  currentDay: number;
  days: CalendarDay[];
}

export interface UpcomingEvent {
  dayNumber: number;
  date: string;
  category: string;
  label: string;
  detail?: string;
  link?: string;
}

export interface UpcomingCalendarData {
  startDate: string;
  currentDay: number;
  events: UpcomingEvent[];
}

export interface DaySummary {
  dayNumber: number;
  eventCount: number;
  summary: string;
  simulatedAt: string | null;
  narrative?: string | null;
  mood?: string | null;
  preview?: string | null;
}

export interface PartyHistory {
  id: number;
  partyId: string;
  dayNumber: number;
  approvalRating: number;
  seatCount: number;
}

export interface PartyVoteRecord {
  bill: Bill;
  vote: BillVote;
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
  authorName?: string | null;
  authorIsBot?: boolean;
}

export interface TrendingTopic {
  label: string;
  sampleQuestion: string;
  source: string;
}

export interface QuestionSuggestion {
  id: string;
  question: string;
  topic: string | null;
  targetPartyId: string;
  createdOnDay: number;
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
  userVoted?: boolean;
}

export interface CrisisTemplate {
  id: string;
  name: string;
  severity: string;
  category: string;
}

export interface PendingInjection {
  id: string;
  type: "crisis" | "election" | "economic_shock" | "budget";
  data: Record<string, unknown>;
  consumed: boolean;
}

export interface Fraktion {
  id: string;
  partyId: string;
  leaderName: string;
  status: "active" | "dissolved";
  formedOnDay: number;
  dissolvedOnDay: number | null;
}

export interface Motion {
  id: string;
  type: "motion" | "resolution";
  title: string;
  description: string;
  proposedBy: string;
  status: "proposed" | "passed" | "rejected";
  votes: BillVote[];
  dayNumber: number;
  sentimentImpact?: number;
}

export interface Minister {
  name: string;
  partyId: string;
  portfolio: string;
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

export interface Interpellation {
  id: string;
  type: "kleine" | "große";
  title: string;
  question: string;
  filedByPartyId: string;
  targetMinistry: string;
  targetMinisterName: string;
  targetPartyId: string;
  response: string | null;
  status: "pending" | "answered" | "expired";
  dayNumber: number;
  respondedOnDay: number | null;
  sentimentImpact: number | null;
}

export interface ConfidenceVote {
  id: string;
  type: "vertrauensfrage" | "misstrauensvotum";
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

export interface AlignmentData {
  parties: { id: string; name: string; color: string }[];
  matrix: Record<string, Record<string, number | null>>;
}

export interface ActivityItem {
  type: string;
  title: string;
  description: string;
  dayNumber: number;
  createdAt: string;
  entityId?: string;
  entityType?: string;
  outcome?: string;
}

// ── Analytics types ───────────────────────────────────────────────────────────

export interface AnalyticsData {
  totalUsers: number;
  totalActions: number;
  dau: number;
  wau: number;
  actionBreakdown: { actionType: string; count: number }[];
  topUsers: { userId: string; displayName: string; actionCount: number; isBot?: boolean }[];
  funnel: {
    registered: number;
    joinedParty: number;
    firstAction: number;
    appliedMdb: number;
    gotSeat: number;
  };
  dailyActions: { date: string; count: number }[];
}

// ── Impact & Catchup types ────────────────────────────────────────────────────

export interface ImpactData {
  signalAccuracy: { matched: number; total: number; pct: number };
  proposalOutcomes: { title: string; status: string; billId: string | null }[];
  mdbVoteStats: { total: number; withMajority: number };
  partyStats: { partyId: string; partyName: string; memberCount: number; approvalPerDay: number } | null;
}

export interface CatchupData {
  daysMissed: number;
  billsPassed: { id: string; title: string; status: string }[];
  billsRejected: { id: string; title: string; status: string }[];
  crisesStarted: { id: string; name: string; severity: string }[];
  crisesEnded: { id: string; name: string }[];
  partyApprovalDelta: number | null;
  proposalOutcomes: { title: string; status: string }[];
}

// ── MdB types ─────────────────────────────────────────────────────────────────

export interface BundestagSeat {
  id: string;
  seatNumber: number;
  partyId: string;
  controller: "human" | "ai" | "bot";
  userId: string | null;
  electionId: string | null;
  active: boolean;
  proxyDefault: "party_line" | "abstain";
  disciplineLevel: number;
  disciplineReason: string | null;
  allocatedOnDay: number;
  displayName?: string | null; // enriched by API
  isBot?: boolean;             // enriched by API
}

export interface MdbApplication {
  id: string;
  userId: string;
  partyId: string;
  status: "pending" | "approved" | "rejected";
  motivation: string;
  policyFocus: string | null;
  createdOnDay: number;
  reviewedOnDay: number | null;
  reviewReason: string | null;
  cooldownUntilDay: number | null;
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
  displayName?: string;
  isBot?: boolean;
}

export interface MdbVoteSummary {
  summary: { yes: number; no: number; abstain: number; total: number };
  byParty: Record<string, { yes: number; no: number; abstain: number }>;
  userVote: string | null;
}

// ── Committee types ─────────────────────────────────────────────────────────

export interface CommitteeListItem {
  id: string;
  name: string;
  shortName: string | null;
  billCategory: string | null;
  billCount: number;
  memberCount: number;
}

export interface CommitteeMember {
  seatId: string;
  seatNumber: number;
  partyId: string;
  role: "chair" | "deputy_chair" | "member";
  displayName: string | null;
  controller: "human" | "ai" | "bot";
}

export interface CommitteeDetail {
  id: string;
  name: string;
  shortName: string | null;
  billCategory: string | null;
  bills: Array<{
    id: string;
    title: string;
    status: string;
    proposedBy: string;
    committeeRecommendation: string | null;
  }>;
  members: CommitteeMember[];
  stats: {
    totalBillsReviewed: number;
    passCount: number;
    rejectCount: number;
    amendCount: number;
  };
}

// ── MdB Profile types ────────────────────────────────────────────────────────

export interface MdbVoteRecord {
  billId: string;
  billTitle: string;
  billStatus: string;
  vote: string;
  createdAt: number;
}

export interface MdbSpeechRecord {
  id: string;
  billId: string;
  billTitle: string;
  reading: number;
  content: string;
  sentimentImpact: number | null;
  dayNumber: number;
  createdAt: number;
}

export interface MdbCommitteeMembership {
  committeeId: string;
  committeeName: string;
  shortName: string | null;
  role: "chair" | "deputy_chair" | "member";
}

export interface Sidejob {
  id: string;
  seatId: string;
  partyId: string;
  politicianName: string;
  organization: string;
  role: string;
  incomeLevel: string;
  category: string;
  isControversial: boolean;
  createdOnDay: number;
}

// ── Quiz types ──────────────────────────────────────────────────────────────

export interface QuizThesis {
  id: string;
  text: string;
  category: string;
}

export interface QuizResultItem {
  partyId: string;
  partyName: string;
  color: string;
  matchPercent: number;
  categoryBreakdown: Record<string, number>;
  agreements: number;
  disagreements: number;
}

export interface QuizPartyPosition {
  thesisId: string;
  partyId: string;
  position: string;
  reasoning: string | null;
}

// ── Lobbying types ──────────────────────────────────────────────────────────

export interface LobbyingEvent {
  id: string;
  organizationName: string;
  sector: string;
  targetPartyId: string;
  targetBillId: string | null;
  influence: "support" | "oppose";
  intensity: number;
  dayNumber: number;
}

// ── Party Donation types ────────────────────────────────────────────────────

export interface PartyDonation {
  id: string;
  partyId: string;
  donorName: string;
  donorType: "individual" | "corporate" | "association";
  amount: number;
  dayNumber: number;
  isPublic: boolean;
}

export interface DonationSummary {
  partyId: string;
  partyName: string;
  color: string;
  totalAmount: number;
  donationCount: number;
  publicDonationCount: number;
}

export interface MdbProfile {
  seat: BundestagSeat;
  party: { id: string; name: string; color: string } | null;
  application: { motivation: string; policyFocus: string[] | null } | null;
  votes: MdbVoteRecord[];
  speeches: MdbSpeechRecord[];
  committees?: MdbCommitteeMembership[];
}
