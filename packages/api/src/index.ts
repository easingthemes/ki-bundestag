import "dotenv/config";
import { randomUUID } from "crypto";
import express from "express";
import cors from "cors";
import { getDb, schema, closeDb, getCrisisTemplates, getActiveFraktionen, getActiveGovernment } from "@ki-bundestag/engine";
import { eq, desc, gte, asc, and, inArray, count, sql } from "drizzle-orm";
import type {
  Party,
  Bill,
  BillVote,
  Budget,
  BudgetAllocations,
  BudgetVote,
  ConfidenceVote,
  ConstitutionalChallenge,
  Crisis,
  Election,
  ElectionResult,
  NationalState,
  SimulationEvent,
  BillImpact,
  PolicyPriorities,
  NegotiationRound,
  CoalitionAgreement,
  Poll,
  PartyHistoryEntry,
  MediaArticle,
  CitizenQuestion,
  Referendum,
  Fraktion,
  Motion,
  Government,
  Minister,
  Interpellation,
} from "@ki-bundestag/types";

const app = express();
const PORT = parseInt(process.env.API_PORT || "3001", 10);

app.use(cors());
app.use(express.json());

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// GET /api/parties
app.get("/api/parties", (_req, res) => {
  const db = getDb();
  const rows = db.select().from(schema.parties).all();

  // Fetch recent approval history (last 14 days) for all parties in one query
  const metaRow = db.select({ day: schema.simulationMeta.currentDay }).from(schema.simulationMeta).limit(1).all()[0];
  const minDay = Math.max(0, (metaRow?.day ?? 0) - 13);
  const histRows = db.select().from(schema.partyHistory)
    .where(gte(schema.partyHistory.dayNumber, minDay))
    .orderBy(asc(schema.partyHistory.dayNumber))
    .all();
  const histByParty = new Map<string, number[]>();
  for (const row of histRows) {
    if (!histByParty.has(row.partyId)) histByParty.set(row.partyId, []);
    histByParty.get(row.partyId)!.push(Number(row.approvalRating));
  }

  const memberCounts = getMemberCounts(db);
  const parties = rows.map(r => ({ ...mapParty(r, memberCounts.get(r.id) ?? 0), recentApprovals: histByParty.get(r.id) ?? [] }));
  res.json(parties);
});

// GET /api/parties/alignment
app.get("/api/parties/alignment", (_req, res) => {
  const db = getDb();
  const allParties = db.select().from(schema.parties).all();
  const allBills = db.select().from(schema.bills).all();

  const partyIds = allParties.map(p => p.id as string);
  const matrix: Record<string, Record<string, number | null>> = {};

  for (const a of partyIds) {
    matrix[a] = {};
    for (const b of partyIds) {
      if (a === b) { matrix[a][b] = 100; continue; }
      let shared = 0, agreed = 0;
      for (const bill of allBills) {
        const votes = (bill.votes as any) as Array<{ partyId: string; vote: string }>;
        if (!Array.isArray(votes)) continue;
        const vA = votes.find(v => v.partyId === a);
        const vB = votes.find(v => v.partyId === b);
        if (!vA || !vB) continue;
        shared++;
        if (vA.vote === vB.vote) agreed++;
      }
      matrix[a][b] = shared >= 3 ? Math.round((agreed / shared) * 100) : null;
    }
  }

  res.json({
    parties: allParties.map(p => ({ id: p.id, name: p.name, color: p.color })),
    matrix,
  });
});

// GET /api/parties/:id
app.get("/api/parties/:id", (req, res) => {
  const db = getDb();
  const rows = db.select().from(schema.parties).where(eq(schema.parties.id, req.params.id)).all();
  if (rows.length === 0) {
    res.status(404).json({ error: "Party not found" });
    return;
  }
  const memberCounts = getMemberCounts(db);
  res.json(mapParty(rows[0], memberCounts.get(req.params.id) ?? 0));
});

// GET /api/parties/:id/history
app.get("/api/parties/:id/history", (req, res) => {
  const db = getDb();
  const rows = db.select().from(schema.partyHistory)
    .where(eq(schema.partyHistory.partyId, req.params.id))
    .all();
  const history: PartyHistoryEntry[] = rows.map(r => ({
    id: r.id,
    partyId: r.partyId,
    dayNumber: r.dayNumber,
    approvalRating: r.approvalRating,
    seatCount: r.seatCount,
  }));
  history.sort((a, b) => a.dayNumber - b.dayNumber);
  res.json(history);
});

// GET /api/parties/:id/bills
app.get("/api/parties/:id/bills", (req, res) => {
  const db = getDb();
  const rows = db.select().from(schema.bills)
    .where(eq(schema.bills.proposedBy, req.params.id))
    .all();
  res.json(rows.map(mapBill));
});

// GET /api/parties/:id/votes
app.get("/api/parties/:id/votes", (req, res) => {
  const db = getDb();
  const partyId = req.params.id;
  const allBills = db.select().from(schema.bills).all();
  const result: Array<{ bill: Bill; vote: BillVote }> = [];

  for (const row of allBills) {
    const bill = mapBill(row);
    const vote = bill.votes.find(v => v.partyId === partyId);
    if (vote) {
      result.push({ bill, vote });
    }
  }

  result.sort((a, b) => b.bill.proposedOnDay - a.bill.proposedOnDay);
  res.json(result);
});

// GET /api/parties/:id/statements
app.get("/api/parties/:id/statements", (req, res) => {
  const db = getDb();
  const partyId = req.params.id;
  const allEvents = db.select().from(schema.simulationEvents).all() as unknown as SimulationEvent[];
  const statements = allEvents.filter(
    e => e.actor === partyId && (e.type === "statement" || e.type === "election_campaign"),
  );
  statements.sort((a, b) => b.dayNumber - a.dayNumber);
  res.json(statements);
});

// GET /api/bills
app.get("/api/bills", (req, res) => {
  const db = getDb();
  const allRows = db.select().from(schema.bills).all();
  const status = req.query.status as string | undefined;
  const rows = status ? allRows.filter((b: { status: string }) => b.status === status) : allRows;
  const bills: Bill[] = rows.map(mapBill);
  res.json(bills);
});

// GET /api/bills/:id
app.get("/api/bills/:id", (req, res) => {
  const db = getDb();
  const rows = db.select().from(schema.bills).where(eq(schema.bills.id, req.params.id)).all();
  if (rows.length === 0) {
    res.status(404).json({ error: "Bill not found" });
    return;
  }
  res.json(mapBill(rows[0]));
});

// GET /api/bills/:id/signal
app.get("/api/bills/:id/signal", (req, res) => {
  const db = getDb();
  const token = getUserToken(req);
  const signals = db.select().from(schema.memberSignals).where(eq(schema.memberSignals.billId, req.params.id)).all();
  const yes = signals.filter(s => s.signal === "yes").length;
  const no = signals.filter(s => s.signal === "no").length;
  const userSignal = token ? (signals.find(s => s.userId === token)?.signal ?? null) : null;
  res.json({ yes, no, userSignal });
});

// POST /api/bills/:id/signal (auth)
app.post("/api/bills/:id/signal", (req, res) => {
  const token = getUserToken(req);
  if (!token) { res.status(401).json({ error: "Not authenticated" }); return; }
  const db = getDb();
  const users = db.select().from(schema.users).where(eq(schema.users.id, token)).all();
  if (users.length === 0) { res.status(401).json({ error: "User not found" }); return; }
  const bill = db.select().from(schema.bills).where(eq(schema.bills.id, req.params.id)).all()[0];
  if (!bill) { res.status(404).json({ error: "Bill not found" }); return; }
  if (!["second_reading", "third_reading"].includes(bill.status)) {
    res.status(400).json({ error: "Bill is not in second or third reading" }); return;
  }

  const { signal } = req.body as { signal?: string };
  if (signal !== "yes" && signal !== "no") { res.status(400).json({ error: "signal must be 'yes' or 'no'" }); return; }

  const existing = db.select().from(schema.memberSignals)
    .where(and(eq(schema.memberSignals.billId, req.params.id), eq(schema.memberSignals.userId, token)))
    .all();

  if (existing.length > 0) {
    db.update(schema.memberSignals).set({ signal, createdAt: Date.now() }).where(eq(schema.memberSignals.id, existing[0].id)).run();
  } else {
    db.insert(schema.memberSignals).values({ id: `sig-${randomUUID().slice(0, 8)}`, billId: req.params.id, userId: token, signal, createdAt: Date.now() }).run();
  }

  db.update(schema.users).set({ lastActive: Date.now() }).where(eq(schema.users.id, token)).run();
  const allSignals = db.select().from(schema.memberSignals).where(eq(schema.memberSignals.billId, req.params.id)).all();
  res.json({ yes: allSignals.filter(s => s.signal === "yes").length, no: allSignals.filter(s => s.signal === "no").length, userSignal: signal });
});

// GET /api/state
app.get("/api/state", (_req, res) => {
  const db = getDb();
  const rows = db.select().from(schema.nationalState).all();
  if (rows.length === 0) {
    res.status(404).json({ error: "No state found" });
    return;
  }
  const s = rows[0];
  const state: NationalState = {
    coalitionParties: s.coalitionParties as unknown as string[],
    oppositionParties: s.oppositionParties as unknown as string[],
    economy: {
      budget: s.budget,
      unemployment: s.unemployment,
      inflation: s.inflation,
      gdpGrowth: s.gdpGrowth,
    },
    publicSentiment: s.publicSentiment,
    provisionalBudget: (s as any).provisionalBudget ?? false,
  };

  // compute coalition cohesion: % of third-reading votes in last 14 days where
  // ALL coalition partners voted the same way
  const metaForCohesion = db.select().from(schema.simulationMeta).all();
  const currentDayForCohesion = metaForCohesion[0]?.currentDay ?? 0;
  const recentBills = db.select().from(schema.bills)
    .where(
      and(
        inArray(schema.bills.status, ["passed", "rejected", "struck_down"]),
        gte(schema.bills.statusChangedOnDay, currentDayForCohesion - 14),
      )
    ).all();

  const coalitionIds: string[] = s.coalitionParties as unknown as string[];
  let cohesionNumerator = 0;
  let cohesionDenominator = 0;

  for (const bill of recentBills) {
    const votes: Array<{ partyId: string; vote: string }> = (bill.votes as any) ?? [];
    const coalitionVotes = votes.filter(v => coalitionIds.includes(v.partyId));
    if (coalitionVotes.length < 2) continue;
    const voteValues = new Set(coalitionVotes.map(v => v.vote));
    cohesionDenominator++;
    if (voteValues.size === 1) cohesionNumerator++;
  }

  const coalitionCohesion = cohesionDenominator >= 3
    ? Math.round((cohesionNumerator / cohesionDenominator) * 100)
    : null;

  state.coalitionCohesion = coalitionCohesion;

  res.json(state);
});

// GET /api/simulation/status
app.get("/api/simulation/status", (_req, res) => {
  const db = getDb();
  const metaRows = db.select().from(schema.simulationMeta).all();
  if (metaRows.length === 0) {
    res.json({ currentDay: 0, lastRunAt: null, budgetRetryDay: null, provisionalBudget: false });
    return;
  }
  const meta = metaRows[0];
  const stateRows = db.select().from(schema.nationalState).all();
  const stateRow = stateRows[0];
  res.json({
    currentDay: meta.currentDay,
    lastRunAt: meta.lastRunAt,
    dayStartedAt: (meta as any).dayStartedAt ?? null,
    nextElectionDay: meta.nextElectionDay,
    budgetRetryDay: (meta as any).budgetRetryDay ?? null,
    provisionalBudget: (stateRow as any)?.provisionalBudget ?? false,
    dailySummary: (meta as any).dailySummary ?? null,
  });
});

// GET /api/simulation/days
app.get("/api/simulation/days", (_req, res) => {
  const db = getDb();
  const rows = db.select().from(schema.simulationEvents).all();

  // Group by day
  const dayMap = new Map<number, { dayNumber: number; eventCount: number; summary: string; simulatedAt: string | null }>();
  for (const row of rows) {
    if (!dayMap.has(row.dayNumber)) {
      dayMap.set(row.dayNumber, { dayNumber: row.dayNumber, eventCount: 0, summary: "", simulatedAt: row.createdAt ?? null });
    }
    const day = dayMap.get(row.dayNumber)!;
    day.eventCount++;
    if (row.type === "bill_passed" || row.type === "bill_rejected") {
      day.summary += (day.summary ? "; " : "") + row.title;
    }
    // Use earliest timestamp for the day
    if (row.createdAt && (!day.simulatedAt || row.createdAt < day.simulatedAt)) {
      day.simulatedAt = row.createdAt;
    }
  }

  const days = Array.from(dayMap.values()).sort((a, b) => a.dayNumber - b.dayNumber);
  res.json(days);
});

// GET /api/simulation/days/:dayNumber
app.get("/api/simulation/days/:dayNumber", (req, res) => {
  const db = getDb();
  const dayNumber = parseInt(req.params.dayNumber, 10);
  const events = db.select().from(schema.simulationEvents).all() as unknown as SimulationEvent[];
  const dayEvents = events.filter(e => e.dayNumber === dayNumber);
  res.json(dayEvents);
});

// GET /api/simulation/events
app.get("/api/simulation/events", (req, res) => {
  const db = getDb();
  const limit = Math.min(parseInt(req.query.limit as string || "50", 10), 200);
  const offset = parseInt(req.query.offset as string || "0", 10);
  let events = db.select().from(schema.simulationEvents).all() as unknown as SimulationEvent[];

  // Filter by type (comma-separated)
  const typeFilter = req.query.type as string | undefined;
  if (typeFilter) {
    const types = typeFilter.split(",").map(t => t.trim());
    events = events.filter(e => types.includes(e.type));
  }

  // Filter by actor
  const actorFilter = req.query.actor as string | undefined;
  if (actorFilter) {
    events = events.filter(e => e.actor === actorFilter);
  }

  // Sort by day descending, then return slice
  events.sort((a, b) => b.dayNumber - a.dayNumber);
  const page = events.slice(offset, offset + limit);
  res.json({ events: page, total: events.length });
});

// GET /api/elections
app.get("/api/elections", (req, res) => {
  const db = getDb();
  const allRows = db.select().from(schema.elections).all();
  const status = req.query.status as string | undefined;
  const rows = status ? allRows.filter((e: any) => e.status === status) : allRows;
  const elections: Election[] = rows.map(mapElection);
  res.json(elections);
});

// GET /api/elections/active
app.get("/api/elections/active", (_req, res) => {
  const db = getDb();
  const allRows = db.select().from(schema.elections).all();
  const active = allRows.find((e: any) => e.status !== "completed" && e.status !== "invalidated");
  res.json(active ? mapElection(active) : null);
});

// GET /api/elections/:id
app.get("/api/elections/:id", (req, res) => {
  const db = getDb();
  const rows = db.select().from(schema.elections).where(eq(schema.elections.id, req.params.id)).all();
  if (rows.length === 0) {
    res.status(404).json({ error: "Election not found" });
    return;
  }
  res.json(mapElection(rows[0]));
});

// GET /api/crises
app.get("/api/crises", (req, res) => {
  const db = getDb();
  const allRows = db.select().from(schema.crises).all();
  const activeOnly = req.query.active === "true";
  const rows = activeOnly ? allRows.filter((c: any) => !c.resolved) : allRows;
  const crises: Crisis[] = rows.map(mapCrisis);
  res.json(crises);
});

// GET /api/crises/:id
app.get("/api/crises/:id", (req, res) => {
  const db = getDb();
  const rows = db.select().from(schema.crises).where(eq(schema.crises.id, req.params.id)).all();
  if (rows.length === 0) {
    res.status(404).json({ error: "Crisis not found" });
    return;
  }
  res.json(mapCrisis(rows[0]));
});

// GET /api/fraktionen
app.get("/api/fraktionen", (req, res) => {
  const db = getDb();
  const allRows = db.select().from(schema.fraktionen).all();
  const statusFilter = req.query.status as string | undefined;
  const rows = statusFilter ? allRows.filter((f: any) => f.status === statusFilter) : allRows;
  const fraktionen: Fraktion[] = rows.map(mapFraktionRow);
  res.json(fraktionen);
});

// GET /api/fraktionen/:id
app.get("/api/fraktionen/:id", (req, res) => {
  const db = getDb();
  const rows = db.select().from(schema.fraktionen).where(eq(schema.fraktionen.id, req.params.id)).all();
  if (rows.length === 0) {
    res.status(404).json({ error: "Fraktion not found" });
    return;
  }
  res.json(mapFraktionRow(rows[0]));
});

// GET /api/motions
app.get("/api/motions", (req, res) => {
  const db = getDb();
  const allRows = db.select().from(schema.motions).all();
  const statusFilter = req.query.status as string | undefined;
  const typeFilter = req.query.type as string | undefined;
  let rows = allRows;
  if (statusFilter) rows = rows.filter((m: any) => m.status === statusFilter);
  if (typeFilter) rows = rows.filter((m: any) => m.type === typeFilter);
  const motions: Motion[] = rows.map(mapMotionRow);
  motions.sort((a, b) => b.dayNumber - a.dayNumber);
  res.json(motions);
});

// GET /api/motions/:id
app.get("/api/motions/:id", (req, res) => {
  const db = getDb();
  const rows = db.select().from(schema.motions).where(eq(schema.motions.id, req.params.id)).all();
  if (rows.length === 0) {
    res.status(404).json({ error: "Motion not found" });
    return;
  }
  res.json(mapMotionRow(rows[0]));
});

// GET /api/interpellations
app.get("/api/interpellations", (req, res) => {
  const db = getDb();
  const allRows = db.select().from(schema.interpellations).all();
  const statusFilter = req.query.status as string | undefined;
  const partyFilter = req.query.partyId as string | undefined;
  const ministryFilter = req.query.targetMinistry as string | undefined;
  let rows = allRows;
  if (statusFilter) rows = rows.filter((i: any) => i.status === statusFilter);
  if (partyFilter) rows = rows.filter((i: any) => i.filedByPartyId === partyFilter);
  if (ministryFilter) rows = rows.filter((i: any) => i.targetMinistry === ministryFilter);
  const interpellations: Interpellation[] = rows.map(mapInterpellationRow);
  interpellations.sort((a, b) => b.dayNumber - a.dayNumber);
  res.json(interpellations);
});

// GET /api/interpellations/:id
app.get("/api/interpellations/:id", (req, res) => {
  const db = getDb();
  const rows = db.select().from(schema.interpellations).where(eq(schema.interpellations.id, req.params.id)).all();
  if (rows.length === 0) {
    res.status(404).json({ error: "Interpellation not found" });
    return;
  }
  res.json(mapInterpellationRow(rows[0]));
});

// GET /api/confidence-votes
app.get("/api/confidence-votes", (req, res) => {
  const db = getDb();
  const allRows = db.select().from(schema.confidenceVotes).all();
  const statusFilter = req.query.status as string | undefined;
  const typeFilter = req.query.type as string | undefined;
  let rows = allRows;
  if (statusFilter) rows = rows.filter((v: any) => v.status === statusFilter);
  if (typeFilter) rows = rows.filter((v: any) => v.type === typeFilter);
  const votes: ConfidenceVote[] = rows.map(mapConfidenceVoteRow);
  votes.sort((a, b) => b.dayNumber - a.dayNumber);
  res.json(votes);
});

// GET /api/confidence-votes/:id
app.get("/api/confidence-votes/:id", (req, res) => {
  const db = getDb();
  const rows = db.select().from(schema.confidenceVotes).where(eq(schema.confidenceVotes.id, req.params.id)).all();
  if (rows.length === 0) {
    res.status(404).json({ error: "Confidence vote not found" });
    return;
  }
  res.json(mapConfidenceVoteRow(rows[0]));
});

// GET /api/polls
app.get("/api/polls", (req, res) => {
  const db = getDb();
  const allRows = db.select().from(schema.polls).all();
  const activeOnly = req.query.active === "true";
  const rows = activeOnly ? allRows.filter((p: any) => p.active) : allRows;
  const polls: Poll[] = rows.map(mapPoll);
  polls.sort((a, b) => b.createdOnDay - a.createdOnDay);
  res.json(polls);
});

// GET /api/polls/:id
app.get("/api/polls/:id", (req, res) => {
  const db = getDb();
  const rows = db.select().from(schema.polls).where(eq(schema.polls.id, req.params.id)).all();
  if (rows.length === 0) {
    res.status(404).json({ error: "Poll not found" });
    return;
  }
  res.json(mapPoll(rows[0]));
});

// POST /api/polls/:id/vote
app.post("/api/polls/:id/vote", (req, res) => {
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

  const votes = { ...poll.votes };
  votes[option] = (votes[option] || 0) + 1;

  db.update(schema.polls)
    .set({ votes: votes as any })
    .where(eq(schema.polls.id, poll.id))
    .run();

  res.json({ ...poll, votes });
});

// GET /api/media
app.get("/api/media", (req, res) => {
  const db = getDb();
  const allRows = db.select().from(schema.mediaArticles).all();
  const dayFilter = req.query.day as string | undefined;
  const rows = dayFilter ? allRows.filter((a: any) => a.dayNumber === parseInt(dayFilter, 10)) : allRows;
  const articles: MediaArticle[] = rows.map(mapMediaArticle);
  articles.sort((a, b) => b.dayNumber - a.dayNumber);
  res.json(articles);
});

// GET /api/media/:id
app.get("/api/media/:id", (req, res) => {
  const db = getDb();
  const rows = db.select().from(schema.mediaArticles).where(eq(schema.mediaArticles.id, req.params.id)).all();
  if (rows.length === 0) {
    res.status(404).json({ error: "Article not found" });
    return;
  }
  res.json(mapMediaArticle(rows[0]));
});

// GET /api/questions
app.get("/api/questions", (req, res) => {
  const db = getDb();
  const allRows = db.select().from(schema.citizenQuestions).all();
  const partyFilter = req.query.partyId as string | undefined;
  const statusFilter = req.query.status as string | undefined;
  let rows = allRows;
  if (partyFilter) rows = rows.filter((q: any) => q.targetPartyId === partyFilter);
  if (statusFilter) rows = rows.filter((q: any) => q.status === statusFilter);
  const questions: CitizenQuestion[] = rows.map(mapQuestion);
  questions.sort((a, b) => b.createdOnDay - a.createdOnDay);
  res.json(questions);
});

// GET /api/questions/:id
app.get("/api/questions/:id", (req, res) => {
  const db = getDb();
  const rows = db.select().from(schema.citizenQuestions).where(eq(schema.citizenQuestions.id, req.params.id)).all();
  if (rows.length === 0) {
    res.status(404).json({ error: "Question not found" });
    return;
  }
  res.json(mapQuestion(rows[0]));
});

// POST /api/questions
app.post("/api/questions", (req, res) => {
  const db = getDb();
  const { question, targetPartyId } = req.body;

  if (!question || typeof question !== "string" || question.trim().length < 5) {
    res.status(400).json({ error: "Question must be at least 5 characters" });
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

  // Rate limit: max 5 pending questions total
  const pendingCount = db.select().from(schema.citizenQuestions).all()
    .filter((q: any) => q.status === "pending").length;
  if (pendingCount >= 5) {
    res.status(429).json({ error: "Too many pending questions. Please wait for some to be answered." });
    return;
  }

  // Get current day
  const metaRows = db.select().from(schema.simulationMeta).all();
  const currentDay = metaRows[0]?.currentDay ?? 0;

  const id = `q-${Math.random().toString(36).substring(2, 10)}${Date.now().toString(36)}`;
  db.insert(schema.citizenQuestions).values({
    id,
    question: question.trim().substring(0, 500),
    targetPartyId,
    response: null,
    respondedOnDay: null,
    createdOnDay: currentDay,
    status: "pending",
  }).run();

  res.status(201).json(mapQuestion(
    db.select().from(schema.citizenQuestions).where(eq(schema.citizenQuestions.id, id)).all()[0],
  ));
});

// GET /api/referendums
app.get("/api/referendums", (req, res) => {
  const db = getDb();
  const allRows = db.select().from(schema.referendums).all();
  const statusFilter = req.query.status as string | undefined;
  const rows = statusFilter ? allRows.filter((r: any) => r.status === statusFilter) : allRows;
  const referendums: Referendum[] = rows.map(mapReferendum);
  referendums.sort((a, b) => b.createdOnDay - a.createdOnDay);
  res.json(referendums);
});

// GET /api/referendums/:id
app.get("/api/referendums/:id", (req, res) => {
  const db = getDb();
  const rows = db.select().from(schema.referendums).where(eq(schema.referendums.id, req.params.id)).all();
  if (rows.length === 0) {
    res.status(404).json({ error: "Referendum not found" });
    return;
  }
  res.json(mapReferendum(rows[0]));
});

// POST /api/referendums/:id/vote
app.post("/api/referendums/:id/vote", (req, res) => {
  const db = getDb();
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

  const votes = { ...referendum.votes };
  votes[option] = (votes[option] || 0) + 1;

  db.update(schema.referendums)
    .set({ votes: votes as any })
    .where(eq(schema.referendums.id, referendum.id))
    .run();

  res.json({ ...referendum, votes });
});

// GET /api/government
app.get("/api/government", (_req, res) => {
  const gov = getActiveGovernment();
  res.json(gov);
});

// GET /api/government/history
app.get("/api/government/history", (_req, res) => {
  const db = getDb();
  const rows = db.select().from(schema.government).all();
  const govs: Government[] = rows.map(mapGovernmentRow);
  govs.sort((a, b) => b.formedOnDay - a.formedOnDay);
  res.json(govs);
});

// GET /api/constitutional-court
app.get("/api/constitutional-court", (req, res) => {
  const db = getDb();
  const allRows = db.select().from(schema.constitutionalChallenges).all();
  const statusFilter = req.query.status as string | undefined;
  const billIdFilter = req.query.billId as string | undefined;
  let rows = allRows;
  if (statusFilter) rows = rows.filter((c: any) => c.status === statusFilter);
  if (billIdFilter) rows = rows.filter((c: any) => c.billId === billIdFilter);
  const challenges: ConstitutionalChallenge[] = rows.map(mapConstitutionalChallengeRow);
  challenges.sort((a, b) => b.dayNumber - a.dayNumber);
  res.json(challenges);
});

// GET /api/constitutional-court/:id
app.get("/api/constitutional-court/:id", (req, res) => {
  const db = getDb();
  const rows = db.select().from(schema.constitutionalChallenges)
    .where(eq(schema.constitutionalChallenges.id, req.params.id)).all();
  if (rows.length === 0) {
    res.status(404).json({ error: "Constitutional challenge not found" });
    return;
  }
  res.json(mapConstitutionalChallengeRow(rows[0]));
});

// GET /api/crisis-templates
app.get("/api/crisis-templates", (_req, res) => {
  const templates = getCrisisTemplates();
  res.json(templates.map(t => ({ id: t.id, name: t.name, severity: t.severity, category: t.category })));
});

// POST /api/simulate/inject
app.post("/api/simulate/inject", (req, res) => {
  const db = getDb();
  const { type, data } = req.body;

  if (!type || !["crisis", "election", "economic_shock", "invalidate_election"].includes(type)) {
    res.status(400).json({ error: "Invalid type. Must be: crisis, election, economic_shock, or invalidate_election" });
    return;
  }

  if (type === "crisis") {
    const templateId = data?.templateId;
    if (!templateId || typeof templateId !== "string") {
      res.status(400).json({ error: "crisis injection requires data.templateId" });
      return;
    }
    const templates = getCrisisTemplates();
    if (!templates.some(t => t.id === templateId)) {
      res.status(400).json({ error: "Unknown crisis template ID" });
      return;
    }
  }

  if (type === "economic_shock") {
    const impact = data?.impact;
    if (!impact || typeof impact !== "object") {
      res.status(400).json({ error: "economic_shock injection requires data.impact" });
      return;
    }
  }

  const id = `inj-${Math.random().toString(36).substring(2, 10)}${Date.now().toString(36)}`;
  db.insert(schema.pendingInjections).values({
    id,
    type,
    data: (data || {}) as any,
    consumed: false,
  }).run();

  res.status(201).json({ id, type, data: data || {}, consumed: false });
});

// GET /api/simulate/injections
app.get("/api/simulate/injections", (_req, res) => {
  const db = getDb();
  const rows = db.select().from(schema.pendingInjections).all();
  res.json(rows.map(r => ({
    id: r.id,
    type: r.type,
    data: r.data,
    consumed: r.consumed,
  })));
});

function mapConstitutionalChallengeRow(row: typeof schema.constitutionalChallenges.$inferSelect): ConstitutionalChallenge {
  return {
    id: row.id,
    billId: row.billId,
    billTitle: row.billTitle,
    filedByPartyId: row.filedByPartyId,
    arguments: row.arguments,
    decision: row.decision as ConstitutionalChallenge["decision"],
    reasoning: row.reasoning ?? null,
    status: row.status as ConstitutionalChallenge["status"],
    dayNumber: row.dayNumber,
    ruledOnDay: row.ruledOnDay ?? null,
    sentimentImpact: row.sentimentImpact ?? null,
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

function mapQuestion(row: typeof schema.citizenQuestions.$inferSelect): CitizenQuestion {
  return {
    id: row.id,
    question: row.question,
    targetPartyId: row.targetPartyId,
    response: row.response,
    respondedOnDay: row.respondedOnDay,
    createdOnDay: row.createdOnDay,
    status: row.status as CitizenQuestion["status"],
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

function mapParty(row: typeof schema.parties.$inferSelect, memberCount = 0): Party {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    ideology: row.ideology,
    seatCount: row.seatCount,
    approvalRating: row.approvalRating,
    policyPriorities: row.policyPriorities as unknown as PolicyPriorities,
    coalitionRole: row.coalitionRole as Party["coalitionRole"],
    memberCount,
  };
}

function getMemberCounts(db: ReturnType<typeof getDb>): Map<string, number> {
  const rows = db
    .select({ partyId: schema.users.partyId, cnt: count() })
    .from(schema.users)
    .where(sql`${schema.users.partyId} IS NOT NULL`)
    .groupBy(schema.users.partyId)
    .all();
  const map = new Map<string, number>();
  for (const r of rows) if (r.partyId) map.set(r.partyId, r.cnt);
  return map;
}

function mapBill(row: typeof schema.bills.$inferSelect): Bill {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category as Bill["category"],
    proposedBy: row.proposedBy,
    status: row.status as Bill["status"],
    impact: row.impact as unknown as BillImpact,
    votes: row.votes as unknown as BillVote[],
    proposedOnDay: row.proposedOnDay,
    reading: row.reading ?? undefined,
    committeeName: row.committeeName ?? undefined,
    committeeRecommendation: row.committeeRecommendation as Bill["committeeRecommendation"] ?? undefined,
    amendments: row.amendments as unknown as Bill["amendments"] ?? undefined,
    originalImpact: row.originalImpact as unknown as BillImpact ?? undefined,
    statusChangedOnDay: row.statusChangedOnDay ?? undefined,
    isGovernmentBill: row.isGovernmentBill ?? undefined,
    vetoedByPresident: row.vetoedByPresident ?? undefined,
    memberInitiative: row.memberInitiative ?? undefined,
    proposerDisplayName: row.proposerDisplayName ?? undefined,
  };
}

function mapElection(row: typeof schema.elections.$inferSelect): Election {
  return {
    id: row.id,
    triggerReason: row.triggerReason,
    announcedOnDay: row.announcedOnDay,
    campaignStartDay: row.campaignStartDay,
    electionDay: row.electionDay,
    status: row.status as Election["status"],
    results: row.results as unknown as ElectionResult[] | null,
    newCoalition: row.newCoalition as unknown as string[] | null,
    newOpposition: row.newOpposition as unknown as string[] | null,
    negotiationRounds: row.negotiationRounds as unknown as NegotiationRound[][] | null,
    coalitionAgreement: row.coalitionAgreement as unknown as CoalitionAgreement | null,
  };
}

function mapCrisis(row: typeof schema.crises.$inferSelect): Crisis {
  return {
    id: row.id,
    templateId: row.templateId,
    name: row.name,
    description: row.description,
    category: row.category as Crisis["category"],
    severity: row.severity as Crisis["severity"],
    startDay: row.startDay,
    endDay: row.endDay,
    dailyImpact: row.dailyImpact as unknown as BillImpact,
    resolved: row.resolved,
  };
}

function mapMotionRow(row: typeof schema.motions.$inferSelect): Motion {
  return {
    id: row.id,
    type: row.type as Motion["type"],
    title: row.title,
    description: row.description,
    proposedBy: row.proposedBy,
    status: row.status as Motion["status"],
    votes: row.votes as unknown as import("@ki-bundestag/types").BillVote[],
    dayNumber: row.dayNumber,
    sentimentImpact: row.sentimentImpact ?? undefined,
  };
}

function mapInterpellationRow(row: typeof schema.interpellations.$inferSelect): Interpellation {
  return {
    id: row.id,
    type: row.type as Interpellation["type"],
    title: row.title,
    question: row.question,
    filedByPartyId: row.filedByPartyId,
    targetMinistry: row.targetMinistry as Interpellation["targetMinistry"],
    targetMinisterName: row.targetMinisterName,
    targetPartyId: row.targetPartyId,
    response: row.response ?? null,
    status: row.status as Interpellation["status"],
    dayNumber: row.dayNumber,
    respondedOnDay: row.respondedOnDay ?? null,
    sentimentImpact: row.sentimentImpact ?? null,
  };
}

function mapConfidenceVoteRow(row: typeof schema.confidenceVotes.$inferSelect): ConfidenceVote {
  return {
    id: row.id,
    type: row.type as ConfidenceVote["type"],
    governmentId: row.governmentId,
    initiatedByPartyId: row.initiatedByPartyId,
    chancellorName: row.chancellorName,
    proposedChancellor: row.proposedChancellor ?? null,
    proposedChancellorPartyId: row.proposedChancellorPartyId ?? null,
    title: row.title,
    description: row.description,
    status: row.status as ConfidenceVote["status"],
    votes: row.votes as unknown as import("@ki-bundestag/types").BillVote[],
    dayNumber: row.dayNumber,
    sentimentImpact: row.sentimentImpact ?? null,
  };
}

function mapFraktionRow(row: typeof schema.fraktionen.$inferSelect): Fraktion {
  return {
    id: row.id,
    partyId: row.partyId,
    leaderName: row.leaderName,
    status: row.status as Fraktion["status"],
    formedOnDay: row.formedOnDay,
    dissolvedOnDay: row.dissolvedOnDay,
  };
}

function mapGovernmentRow(row: typeof schema.government.$inferSelect): Government {
  return {
    id: row.id,
    electionId: row.electionId,
    chancellorName: row.chancellorName,
    chancellorPartyId: row.chancellorPartyId,
    ministers: row.ministers as unknown as Minister[],
    formedOnDay: row.formedOnDay,
    dissolvedOnDay: row.dissolvedOnDay,
    active: row.active,
  };
}

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

function mapBudgetRow(row: typeof schema.budgets.$inferSelect): Budget {
  return {
    id: row.id,
    cycleNumber: row.cycleNumber,
    status: row.status as Budget["status"],
    allocations: row.allocations as unknown as BudgetAllocations,
    totalAmount: row.totalAmount,
    proposedOnDay: row.proposedOnDay,
    votedOnDay: row.votedOnDay ?? null,
    votes: (row.votes as unknown as BudgetVote[]) ?? [],
    yesSeats: row.yesSeats ?? null,
    noSeats: row.noSeats ?? null,
    economicEffect: row.economicEffect as unknown as Record<string, number> | null,
    revisionAttempt: (row as any).revisionAttempt ?? 0,
  };
}

// GET /api/budgets(?status=)
app.get("/api/budgets", (req, res) => {
  const db = getDb();
  const allRows = db.select().from(schema.budgets).all();
  const statusFilter = req.query.status as string | undefined;
  let rows = allRows;
  if (statusFilter) rows = rows.filter((r: any) => r.status === statusFilter);
  const budgets: Budget[] = rows.map(mapBudgetRow);
  budgets.sort((a, b) => b.proposedOnDay - a.proposedOnDay);
  res.json(budgets);
});

// GET /api/budgets/:id
app.get("/api/budgets/:id", (req, res) => {
  const db = getDb();
  const rows = db.select().from(schema.budgets)
    .where(eq(schema.budgets.id, req.params.id)).all();
  if (rows.length === 0) {
    res.status(404).json({ error: "Budget not found" });
    return;
  }
  res.json(mapBudgetRow(rows[0]));
});

// ── Internal Proposals endpoints ─────────────────────────────────────────────

function mapProposal(row: typeof schema.internalProposals.$inferSelect, userVote?: 1 | -1 | null) {
  return {
    id: row.id,
    partyId: row.partyId,
    proposedBy: row.proposedBy,
    proposerName: row.proposerName,
    title: row.title,
    description: row.description,
    category: row.category,
    rationale: row.rationale,
    status: row.status,
    voteScore: row.voteScore,
    totalVotes: row.totalVotes,
    createdOnDay: row.createdOnDay,
    reviewByDay: row.reviewByDay,
    reviewedOnDay: row.reviewedOnDay,
    declineReason: row.declineReason,
    bundestagBillId: row.bundestag_bill_id,
    userVote: userVote ?? null,
  };
}

// GET /api/parties/:id/proposals
app.get("/api/parties/:id/proposals", (req, res) => {
  const db = getDb();
  const token = getUserToken(req);
  const statusFilter = req.query.status as string | undefined;
  let rows = db.select().from(schema.internalProposals)
    .where(eq(schema.internalProposals.partyId, req.params.id))
    .all();
  if (statusFilter) rows = rows.filter(r => r.status === statusFilter);
  rows.sort((a, b) => b.voteScore - a.voteScore || b.createdOnDay - a.createdOnDay);

  // Include userVote if authenticated
  let userVoteMap: Record<string, 1 | -1> = {};
  if (token) {
    const proposalIds = rows.map(r => r.id);
    if (proposalIds.length > 0) {
      const votes = db.select().from(schema.internalVotes)
        .where(and(eq(schema.internalVotes.userId, token), inArray(schema.internalVotes.proposalId, proposalIds)))
        .all();
      for (const v of votes) userVoteMap[v.proposalId] = v.vote as 1 | -1;
    }
  }
  res.json(rows.map(r => mapProposal(r, userVoteMap[r.id] ?? null)));
});

// POST /api/parties/:id/proposals
app.post("/api/parties/:id/proposals", (req, res) => {
  const token = getUserToken(req);
  if (!token) { res.status(401).json({ error: "Not authenticated" }); return; }
  const db = getDb();
  const users = db.select().from(schema.users).where(eq(schema.users.id, token)).all();
  if (users.length === 0) { res.status(401).json({ error: "User not found" }); return; }
  const user = users[0];
  if (user.partyId !== req.params.id) { res.status(403).json({ error: "Not a member of this party" }); return; }

  const { title, description, category, rationale } = req.body as Record<string, string>;
  if (!title?.trim() || title.trim().length > 80) { res.status(400).json({ error: "Title required (max 80 chars)" }); return; }
  if (!description?.trim() || description.trim().length > 500) { res.status(400).json({ error: "Description required (max 500 chars)" }); return; }
  if (!category) { res.status(400).json({ error: "Category required" }); return; }

  // Check: one active proposal per member
  const existing = db.select().from(schema.internalProposals)
    .where(and(eq(schema.internalProposals.proposedBy, token), eq(schema.internalProposals.partyId, req.params.id)))
    .all()
    .filter(r => r.status === "open" || r.status === "reviewing");
  if (existing.length > 0) { res.status(400).json({ error: "You already have an active proposal" }); return; }

  // Check: max 5 open proposals per party
  const openCount = db.select().from(schema.internalProposals)
    .where(and(eq(schema.internalProposals.partyId, req.params.id), eq(schema.internalProposals.status, "open")))
    .all().length;
  if (openCount >= 5) { res.status(400).json({ error: "Party already has 5 open proposals" }); return; }

  const metaRow = db.select({ day: schema.simulationMeta.currentDay }).from(schema.simulationMeta).limit(1).all()[0];
  const currentDay = metaRow?.day ?? 0;

  const id = `iprop-${randomUUID().slice(0, 8)}`;
  db.insert(schema.internalProposals).values({
    id,
    partyId: req.params.id,
    proposedBy: token,
    proposerName: user.displayName,
    title: title.trim(),
    description: description.trim(),
    category,
    rationale: rationale?.trim() || null,
    status: "open",
    voteScore: 0,
    totalVotes: 0,
    createdOnDay: currentDay,
    reviewByDay: currentDay + 5,
  }).run();

  db.update(schema.users).set({ lastActive: Date.now() }).where(eq(schema.users.id, token)).run();
  const row = db.select().from(schema.internalProposals).where(eq(schema.internalProposals.id, id)).all()[0];
  res.status(201).json(mapProposal(row));
});

// GET /api/proposals/:id
app.get("/api/proposals/:id", (req, res) => {
  const db = getDb();
  const token = getUserToken(req);
  const rows = db.select().from(schema.internalProposals).where(eq(schema.internalProposals.id, req.params.id)).all();
  if (rows.length === 0) { res.status(404).json({ error: "Proposal not found" }); return; }
  let userVote: 1 | -1 | null = null;
  if (token) {
    const vr = db.select().from(schema.internalVotes)
      .where(and(eq(schema.internalVotes.proposalId, req.params.id), eq(schema.internalVotes.userId, token)))
      .all();
    if (vr.length > 0) userVote = vr[0].vote as 1 | -1;
  }
  res.json(mapProposal(rows[0], userVote));
});

// POST /api/proposals/:id/vote (auth)
app.post("/api/proposals/:id/vote", (req, res) => {
  const token = getUserToken(req);
  if (!token) { res.status(401).json({ error: "Not authenticated" }); return; }
  const db = getDb();
  const users = db.select().from(schema.users).where(eq(schema.users.id, token)).all();
  if (users.length === 0) { res.status(401).json({ error: "User not found" }); return; }
  const proposal = db.select().from(schema.internalProposals).where(eq(schema.internalProposals.id, req.params.id)).all()[0];
  if (!proposal) { res.status(404).json({ error: "Proposal not found" }); return; }
  if (proposal.status !== "open") { res.status(400).json({ error: "Proposal is not open for voting" }); return; }

  const { vote } = req.body as { vote?: number };
  if (vote !== 1 && vote !== -1) { res.status(400).json({ error: "vote must be 1 or -1" }); return; }

  const existing = db.select().from(schema.internalVotes)
    .where(and(eq(schema.internalVotes.proposalId, req.params.id), eq(schema.internalVotes.userId, token)))
    .all();

  if (existing.length > 0) {
    const oldVote = existing[0].vote;
    if (oldVote === vote) { res.json(mapProposal(proposal, vote as 1 | -1)); return; } // no change
    // Update existing vote: adjust score by (new - old)
    db.update(schema.internalVotes).set({ vote, createdAt: Date.now() }).where(eq(schema.internalVotes.id, existing[0].id)).run();
    db.update(schema.internalProposals).set({
      voteScore: proposal.voteScore - oldVote + vote,
    }).where(eq(schema.internalProposals.id, req.params.id)).run();
  } else {
    const voteId = `ivote-${randomUUID().slice(0, 8)}`;
    db.insert(schema.internalVotes).values({ id: voteId, proposalId: req.params.id, userId: token, vote, createdAt: Date.now() }).run();
    db.update(schema.internalProposals).set({
      voteScore: proposal.voteScore + vote,
      totalVotes: proposal.totalVotes + 1,
    }).where(eq(schema.internalProposals.id, req.params.id)).run();
  }

  db.update(schema.users).set({ lastActive: Date.now() }).where(eq(schema.users.id, token)).run();
  const updated = db.select().from(schema.internalProposals).where(eq(schema.internalProposals.id, req.params.id)).all()[0];
  res.json(mapProposal(updated, vote as 1 | -1));
});

// DELETE /api/proposals/:id/vote (auth)
app.delete("/api/proposals/:id/vote", (req, res) => {
  const token = getUserToken(req);
  if (!token) { res.status(401).json({ error: "Not authenticated" }); return; }
  const db = getDb();
  const proposal = db.select().from(schema.internalProposals).where(eq(schema.internalProposals.id, req.params.id)).all()[0];
  if (!proposal) { res.status(404).json({ error: "Proposal not found" }); return; }

  const existing = db.select().from(schema.internalVotes)
    .where(and(eq(schema.internalVotes.proposalId, req.params.id), eq(schema.internalVotes.userId, token)))
    .all();
  if (existing.length === 0) { res.json(mapProposal(proposal, null)); return; }

  const oldVote = existing[0].vote;
  db.delete(schema.internalVotes).where(eq(schema.internalVotes.id, existing[0].id)).run();
  db.update(schema.internalProposals).set({
    voteScore: proposal.voteScore - oldVote,
    totalVotes: Math.max(0, proposal.totalVotes - 1),
  }).where(eq(schema.internalProposals.id, req.params.id)).run();

  const updated = db.select().from(schema.internalProposals).where(eq(schema.internalProposals.id, req.params.id)).all()[0];
  res.json(mapProposal(updated, null));
});

// ── User / Membership endpoints ──────────────────────────────────────────────

function getUserToken(req: express.Request): string | null {
  const h = req.headers["x-user-token"];
  return typeof h === "string" && h.length > 0 ? h : null;
}

// POST /api/users/login
app.post("/api/users/login", (req, res) => {
  const { displayName } = req.body as { displayName?: string };
  if (!displayName || displayName.trim().length < 2) {
    res.status(400).json({ error: "displayName must be at least 2 characters" });
    return;
  }
  const db = getDb();
  const rows = db.select().from(schema.users).where(eq(schema.users.displayName, displayName.trim())).all();
  if (rows.length === 0) { res.status(404).json({ error: "User not found" }); return; }
  const u = rows[0];
  db.update(schema.users).set({ lastActive: Date.now() }).where(eq(schema.users.id, u.id)).run();
  res.json({ id: u.id, displayName: u.displayName, partyId: u.partyId, createdAt: u.createdAt, lastActive: Date.now(), switchCooldownUntil: u.switchCooldownUntil });
});

// POST /api/users/register
app.post("/api/users/register", (req, res) => {
  const { displayName, partyId } = req.body as { displayName?: string; partyId?: string };
  if (!displayName || displayName.trim().length < 2 || displayName.trim().length > 30) {
    res.status(400).json({ error: "displayName must be 2–30 characters" });
    return;
  }
  const db = getDb();
  if (partyId) {
    const party = db.select().from(schema.parties).where(eq(schema.parties.id, partyId)).all();
    if (party.length === 0) { res.status(400).json({ error: "Party not found" }); return; }
  }
  const id: string = randomUUID();
  const now = Date.now();
  try {
    db.insert(schema.users).values({
      id,
      displayName: displayName.trim(),
      partyId: partyId ?? null,
      createdAt: now,
      lastActive: now,
      switchCooldownUntil: null,
    }).run();
  } catch (err: any) {
    if (err.message?.includes("UNIQUE constraint failed")) {
      res.status(409).json({ error: "Nickname already taken" });
      return;
    }
    throw err;
  }
  res.json({ id, displayName: displayName.trim(), partyId: partyId ?? null, createdAt: now, lastActive: now, switchCooldownUntil: null });
});

// GET /api/users/me
app.get("/api/users/me", (req, res) => {
  const token = getUserToken(req);
  if (!token) { res.status(401).json({ error: "Missing X-User-Token header" }); return; }
  const db = getDb();
  const rows = db.select().from(schema.users).where(eq(schema.users.id, token)).all();
  if (rows.length === 0) { res.status(404).json({ error: "User not found" }); return; }
  const u = rows[0];
  res.json({ id: u.id, displayName: u.displayName, partyId: u.partyId, createdAt: u.createdAt, lastActive: u.lastActive, switchCooldownUntil: u.switchCooldownUntil });
});

// POST /api/users/me/join/:partyId
app.post("/api/users/me/join/:partyId", (req, res) => {
  const token = getUserToken(req);
  if (!token) { res.status(401).json({ error: "Missing X-User-Token header" }); return; }
  const db = getDb();
  const rows = db.select().from(schema.users).where(eq(schema.users.id, token)).all();
  if (rows.length === 0) { res.status(404).json({ error: "User not found" }); return; }
  const user = rows[0];

  const metaRow = db.select({ day: schema.simulationMeta.currentDay }).from(schema.simulationMeta).limit(1).all()[0];
  const currentDay = metaRow?.day ?? 0;

  if (user.switchCooldownUntil != null && currentDay < user.switchCooldownUntil) {
    res.status(403).json({ error: `Cooldown active until Day ${user.switchCooldownUntil}` });
    return;
  }
  const party = db.select().from(schema.parties).where(eq(schema.parties.id, req.params.partyId)).all();
  if (party.length === 0) { res.status(404).json({ error: "Party not found" }); return; }

  const cooldown = user.partyId != null ? currentDay + 7 : null;
  db.update(schema.users)
    .set({ partyId: req.params.partyId, lastActive: Date.now(), switchCooldownUntil: cooldown })
    .where(eq(schema.users.id, token))
    .run();
  const updated = db.select().from(schema.users).where(eq(schema.users.id, token)).all()[0];
  res.json({ id: updated.id, displayName: updated.displayName, partyId: updated.partyId, createdAt: updated.createdAt, lastActive: updated.lastActive, switchCooldownUntil: updated.switchCooldownUntil });
});

// POST /api/users/me/leave
app.post("/api/users/me/leave", (req, res) => {
  const token = getUserToken(req);
  if (!token) { res.status(401).json({ error: "Missing X-User-Token header" }); return; }
  const db = getDb();
  const rows = db.select().from(schema.users).where(eq(schema.users.id, token)).all();
  if (rows.length === 0) { res.status(404).json({ error: "User not found" }); return; }
  const metaRow = db.select({ day: schema.simulationMeta.currentDay }).from(schema.simulationMeta).limit(1).all()[0];
  const currentDay = metaRow?.day ?? 0;
  db.update(schema.users)
    .set({ partyId: null, lastActive: Date.now(), switchCooldownUntil: currentDay + 7 })
    .where(eq(schema.users.id, token))
    .run();
  const updated = db.select().from(schema.users).where(eq(schema.users.id, token)).all()[0];
  res.json({ id: updated.id, displayName: updated.displayName, partyId: updated.partyId, createdAt: updated.createdAt, lastActive: updated.lastActive, switchCooldownUntil: updated.switchCooldownUntil });
});

const server = app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`);
});

process.on("SIGINT", () => {
  server.close();
  closeDb();
  process.exit(0);
});
