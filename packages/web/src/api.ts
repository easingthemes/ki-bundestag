const BASE = "/api";

let _onError: ((msg: string) => void) | null = null;
let _userToken: string | null = null;

export function setErrorHandler(handler: (msg: string) => void) {
  _onError = handler;
}

export function setUserToken(token: string | null) {
  _userToken = token;
}

function authHeaders(): Record<string, string> {
  return _userToken ? { "X-User-Token": _userToken } : {};
}

async function fetchJson<T>(path: string): Promise<T> {
  try {
    const res = await fetch(`${BASE}${path}`, { headers: authHeaders() });
    if (!res.ok) {
      const msg = `API error: ${res.status} on ${path}`;
      _onError?.(msg);
      throw new Error(msg);
    }
    return res.json();
  } catch (err) {
    if (err instanceof TypeError && err.message.includes("fetch")) {
      const msg = "Cannot connect to API server. Is it running on port 3001?";
      _onError?.(msg);
    }
    throw err;
  }
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      let msg = `API error: ${res.status} on POST ${path}`;
      try { msg = (JSON.parse(text) as { error?: string }).error ?? msg; } catch { /* ignore */ }
      _onError?.(msg);
      throw new Error(msg);
    }
    return res.json();
  } catch (err) {
    if (err instanceof TypeError && err.message.includes("fetch")) {
      const msg = "Cannot connect to API server. Is it running on port 3001?";
      _onError?.(msg);
    }
    throw err;
  }
}

async function deleteJson<T>(path: string): Promise<T> {
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    if (!res.ok) {
      const msg = `API error: ${res.status} on DELETE ${path}`;
      _onError?.(msg);
      throw new Error(msg);
    }
    return res.json();
  } catch (err) {
    if (err instanceof TypeError && err.message.includes("fetch")) {
      const msg = "Cannot connect to API server. Is it running on port 3001?";
      _onError?.(msg);
    }
    throw err;
  }
}

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
  id: string;        // UUID = auth token
  displayName: string;
  partyId: string | null;
  createdAt: number;
  lastActive: number;
  switchCooldownUntil: number | null; // sim day
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
  recentApprovals: number[];
  memberCount: number;
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

export interface SimulationStatus {
  currentDay: number;
  lastRunAt: string | null;
  nextElectionDay: number;
  budgetRetryDay: number | null;
  provisionalBudget: boolean;
  dailySummary: string | null;
}

export interface DaySummary {
  dayNumber: number;
  eventCount: number;
  summary: string;
  simulatedAt: string | null;
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

export const api = {
  getParties: () => fetchJson<Party[]>("/parties"),
  getAlignment: () => fetchJson<AlignmentData>("/parties/alignment"),
  getParty: (id: string) => fetchJson<Party>(`/parties/${id}`),
  getPartyHistory: (id: string) => fetchJson<PartyHistory[]>(`/parties/${id}/history`),
  getPartyBills: (id: string) => fetchJson<Bill[]>(`/parties/${id}/bills`),
  getPartyVotes: (id: string) => fetchJson<PartyVoteRecord[]>(`/parties/${id}/votes`),
  getPartyStatements: (id: string) => fetchJson<SimulationEvent[]>(`/parties/${id}/statements`),
  getBills: (status?: string) => fetchJson<Bill[]>(`/bills${status ? `?status=${status}` : ""}`),
  getBill: (id: string) => fetchJson<Bill>(`/bills/${id}`),
  getState: () => fetchJson<NationalState>("/state"),
  getSimulationStatus: () => fetchJson<SimulationStatus>("/simulation/status"),
  getDays: () => fetchJson<DaySummary[]>("/simulation/days"),
  getDayEvents: (day: number) => fetchJson<SimulationEvent[]>(`/simulation/days/${day}`),
  getEvents: (limit = 50, offset = 0, type?: string, actor?: string) => {
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (type) params.set("type", type);
    if (actor) params.set("actor", actor);
    return fetchJson<{ events: SimulationEvent[]; total: number }>(`/simulation/events?${params}`);
  },
  getCrises: (activeOnly = false) =>
    fetchJson<Crisis[]>(`/crises${activeOnly ? "?active=true" : ""}`),
  getCrisis: (id: string) => fetchJson<Crisis>(`/crises/${id}`),
  getElections: (status?: string) =>
    fetchJson<Election[]>(`/elections${status ? `?status=${status}` : ""}`),
  getActiveElection: () => fetchJson<Election | null>("/elections/active"),
  getElection: (id: string) => fetchJson<Election>(`/elections/${id}`),
  getPolls: (activeOnly = false) =>
    fetchJson<Poll[]>(`/polls${activeOnly ? "?active=true" : ""}`),
  getPoll: (id: string) => fetchJson<Poll>(`/polls/${id}`),
  votePoll: (id: string, option: string) =>
    postJson<Poll>(`/polls/${id}/vote`, { option }),
  getQuestions: (partyId?: string, status?: string) => {
    const params = new URLSearchParams();
    if (partyId) params.set("partyId", partyId);
    if (status) params.set("status", status);
    const qs = params.toString();
    return fetchJson<CitizenQuestion[]>(`/questions${qs ? `?${qs}` : ""}`);
  },
  getQuestion: (id: string) => fetchJson<CitizenQuestion>(`/questions/${id}`),
  submitQuestion: (question: string, targetPartyId: string) =>
    postJson<CitizenQuestion>("/questions", { question, targetPartyId }),
  getReferendums: (status?: string) =>
    fetchJson<Referendum[]>(`/referendums${status ? `?status=${status}` : ""}`),
  getReferendum: (id: string) => fetchJson<Referendum>(`/referendums/${id}`),
  voteReferendum: (id: string, option: string) =>
    postJson<Referendum>(`/referendums/${id}/vote`, { option }),
  getCrisisTemplates: () => fetchJson<CrisisTemplate[]>("/crisis-templates"),
  injectEvent: (type: string, data?: Record<string, unknown>) =>
    postJson<PendingInjection>("/simulate/inject", { type, data }),
  getInjections: () => fetchJson<PendingInjection[]>("/simulate/injections"),
  getMotions: (status?: string, type?: string) => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (type) params.set("type", type);
    const qs = params.toString();
    return fetchJson<Motion[]>(`/motions${qs ? `?${qs}` : ""}`);
  },
  getMotion: (id: string) => fetchJson<Motion>(`/motions/${id}`),
  getMedia: (day?: number) =>
    fetchJson<MediaArticle[]>(`/media${day != null ? `?day=${day}` : ""}`),
  getMediaArticle: (id: string) => fetchJson<MediaArticle>(`/media/${id}`),
  getFraktionen: (status?: string) =>
    fetchJson<Fraktion[]>(`/fraktionen${status ? `?status=${status}` : ""}`),
  getFraktion: (id: string) => fetchJson<Fraktion>(`/fraktionen/${id}`),
  getGovernment: () => fetchJson<Government | null>("/government"),
  getGovernmentHistory: () => fetchJson<Government[]>("/government/history"),
  getInterpellations: (status?: string, partyId?: string, targetMinistry?: string) => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (partyId) params.set("partyId", partyId);
    if (targetMinistry) params.set("targetMinistry", targetMinistry);
    const qs = params.toString();
    return fetchJson<Interpellation[]>(`/interpellations${qs ? `?${qs}` : ""}`);
  },
  getInterpellation: (id: string) => fetchJson<Interpellation>(`/interpellations/${id}`),
  getConfidenceVotes: (status?: string, type?: string) => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (type) params.set("type", type);
    const qs = params.toString();
    return fetchJson<ConfidenceVote[]>(`/confidence-votes${qs ? `?${qs}` : ""}`);
  },
  getConfidenceVote: (id: string) => fetchJson<ConfidenceVote>(`/confidence-votes/${id}`),
  getConstitutionalChallenges: (status?: string, billId?: string) => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (billId) params.set("billId", billId);
    const qs = params.toString();
    return fetchJson<ConstitutionalChallenge[]>(`/constitutional-court${qs ? `?${qs}` : ""}`);
  },
  getConstitutionalChallenge: (id: string) => fetchJson<ConstitutionalChallenge>(`/constitutional-court/${id}`),
  getBudgets: (status?: string) =>
    fetchJson<Budget[]>(`/budgets${status ? `?status=${status}` : ""}`),
  getBudget: (id: string) => fetchJson<Budget>(`/budgets/${id}`),

  // Internal proposals
  getPartyProposals: (partyId: string, status?: string) =>
    fetchJson<InternalProposal[]>(`/parties/${partyId}/proposals${status ? `?status=${status}` : ""}`),
  createProposal: (partyId: string, body: { title: string; description: string; category: string; rationale?: string }) =>
    postJson<InternalProposal>(`/parties/${partyId}/proposals`, body),
  getProposal: (id: string) => fetchJson<InternalProposal>(`/proposals/${id}`),
  voteOnProposal: (id: string, vote: 1 | -1) => postJson<InternalProposal>(`/proposals/${id}/vote`, { vote }),
  // Member signals on bills
  getBillSignals: (billId: string) => fetchJson<{ yes: number; no: number; userSignal: "yes" | "no" | null }>(`/bills/${billId}/signal`),
  signalBill: (billId: string, signal: "yes" | "no") => postJson<{ yes: number; no: number; userSignal: "yes" | "no" | null }>(`/bills/${billId}/signal`, { signal }),
  retractProposalVote: (id: string) => deleteJson<InternalProposal>(`/proposals/${id}/vote`),

  // User / membership
  registerUser: (displayName: string, partyId: string) =>
    postJson<User>("/users/register", { displayName, partyId }),
  getMe: () => fetchJson<User>("/users/me"),
  joinParty: (partyId: string) => postJson<User>(`/users/me/join/${partyId}`, {}),
  leaveParty: () => postJson<User>("/users/me/leave", {}),
};
