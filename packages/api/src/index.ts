import "dotenv/config";
import express from "express";
import cors from "cors";
import { getDb, schema, closeDb, getCrisisTemplates, getActiveFraktionen, getActiveGovernment } from "@ki-bundestag/engine";
import { eq, desc, gte, asc, and, inArray } from "drizzle-orm";
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

  const parties = rows.map(r => ({ ...mapParty(r), recentApprovals: histByParty.get(r.id) ?? [] }));
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
  res.json(mapParty(rows[0]));
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

function mapParty(row: typeof schema.parties.$inferSelect): Party {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    ideology: row.ideology,
    seatCount: row.seatCount,
    approvalRating: row.approvalRating,
    policyPriorities: row.policyPriorities as unknown as PolicyPriorities,
    coalitionRole: row.coalitionRole as Party["coalitionRole"],
  };
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

const server = app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`);
});

process.on("SIGINT", () => {
  server.close();
  closeDb();
  process.exit(0);
});
