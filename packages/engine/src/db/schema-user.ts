import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

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
  userId: text("user_id").notNull().references(() => users.id),
  signal: text("signal").notNull(),    // "yes" | "no"
  createdAt: integer("created_at").notNull(),
});

export const internalVotes = sqliteTable("internal_votes", {
  id: text("id").primaryKey(),
  proposalId: text("proposal_id").notNull().references(() => internalProposals.id),
  userId: text("user_id").notNull().references(() => users.id),
  vote: integer("vote").notNull(),             // +1 or -1
  createdAt: integer("created_at").notNull(),
});

export const questionVotes = sqliteTable("question_votes", {
  id: text("id").primaryKey(),
  questionId: text("question_id").notNull(),
  userId: text("user_id").notNull().references(() => users.id),
  vote: integer("vote").notNull(),             // +1 or -1
  createdAt: integer("created_at").notNull(),
});

export const referendumVotes = sqliteTable("referendum_votes", {
  id: text("id").primaryKey(),
  referendumId: text("referendum_id").notNull(),
  userId: text("user_id").notNull().references(() => users.id),
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

export const notifications = sqliteTable("notifications", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  type: text("type").notNull(),       // "queued_event" | "event_ready" | "participation_window" | "summary"
  title: text("title").notNull(),
  message: text("message").notNull(),
  data: text("data", { mode: "json" }),
  read: integer("read", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
  dayNumber: integer("day_number").notNull(),
});

// ── MdB (Bundestag Member) tables ──

export const mdbApplications = sqliteTable("mdb_applications", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
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
  userId: text("user_id").notNull().references(() => users.id),
  vote: text("vote").notNull(),       // "yes" | "no" | "abstain"
  createdAt: integer("created_at").notNull(),
});

export const mdbSpeeches = sqliteTable("mdb_speeches", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
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
  userId: text("user_id").notNull().references(() => users.id),
  actionType: text("action_type").notNull(),
  entityId: text("entity_id"),
  entityType: text("entity_type"),
  metadata: text("metadata", { mode: "json" }),
  simDay: integer("sim_day").notNull(),
  createdAt: text("created_at").notNull(),
});
