import { Router } from "express";
import { randomUUID } from "crypto";
import { eq, and } from "drizzle-orm";
import { getDb, getUserDb, schema, getUserSeat, getActiveSeats, getOpenSeatCounts, getSqlite, logUserAction, logger } from "@ki-bundestag/engine";
import { getUserToken, requireParticipatory } from "../middleware/index.js";
import { LIMITS } from "../validation.js";

const router = Router();

// POST /api/seats/apply — apply for a Bundestag seat
router.post("/api/seats/apply", (req, res) => {
  if (requireParticipatory(req, res, "mdb_apply")) return;
  const token = getUserToken(req);
  if (!token) { res.status(401).json({ error: "Not authenticated" }); return; }

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

  // Check open seats exist for party (bot users check bot seats, humans check human seats)
  const seatType = user.isBot ? "bot" : "human";
  const openCounts = getOpenSeatCounts(seatType as "human" | "bot");
  if ((openCounts[user.partyId] ?? 0) === 0) {
    res.status(400).json({ error: "No open seats available for your party" });
    return;
  }

  const { applicationText, policyFocus } = req.body as { applicationText?: string; policyFocus?: unknown };
  if (!applicationText || applicationText.trim().length < LIMITS.TEXT_MEDIUM_MIN || applicationText.trim().length > LIMITS.TEXT_MEDIUM_MAX) {
    res.status(400).json({ error: `applicationText must be ${LIMITS.TEXT_MEDIUM_MIN}–${LIMITS.TEXT_MEDIUM_MAX} characters` });
    return;
  }
  if (policyFocus !== undefined && policyFocus !== null) {
    if (!Array.isArray(policyFocus)) {
      res.status(400).json({ error: "policyFocus must be an array of strings" });
      return;
    }
    if (policyFocus.length > 5) {
      res.status(400).json({ error: "policyFocus may have at most 5 items" });
      return;
    }
    for (const item of policyFocus) {
      if (typeof item !== "string") {
        res.status(400).json({ error: "Each policyFocus item must be a string" });
        return;
      }
      if (item.length > 100) {
        res.status(400).json({ error: "Each policyFocus item must be at most 100 characters" });
        return;
      }
    }
  }
  const validatedPolicyFocus = policyFocus as string[] | null | undefined;

  const appId = randomUUID();
  userDb.insert(schema.mdbApplications).values({
    id: appId,
    userId: token,
    partyId: user.partyId,
    applicationText: applicationText.trim(),
    policyFocus: validatedPolicyFocus ?? null,
    status: "pending",
    createdOnDay: currentDay,
  }).run();

  try { logUserAction(token, "apply_mdb", currentDay, appId, "application", { partyId: user.partyId }); } catch (err) { logger.error("[seats] Failed to log action:", err); }
  res.json({
    id: appId,
    userId: token,
    partyId: user.partyId,
    applicationText: applicationText.trim(),
    policyFocus: validatedPolicyFocus ?? null,
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
    let isBot = false;
    if (seat.userId) {
      const user = userDb.select().from(schema.users)
        .where(eq(schema.users.id, seat.userId))
        .all()[0];
      displayName = user?.displayName ?? null;
      isBot = user?.isBot ?? false;
    }
    return { ...seat, displayName, isBot };
  });

  res.json(enriched);
});

// GET /api/seats/roster — all active seats across all parties (public MdB listing)
router.get("/api/seats/roster", (req, res) => {
  const partyId = req.query.partyId as string | undefined;
  const controller = req.query.controller as string | undefined;
  const search = req.query.search as string | undefined;

  let seats = getActiveSeats(partyId);

  if (controller && (controller === "human" || controller === "ai" || controller === "bot")) {
    seats = seats.filter(s => s.controller === controller);
  }

  // Enrich with user display names
  const userDb = getUserDb();
  const enriched = seats.map(seat => {
    let displayName: string | null = null;
    let isBot = false;
    if (seat.userId) {
      const user = userDb.select().from(schema.users)
        .where(eq(schema.users.id, seat.userId))
        .all()[0];
      displayName = user?.displayName ?? null;
      isBot = user?.isBot ?? false;
    }
    return { ...seat, displayName, isBot };
  });

  // Search filter (by display name or seat number)
  if (search) {
    const q = search.toLowerCase();
    return res.json(enriched.filter(s =>
      (s.displayName && s.displayName.toLowerCase().includes(q)) ||
      String(s.seatNumber).includes(q)
    ));
  }

  res.json(enriched);
});

// GET /api/seats/:seatId/profile — detailed MdB profile with votes and speeches
router.get("/api/seats/:seatId/profile", (req, res) => {
  const db = getDb();
  const seat = db.select().from(schema.bundestagSeats)
    .where(eq(schema.bundestagSeats.id, req.params.seatId))
    .all()[0];
  if (!seat) { res.status(404).json({ error: "Seat not found" }); return; }

  // Display name
  const userDb = getUserDb();
  let displayName: string | null = null;
  let isBot = false;
  let application: typeof schema.mdbApplications.$inferSelect | null = null;
  if (seat.userId) {
    const user = userDb.select().from(schema.users)
      .where(eq(schema.users.id, seat.userId))
      .all()[0];
    displayName = user?.displayName ?? null;
    isBot = user?.isBot ?? false;

    // Get approved application for this user+party (motivation & policy focus)
    application = userDb.select().from(schema.mdbApplications)
      .where(and(
        eq(schema.mdbApplications.userId, seat.userId),
        eq(schema.mdbApplications.partyId, seat.partyId),
        eq(schema.mdbApplications.status, "approved"),
      ))
      .all()
      .sort((a, b) => b.createdOnDay - a.createdOnDay)[0] ?? null;
  }

  // Votes cast by this seat
  const votes = userDb.select().from(schema.mdbVotes)
    .where(eq(schema.mdbVotes.seatId, seat.id))
    .all();

  // Enrich votes with bill info
  const enrichedVotes = votes.map(v => {
    const bill = db.select().from(schema.bills)
      .where(eq(schema.bills.id, v.billId))
      .all()[0];
    return {
      billId: v.billId,
      billTitle: bill?.title ?? "Unbekannt",
      billStatus: bill?.status ?? "unknown",
      vote: v.vote,
      createdAt: v.createdAt,
    };
  }).sort((a, b) => b.createdAt - a.createdAt);

  // Speeches by this user
  let speeches: Array<{
    id: string;
    billId: string;
    billTitle: string;
    reading: number;
    content: string;
    sentimentImpact: number | null;
    dayNumber: number;
    createdAt: number;
  }> = [];
  if (seat.userId) {
    const rawSpeeches = userDb.select().from(schema.mdbSpeeches)
      .where(eq(schema.mdbSpeeches.userId, seat.userId))
      .all();
    speeches = rawSpeeches.map(s => {
      const bill = db.select().from(schema.bills)
        .where(eq(schema.bills.id, s.billId))
        .all()[0];
      return {
        id: s.id,
        billId: s.billId,
        billTitle: bill?.title ?? "Unbekannt",
        reading: s.reading,
        content: s.content,
        sentimentImpact: s.sentimentImpact,
        dayNumber: s.dayNumber,
        createdAt: s.createdAt,
      };
    }).sort((a, b) => b.createdAt - a.createdAt);
  }

  // Party info
  const party = db.select().from(schema.parties)
    .where(eq(schema.parties.id, seat.partyId))
    .all()[0];

  // Committee memberships for this seat
  const sqlite = getSqlite();
  const committeeRows = sqlite.prepare(`
    SELECT cm.committee_id, cm.role, c.name, c.short_name
    FROM committee_memberships cm
    JOIN committees c ON c.id = cm.committee_id AND c.active = 1
    WHERE cm.seat_id = ?
  `).all(seat.id) as Array<{
    committee_id: string;
    role: string;
    name: string;
    short_name: string | null;
  }>;
  const committeeList = committeeRows.map(r => ({
    committeeId: r.committee_id,
    committeeName: r.name,
    shortName: r.short_name,
    role: r.role,
  }));

  res.json({
    seat: { ...seat, displayName, isBot },
    party: party ? { id: party.id, name: party.name, color: party.color } : null,
    application: application ? {
      motivation: application.applicationText,
      policyFocus: application.policyFocus,
    } : null,
    votes: enrichedVotes,
    speeches,
    committees: committeeList,
  });
});

// GET /api/seats/available — open seat counts per party
router.get("/api/seats/available", (_req, res) => {
  const openCounts = getOpenSeatCounts();
  const humanOpenCounts = getOpenSeatCounts("human");
  const botOpenCounts = getOpenSeatCounts("bot");

  // Also include total active seats per party for context
  const sqlite = getSqlite();
  const totalRows = sqlite.prepare(
    `SELECT party_id, COUNT(*) as total,
       SUM(CASE WHEN controller = 'human' THEN 1 ELSE 0 END) as human_total,
       SUM(CASE WHEN controller = 'bot' THEN 1 ELSE 0 END) as bot_total
     FROM bundestag_seats WHERE active = 1 GROUP BY party_id`
  ).all() as Array<{ party_id: string; total: number; human_total: number; bot_total: number }>;

  const result: Record<string, { open: number; humanOpen: number; botOpen: number; humanTotal: number; botTotal: number; total: number }> = {};
  for (const row of totalRows) {
    result[row.party_id] = {
      open: openCounts[row.party_id] ?? 0,
      humanOpen: humanOpenCounts[row.party_id] ?? 0,
      botOpen: botOpenCounts[row.party_id] ?? 0,
      humanTotal: row.human_total,
      botTotal: row.bot_total,
      total: row.total,
    };
  }

  res.json(result);
});

export default router;
