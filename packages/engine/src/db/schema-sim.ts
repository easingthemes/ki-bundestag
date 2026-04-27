import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const parties = sqliteTable("parties", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  color: text("color").notNull(),
  ideology: text("ideology").notNull(),
  seatCount: integer("seat_count").notNull(),
  approvalRating: real("approval_rating").notNull(),
  policyPriorities: text("policy_priorities", { mode: "json" }).notNull(),
  coalitionRole: text("coalition_role").notNull(), // "leader" | "junior" | "opposition"
  inactiveDays: integer("inactive_days").notNull().default(0),
});

export const bills = sqliteTable("bills", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  proposedBy: text("proposed_by").notNull().references(() => parties.id),
  status: text("status").notNull(), // "proposed" | "first_reading" | "committee" | "second_reading" | "third_reading" | "passed" | "rejected"
  impact: text("impact", { mode: "json" }).notNull(),
  votes: text("votes", { mode: "json" }).notNull().default("[]"),
  proposedOnDay: integer("proposed_on_day").notNull(),
  reading: integer("reading"),
  committeeName: text("committee_name"),
  committeeRecommendation: text("committee_recommendation"),
  amendments: text("amendments", { mode: "json" }),
  originalImpact: text("original_impact", { mode: "json" }),
  statusChangedOnDay: integer("status_changed_on_day"),
  isGovernmentBill: integer("is_government_bill", { mode: "boolean" }),
  vetoedByPresident: integer("vetoed_by_president", { mode: "boolean" }).default(false),
  memberInitiative: integer("member_initiative", { mode: "boolean" }).default(false),
  proposerDisplayName: text("proposer_display_name"),
  stageEntryDay: integer("stage_entry_day"),
  stageMinDuration: integer("stage_min_duration"),
  stageMaxDuration: integer("stage_max_duration"),
  isComplexBill: integer("is_complex_bill", { mode: "boolean" }).default(false),
  bundesratState: text("bundesrat_state"),
  bundesratEntryDay: integer("bundesrat_entry_day"),
  ausfertigungDay: integer("ausfertigung_day"),
  inkrafttretenDay: integer("inkrafttreten_day"),
  // Cycle 2a — Bundesrat voting + Vermittlungsausschuss
  bundesratMode: text("bundesrat_mode"),
  bundesratVoteResult: text("bundesrat_vote_result", { mode: "json" }),
  vermittlungEntryDay: integer("vermittlung_entry_day"),
  vermittlungMinDuration: integer("vermittlung_min_duration"),
  vermittlungOutcome: text("vermittlung_outcome"),
});

export const nationalState = sqliteTable("national_state", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  coalitionParties: text("coalition_parties", { mode: "json" }).notNull(),
  oppositionParties: text("opposition_parties", { mode: "json" }).notNull(),
  budget: real("budget").notNull(),
  unemployment: real("unemployment").notNull(),
  inflation: real("inflation").notNull(),
  gdpGrowth: real("gdp_growth").notNull(),
  publicSentiment: real("public_sentiment").notNull(),
  provisionalBudget: integer("provisional_budget", { mode: "boolean" }).notNull().default(false),
  // Cycle 4 PR 2 — Schuldenbremse-Aussetzung (Art. 115 GG). True while the
  // structural debt brake is suspended. Auto-clears via checkSchuldenbremseExpiry.
  schuldenbremseSuspended: integer("schuldenbremse_suspended", { mode: "boolean" }).notNull().default(false),
});

export const simulationEvents = sqliteTable("simulation_events", {
  id: text("id").primaryKey(),
  dayNumber: integer("day_number").notNull(),
  type: text("type").notNull(),
  actor: text("actor").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  data: text("data", { mode: "json" }),
  createdAt: text("created_at"),
});

export const crises = sqliteTable("crises", {
  id: text("id").primaryKey(),
  templateId: text("template_id").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  severity: text("severity").notNull(), // "low" | "medium" | "high"
  startDay: integer("start_day").notNull(),
  endDay: integer("end_day").notNull(),
  dailyImpact: text("daily_impact", { mode: "json" }).notNull(),
  resolved: integer("resolved", { mode: "boolean" }).notNull().default(false),
});

export const elections = sqliteTable("elections", {
  id: text("id").primaryKey(),
  triggerReason: text("trigger_reason").notNull(),
  announcedOnDay: integer("announced_on_day").notNull(),
  campaignStartDay: integer("campaign_start_day").notNull(),
  electionDay: integer("election_day").notNull(),
  status: text("status").notNull(),
  results: text("results", { mode: "json" }),
  newCoalition: text("new_coalition", { mode: "json" }),
  newOpposition: text("new_opposition", { mode: "json" }),
  negotiationRounds: text("negotiation_rounds", { mode: "json" }),
  coalitionAgreement: text("coalition_agreement", { mode: "json" }),
  konstituierendeSitzungDay: integer("konstituierende_sitzung_day"),
});

// Cycle 2a — Kanzlerwahl (Art. 63 GG) 3-phase chancellor election.
export const kanzlerwahl = sqliteTable("kanzlerwahl", {
  id: text("id").primaryKey(),
  electionId: text("election_id").notNull().references(() => elections.id),
  startedOnDay: integer("started_on_day").notNull(),
  phase1: text("phase1", { mode: "json" }),
  phase2Rounds: text("phase2_rounds", { mode: "json" }).notNull().default("[]"),
  phase2WindowEndDay: integer("phase2_window_end_day"),
  phase3: text("phase3", { mode: "json" }),
  status: text("status").notNull(),
  electedCandidatePartyId: text("elected_candidate_party_id"),
  electedCandidateName: text("elected_candidate_name"),
  amtseidDay: integer("amtseid_day"),
});

// Cycle 2b — Parliamentary-QA (Regierungsbefragung + Fragestunde).
// One row per session. `questions` holds the Q+A list (JSON). `answered_on_day`
// is set when the weekly AI batch result is processed back onto the row.
export const parliamentaryQaSessions = sqliteTable("parliamentary_qa_sessions", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  day: integer("day").notNull(),
  questions: text("questions", { mode: "json" }).notNull(),
  batchRequestId: text("batch_request_id"),
  batchAttempts: integer("batch_attempts").notNull().default(0),
  answeredOnDay: integer("answered_on_day"),
});

// Cycle 2b — Petitions (öffentliche E-Petitionen). One row per petition.
export const petitions = sqliteTable("petitions", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  authorDisplayName: text("author_display_name").notNull(),
  startedOnDay: integer("started_on_day").notNull(),
  publicWindowEndDay: integer("public_window_end_day").notNull(),
  signatureCount: integer("signature_count").notNull().default(0),
  signatureQuorum: integer("signature_quorum").notNull().default(30_000),
  status: text("status").notNull().default("collecting"),
  quorumReachedOnDay: integer("quorum_reached_on_day"),
  debatedOnDay: integer("debated_on_day"),
  outcome: text("outcome"),
});

// Cycle 2b — Aktuelle Stunde (crisis-hooked + baseline). One row per session.
// `positions` holds {government, opposition} AI-generated statements, null
// until the weekly batch result lands. `emitted_on_day` is set when the event
// has been fired into simulation_events on/after `scheduled_day`.
export const aktuelleStundeSessions = sqliteTable("aktuelle_stunde_sessions", {
  id: text("id").primaryKey(),
  scheduledDay: integer("scheduled_day").notNull(),
  topic: text("topic").notNull(),
  triggerKind: text("trigger_kind").notNull(),
  crisisId: text("crisis_id"),
  governmentPartyId: text("government_party_id").notNull(),
  oppositionPartyId: text("opposition_party_id").notNull(),
  positions: text("positions", { mode: "json" }),
  batchRequestId: text("batch_request_id"),
  batchAttempts: integer("batch_attempts").notNull().default(0),
  emittedOnDay: integer("emitted_on_day"),
});

export const simulationMeta = sqliteTable("simulation_meta", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  currentDay: integer("current_day").notNull().default(0),
  lastRunAt: text("last_run_at"),
  dayStartedAt: text("day_started_at"),
  heartbeatAt: text("heartbeat_at"),
  dayProgress: integer("day_progress").notNull().default(0),
  nextElectionDay: integer("next_election_day").notNull().default(1461),
  lowSentimentStreak: integer("low_sentiment_streak").notNull().default(0),
  electionCooldownUntil: integer("election_cooldown_until").notNull().default(0),
  budgetRetryDay: integer("budget_retry_day"),
  dailySummary: text("daily_summary"),
  timingPreset: text("timing_preset").notNull().default("normal"),
  contextDepth: text("context_depth").notNull().default("normal"),
  startDate: text("start_date"),
  botsEnabled: integer("bots_enabled").notNull().default(1),
  // Cycle 2b — Schriftliche-Einzelfragen cumulative counters (PR 7).
  schriftlicheEinzelfragenFiledTotal: integer("schriftliche_einzelfragen_filed_total").notNull().default(0),
  schriftlicheEinzelfragenAnsweredTotal: integer("schriftliche_einzelfragen_answered_total").notNull().default(0),
  // Cycle 3 PR 2 — gates Vertrauensfrage when government parties' weighted
  // approval is below 25 for >= 30 sim days. Mirrors lowSentimentStreak.
  lowGovernmentApprovalStreak: integer("low_government_approval_streak").notNull().default(0),
  // Cycle 3 PR 3 — idempotency flag for the 735 → 630 seat-reform shrink.
  // 1 = already migrated, 0 = not yet (default for fresh DBs and pre-PR3 DBs).
  bundestagSizeMigrated: integer("bundestag_size_migrated").notNull().default(0),
  // Cycle 3 PR 4 — sim day on which the most-recent negotiation round was
  // dispatched. Used by loop.ts to enforce MIN_NEGOTIATION_ROUND_DWELL_DAYS
  // pacing between rounds. NULL = no negotiation in flight.
  lastNegotiationRoundDay: integer("last_negotiation_round_day"),
  // Cycle 3 PR 2 follow-up — cumulative observability counters for gate-
  // suppressed Vertrauensfrage / Misstrauensvotum agent actions. Lets us
  // answer "did the gate ever fire?" and "is a party agent spamming a blocked
  // action?" from a SQL query, instead of relying on console-log scraping.
  vertrauensfrageSuppressedTotal: integer("vertrauensfrage_suppressed_total").notNull().default(0),
  misstrauensvotumSuppressedTotal: integer("misstrauensvotum_suppressed_total").notNull().default(0),
  // Cycle 4 PR 1 — last sim day on which a Untersuchungsausschuss was filed.
  // Powers the S8 60-day rate-limit. NULL = no inquiry has been filed yet.
  lastInquiryFiledDay: integer("last_inquiry_filed_day"),
  // Cycle 4 PR 1 — idempotency flag for the cycle-4 migration block (S7).
  // 1 = migration ran (table created, columns added, R15 backfill done),
  // 0 = not yet (default for fresh DBs and pre-Cycle-4 DBs).
  cycle4Migrated: integer("cycle4_migrated").notNull().default(0),
  // Cycle 4 PR 2 — sim day on which the active Schuldenbremse-Aussetzung
  // expires. NULL = not currently suspended. Set by applySchuldenbremseAussetzung
  // and cleared by checkSchuldenbremseExpiry.
  schuldenbremseSuspendedUntilDay: integer("schuldenbremse_suspended_until_day"),
  // Cycle 4 PR 2 — sim day on which `provisionalBudget` was last flipped TRUE.
  // NULL when not in provisional state. Used by findFiscalEmergencyOpportunity
  // to compute the 30-day streak gate. R15 backfill (PR 1) seeds in-flight rows.
  provisionalBudgetSinceDay: integer("provisional_budget_since_day"),
  // Cycle 5 PR 1 — idempotency flag for the cycle-5 migration block (S13).
  // 1 = migration ran (EXPERTS_SEED inserted, flag set). 0 = not yet.
  cycle5Migrated: integer("cycle5_migrated").notNull().default(0),
  // Cycle 5 PR 2 — sim day on which the most-recent Enquete-Kommission was
  // proposed. Powers the S9 ENQUETE_RATE_LIMIT_DAYS rate-limit. NULL = no
  // Enquete has been proposed yet (or the DB predates this column).
  lastEnqueteProposedDay: integer("last_enquete_proposed_day"),
  // ISO timestamp of the wall-clock moment the next sim day is scheduled to
  // start. Written by runner-auto right before it sleeps. Lets agents (and
  // the dashboard) know exactly when to wake up instead of polling. NULL
  // when unknown — between days while compute is in flight, or when the
  // simulation is being driven by `npm run simulate` rather than the runner.
  nextDayAt: text("next_day_at"),
});

export const partyHistory = sqliteTable("party_history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  partyId: text("party_id").notNull().references(() => parties.id),
  dayNumber: integer("day_number").notNull(),
  approvalRating: real("approval_rating").notNull(),
  seatCount: integer("seat_count").notNull(),
});

export const citizenQuestions = sqliteTable("citizen_questions", {
  id: text("id").primaryKey(),
  question: text("question").notNull(),
  targetPartyId: text("target_party_id").notNull().references(() => parties.id),
  response: text("response"),
  respondedOnDay: integer("responded_on_day"),
  createdOnDay: integer("created_on_day").notNull(),
  status: text("status").notNull().default("pending"),
  userId: text("user_id"),
  topic: text("topic"),
});

export const botQuestionPool = sqliteTable("bot_question_pool", {
  id: text("id").primaryKey(),
  question: text("question").notNull(),
  topic: text("topic").notNull(),
  targetPartyId: text("target_party_id").notNull().references(() => parties.id),
  /** JSON array of tags — e.g. ["opposition", "wirtschaft", "aktuell", "klimaschutz"] */
  tags: text("tags").notNull().default("[]"),
  /** JSON array of party IDs whose members would naturally ask this question */
  relevantForParties: text("relevant_for_parties").notNull().default("[]"),
  generatedOnDay: integer("generated_on_day").notNull(),
  /** Null until a bot picks this question */
  usedByBotId: text("used_by_bot_id"),
  usedOnDay: integer("used_on_day"),
});

export const questionSuggestions = sqliteTable("question_suggestions", {
  id: text("id").primaryKey(),
  question: text("question").notNull(),
  topic: text("topic"),
  targetPartyId: text("target_party_id").notNull().references(() => parties.id),
  createdOnDay: integer("created_on_day").notNull(),
  usedByUserId: text("used_by_user_id"),
});

export const mediaArticles = sqliteTable("media_articles", {
  id: text("id").primaryKey(),
  headline: text("headline").notNull(),
  summary: text("summary").notNull(),
  content: text("content").notNull(),
  outlet: text("outlet").notNull(),
  bias: text("bias").notNull(),
  category: text("category").notNull(),
  dayNumber: integer("day_number").notNull(),
});

export const pendingInjections = sqliteTable("pending_injections", {
  id: text("id").primaryKey(),
  type: text("type").notNull(), // "crisis" | "election" | "economic_shock"
  data: text("data", { mode: "json" }).notNull(),
  consumed: integer("consumed", { mode: "boolean" }).notNull().default(false),
});

export const referendums = sqliteTable("referendums", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  options: text("options", { mode: "json" }).notNull(),
  votes: text("votes", { mode: "json" }).notNull().default("{}"),
  createdOnDay: integer("created_on_day").notNull(),
  closesOnDay: integer("closes_on_day").notNull(),
  status: text("status").notNull().default("active"),
  result: text("result"),
  impact: text("impact", { mode: "json" }),
  category: text("category").notNull(),
});

export const fraktionen = sqliteTable("fraktionen", {
  id: text("id").primaryKey(),
  partyId: text("party_id").notNull().references(() => parties.id),
  leaderName: text("leader_name").notNull(),
  status: text("status").notNull(), // "active" | "dissolved"
  formedOnDay: integer("formed_on_day").notNull(),
  dissolvedOnDay: integer("dissolved_on_day"),
});

export const motions = sqliteTable("motions", {
  id: text("id").primaryKey(),
  type: text("type").notNull(), // "motion" | "resolution"
  title: text("title").notNull(),
  description: text("description").notNull(),
  proposedBy: text("proposed_by").notNull(),
  status: text("status").notNull(), // "proposed" | "passed" | "rejected"
  votes: text("votes", { mode: "json" }).notNull().default("[]"),
  dayNumber: integer("day_number").notNull(),
  sentimentImpact: real("sentiment_impact"),
});

export const government = sqliteTable("government", {
  id: text("id").primaryKey(),
  electionId: text("election_id").references(() => elections.id),
  chancellorName: text("chancellor_name").notNull(),
  chancellorPartyId: text("chancellor_party_id").notNull().references(() => parties.id),
  ministers: text("ministers", { mode: "json" }).notNull(),
  formedOnDay: integer("formed_on_day").notNull(),
  dissolvedOnDay: integer("dissolved_on_day"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

export const interpellations = sqliteTable("interpellations", {
  id: text("id").primaryKey(),
  type: text("type").notNull(), // "kleine" | "große"
  title: text("title").notNull(),
  question: text("question").notNull(),
  filedByPartyId: text("filed_by_party_id").notNull().references(() => parties.id),
  targetMinistry: text("target_ministry").notNull(),
  targetMinisterName: text("target_minister_name").notNull(),
  targetPartyId: text("target_party_id").notNull().references(() => parties.id),
  response: text("response"),
  status: text("status").notNull(), // "pending" | "answered" | "expired"
  dayNumber: integer("day_number").notNull(),
  respondedOnDay: integer("responded_on_day"),
  sentimentImpact: real("sentiment_impact"),
});

export const confidenceVotes = sqliteTable("confidence_votes", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),             // "vertrauensfrage" | "misstrauensvotum"
  governmentId: text("government_id").notNull().references(() => government.id),
  initiatedByPartyId: text("initiated_by_party_id").notNull().references(() => parties.id),
  chancellorName: text("chancellor_name").notNull(),
  proposedChancellor: text("proposed_chancellor"),              // misstrauensvotum only
  proposedChancellorPartyId: text("proposed_chancellor_party_id").references(() => parties.id), // misstrauensvotum only
  title: text("title").notNull(),
  description: text("description").notNull(),
  status: text("status").notNull(),         // "passed" | "failed"
  votes: text("votes", { mode: "json" }).notNull().default("[]"),
  dayNumber: integer("day_number").notNull(),
  sentimentImpact: real("sentiment_impact"),
});

export const constitutionalChallenges = sqliteTable("constitutional_challenges", {
  id: text("id").primaryKey(),
  billId: text("bill_id").notNull().references(() => bills.id),
  billTitle: text("bill_title").notNull(),
  filedByPartyId: text("filed_by_party_id").notNull().references(() => parties.id),
  arguments: text("arguments").notNull(),
  decision: text("decision"),           // "struck_down" | "upheld" | null while pending
  reasoning: text("reasoning"),
  status: text("status").notNull(),     // "pending" | "ruled"
  dayNumber: integer("day_number").notNull(),
  ruledOnDay: integer("ruled_on_day"),
  sentimentImpact: real("sentiment_impact"),
});

export const budgets = sqliteTable("budgets", {
  id: text("id").primaryKey(),
  cycleNumber: integer("cycle_number").notNull(),
  status: text("status").notNull(),        // "passed" | "rejected"
  allocations: text("allocations", { mode: "json" }).notNull(),
  totalAmount: real("total_amount").notNull(),
  proposedOnDay: integer("proposed_on_day").notNull(),
  votedOnDay: integer("voted_on_day"),
  votes: text("votes", { mode: "json" }),
  yesSeats: integer("yes_seats"),
  noSeats: integer("no_seats"),
  economicEffect: text("economic_effect", { mode: "json" }),
  revisionAttempt: integer("revision_attempt").notNull().default(0),
});

export const polls = sqliteTable("polls", {
  id: text("id").primaryKey(),
  question: text("question").notNull(),
  options: text("options", { mode: "json" }).notNull(),
  votes: text("votes", { mode: "json" }).notNull().default("{}"),
  createdOnDay: integer("created_on_day").notNull(),
  expiresOnDay: integer("expires_on_day"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  category: text("category").notNull().default("general"),
});

export const eventQueue = sqliteTable("event_queue", {
  id: text("id").primaryKey(),
  eventType: text("event_type").notNull(),
  eventData: text("event_data", { mode: "json" }),
  scheduledForDay: integer("scheduled_for_day").notNull(),
  queuedAt: text("queued_at").notNull(),
  processedAt: text("processed_at"),
  status: text("status").notNull().default("queued"),  // "queued" | "processed" | "cancelled"
});

export const aiCalls = sqliteTable("ai_calls", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  dayNumber: integer("day_number").notNull(),
  task: text("task").notNull(),           // e.g. "agent:spd", "briefing", "media", "summary"
  provider: text("provider").notNull(),   // "anthropic" | "xai"
  model: text("model").notNull(),
  inputTokens: integer("input_tokens").notNull(),
  outputTokens: integer("output_tokens").notNull(),
  costUsd: real("cost_usd").notNull(),
  latencyMs: integer("latency_ms"),
  batchId: text("batch_id"),              // Anthropic batch ID, null for sequential calls
  success: integer("success", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
});

export const realWorldKnowledge = sqliteTable("real_world_knowledge", {
  id: text("id").primaryKey(),
  generation: integer("generation").notNull(),
  category: text("category").notNull(),       // "landscape" | "party_position" | "shock" | "headline"
  partyId: text("party_id"),
  digest: text("digest").notNull(),
  sourceUrls: text("source_urls", { mode: "json" }),
  fetchedAt: text("fetched_at").notNull(),
  simDayFirstUsed: integer("sim_day_first_used"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

export const bundestagSeats = sqliteTable("bundestag_seats", {
  id: text("id").primaryKey(),
  seatNumber: integer("seat_number").notNull(),
  partyId: text("party_id").notNull().references(() => parties.id),
  controller: text("controller").notNull(),         // "human" | "ai" | "bot"
  userId: text("user_id"),
  electionId: text("election_id").references(() => elections.id),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  proxyDefault: text("proxy_default").notNull().default("party_line"), // "party_line" | "abstain"
  disciplineLevel: integer("discipline_level").notNull().default(0),   // 0-3
  disciplineReason: text("discipline_reason"),
  allocatedOnDay: integer("allocated_on_day").notNull(),
});

export const committees = sqliteTable("committees", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  shortName: text("short_name"),
  billCategory: text("bill_category"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdOnDay: integer("created_on_day"),
});

export const committeeMemberships = sqliteTable("committee_memberships", {
  id: text("id").primaryKey(),
  committeeId: text("committee_id").notNull(),
  seatId: text("seat_id").notNull(),
  role: text("role").notNull().default("member"),
  assignedOnDay: integer("assigned_on_day").notNull(),
});

export const sidejobs = sqliteTable("sidejobs", {
  id: text("id").primaryKey(),
  seatId: text("seat_id").notNull(),
  partyId: text("party_id").notNull(),
  politicianName: text("politician_name").notNull(),
  organization: text("organization").notNull(),
  role: text("role").notNull(),
  incomeLevel: text("income_level").notNull(),
  category: text("category").notNull(),
  isControversial: integer("is_controversial", { mode: "boolean" }).notNull().default(false),
  createdOnDay: integer("created_on_day").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

export const quizTheses = sqliteTable("quiz_theses", {
  id: text("id").primaryKey(),
  text: text("text").notNull(),
  category: text("category").notNull(),
  generatedOnDay: integer("generated_on_day").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

export const quizPartyPositions = sqliteTable("quiz_party_positions", {
  id: text("id").primaryKey(),
  thesisId: text("thesis_id").notNull().references(() => quizTheses.id),
  partyId: text("party_id").notNull().references(() => parties.id),
  position: text("position").notNull(), // "agree" | "disagree" | "neutral"
  reasoning: text("reasoning"),
});

export const lobbyingEvents = sqliteTable("lobbying_events", {
  id: text("id").primaryKey(),
  organizationName: text("organization_name").notNull(),
  sector: text("sector").notNull(),
  targetPartyId: text("target_party_id").notNull().references(() => parties.id),
  targetBillId: text("target_bill_id"),
  influence: text("influence").notNull(), // "support" | "oppose"
  intensity: integer("intensity").notNull(), // 1-5
  dayNumber: integer("day_number").notNull(),
});

export const partyDonations = sqliteTable("party_donations", {
  id: text("id").primaryKey(),
  partyId: text("party_id").notNull().references(() => parties.id),
  donorName: text("donor_name").notNull(),
  donorType: text("donor_type").notNull(), // "individual" | "corporate" | "association"
  amount: real("amount").notNull(),
  dayNumber: integer("day_number").notNull(),
  isPublic: integer("is_public", { mode: "boolean" }).notNull().default(false),
});

export const daySummaries = sqliteTable("day_summaries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  dayNumber: integer("day_number").notNull().unique(),
  narrative: text("narrative"),
  mood: text("mood"),
  preview: text("preview"),        // start-of-day preview (deterministic)
  createdAt: text("created_at").notNull(),
});

// Cycle 4 PR 1 — Untersuchungsausschuss (parliamentary inquiry committee).
// Dedicated table per S11 (NOT reusing `committees` — different lifecycle, no
// member-roster, no bill-routing role). At least one of `targetPartyId` /
// `targetMinistry` must be non-null at filing time (S17 invariant, enforced
// by `fileInquiry()` and asserted by tests).
export const inquiryCommittees = sqliteTable("inquiry_committees", {
  id: text("id").primaryKey(),
  subject: text("subject").notNull(),
  filingPartyId: text("filing_party_id").notNull().references(() => parties.id),
  targetPartyId: text("target_party_id").references(() => parties.id),
  targetMinistry: text("target_ministry"),
  filedOnDay: integer("filed_on_day").notNull(),
  scheduledEndDay: integer("scheduled_end_day").notNull(),
  concludedOnDay: integer("concluded_on_day"),
  status: text("status").notNull().default("active"),         // "active" | "concluded"
  outcome: text("outcome"),                                    // "wrongdoing_found" | "cleared" | null while active
  finalReport: text("final_report"),                           // populated at conclusion (S21)
  hearingCount: integer("hearing_count").notNull().default(0),
  lastHearingDay: integer("last_hearing_day"),
});

// Cycle 5 PR 1 — Ausschussanhörung expert pool (Q3=A, S2).
// Seeded once via INSERT OR IGNORE in seed.ts cycle5Migrated block (S13).
// Expert rows are referenced by both Ausschussanhörungen (PR 1) and
// Enquete-Kommissionen (PR 2) via JSON-encoded id arrays.
export const experts = sqliteTable("experts", {
  id: text("id").primaryKey(),                       // 'expert-diw-fratzscher'
  name: text("name").notNull(),                      // 'Prof. Dr. Marcel Fratzscher'
  affiliation: text("affiliation").notNull(),        // 'DIW Berlin'
  /** JSON array of MinistryPortfolio[] — invariant: ≥3 experts per portfolio (S2). */
  expertiseAreas: text("expertise_areas").notNull(),
});

// Cycle 5 PR 1 — Ausschussanhörung lifecycle row (Q4 auto-trigger, S3 lifecycle).
// Row written `status='scheduled'` synchronously when bill_committee fires;
// AI batch updates to 'held' (with testimonies + tone) or 'lapsed' (tone=0).
// Pipeline reads tone=0 as no-nudge gracefully (S3).
export const ausschussanhoerungen = sqliteTable("ausschussanhoerungen", {
  id: text("id").primaryKey(),                          // 'anhoerung-{billId}-{day}'
  billId: text("bill_id").notNull().references(() => bills.id),
  ministryFocus: text("ministry_focus").notNull(),      // MinistryPortfolio (mapped via S14)
  expertIds: text("expert_ids").notNull(),              // JSON: string[] length === ANHOERUNG_EXPERTS_PER_HEARING
  testimonies: text("testimonies").notNull().default("[]"), // JSON: [{expertId, statement}]
  tone: real("tone").notNull().default(0),              // [-1, +1]
  heldOnDay: integer("held_on_day").notNull(),
  status: text("status").notNull().default("scheduled"), // 'scheduled' | 'held' | 'lapsed'
});

// Cycle 5 PR 2 — Enquete-Kommission lifecycle (Q2=A: mid-fidelity establish +
// AI Schlussbericht). Bundestag-Beschluss vote happens same tick (S12). Active
// rows transition to `concluded` via the daily watchdog at scheduledEndDay
// (with AI final-report submitted via batch group D piggyback). Stale rows
// past scheduledEndDay + 30 transition to `lapsed` (soft-watchdog, R7/Q9).
export const enqueteCommissions = sqliteTable("enquete_commissions", {
  id: text("id").primaryKey(),                                          // 'enquete-{day}-{topic}'
  topic: text("topic").notNull(),                                       // MinistryPortfolio enum value
  proposingPartyId: text("proposing_party_id").notNull().references(() => parties.id),
  partyMemberIds: text("party_member_ids").notNull(),                   // JSON: { [partyId]: number } (Σ === ENQUETE_MDB_SLOTS)
  expertMemberIds: text("expert_member_ids").notNull(),                 // JSON: string[] of length [ENQUETE_EXPERT_SLOTS_MIN, ENQUETE_EXPERT_SLOTS_MAX]
  formedOnDay: integer("formed_on_day").notNull(),
  scheduledEndDay: integer("scheduled_end_day").notNull(),              // formedOnDay + draw(MIN, MAX)
  concludedOnDay: integer("concluded_on_day"),                          // null while active
  status: text("status", {
    enum: ["proposed", "active", "concluded", "rejected", "lapsed"],
  }).notNull().default("proposed"),
  finalReport: text("final_report"),                                    // null until concluded (AI Schlussbericht)
  voteResult: text("vote_result"),                                      // JSON {yes, no, abstain, passed}; null until convened/rejected
});

export const eraSummaries = sqliteTable("era_summaries", {
  id: text("id").primaryKey(),
  startDay: integer("start_day").notNull(),
  endDay: integer("end_day").notNull(),
  summary: text("summary").notNull(),
  caseFacts: text("case_facts", { mode: "json" }),
  createdAt: text("created_at").notNull(),
});
