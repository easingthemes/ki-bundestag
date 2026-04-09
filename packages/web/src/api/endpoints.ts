// All typed API call functions, grouped by domain.

import {
  Party,
  Bill,
  Election,
  NationalState,
  SimulationStatus,
  SimulationEvent,
  DaySummary,
  CalendarData,
  UpcomingCalendarData,
  Crisis,
  CrisisTemplate,
  PendingInjection,
  Poll,
  CitizenQuestion,
  Referendum,
  Motion,
  Fraktion,
  Government,
  Interpellation,
  ConfidenceVote,
  ConstitutionalChallenge,
  Budget,
  MediaArticle,
  AlignmentData,
  PartyHistory,
  PartyVoteRecord,
  InternalProposal,
  User,
  ActivityItem,
  AppNotification,
  PresetInfo,
  TimingPreset,
  BundestagSeat,
  MdbApplication,
  MdbSpeech,
  MdbVoteSummary,
  MdbProfile,
  ImpactData,
  CatchupData,
  CommitteeListItem,
  CommitteeDetail,
  Sidejob,
  TrendingTopic,
  QuestionSuggestion,
  QuizThesis,
  QuizResultItem,
  QuizPartyPosition,
  LobbyingEvent,
  PartyDonation,
  DonationSummary,
} from "./types.js";
import { fetchJson, postJson, deleteJson, patchJson, getBase } from "./client.js";

// ── Parties & proposals ───────────────────────────────────────────────────────

export const getParties = () => fetchJson<Party[]>("/parties");
export const getAlignment = () => fetchJson<AlignmentData>("/parties/alignment");
export const getParty = (id: string) => fetchJson<Party>(`/parties/${id}`);
export const getPartyHistory = (id: string) => fetchJson<PartyHistory[]>(`/parties/${id}/history`);
export const getPartyBills = (id: string) => fetchJson<Bill[]>(`/parties/${id}/bills`);
export const getPartyVotes = (id: string) => fetchJson<PartyVoteRecord[]>(`/parties/${id}/votes`);
export const getPartyStatements = (id: string) => fetchJson<SimulationEvent[]>(`/parties/${id}/statements`);

export const getPartyProposals = (partyId: string, status?: string) =>
  fetchJson<InternalProposal[]>(`/parties/${partyId}/proposals${status ? `?status=${status}` : ""}`);
export const createProposal = (partyId: string, body: { title: string; description: string; category: string; rationale?: string }) =>
  postJson<InternalProposal>(`/parties/${partyId}/proposals`, body);
export const getProposal = (id: string) => fetchJson<InternalProposal>(`/proposals/${id}`);
export const voteOnProposal = (id: string, vote: 1 | -1) => postJson<InternalProposal>(`/proposals/${id}/vote`, { vote });
export const retractProposalVote = (id: string) => deleteJson<InternalProposal>(`/proposals/${id}/vote`);

// ── Bills ─────────────────────────────────────────────────────────────────────

export const getBills = (status?: string) => fetchJson<Bill[]>(`/bills${status ? `?status=${status}` : ""}`);
export const getBill = (id: string) => fetchJson<Bill>(`/bills/${id}`);

export const getBillSignals = (billId: string) =>
  fetchJson<{ yes: number; no: number; userSignal: "yes" | "no" | null }>(`/bills/${billId}/signal`);
export const signalBill = (billId: string, signal: "yes" | "no") =>
  postJson<{ yes: number; no: number; userSignal: "yes" | "no" | null }>(`/bills/${billId}/signal`, { signal });

export const castMdbVote = (billId: string, vote: "yes" | "no" | "abstain") =>
  postJson<{ userVote: string; summary: { yes: number; no: number; abstain: number; total: number } }>(`/bills/${billId}/mdb-vote`, { vote });
export const getMdbVotes = (billId: string) => fetchJson<MdbVoteSummary>(`/bills/${billId}/mdb-votes`);

export const submitSpeech = (billId: string, reading: number, content: string) =>
  postJson<{ status: string }>(`/bills/${billId}/speech`, { reading, content });
export const getSpeeches = (billId: string) =>
  fetchJson<{ speeches: MdbSpeech[]; byReading: Record<string, MdbSpeech[]> }>(`/bills/${billId}/speeches`);

export const submitAmendment = (billId: string, body: { title: string; description: string; impactChange?: Record<string, number> }) =>
  postJson<{ status: string }>(`/bills/${billId}/amendment`, body);

// ── Elections & government ────────────────────────────────────────────────────

export const getElections = (status?: string) =>
  fetchJson<Election[]>(`/elections${status ? `?status=${status}` : ""}`);
export const getActiveElection = () => fetchJson<Election | null>("/elections/active");
export const getElection = (id: string) => fetchJson<Election>(`/elections/${id}`);

export const getGovernment = () => fetchJson<Government | null>("/government");
export const getGovernmentHistory = () => fetchJson<Government[]>("/government/history");

// ── Simulation & state ────────────────────────────────────────────────────────

export const getState = () => fetchJson<NationalState>("/state");
export const getSimulationStatus = () => fetchJson<SimulationStatus>("/simulation/status");
export const getDays = () => fetchJson<DaySummary[]>("/simulation/days");
export const getDayEvents = (day: number) => fetchJson<SimulationEvent[]>(`/simulation/days/${day}`);
export const getCalendar = (month?: string) => fetchJson<CalendarData>(`/calendar${month ? `?month=${month}` : ""}`);
export const getUpcomingCalendar = () => fetchJson<UpcomingCalendarData>("/calendar/upcoming");
export const getEvents = (limit = 50, offset = 0, type?: string, actor?: string) => {
  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (type) params.set("type", type);
  if (actor) params.set("actor", actor);
  return fetchJson<{ events: SimulationEvent[]; total: number }>(`/simulation/events?${params}`);
};
export const getLatestEvents = (since?: string) =>
  fetchJson<SimulationEvent[]>(`/simulation/events/latest${since ? `?since=${since}` : ""}`);

export const getInjections = () => fetchJson<PendingInjection[]>("/simulate/injections");

// ── Parliament (motions, interpellations, confidence votes, constitutional court) ──

export const getFraktionen = (status?: string) =>
  fetchJson<Fraktion[]>(`/fraktionen${status ? `?status=${status}` : ""}`);
export const getFraktion = (id: string) => fetchJson<Fraktion>(`/fraktionen/${id}`);

export const getMotions = (status?: string, type?: string) => {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (type) params.set("type", type);
  const qs = params.toString();
  return fetchJson<Motion[]>(`/motions${qs ? `?${qs}` : ""}`);
};
export const getMotion = (id: string) => fetchJson<Motion>(`/motions/${id}`);
export const submitMotion = (body: { motionType: string; title: string; description: string }) =>
  postJson<{ status: string }>("/motions/submit", body);

export const getInterpellations = (status?: string, partyId?: string, targetMinistry?: string) => {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (partyId) params.set("partyId", partyId);
  if (targetMinistry) params.set("targetMinistry", targetMinistry);
  const qs = params.toString();
  return fetchJson<Interpellation[]>(`/interpellations${qs ? `?${qs}` : ""}`);
};
export const getInterpellation = (id: string) => fetchJson<Interpellation>(`/interpellations/${id}`);
export const submitInterpellation = (body: { interpellationType: string; title: string; question: string; targetMinistry: string }) =>
  postJson<{ status: string }>("/interpellations/submit", body);

export const getConfidenceVotes = (status?: string, type?: string) => {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (type) params.set("type", type);
  const qs = params.toString();
  return fetchJson<ConfidenceVote[]>(`/confidence-votes${qs ? `?${qs}` : ""}`);
};
export const getConfidenceVote = (id: string) => fetchJson<ConfidenceVote>(`/confidence-votes/${id}`);

export const getConstitutionalChallenges = (status?: string, billId?: string) => {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (billId) params.set("billId", billId);
  const qs = params.toString();
  return fetchJson<ConstitutionalChallenge[]>(`/constitutional-court${qs ? `?${qs}` : ""}`);
};
export const getConstitutionalChallenge = (id: string) =>
  fetchJson<ConstitutionalChallenge>(`/constitutional-court/${id}`);

// ── Committees ───────────────────────────────────────────────────────────────

export const getCommittees = () => fetchJson<CommitteeListItem[]>("/committees");
export const getCommitteeDetail = (id: string) => fetchJson<CommitteeDetail>(`/committees/${id}`);

// ── Sidejobs ────────────────────────────────────────────────────────────────

export const getSidejobs = (partyId?: string) =>
  fetchJson<Sidejob[]>(`/sidejobs${partyId ? `?partyId=${partyId}` : ""}`);
export const getSeatSidejobs = (seatId: string) =>
  fetchJson<Sidejob[]>(`/sidejobs/seat/${seatId}`);

// ── Content (media, questions, polls, referendums, crises) ───────────────────

export const getMedia = (day?: number) =>
  fetchJson<MediaArticle[]>(`/media${day != null ? `?day=${day}` : ""}`);
export const getMediaArticle = (id: string) => fetchJson<MediaArticle>(`/media/${id}`);

export const getQuestions = (partyId?: string, status?: string, topic?: string) => {
  const params = new URLSearchParams();
  if (partyId) params.set("partyId", partyId);
  if (status) params.set("status", status);
  if (topic) params.set("topic", topic);
  const qs = params.toString();
  return fetchJson<CitizenQuestion[]>(`/questions${qs ? `?${qs}` : ""}`);
};
export const getQuestion = (id: string) => fetchJson<CitizenQuestion>(`/questions/${id}`);
export const submitQuestion = (question: string, targetPartyId: string, topic?: string) =>
  postJson<CitizenQuestion>("/questions", { question, targetPartyId, topic });
export const getQuestionTopics = () => fetchJson<string[]>("/questions/topics");
export const getTrendingTopics = () => fetchJson<TrendingTopic[]>("/questions/trending-topics");
export const getQuestionSuggestions = () => fetchJson<QuestionSuggestion[]>("/questions/suggestions");
export const useQuestionSuggestion = (id: string) =>
  postJson<{ success: boolean }>(`/questions/suggestions/${id}/use`, {});
export const voteOnQuestion = (id: string, vote: 1 | -1) =>
  postJson<CitizenQuestion>(`/questions/${id}/vote`, { vote });
export const retractQuestionVote = (id: string) =>
  deleteJson<CitizenQuestion>(`/questions/${id}/vote`);

export const getPolls = (activeOnly = false) =>
  fetchJson<Poll[]>(`/polls${activeOnly ? "?active=true" : ""}`);
export const getPoll = (id: string) => fetchJson<Poll>(`/polls/${id}`);
export const votePoll = (id: string, option: string) =>
  postJson<Poll>(`/polls/${id}/vote`, { option });

export const getReferendums = (status?: string) =>
  fetchJson<Referendum[]>(`/referendums${status ? `?status=${status}` : ""}`);
export const getReferendum = (id: string) => fetchJson<Referendum>(`/referendums/${id}`);
export const voteReferendum = (id: string, option: string) =>
  postJson<Referendum>(`/referendums/${id}/vote`, { option });

export const getCrises = (activeOnly = false) =>
  fetchJson<Crisis[]>(`/crises${activeOnly ? "?active=true" : ""}`);
export const getCrisis = (id: string) => fetchJson<Crisis>(`/crises/${id}`);

// ── Budget ────────────────────────────────────────────────────────────────────

export const getBudgets = (status?: string) =>
  fetchJson<Budget[]>(`/budgets${status ? `?status=${status}` : ""}`);
export const getBudget = (id: string) => fetchJson<Budget>(`/budgets/${id}`);

// ── Users & auth ──────────────────────────────────────────────────────────────
export const getAuthMe = async (): Promise<User | null> => {
  const res = await fetch(`${getBase()}/auth/me`, { credentials: "include" });
  if (res.status === 401) return null;
  if (!res.ok) return null;
  return res.json();
};
export const authLogout = () => postJson<{ success: boolean }>("/auth/logout", {});
export const getAuthProviders = () => fetchJson<{ providers: string[] }>("/auth/providers");
export const getMe = () => fetchJson<User>("/users/me");
export const updateDisplayName = (displayName: string) => patchJson<User>("/users/me", { displayName });
export const getMyLimits = () => fetchJson<Record<string, { used: number; limit: number; remaining: number }>>("/users/me/limits");
export const getMyActivity = (cursor?: string, limit?: number) => {
  const params = new URLSearchParams();
  if (cursor) params.set("cursor", cursor);
  if (limit) params.set("limit", String(limit));
  const qs = params.toString();
  return fetchJson<{ items: ActivityItem[]; nextCursor: string | null }>(`/users/me/activity${qs ? `?${qs}` : ""}`);
};
export const joinParty = (partyId: string) => postJson<User>(`/users/me/join/${partyId}`, {});
export const leaveParty = () => postJson<User>("/users/me/leave", {});

// ── Notifications ─────────────────────────────────────────────────────────────

export const getNotifications = (unreadOnly = false, limit?: number) => {
  const params = new URLSearchParams();
  if (unreadOnly) params.set("unread", "true");
  if (limit) params.set("limit", String(limit));
  const qs = params.toString();
  return fetchJson<AppNotification[]>(`/notifications${qs ? `?${qs}` : ""}`);
};
export const getUnreadCount = () => fetchJson<{ count: number }>("/notifications/unread-count");
export const markNotificationRead = (id: string) => postJson<{ success: boolean }>(`/notifications/${id}/read`, {});
export const markAllNotificationsRead = () => postJson<{ marked: number }>("/notifications/read-all", {});

// ── Timing preset ─────────────────────────────────────────────────────────────

export const getPreset = () => fetchJson<PresetInfo>("/simulation/preset");

// ── Seats ─────────────────────────────────────────────────────────────────────

export const getMySeat = () =>
  fetchJson<{ seat: BundestagSeat | null; applications: MdbApplication[] }>("/seats/my-seat");
export const getPartySeats = (partyId: string) => fetchJson<BundestagSeat[]>(`/seats/party/${partyId}`);
export const getAvailableSeats = () =>
  fetchJson<Record<string, { open: number; humanOpen: number; botOpen: number; humanTotal: number; botTotal: number; total: number }>>("/seats/available");
export const applyForSeat = (applicationText: string, policyFocus?: string) =>
  postJson<{ status: string }>("/seats/apply", { applicationText, policyFocus: policyFocus ? [policyFocus] : undefined });
export const getSeatRoster = (partyId?: string, controller?: string, search?: string) => {
  const params = new URLSearchParams();
  if (partyId) params.set("partyId", partyId);
  if (controller) params.set("controller", controller);
  if (search) params.set("search", search);
  const qs = params.toString();
  return fetchJson<BundestagSeat[]>(`/seats/roster${qs ? `?${qs}` : ""}`);
};
export const getMdbProfile = (seatId: string) => fetchJson<MdbProfile>(`/seats/${seatId}/profile`);

// ── MdB Parliamentary Actions ─────────────────────────────────────────────────

// (submitMotion, submitInterpellation, submitAmendment already defined above under Parliament)

// ── Admin ─────────────────────────────────────────────────────────────────────

// ── Impact & Catchup ──────────────────────────────────────────────────────────

export const getMyImpact = () => fetchJson<ImpactData>("/users/me/impact");
export const getMyCatchup = () => fetchJson<CatchupData>("/users/me/catchup");

// ── Quiz ─────────────────────────────────────────────────────────────────────

export const getQuizTheses = () => fetchJson<QuizThesis[]>("/quiz/theses");
export const submitQuizAnswers = (answers: Record<string, string>) =>
  postJson<{ results: QuizResultItem[] }>("/quiz/results", { answers });
export const getQuizPartyPositions = () => fetchJson<QuizPartyPosition[]>("/quiz/party-positions");

// ── Lobbying ─────────────────────────────────────────────────────────────────

export const getLobbyingEvents = (partyId?: string, sector?: string) => {
  const params = new URLSearchParams();
  if (partyId) params.set("partyId", partyId);
  if (sector) params.set("sector", sector);
  const qs = params.toString();
  return fetchJson<LobbyingEvent[]>(`/quiz/lobbying${qs ? `?${qs}` : ""}`);
};

// ── Donations ────────────────────────────────────────────────────────────────

export const getPartyDonations = (partyId?: string) =>
  fetchJson<PartyDonation[]>(`/quiz/donations${partyId ? `?partyId=${partyId}` : ""}`);
export const getDonationSummary = () => fetchJson<DonationSummary[]>("/quiz/donations/summary");

// ── Legacy `api` object — keeps all call sites that use `api.xxx()` working ───

export const api = {
  getParties,
  getAlignment,
  getParty,
  getPartyHistory,
  getPartyBills,
  getPartyVotes,
  getPartyStatements,
  getBills,
  getBill,
  getState,
  getSimulationStatus,
  getDays,
  getDayEvents,
  getCalendar,
  getUpcomingCalendar,
  getEvents,
  getCrises,
  getCrisis,
  getElections,
  getActiveElection,
  getElection,
  getPolls,
  getPoll,
  votePoll,
  getQuestions,
  getQuestion,
  submitQuestion,
  voteOnQuestion,
  retractQuestionVote,
  getReferendums,
  getReferendum,
  voteReferendum,
  getInjections,
  getMotions,
  getMotion,
  getMedia,
  getMediaArticle,
  getFraktionen,
  getFraktion,
  getGovernment,
  getGovernmentHistory,
  getInterpellations,
  getInterpellation,
  getConfidenceVotes,
  getConfidenceVote,
  getConstitutionalChallenges,
  getConstitutionalChallenge,
  getBudgets,
  getBudget,
  getPartyProposals,
  createProposal,
  getProposal,
  voteOnProposal,
  getBillSignals,
  signalBill,
  retractProposalVote,
  getMe,
  updateDisplayName,
  getMyLimits,
  getAuthMe,
  authLogout,
  getAuthProviders,
  getMyActivity,
  joinParty,
  leaveParty,
  getPreset,
  getNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
  getMySeat,
  getPartySeats,
  getAvailableSeats,
  applyForSeat,
  castMdbVote,
  getMdbVotes,
  submitSpeech,
  getSpeeches,
  submitMotion,
  submitInterpellation,
  submitAmendment,
  getMyImpact,
  getMyCatchup,
  getLatestEvents,
  getSeatRoster,
  getMdbProfile,
  getCommittees,
  getCommitteeDetail,
  getSidejobs,
  getSeatSidejobs,
  getQuestionTopics,
  getTrendingTopics,
  getQuestionSuggestions,
  useQuestionSuggestion,
  getQuizTheses,
  submitQuizAnswers,
  getQuizPartyPositions,
  getLobbyingEvents,
  getPartyDonations,
  getDonationSummary,
};
