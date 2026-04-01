import { Router } from "express";
import { getDb, schema, calculateAllMatches } from "@ki-bundestag/engine";
import type { QuizAnswer } from "@ki-bundestag/engine";
import { eq } from "drizzle-orm";

const router = Router();

// GET /api/quiz/theses — return all active theses
router.get("/api/quiz/theses", (_req, res) => {
  const db = getDb();
  const rows = db.select({
    id: schema.quizTheses.id,
    text: schema.quizTheses.text,
    category: schema.quizTheses.category,
  }).from(schema.quizTheses).where(eq(schema.quizTheses.active, true)).all();

  res.json(rows);
});

// POST /api/quiz/results — calculate match results
router.post("/api/quiz/results", (req, res) => {
  const { answers } = req.body as { answers?: Record<string, string> };
  if (!answers || typeof answers !== "object" || Object.keys(answers).length === 0) {
    res.status(400).json({ error: "answers object is required" });
    return;
  }

  // Validate answer values
  const validAnswers = ["agree", "disagree", "neutral"];
  for (const val of Object.values(answers)) {
    if (!validAnswers.includes(val)) {
      res.status(400).json({ error: `Invalid answer value: ${val}` });
      return;
    }
  }

  const db = getDb();

  // Load theses for category info
  const theses = db.select({
    id: schema.quizTheses.id,
    category: schema.quizTheses.category,
  }).from(schema.quizTheses).where(eq(schema.quizTheses.active, true)).all();

  const thesisCategories = new Map(theses.map(t => [t.id, t.category]));

  // Load all party positions
  const positions = db.select({
    thesisId: schema.quizPartyPositions.thesisId,
    partyId: schema.quizPartyPositions.partyId,
    position: schema.quizPartyPositions.position,
  }).from(schema.quizPartyPositions).all();

  // Load party info for response
  const parties = db.select({
    id: schema.parties.id,
    name: schema.parties.name,
    color: schema.parties.color,
  }).from(schema.parties).all();

  const partyMap = new Map(parties.map(p => [p.id, p]));

  const results = calculateAllMatches(
    answers as Record<string, QuizAnswer>,
    positions.map(p => ({ ...p, position: p.position as QuizAnswer })),
    thesisCategories,
  );

  const enriched = results.map(r => {
    const party = partyMap.get(r.partyId);
    return {
      partyId: r.partyId,
      partyName: party?.name ?? r.partyId,
      color: party?.color ?? "#888888",
      matchPercent: r.matchPercent,
      categoryBreakdown: r.categoryBreakdown,
      agreements: r.agreements,
      disagreements: r.disagreements,
    };
  });

  res.json({ results: enriched });
});

// GET /api/quiz/party-positions — return all party positions with reasoning
router.get("/api/quiz/party-positions", (_req, res) => {
  const db = getDb();
  const rows = db.select({
    thesisId: schema.quizPartyPositions.thesisId,
    partyId: schema.quizPartyPositions.partyId,
    position: schema.quizPartyPositions.position,
    reasoning: schema.quizPartyPositions.reasoning,
  }).from(schema.quizPartyPositions).all();

  res.json(rows);
});

// GET /api/quiz/lobbying — return lobbying events
router.get("/api/quiz/lobbying", (req, res) => {
  const db = getDb();
  const { partyId, sector } = req.query;

  let query = db.select().from(schema.lobbyingEvents);

  if (partyId && typeof partyId === "string") {
    query = query.where(eq(schema.lobbyingEvents.targetPartyId, partyId)) as typeof query;
  }

  const rows = query.orderBy(schema.lobbyingEvents.dayNumber).all();

  // Filter by sector in JS if needed (drizzle chaining limitation)
  const filtered = sector && typeof sector === "string"
    ? rows.filter(r => r.sector === sector)
    : rows;

  res.json(filtered);
});

// GET /api/quiz/donations — return party donations
router.get("/api/quiz/donations", (req, res) => {
  const db = getDb();
  const { partyId } = req.query;

  let query = db.select().from(schema.partyDonations);

  if (partyId && typeof partyId === "string") {
    query = query.where(eq(schema.partyDonations.partyId, partyId)) as typeof query;
  }

  const rows = query.orderBy(schema.partyDonations.dayNumber).all();

  res.json(rows);
});

// GET /api/quiz/donations/summary — aggregated donation totals per party
router.get("/api/quiz/donations/summary", (_req, res) => {
  const db = getDb();
  const rows = db.select().from(schema.partyDonations).all();

  const parties = db.select({
    id: schema.parties.id,
    name: schema.parties.name,
    color: schema.parties.color,
  }).from(schema.parties).all();

  const partyMap = new Map(parties.map(p => [p.id, p]));

  // Aggregate
  const totals = new Map<string, { total: number; count: number; publicCount: number }>();
  for (const row of rows) {
    if (!totals.has(row.partyId)) totals.set(row.partyId, { total: 0, count: 0, publicCount: 0 });
    const t = totals.get(row.partyId)!;
    t.total += row.amount;
    t.count++;
    if (row.isPublic) t.publicCount++;
  }

  const summary = parties.map(p => {
    const t = totals.get(p.id) ?? { total: 0, count: 0, publicCount: 0 };
    return {
      partyId: p.id,
      partyName: p.name,
      color: p.color,
      totalAmount: Math.round(t.total * 100) / 100,
      donationCount: t.count,
      publicDonationCount: t.publicCount,
    };
  });

  res.json(summary);
});

export default router;
