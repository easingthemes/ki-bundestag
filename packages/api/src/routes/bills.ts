import { Router } from "express";
import { randomUUID } from "crypto";
import { getDb, getUserDb, schema, getSqlite, getUserSeat, logUserAction } from "@ki-bundestag/engine";
import { eq, and } from "drizzle-orm";
import type { Bill } from "@ki-bundestag/types";
import { mapBill } from "../mappers/index.js";
import { getUserToken, requireParticipatory } from "../middleware/index.js";

const router = Router();

// GET /api/bills
router.get("/api/bills", (req, res) => {
  const db = getDb();
  const allRows = db.select().from(schema.bills).all();
  const status = req.query.status as string | undefined;
  const rows = status ? allRows.filter((b: { status: string }) => b.status === status) : allRows;
  const bills: Bill[] = rows.map(mapBill);
  res.json(bills);
});

// GET /api/bills/:id
router.get("/api/bills/:id", (req, res) => {
  const db = getDb();
  const rows = db.select().from(schema.bills).where(eq(schema.bills.id, req.params.id)).all();
  if (rows.length === 0) {
    res.status(404).json({ error: "Bill not found" });
    return;
  }
  res.json(mapBill(rows[0]));
});

// GET /api/bills/:id/signal
router.get("/api/bills/:id/signal", (req, res) => {
  const userDb = getUserDb();
  const token = getUserToken(req);
  const signals = userDb.select().from(schema.memberSignals).where(eq(schema.memberSignals.billId, req.params.id)).all();
  const yes = signals.filter(s => s.signal === "yes").length;
  const no = signals.filter(s => s.signal === "no").length;
  const userSignal = token ? (signals.find(s => s.userId === token)?.signal ?? null) : null;
  res.json({ yes, no, userSignal });
});

// POST /api/bills/:id/signal (auth)
router.post("/api/bills/:id/signal", (req, res) => {
  if (requireParticipatory(req, res, "bill_signals")) return;
  const token = getUserToken(req);
  if (!token) { res.status(401).json({ error: "Not authenticated" }); return; }
  const userDb = getUserDb();
  const users = userDb.select().from(schema.users).where(eq(schema.users.id, token)).all();
  if (users.length === 0) { res.status(401).json({ error: "User not found" }); return; }
  const db = getDb();
  const bill = db.select().from(schema.bills).where(eq(schema.bills.id, req.params.id)).all()[0];
  if (!bill) { res.status(404).json({ error: "Bill not found" }); return; }
  if (!["second_reading", "third_reading"].includes(bill.status)) {
    res.status(400).json({ error: "Bill is not in second or third reading" }); return;
  }

  const { signal } = req.body as { signal?: string };
  if (signal !== "yes" && signal !== "no") { res.status(400).json({ error: "signal must be 'yes' or 'no'" }); return; }

  const existing = userDb.select().from(schema.memberSignals)
    .where(and(eq(schema.memberSignals.billId, req.params.id), eq(schema.memberSignals.userId, token)))
    .all();

  if (existing.length > 0) {
    userDb.update(schema.memberSignals).set({ signal, createdAt: Date.now() }).where(eq(schema.memberSignals.id, existing[0].id)).run();
  } else {
    userDb.insert(schema.memberSignals).values({ id: `sig-${randomUUID().slice(0, 8)}`, billId: req.params.id, userId: token, signal, createdAt: Date.now() }).run();
  }

  userDb.update(schema.users).set({ lastActive: Date.now() }).where(eq(schema.users.id, token)).run();
  try { const md = db.select({ day: schema.simulationMeta.currentDay }).from(schema.simulationMeta).limit(1).all()[0]; logUserAction(token, "signal_bill", md?.day ?? 0, req.params.id, "bill", { signal }); } catch {}
  const allSignals = userDb.select().from(schema.memberSignals).where(eq(schema.memberSignals.billId, req.params.id)).all();
  res.json({ yes: allSignals.filter(s => s.signal === "yes").length, no: allSignals.filter(s => s.signal === "no").length, userSignal: signal });
});

// POST /api/bills/:id/amendment — user proposes an amendment
router.post("/api/bills/:id/amendment", (req, res) => {
  if (requireParticipatory(req, res, "propose_amendments")) return;
  const token = getUserToken(req);
  if (!token) { res.status(401).json({ error: "Missing X-User-Token header" }); return; }

  const seat = getUserSeat(token);
  if (!seat) { res.status(403).json({ error: "You don't have an active Bundestag seat" }); return; }

  const db = getDb();
  const bill = db.select().from(schema.bills).where(eq(schema.bills.id, req.params.id)).all()[0];
  if (!bill) { res.status(404).json({ error: "Bill not found" }); return; }
  if (bill.status !== "second_reading") { res.status(400).json({ error: "Bill is not in second reading" }); return; }

  const { title, description, impactChange } = req.body as {
    title?: string; description?: string; impactChange?: Record<string, number>;
  };
  if (!title || title.trim().length < 5 || title.trim().length > 100) {
    res.status(400).json({ error: "title must be 5–100 characters" }); return;
  }
  if (!description || description.trim().length < 10 || description.trim().length > 300) {
    res.status(400).json({ error: "description must be 10–300 characters" }); return;
  }
  if (!impactChange || typeof impactChange !== "object") {
    res.status(400).json({ error: "impactChange must be an object" }); return;
  }
  // Validate impact bounds (±0.3)
  for (const [key, val] of Object.entries(impactChange)) {
    if (!["budget", "unemployment", "inflation", "gdpGrowth", "publicSentiment"].includes(key)) {
      res.status(400).json({ error: `Invalid impact key: ${key}` }); return;
    }
    if (typeof val !== "number" || val < -0.3 || val > 0.3) {
      res.status(400).json({ error: `${key} must be between -0.3 and 0.3` }); return;
    }
  }

  // 1 amendment per user per bill
  const sqlite = getSqlite();
  const existingAmend = sqlite.prepare(
    "SELECT COUNT(*) as cnt FROM pending_injections WHERE type = 'mdb_amendment' AND consumed = 0 AND json_extract(data, '$.userId') = ? AND json_extract(data, '$.billId') = ?"
  ).get(token, req.params.id) as { cnt: number };
  if (existingAmend.cnt > 0) {
    res.status(400).json({ error: "You already have a pending amendment for this bill" }); return;
  }
  // Check via pending_injections that were already consumed for this bill+user
  const consumedAmend = sqlite.prepare(
    "SELECT COUNT(*) as cnt FROM pending_injections WHERE type = 'mdb_amendment' AND consumed = 1 AND json_extract(data, '$.userId') = ? AND json_extract(data, '$.billId') = ?"
  ).get(token, req.params.id) as { cnt: number };
  if (consumedAmend.cnt > 0) {
    res.status(400).json({ error: "You have already proposed an amendment for this bill" }); return;
  }

  const userDb = getUserDb();
  const user = userDb.select().from(schema.users).where(eq(schema.users.id, token)).all()[0];

  db.insert(schema.pendingInjections).values({
    id: randomUUID(),
    type: "mdb_amendment",
    data: {
      billId: req.params.id,
      title: title.trim(),
      description: description.trim(),
      impactChange,
      partyId: seat.partyId,
      userId: token,
      proposerName: user?.displayName ?? "MdB",
    } as any,
    consumed: false,
  }).run();

  try { const md = db.select({ day: schema.simulationMeta.currentDay }).from(schema.simulationMeta).limit(1).all()[0]; logUserAction(token, "submit_amendment", md?.day ?? 0, req.params.id, "bill"); } catch {}
  res.json({ status: "queued", message: "Amendment will be processed on next simulation day" });
});

// POST /api/bills/:id/speech — submit a speech on a bill
router.post("/api/bills/:id/speech", (req, res) => {
  if (requireParticipatory(req, res, "give_speech")) return;
  const token = getUserToken(req);
  if (!token) { res.status(401).json({ error: "Missing X-User-Token header" }); return; }

  const seat = getUserSeat(token);
  if (!seat) { res.status(403).json({ error: "You don't have an active Bundestag seat" }); return; }

  const db = getDb();
  const bill = db.select().from(schema.bills).where(eq(schema.bills.id, req.params.id)).all()[0];
  if (!bill) { res.status(404).json({ error: "Bill not found" }); return; }

  const { content, reading } = req.body as { content?: string; reading?: number };
  if (!content || content.trim().length < 20 || content.trim().length > 500) {
    res.status(400).json({ error: "content must be 20–500 characters" });
    return;
  }
  if (!reading || ![1, 2, 3].includes(reading)) {
    res.status(400).json({ error: "reading must be 1, 2, or 3" });
    return;
  }

  // Validate bill is in matching reading stage
  const readingStatusMap: Record<number, string> = { 1: "first_reading", 2: "second_reading", 3: "third_reading" };
  if (bill.status !== readingStatusMap[reading]) {
    res.status(400).json({ error: `Bill is in ${bill.status}, not ${readingStatusMap[reading]}` });
    return;
  }

  // Check user hasn't already spoken on this bill+reading
  const userDb = getUserDb();
  const existing = userDb.select().from(schema.mdbSpeeches)
    .where(and(
      eq(schema.mdbSpeeches.billId, req.params.id),
      eq(schema.mdbSpeeches.userId, token),
      eq(schema.mdbSpeeches.reading, reading),
    )).all();
  if (existing.length > 0) {
    res.status(400).json({ error: "You have already spoken on this bill in this reading" });
    return;
  }

  const metaRow = db.select({ day: schema.simulationMeta.currentDay }).from(schema.simulationMeta).limit(1).all()[0];
  const currentDay = metaRow?.day ?? 0;

  const speechId = randomUUID();
  userDb.insert(schema.mdbSpeeches).values({
    id: speechId,
    userId: token,
    billId: req.params.id,
    reading,
    content: content.trim(),
    sentimentImpact: null,
    dayNumber: currentDay,
    createdAt: Date.now(),
  }).run();

  try { logUserAction(token, "submit_speech", currentDay, req.params.id, "bill", { reading }); } catch {}
  res.json({ id: speechId, billId: req.params.id, reading, content: content.trim(), dayNumber: currentDay });
});

// GET /api/bills/:id/speeches — all speeches for a bill, grouped by reading
router.get("/api/bills/:id/speeches", (req, res) => {
  const userDb = getUserDb();
  const speeches = userDb.select().from(schema.mdbSpeeches)
    .where(eq(schema.mdbSpeeches.billId, req.params.id))
    .all();

  // Enrich with display names
  const userIds = [...new Set(speeches.map(s => s.userId))];
  const nameMap = new Map<string, string>();
  for (const uid of userIds) {
    const user = userDb.select().from(schema.users).where(eq(schema.users.id, uid)).all()[0];
    if (user) nameMap.set(uid, user.displayName);
  }

  const enriched = speeches.map(s => ({
    ...s,
    displayName: nameMap.get(s.userId) ?? "Unknown",
  }));

  // Group by reading
  const byReading: Record<number, typeof enriched> = {};
  for (const s of enriched) {
    if (!byReading[s.reading]) byReading[s.reading] = [];
    byReading[s.reading].push(s);
  }

  res.json({ speeches: enriched, byReading });
});

// POST /api/bills/:id/mdb-vote — cast a direct MdB vote on a third_reading bill
router.post("/api/bills/:id/mdb-vote", (req, res) => {
  if (requireParticipatory(req, res, "vote_bills")) return;
  const token = getUserToken(req);
  if (!token) { res.status(401).json({ error: "Missing X-User-Token header" }); return; }

  const seat = getUserSeat(token);
  if (!seat) { res.status(403).json({ error: "You don't have an active Bundestag seat" }); return; }

  const db = getDb();
  const bill = db.select().from(schema.bills).where(eq(schema.bills.id, req.params.id)).all()[0];
  if (!bill) { res.status(404).json({ error: "Bill not found" }); return; }
  if (bill.status !== "third_reading") { res.status(400).json({ error: "Bill is not in third reading" }); return; }

  const { vote } = req.body as { vote?: string };
  if (!vote || !["yes", "no", "abstain"].includes(vote)) {
    res.status(400).json({ error: "vote must be 'yes', 'no', or 'abstain'" });
    return;
  }

  const userDb = getUserDb();
  // Check for existing vote (upsert)
  const existing = userDb.select().from(schema.mdbVotes)
    .where(and(eq(schema.mdbVotes.billId, req.params.id), eq(schema.mdbVotes.userId, token)))
    .all()[0];

  if (existing) {
    userDb.update(schema.mdbVotes)
      .set({ vote, createdAt: Date.now() })
      .where(eq(schema.mdbVotes.id, existing.id))
      .run();
  } else {
    userDb.insert(schema.mdbVotes).values({
      id: randomUUID(),
      seatId: seat.id,
      billId: req.params.id,
      userId: token,
      vote,
      createdAt: Date.now(),
    }).run();
  }

  // Return aggregated MdB votes
  const allVotes = userDb.select().from(schema.mdbVotes)
    .where(eq(schema.mdbVotes.billId, req.params.id))
    .all();
  const summary = { yes: 0, no: 0, abstain: 0, total: allVotes.length };
  for (const v of allVotes) {
    if (v.vote === "yes") summary.yes++;
    else if (v.vote === "no") summary.no++;
    else summary.abstain++;
  }

  try { const md = db.select({ day: schema.simulationMeta.currentDay }).from(schema.simulationMeta).limit(1).all()[0]; logUserAction(token, "cast_mdb_vote", md?.day ?? 0, req.params.id, "bill", { vote }); } catch {}
  res.json({ userVote: vote, summary });
});

// GET /api/bills/:id/mdb-votes — aggregated MdB votes + user's own vote
router.get("/api/bills/:id/mdb-votes", (req, res) => {
  const userDb = getUserDb();
  const allVotes = userDb.select().from(schema.mdbVotes)
    .where(eq(schema.mdbVotes.billId, req.params.id))
    .all();

  const summary = { yes: 0, no: 0, abstain: 0, total: allVotes.length };
  // Also break down by party
  const byParty: Record<string, { yes: number; no: number; abstain: number }> = {};
  for (const v of allVotes) {
    // Get party from the seat
    const seat = getDb().select().from(schema.bundestagSeats)
      .where(eq(schema.bundestagSeats.id, v.seatId))
      .all()[0];
    const partyId = seat?.partyId ?? "unknown";
    if (!byParty[partyId]) byParty[partyId] = { yes: 0, no: 0, abstain: 0 };

    if (v.vote === "yes") { summary.yes++; byParty[partyId].yes++; }
    else if (v.vote === "no") { summary.no++; byParty[partyId].no++; }
    else { summary.abstain++; byParty[partyId].abstain++; }
  }

  // User's own vote
  const token = getUserToken(req);
  let userVote: string | null = null;
  if (token) {
    const own = allVotes.find(v => v.userId === token);
    userVote = own?.vote ?? null;
  }

  res.json({ summary, byParty, userVote });
});

export default router;
