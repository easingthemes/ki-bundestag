import { Router } from "express";
import { randomUUID } from "crypto";
import { eq, and } from "drizzle-orm";
import { getDb, getUserDb, schema, getUserSeat, getActiveSeats, getOpenSeatCounts, getSqlite, logUserAction } from "@ki-bundestag/engine";
import { getUserToken, requireParticipatory } from "../middleware/index.js";

const router = Router();

// POST /api/seats/apply — apply for a Bundestag seat
router.post("/api/seats/apply", (req, res) => {
  if (requireParticipatory(req, res, "mdb_apply")) return;
  const token = getUserToken(req);
  if (!token) { res.status(401).json({ error: "Missing X-User-Token header" }); return; }

  const userDb = getUserDb();
  const user = userDb.select().from(schema.users).where(eq(schema.users.id, token)).all()[0];
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  if (!user.partyId) { res.status(400).json({ error: "You must join a party first" }); return; }

  // Check no active seat
  const existingSeat = getUserSeat(token);
  if (existingSeat) { res.status(400).json({ error: "You already have an active seat" }); return; }

  // Check no pending application
  const pendingApp = userDb.select().from(schema.mdbApplications)
    .where(and(
      eq(schema.mdbApplications.userId, token),
      eq(schema.mdbApplications.status, "pending"),
    )).all();
  if (pendingApp.length > 0) { res.status(400).json({ error: "You already have a pending application" }); return; }

  // Check cooldown from rejected application
  const db = getDb();
  const metaRow = db.select({ day: schema.simulationMeta.currentDay }).from(schema.simulationMeta).limit(1).all()[0];
  const currentDay = metaRow?.day ?? 0;
  const recentRejected = userDb.select().from(schema.mdbApplications)
    .where(and(
      eq(schema.mdbApplications.userId, token),
      eq(schema.mdbApplications.status, "rejected"),
    )).all()
    .filter(a => a.cooldownUntilDay != null && currentDay < a.cooldownUntilDay);
  if (recentRejected.length > 0) {
    res.status(403).json({ error: `Cooldown active until Day ${recentRejected[0].cooldownUntilDay}` });
    return;
  }

  // Check open seats exist for party
  const openCounts = getOpenSeatCounts();
  if ((openCounts[user.partyId] ?? 0) === 0) {
    res.status(400).json({ error: "No open seats available for your party" });
    return;
  }

  const { applicationText, policyFocus } = req.body as { applicationText?: string; policyFocus?: string[] };
  if (!applicationText || applicationText.trim().length < 10 || applicationText.trim().length > 500) {
    res.status(400).json({ error: "applicationText must be 10–500 characters" });
    return;
  }

  const appId = randomUUID();
  userDb.insert(schema.mdbApplications).values({
    id: appId,
    userId: token,
    partyId: user.partyId,
    applicationText: applicationText.trim(),
    policyFocus: policyFocus ?? null,
    status: "pending",
    createdOnDay: currentDay,
  }).run();

  try { logUserAction(token, "apply_mdb", currentDay, appId, "application", { partyId: user.partyId }); } catch {}
  res.json({
    id: appId,
    userId: token,
    partyId: user.partyId,
    applicationText: applicationText.trim(),
    policyFocus: policyFocus ?? null,
    status: "pending",
    createdOnDay: currentDay,
  });
});

// GET /api/seats/my-seat — get user's active seat + application status
router.get("/api/seats/my-seat", (req, res) => {
  const token = getUserToken(req);
  if (!token) { res.json({ seat: null, applications: [] }); return; }

  const seat = getUserSeat(token);
  const userDb = getUserDb();
  const applications = userDb.select().from(schema.mdbApplications)
    .where(eq(schema.mdbApplications.userId, token))
    .all()
    .sort((a, b) => b.createdOnDay - a.createdOnDay);

  res.json({ seat, applications });
});

// GET /api/seats/party/:partyId — all active seats for a party (public roster)
router.get("/api/seats/party/:partyId", (req, res) => {
  const seats = getActiveSeats(req.params.partyId);

  // Enrich with user display names
  const userDb = getUserDb();
  const enriched = seats.map(seat => {
    let displayName: string | null = null;
    if (seat.userId) {
      const user = userDb.select().from(schema.users)
        .where(eq(schema.users.id, seat.userId))
        .all()[0];
      displayName = user?.displayName ?? null;
    }
    return { ...seat, displayName };
  });

  res.json(enriched);
});

// GET /api/seats/available — open seat counts per party
router.get("/api/seats/available", (_req, res) => {
  const openCounts = getOpenSeatCounts();

  // Also include total active seats per party for context
  const sqlite = getSqlite();
  const totalRows = sqlite.prepare(
    "SELECT party_id, COUNT(*) as total, SUM(CASE WHEN controller = 'human' THEN 1 ELSE 0 END) as human_total FROM bundestag_seats WHERE active = 1 GROUP BY party_id"
  ).all() as Array<{ party_id: string; total: number; human_total: number }>;

  const result: Record<string, { open: number; humanTotal: number; total: number }> = {};
  for (const row of totalRows) {
    result[row.party_id] = {
      open: openCounts[row.party_id] ?? 0,
      humanTotal: row.human_total,
      total: row.total,
    };
  }

  res.json(result);
});

export default router;
