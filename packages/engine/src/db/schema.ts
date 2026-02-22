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
});

export const bills = sqliteTable("bills", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  proposedBy: text("proposed_by").notNull(),
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
});

export const simulationMeta = sqliteTable("simulation_meta", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  currentDay: integer("current_day").notNull().default(0),
  lastRunAt: text("last_run_at"),
  dayStartedAt: text("day_started_at"),
  nextElectionDay: integer("next_election_day").notNull().default(1461),
  lowSentimentStreak: integer("low_sentiment_streak").notNull().default(0),
  budgetRetryDay: integer("budget_retry_day"),
  dailySummary: text("daily_summary"),
  timingPreset: text("timing_preset").notNull().default("normal"),
  startDate: text("start_date"),
});

export const partyHistory = sqliteTable("party_history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  partyId: text("party_id").notNull(),
  dayNumber: integer("day_number").notNull(),
  approvalRating: real("approval_rating").notNull(),
  seatCount: integer("seat_count").notNull(),
});

export const citizenQuestions = sqliteTable("citizen_questions", {
  id: text("id").primaryKey(),
  question: text("question").notNull(),
  targetPartyId: text("target_party_id").notNull(),
  response: text("response"),
  respondedOnDay: integer("responded_on_day"),
  createdOnDay: integer("created_on_day").notNull(),
  status: text("status").notNull().default("pending"),
  userId: text("user_id"),
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
  partyId: text("party_id").notNull(),
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
  electionId: text("election_id"),
  chancellorName: text("chancellor_name").notNull(),
  chancellorPartyId: text("chancellor_party_id").notNull(),
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
  filedByPartyId: text("filed_by_party_id").notNull(),
  targetMinistry: text("target_ministry").notNull(),
  targetMinisterName: text("target_minister_name").notNull(),
  targetPartyId: text("target_party_id").notNull(),
  response: text("response"),
  status: text("status").notNull(), // "pending" | "answered" | "expired"
  dayNumber: integer("day_number").notNull(),
  respondedOnDay: integer("responded_on_day"),
  sentimentImpact: real("sentiment_impact"),
});

export const confidenceVotes = sqliteTable("confidence_votes", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),             // "vertrauensfrage" | "misstrauensvotum"
  governmentId: text("government_id").notNull(),
  initiatedByPartyId: text("initiated_by_party_id").notNull(),
  chancellorName: text("chancellor_name").notNull(),
  proposedChancellor: text("proposed_chancellor"),              // misstrauensvotum only
  proposedChancellorPartyId: text("proposed_chancellor_party_id"), // misstrauensvotum only
  title: text("title").notNull(),
  description: text("description").notNull(),
  status: text("status").notNull(),         // "passed" | "failed"
  votes: text("votes", { mode: "json" }).notNull().default("[]"),
  dayNumber: integer("day_number").notNull(),
  sentimentImpact: real("sentiment_impact"),
});

export const constitutionalChallenges = sqliteTable("constitutional_challenges", {
  id: text("id").primaryKey(),
  billId: text("bill_id").notNull(),
  billTitle: text("bill_title").notNull(),
  filedByPartyId: text("filed_by_party_id").notNull(),
  arguments: text("arguments").notNull(),
  decision: text("decision"),           // "struck_down" | "upheld" | null while pending
  reasoning: text("reasoning"),
  status: text("status").notNull(),     // "pending" | "ruled"
  dayNumber: integer("day_number").notNull(),
  ruledOnDay: integer("ruled_on_day"),
  sentimentImpact: real("sentiment_impact"),
});

export const internalProposals = sqliteTable("internal_proposals", {
  id: text("id").primaryKey(),
  partyId: text("party_id").notNull(),
  proposedBy: text("proposed_by").notNull(),           // userId or "ai"
  proposerName: text("proposer_name").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  rationale: text("rationale"),
  status: text("status").notNull().default("open"),    // open/reviewing/accepted/declined/expired
  voteScore: integer("vote_score").notNull().default(0),
  totalVotes: integer("total_votes").notNull().default(0),
  createdOnDay: integer("created_on_day").notNull(),
  reviewByDay: integer("review_by_day").notNull(),
  reviewedOnDay: integer("reviewed_on_day"),
  declineReason: text("decline_reason"),
  bundestag_bill_id: text("bundestag_bill_id"),
});

export const memberSignals = sqliteTable("member_signals", {
  id: text("id").primaryKey(),
  billId: text("bill_id").notNull(),
  userId: text("user_id").notNull(),
  signal: text("signal").notNull(),    // "yes" | "no"
  createdAt: integer("created_at").notNull(),
});

export const internalVotes = sqliteTable("internal_votes", {
  id: text("id").primaryKey(),
  proposalId: text("proposal_id").notNull(),
  userId: text("user_id").notNull(),
  vote: integer("vote").notNull(),             // +1 or -1
  createdAt: integer("created_at").notNull(),
});

export const questionVotes = sqliteTable("question_votes", {
  id: text("id").primaryKey(),
  questionId: text("question_id").notNull(),
  userId: text("user_id").notNull(),
  vote: integer("vote").notNull(),             // +1 or -1
  createdAt: integer("created_at").notNull(),
});

export const referendumVotes = sqliteTable("referendum_votes", {
  id: text("id").primaryKey(),
  referendumId: text("referendum_id").notNull(),
  userId: text("user_id").notNull(),
  option: text("option").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),                         // UUID = auth token
  displayName: text("display_name").notNull().unique(),
  partyId: text("party_id"),                           // null = no party
  createdAt: integer("created_at").notNull(),
  lastActive: integer("last_active").notNull(),
  switchCooldownUntil: integer("switch_cooldown_until"), // sim day
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

export const notifications = sqliteTable("notifications", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  type: text("type").notNull(),       // "queued_event" | "event_ready" | "participation_window" | "summary"
  title: text("title").notNull(),
  message: text("message").notNull(),
  data: text("data", { mode: "json" }),
  read: integer("read", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
  dayNumber: integer("day_number").notNull(),
});

// ── MdB (Bundestag Member) tables ──

export const bundestagSeats = sqliteTable("bundestag_seats", {
  id: text("id").primaryKey(),
  seatNumber: integer("seat_number").notNull(),
  partyId: text("party_id").notNull(),
  controller: text("controller").notNull(),         // "human" | "ai"
  userId: text("user_id"),
  electionId: text("election_id"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  proxyDefault: text("proxy_default").notNull().default("party_line"), // "party_line" | "abstain"
  disciplineLevel: integer("discipline_level").notNull().default(0),   // 0-3
  disciplineReason: text("discipline_reason"),
  allocatedOnDay: integer("allocated_on_day").notNull(),
});

export const mdbApplications = sqliteTable("mdb_applications", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  partyId: text("party_id").notNull(),
  applicationText: text("application_text").notNull(),
  policyFocus: text("policy_focus", { mode: "json" }),
  status: text("status").notNull().default("pending"), // "pending" | "approved" | "rejected" | "expired"
  aiReasoning: text("ai_reasoning"),
  priorityScore: real("priority_score"),
  createdOnDay: integer("created_on_day").notNull(),
  reviewedOnDay: integer("reviewed_on_day"),
  cooldownUntilDay: integer("cooldown_until_day"),
});

export const mdbVotes = sqliteTable("mdb_votes", {
  id: text("id").primaryKey(),
  seatId: text("seat_id").notNull(),
  billId: text("bill_id").notNull(),
  userId: text("user_id").notNull(),
  vote: text("vote").notNull(),       // "yes" | "no" | "abstain"
  createdAt: integer("created_at").notNull(),
});

export const mdbSpeeches = sqliteTable("mdb_speeches", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  billId: text("bill_id").notNull(),
  reading: integer("reading").notNull(),
  content: text("content").notNull(),
  sentimentImpact: real("sentiment_impact"),
  dayNumber: integer("day_number").notNull(),
  createdAt: integer("created_at").notNull(),
});

// ── User Action Logging (analytics) ──

export const userActions = sqliteTable("user_actions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  actionType: text("action_type").notNull(),
  entityId: text("entity_id"),
  entityType: text("entity_type"),
  metadata: text("metadata", { mode: "json" }),
  simDay: integer("sim_day").notNull(),
  createdAt: text("created_at").notNull(),
});
