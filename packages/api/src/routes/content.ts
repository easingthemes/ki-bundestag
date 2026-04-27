import { Router } from "express";
import { randomUUID } from "crypto";
import { getDb, getUserDb, getUserSqlite, schema, logUserAction, logger, QUESTION_TOPICS } from "@ki-bundestag/engine";
import { eq, and, isNull } from "drizzle-orm";
import type {
  Poll,
  MediaArticle,
  CitizenQuestion,
  Referendum,
  BillImpact,
} from "@ki-bundestag/types";
import { getUserToken, requireParticipatory } from "../middleware/index.js";
import { checkUserDailyLimit, quotaSnapshot } from "../middleware/rate-limit.js";
import { LIMITS } from "../validation.js";

const router = Router();

// ── Helpers ─────────────────────────────────────────────────────────────────

function mapPoll(row: typeof schema.polls.$inferSelect): Poll {
  return {
    id: row.id,
    question: row.question,
    options: row.options as unknown as string[],
    votes: row.votes as unknown as Record<string, number>,
    createdOnDay: row.createdOnDay,
    expiresOnDay: row.expiresOnDay,
    active: row.active,
    category: row.category,
  };
}

function mapReferendum(row: typeof schema.referendums.$inferSelect): Referendum {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    options: row.options as unknown as string[],
    votes: row.votes as unknown as Record<string, number>,
    createdOnDay: row.createdOnDay,
    closesOnDay: row.closesOnDay,
    status: row.status as Referendum["status"],
    result: row.result,
    impact: row.impact as unknown as BillImpact | null,
    category: row.category,
  };
}

/** Resolve a question's author for response shaping. Returns null if the row has no userId or the user was deleted. */
function lookupAuthorInfo(userId: string | null | undefined): { displayName: string; isBot: boolean } | null {
  if (!userId) return null;
  const row = getUserDb().select({ displayName: schema.users.displayName, isBot: schema.users.isBot })
    .from(schema.users).where(eq(schema.users.id, userId)).all()[0];
  return row ? { displayName: row.displayName, isBot: row.isBot ?? false } : null;
}

function mapQuestion(
  row: typeof schema.citizenQuestions.$inferSelect,
  voteScore = 0,
  totalVotes = 0,
  userVote?: 1 | -1 | null,
  authorInfo?: { displayName: string; isBot: boolean } | null,
): CitizenQuestion {
  return {
    id: row.id,
    question: row.question,
    targetPartyId: row.targetPartyId,
    response: row.response,
    respondedOnDay: row.respondedOnDay,
    createdOnDay: row.createdOnDay,
    status: row.status as CitizenQuestion["status"],
    topic: (row as any).topic ?? null,
    voteScore,
    totalVotes,
    userVote: userVote ?? null,
    authorName: authorInfo?.displayName ?? null,
    authorIsBot: authorInfo?.isBot ?? false,
  };
}

function mapMediaArticle(row: typeof schema.mediaArticles.$inferSelect): MediaArticle {
  return {
    id: row.id,
    headline: row.headline,
    summary: row.summary,
    content: row.content,
    outlet: row.outlet,
    bias: row.bias,
    category: row.category,
    dayNumber: row.dayNumber,
  };
}

// ── Polls ───────────────────────────────────────────────────────────────────

// GET /api/polls
router.get("/api/polls", (req, res) => {
  const db = getDb();
  const allRows = db.select().from(schema.polls).all();
  const activeOnly = req.query.active === "true";
  const rows = activeOnly ? allRows.filter((p: any) => p.active) : allRows;
  const polls: Poll[] = rows.map(mapPoll);
  polls.sort((a, b) => b.createdOnDay - a.createdOnDay);
  res.json(polls);
});

// GET /api/polls/:id
router.get("/api/polls/:id", (req, res) => {
  const db = getDb();
  const rows = db.select().from(schema.polls).where(eq(schema.polls.id, req.params.id)).all();
  if (rows.length === 0) {
    res.status(404).json({ error: "Poll not found" });
    return;
  }
  res.json(mapPoll(rows[0]));
});

// POST /api/polls/:id/vote
router.post("/api/polls/:id/vote", (req, res) => {
  if (requireParticipatory(req, res, "vote_polls")) return;
  const token = getUserToken(req);
  if (!token) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const db = getDb();
  const rows = db.select().from(schema.polls).where(eq(schema.polls.id, req.params.id)).all();
  if (rows.length === 0) {
    res.status(404).json({ error: "Poll not found" });
    return;
  }

  const poll = mapPoll(rows[0]);
  if (!poll.active) {
    res.status(400).json({ error: "Poll is no longer active" });
    return;
  }

  const { option } = req.body;
  if (!option || !poll.options.includes(option)) {
    res.status(400).json({ error: "Invalid option" });
    return;
  }

  // Polls store tallies in a JSON column with no per-user attribution table,
  // so we dedupe via user_actions: one vote_poll row per user per poll.
  const userSqlite = getUserSqlite();
  const prior = userSqlite.prepare(
    "SELECT 1 FROM user_actions WHERE user_id = ? AND action_type = 'vote_poll' AND entity_id = ? LIMIT 1"
  ).get(token, req.params.id);
  if (prior) {
    res.status(409).json({ error: "You have already voted in this poll" });
    return;
  }

  const votes = { ...poll.votes };
  votes[option] = (votes[option] || 0) + 1;

  db.update(schema.polls)
    .set({ votes: votes as any })
    .where(eq(schema.polls.id, poll.id))
    .run();

  try { const token = getUserToken(req); const md = db.select({ day: schema.simulationMeta.currentDay }).from(schema.simulationMeta).limit(1).all()[0]; if (token) logUserAction(token, "vote_poll", md?.day ?? 0, req.params.id, "poll", { option }); } catch (err) { logger.error("[content] Failed to log action:", err); }
  res.json({ ...poll, votes });
});

// ── Media ───────────────────────────────────────────────────────────────────

// GET /api/media
router.get("/api/media", (req, res) => {
  const db = getDb();
  const allRows = db.select().from(schema.mediaArticles).all();
  const dayFilter = req.query.day as string | undefined;
  const dayFilterNum = dayFilter !== undefined ? parseInt(dayFilter, 10) : NaN;
  if (dayFilter !== undefined && isNaN(dayFilterNum)) {
    res.status(400).json({ error: "day filter must be a valid integer" });
    return;
  }
  const rows = dayFilter !== undefined ? allRows.filter((a: any) => a.dayNumber === dayFilterNum) : allRows;
  const articles: MediaArticle[] = rows.map(mapMediaArticle);
  articles.sort((a, b) => b.dayNumber - a.dayNumber);
  res.json(articles);
});

// GET /api/media/:id
router.get("/api/media/:id", (req, res) => {
  const db = getDb();
  const rows = db.select().from(schema.mediaArticles).where(eq(schema.mediaArticles.id, req.params.id)).all();
  if (rows.length === 0) {
    res.status(404).json({ error: "Article not found" });
    return;
  }
  res.json(mapMediaArticle(rows[0]));
});

// ── Questions ───────────────────────────────────────────────────────────────

// GET /api/questions
router.get("/api/questions", (req, res) => {
  const db = getDb();
  const userDb = getUserDb();
  const allRows = db.select().from(schema.citizenQuestions).all();
  const partyFilter = req.query.partyId as string | undefined;
  const statusFilter = req.query.status as string | undefined;
  const topicFilter = req.query.topic as string | undefined;
  let rows = allRows;
  if (partyFilter) rows = rows.filter((q: any) => q.targetPartyId === partyFilter);
  if (statusFilter) rows = rows.filter((q: any) => q.status === statusFilter);
  if (topicFilter) rows = rows.filter((q: any) => q.topic === topicFilter);

  // Aggregate vote scores from user DB
  const allVotes = userDb.select().from(schema.questionVotes).all();
  const scoreMap: Record<string, { score: number; total: number }> = {};
  for (const v of allVotes) {
    if (!scoreMap[v.questionId]) scoreMap[v.questionId] = { score: 0, total: 0 };
    scoreMap[v.questionId].score += v.vote;
    scoreMap[v.questionId].total += 1;
  }

  // Check user vote if authenticated
  const token = getUserToken(req);
  const userVoteMap: Record<string, 1 | -1> = {};
  if (token) {
    const userVotes = userDb.select().from(schema.questionVotes)
      .where(eq(schema.questionVotes.userId, token)).all();
    for (const v of userVotes) userVoteMap[v.questionId] = v.vote as 1 | -1;
  }

  // Batch-fetch author info for questions with userId
  const authorIds = [...new Set(rows.map(r => (r as any).userId).filter(Boolean))];
  const authorMap: Record<string, { displayName: string; isBot: boolean }> = {};
  if (authorIds.length > 0) {
    const allUsers = userDb.select({ id: schema.users.id, displayName: schema.users.displayName, isBot: schema.users.isBot }).from(schema.users).all();
    for (const u of allUsers) {
      if (authorIds.includes(u.id)) authorMap[u.id] = { displayName: u.displayName, isBot: u.isBot ?? false };
    }
  }

  const questions: CitizenQuestion[] = rows.map(r =>
    mapQuestion(r, scoreMap[r.id]?.score ?? 0, scoreMap[r.id]?.total ?? 0, userVoteMap[r.id] ?? null, (r as any).userId ? authorMap[(r as any).userId] ?? null : null),
  );
  // Pending: by voteScore desc, then oldest first; Answered: by respondedOnDay desc
  questions.sort((a, b) => {
    if (a.status === "pending" && b.status === "pending") {
      return (b.voteScore - a.voteScore) || (a.createdOnDay - b.createdOnDay);
    }
    if (a.status === "pending") return -1;
    if (b.status === "pending") return 1;
    return (b.respondedOnDay ?? 0) - (a.respondedOnDay ?? 0);
  });
  res.json(questions);
});

// GET /api/questions/topics — static list of available topics
router.get("/api/questions/topics", (_req, res) => {
  res.json(QUESTION_TOPICS);
});

// GET /api/questions/trending-topics — real-world question topics from abgeordnetenwatch
let trendingCache: { topics: Array<{ label: string; sampleQuestion: string; source: string }>; cachedAt: number } | null = null;
router.get("/api/questions/trending-topics", (_req, res) => {
  const now = Date.now();
  if (trendingCache && now - trendingCache.cachedAt < 3600_000) {
    res.json(trendingCache.topics);
    return;
  }

  const db = getDb();
  const rows = db.select().from(schema.realWorldKnowledge)
    .all()
    .filter(r => r.active && (r.digest.includes("abgeordnetenwatch") || r.category === "headline"))
    .slice(0, 30);

  // Extract topic labels and sample questions
  const topicMap = new Map<string, string>();
  for (const r of rows) {
    // digest format varies; extract meaningful topic label
    const label = r.partyId ? r.digest.slice(0, 60) : r.digest.slice(0, 60);
    const topic = r.category === "headline" ? r.digest.slice(0, 40) : r.digest.slice(0, 40);
    if (!topicMap.has(topic)) {
      topicMap.set(topic, r.digest.slice(0, 150));
    }
  }

  const topics = Array.from(topicMap.entries()).slice(0, 8).map(([label, sample]) => ({
    label: label.replace(/\.\.\.$/, "").trim(),
    sampleQuestion: sample,
    source: "abgeordnetenwatch",
  }));

  trendingCache = { topics, cachedAt: now };
  res.json(topics);
});

// GET /api/questions/suggestions — AI-generated question suggestions
router.get("/api/questions/suggestions", (_req, res) => {
  const db = getDb();
  const rows = db.select().from(schema.questionSuggestions)
    .where(isNull(schema.questionSuggestions.usedByUserId))
    .all();
  res.json(rows.slice(0, 5).map(r => ({
    id: r.id,
    question: r.question,
    topic: r.topic,
    targetPartyId: r.targetPartyId,
    createdOnDay: r.createdOnDay,
  })));
});

// POST /api/questions/suggestions/:id/use — mark a suggestion as used
router.post("/api/questions/suggestions/:id/use", (req, res) => {
  const token = getUserToken(req);
  if (!token) { res.status(401).json({ error: "Authentication required" }); return; }

  const db = getDb();
  const rows = db.select().from(schema.questionSuggestions)
    .where(eq(schema.questionSuggestions.id, req.params.id))
    .all();
  if (rows.length === 0) { res.status(404).json({ error: "Suggestion not found" }); return; }

  db.update(schema.questionSuggestions)
    .set({ usedByUserId: token })
    .where(eq(schema.questionSuggestions.id, req.params.id))
    .run();

  res.json({ success: true });
});

// GET /api/questions/:id
router.get("/api/questions/:id", (req, res) => {
  const db = getDb();
  const userDb = getUserDb();
  const rows = db.select().from(schema.citizenQuestions).where(eq(schema.citizenQuestions.id, req.params.id)).all();
  if (rows.length === 0) {
    res.status(404).json({ error: "Question not found" });
    return;
  }
  const votes = userDb.select().from(schema.questionVotes).where(eq(schema.questionVotes.questionId, req.params.id)).all();
  const score = votes.reduce((s, v) => s + v.vote, 0);
  const token = getUserToken(req);
  const uv = token ? votes.find(v => v.userId === token) : undefined;
  const qUserId = (rows[0] as any).userId;
  let authorInfo: { displayName: string; isBot: boolean } | null = null;
  if (qUserId) {
    const authorRow = userDb.select({ displayName: schema.users.displayName, isBot: schema.users.isBot }).from(schema.users).where(eq(schema.users.id, qUserId)).all()[0];
    if (authorRow) authorInfo = { displayName: authorRow.displayName, isBot: authorRow.isBot ?? false };
  }
  res.json(mapQuestion(rows[0], score, votes.length, uv ? (uv.vote as 1 | -1) : null, authorInfo));
});

// POST /api/questions
router.post("/api/questions", (req, res) => {
  if (requireParticipatory(req, res, "ask_questions")) return;
  const db = getDb();
  const { question, targetPartyId, topic } = req.body;

  // Validate topic if provided
  if (topic && !QUESTION_TOPICS.includes(topic)) {
    res.status(400).json({ error: "Invalid topic" });
    return;
  }

  // Per-user daily cap (24h wall-clock for humans, sim-day for bots — see rate-limit.ts)
  const token = getUserToken(req);
  let questionCap: { limit: number; used: number } | null = null;
  if (token) {
    const cap = checkUserDailyLimit(token, "submit_question");
    if (!cap.allowed) {
      res.status(429).json({ error: `Daily limit reached (${cap.used}/${cap.limit} questions). Try again later.` });
      return;
    }
    questionCap = { limit: cap.limit, used: cap.used };
  }

  if (!question || typeof question !== "string" || question.trim().length < LIMITS.QUESTION_MIN) {
    res.status(400).json({ error: `Question must be at least ${LIMITS.QUESTION_MIN} characters` });
    return;
  }
  if (question.trim().length > 500) {
    res.status(400).json({ error: "Question must be at most 500 characters" });
    return;
  }
  if (!targetPartyId || typeof targetPartyId !== "string") {
    res.status(400).json({ error: "targetPartyId is required" });
    return;
  }

  // Validate party exists
  const partyRows = db.select().from(schema.parties).where(eq(schema.parties.id, targetPartyId)).all();
  if (partyRows.length === 0) {
    res.status(400).json({ error: "Party not found" });
    return;
  }

  // Get current day
  const metaRows = db.select().from(schema.simulationMeta).all();
  const currentDay = metaRows[0]?.currentDay ?? 0;

  const id = `q-${Math.random().toString(36).substring(2, 10)}${Date.now().toString(36)}`;
  db.insert(schema.citizenQuestions).values({
    id,
    question: question.trim().substring(0, LIMITS.QUESTION_MAX),
    targetPartyId,
    response: null,
    respondedOnDay: null,
    createdOnDay: currentDay,
    status: "pending",
    userId: token,
    topic: topic || null,
  }).run();

  const created = db.select().from(schema.citizenQuestions).where(eq(schema.citizenQuestions.id, id)).all()[0];
  try { if (token) logUserAction(token, "submit_question", currentDay, id, "question", { targetPartyId }); } catch (err) { logger.error("[content] Failed to log action:", err); }
  const quota = questionCap ? quotaSnapshot("submit_question", questionCap.used, questionCap.limit) : null;
  res.status(201).json({ ...mapQuestion(created, 0, 0, null, lookupAuthorInfo(token)), quota });
});

// POST /api/questions/:id/vote (auth)
router.post("/api/questions/:id/vote", (req, res) => {
  if (requireParticipatory(req, res, "upvote_downvote")) return;
  const token = getUserToken(req);
  if (!token) { res.status(401).json({ error: "Not authenticated" }); return; }
  const userDb = getUserDb();
  const users = userDb.select().from(schema.users).where(eq(schema.users.id, token)).all();
  if (users.length === 0) { res.status(401).json({ error: "User not found" }); return; }

  const db = getDb();
  const question = db.select().from(schema.citizenQuestions).where(eq(schema.citizenQuestions.id, req.params.id)).all()[0];
  if (!question) { res.status(404).json({ error: "Question not found" }); return; }

  const { vote } = req.body as { vote?: number };
  if (vote !== 1 && vote !== -1) { res.status(400).json({ error: "vote must be 1 or -1" }); return; }

  const existing = userDb.select().from(schema.questionVotes)
    .where(and(eq(schema.questionVotes.questionId, req.params.id), eq(schema.questionVotes.userId, token)))
    .all();

  if (existing.length > 0) {
    if (existing[0].vote === vote) {
      // No change — return current state
    } else {
      userDb.update(schema.questionVotes).set({ vote, createdAt: Date.now() })
        .where(eq(schema.questionVotes.id, existing[0].id)).run();
    }
  } else {
    const voteId = `qvote-${randomUUID().slice(0, 8)}`;
    userDb.insert(schema.questionVotes).values({
      id: voteId, questionId: req.params.id, userId: token, vote, createdAt: Date.now(),
    }).run();
  }

  userDb.update(schema.users).set({ lastActive: Date.now() }).where(eq(schema.users.id, token)).run();

  try { const md = db.select({ day: schema.simulationMeta.currentDay }).from(schema.simulationMeta).limit(1).all()[0]; logUserAction(token, "vote_question", md?.day ?? 0, req.params.id, "question", { vote }); } catch (err) { logger.error("[content] Failed to log action:", err); }

  // Recompute scores
  const allVotes = userDb.select().from(schema.questionVotes).where(eq(schema.questionVotes.questionId, req.params.id)).all();
  const score = allVotes.reduce((s, v) => s + v.vote, 0);
  res.json(mapQuestion(question, score, allVotes.length, vote as 1 | -1, lookupAuthorInfo((question as any).userId)));
});

// DELETE /api/questions/:id/vote (auth)
router.delete("/api/questions/:id/vote", (req, res) => {
  if (requireParticipatory(req, res, "upvote_downvote")) return;
  const token = getUserToken(req);
  if (!token) { res.status(401).json({ error: "Not authenticated" }); return; }
  const userDb = getUserDb();

  const db = getDb();
  const question = db.select().from(schema.citizenQuestions).where(eq(schema.citizenQuestions.id, req.params.id)).all()[0];
  if (!question) { res.status(404).json({ error: "Question not found" }); return; }

  const existing = userDb.select().from(schema.questionVotes)
    .where(and(eq(schema.questionVotes.questionId, req.params.id), eq(schema.questionVotes.userId, token)))
    .all();

  if (existing.length > 0) {
    userDb.delete(schema.questionVotes).where(eq(schema.questionVotes.id, existing[0].id)).run();
  }

  // Recompute scores
  const allVotes = userDb.select().from(schema.questionVotes).where(eq(schema.questionVotes.questionId, req.params.id)).all();
  const score = allVotes.reduce((s, v) => s + v.vote, 0);
  res.json(mapQuestion(question, score, allVotes.length, null, lookupAuthorInfo((question as any).userId)));
});

// ── Referendums ─────────────────────────────────────────────────────────────

// GET /api/referendums
router.get("/api/referendums", (req, res) => {
  const db = getDb();
  const userDb = getUserDb();
  const allRows = db.select().from(schema.referendums).all();
  const statusFilter = req.query.status as string | undefined;
  const rows = statusFilter ? allRows.filter((r: any) => r.status === statusFilter) : allRows;

  const token = getUserToken(req);
  const votedSet = new Set<string>();
  if (token) {
    const userVotes = userDb.select().from(schema.referendumVotes)
      .where(eq(schema.referendumVotes.userId, token)).all();
    for (const v of userVotes) votedSet.add(v.referendumId);
  }

  const referendums = rows.map(r => ({ ...mapReferendum(r), userVoted: votedSet.has(r.id) }));
  referendums.sort((a, b) => b.createdOnDay - a.createdOnDay);
  res.json(referendums);
});

// GET /api/referendums/:id
router.get("/api/referendums/:id", (req, res) => {
  const db = getDb();
  const userDb = getUserDb();
  const rows = db.select().from(schema.referendums).where(eq(schema.referendums.id, req.params.id)).all();
  if (rows.length === 0) {
    res.status(404).json({ error: "Referendum not found" });
    return;
  }
  const token = getUserToken(req);
  let userVoted = false;
  if (token) {
    const existing = userDb.select().from(schema.referendumVotes)
      .where(and(eq(schema.referendumVotes.referendumId, req.params.id), eq(schema.referendumVotes.userId, token))).all();
    userVoted = existing.length > 0;
  }
  res.json({ ...mapReferendum(rows[0]), userVoted });
});

// POST /api/referendums/:id/vote
router.post("/api/referendums/:id/vote", (req, res) => {
  if (requireParticipatory(req, res, "vote_referendums")) return;
  const token = getUserToken(req);
  if (!token) { res.status(401).json({ error: "Login required to vote" }); return; }

  const db = getDb();
  const userDb = getUserDb();
  const rows = db.select().from(schema.referendums).where(eq(schema.referendums.id, req.params.id)).all();
  if (rows.length === 0) {
    res.status(404).json({ error: "Referendum not found" });
    return;
  }

  const referendum = mapReferendum(rows[0]);
  if (referendum.status !== "active") {
    res.status(400).json({ error: "Referendum is no longer active" });
    return;
  }

  const { option } = req.body;
  if (!option || !referendum.options.includes(option)) {
    res.status(400).json({ error: "Invalid option" });
    return;
  }

  // Check for existing vote
  const existing = userDb.select().from(schema.referendumVotes)
    .where(and(eq(schema.referendumVotes.referendumId, referendum.id), eq(schema.referendumVotes.userId, token))).all();
  if (existing.length > 0) {
    res.status(400).json({ error: "Already voted on this referendum" });
    return;
  }

  // Record user vote
  const voteId = `rvote-${randomUUID().slice(0, 8)}`;
  userDb.insert(schema.referendumVotes).values({
    id: voteId, referendumId: referendum.id, userId: token, option, createdAt: Date.now(),
  }).run();

  const votes = { ...referendum.votes };
  votes[option] = (votes[option] || 0) + 1;

  db.update(schema.referendums)
    .set({ votes: votes as any })
    .where(eq(schema.referendums.id, referendum.id))
    .run();

  try { const md = db.select({ day: schema.simulationMeta.currentDay }).from(schema.simulationMeta).limit(1).all()[0]; logUserAction(token, "vote_referendum", md?.day ?? 0, req.params.id, "referendum", { option }); } catch (err) { logger.error("[content] Failed to log action:", err); }
  res.json({ ...referendum, votes, userVoted: true });
});

export default router;
