import { Router } from "express";
import { randomUUID } from "crypto";
import { getDb, getUserDb, schema, getSqlite, getUserSqlite, deactivateUserSeat, getNotifications, getUnreadCount, markNotificationRead, markAllNotificationsRead, logUserAction } from "@ki-bundestag/engine";
import { eq, desc, gte, asc, and, count } from "drizzle-orm";
import { getUserToken } from "../middleware/index.js";
import { LIMITS } from "../validation.js";

const router = Router();

// POST /api/users/login
router.post("/api/users/login", (req, res) => {
  const { displayName } = req.body as { displayName?: string };
  if (!displayName || displayName.trim().length < LIMITS.NICKNAME_MIN) {
    res.status(400).json({ error: `displayName must be at least ${LIMITS.NICKNAME_MIN} characters` });
    return;
  }
  const userDb = getUserDb();
  const rows = userDb.select().from(schema.users).where(eq(schema.users.displayName, displayName.trim())).all();
  if (rows.length === 0) { res.status(404).json({ error: "User not found" }); return; }
  const u = rows[0];
  userDb.update(schema.users).set({ lastActive: Date.now() }).where(eq(schema.users.id, u.id)).run();
  try { const db = getDb(); const md = db.select({ day: schema.simulationMeta.currentDay }).from(schema.simulationMeta).limit(1).all()[0]; logUserAction(u.id, "login", md?.day ?? 0, u.id, "user"); } catch (err) { console.error("[users] Failed to log action:", err); }
  res.json({ id: u.id, displayName: u.displayName, partyId: u.partyId, createdAt: u.createdAt, lastActive: Date.now(), switchCooldownUntil: u.switchCooldownUntil });
});

// POST /api/users/register
router.post("/api/users/register", (req, res) => {
  const { displayName, partyId } = req.body as { displayName?: string; partyId?: string };
  if (!displayName || displayName.trim().length < LIMITS.NICKNAME_MIN || displayName.trim().length > LIMITS.NICKNAME_MAX) {
    res.status(400).json({ error: `displayName must be ${LIMITS.NICKNAME_MIN}\u2013${LIMITS.NICKNAME_MAX} characters` });
    return;
  }
  if (partyId) {
    const db = getDb();
    const party = db.select().from(schema.parties).where(eq(schema.parties.id, partyId)).all();
    if (party.length === 0) { res.status(400).json({ error: "Party not found" }); return; }
  }
  const userDb = getUserDb();
  const id: string = randomUUID();
  const now = Date.now();
  try {
    userDb.insert(schema.users).values({
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
  try { const db = getDb(); const md = db.select({ day: schema.simulationMeta.currentDay }).from(schema.simulationMeta).limit(1).all()[0]; logUserAction(id, "register", md?.day ?? 0, id, "user"); } catch (err) { console.error("[users] Failed to log action:", err); }
  res.json({ id, displayName: displayName.trim(), partyId: partyId ?? null, createdAt: now, lastActive: now, switchCooldownUntil: null });
});

// GET /api/users/me
router.get("/api/users/me", (req, res) => {
  const token = getUserToken(req);
  if (!token) { res.status(401).json({ error: "Missing X-User-Token header" }); return; }
  const userDb = getUserDb();
  const rows = userDb.select().from(schema.users).where(eq(schema.users.id, token)).all();
  if (rows.length === 0) { res.status(404).json({ error: "User not found" }); return; }
  const u = rows[0];
  res.json({ id: u.id, displayName: u.displayName, partyId: u.partyId, createdAt: u.createdAt, lastActive: u.lastActive, switchCooldownUntil: u.switchCooldownUntil });
});

// GET /api/users/me/activity
router.get("/api/users/me/activity", (req, res) => {
  const token = getUserToken(req);
  if (!token) { res.status(401).json({ error: "Not authenticated" }); return; }
  const userDb = getUserDb();
  const user = userDb.select().from(schema.users).where(eq(schema.users.id, token)).all()[0];
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const items: Array<{ type: string; title: string; description: string; dayNumber: number; createdAt: string; entityId?: string; entityType?: string; outcome?: string }> = [];

  // Proposals
  const proposals = userDb.select().from(schema.internalProposals).where(eq(schema.internalProposals.proposedBy, token)).all();
  for (const p of proposals) {
    items.push({
      type: "proposal",
      title: `Proposed: "${p.title}"`,
      description: `Status: ${p.status}${p.bundestag_bill_id ? ` \u2192 Bill ${p.bundestag_bill_id}` : ""}`,
      dayNumber: p.createdOnDay,
      createdAt: new Date(p.createdOnDay * 86400000).toISOString(),
      entityId: p.id,
      entityType: "proposal",
      outcome: p.status,
    });
  }

  // Signals
  const signals = userDb.select().from(schema.memberSignals).where(eq(schema.memberSignals.userId, token)).all();
  for (const s of signals) {
    items.push({
      type: "signal",
      title: `Signaled ${s.signal.toUpperCase()} on a bill`,
      description: `Bill: ${s.billId}`,
      dayNumber: 0,
      createdAt: new Date(s.createdAt).toISOString(),
      entityId: s.billId,
      entityType: "bill",
    });
  }

  // MdB Votes
  const mdbVotes = userDb.select().from(schema.mdbVotes).where(eq(schema.mdbVotes.userId, token)).all();
  for (const v of mdbVotes) {
    items.push({
      type: "mdb_vote",
      title: `MdB vote: ${v.vote.toUpperCase()}`,
      description: `Bill: ${v.billId}`,
      dayNumber: 0,
      createdAt: new Date(v.createdAt).toISOString(),
      entityId: v.billId,
      entityType: "bill",
    });
  }

  // Speeches
  const speeches = userDb.select().from(schema.mdbSpeeches).where(eq(schema.mdbSpeeches.userId, token)).all();
  for (const sp of speeches) {
    items.push({
      type: "speech",
      title: `Speech (Reading ${sp.reading})`,
      description: sp.content.substring(0, 100) + (sp.content.length > 100 ? "..." : ""),
      dayNumber: sp.dayNumber,
      createdAt: new Date(sp.createdAt).toISOString(),
      entityId: sp.billId,
      entityType: "bill",
    });
  }

  // Applications
  const apps = userDb.select().from(schema.mdbApplications).where(eq(schema.mdbApplications.userId, token)).all();
  for (const a of apps) {
    items.push({
      type: "application",
      title: `MdB application (${a.partyId})`,
      description: `Status: ${a.status}`,
      dayNumber: a.createdOnDay,
      createdAt: new Date(a.createdOnDay * 86400000).toISOString(),
      entityId: a.id,
      entityType: "application",
      outcome: a.status,
    });
  }

  // Questions
  const db = getDb();
  const questions = db.select().from(schema.citizenQuestions).all().filter((q: any) => q.userId === token);
  for (const q of questions) {
    items.push({
      type: "question",
      title: `Asked ${q.targetPartyId}: "${q.question.substring(0, 60)}..."`,
      description: q.response ? `Answered: ${q.response.substring(0, 100)}...` : "Awaiting answer",
      dayNumber: q.createdOnDay,
      createdAt: new Date(q.createdOnDay * 86400000).toISOString(),
      entityId: q.id,
      entityType: "question",
      outcome: q.status,
    });
  }

  // Sort by createdAt descending
  items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  res.json({ items: items.slice(0, 100) });
});

// GET /api/users/me/impact (A6)
router.get("/api/users/me/impact", (req, res) => {
  const token = getUserToken(req);
  if (!token) { res.status(401).json({ error: "Not authenticated" }); return; }
  const userDb = getUserDb();
  const user = userDb.select().from(schema.users).where(eq(schema.users.id, token)).all()[0];
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const db = getDb();

  // 1. signalAccuracy
  const signals = userDb.select().from(schema.memberSignals).where(eq(schema.memberSignals.userId, token)).all();
  let matched = 0;
  let total = 0;
  for (const s of signals) {
    const bill = db.select({ status: schema.bills.status }).from(schema.bills).where(eq(schema.bills.id, s.billId)).all()[0];
    if (!bill) continue;
    if (bill.status === "passed" || bill.status === "rejected") {
      total++;
      if ((s.signal === "yes" && bill.status === "passed") || (s.signal === "no" && bill.status === "rejected")) {
        matched++;
      }
    }
  }
  const signalAccuracy = { matched, total, pct: total > 0 ? Math.round((matched / total) * 100) : 0 };

  // 2. proposalOutcomes
  const proposals = userDb.select().from(schema.internalProposals).where(eq(schema.internalProposals.proposedBy, token)).all();
  const proposalOutcomes = proposals.map(p => ({
    title: p.title,
    status: p.status,
    billId: p.bundestag_bill_id ?? null,
  }));

  // 3. mdbVoteStats
  const mdbVotes = userDb.select().from(schema.mdbVotes).where(eq(schema.mdbVotes.userId, token)).all();
  let withMajority = 0;
  for (const v of mdbVotes) {
    const bill = db.select({ status: schema.bills.status }).from(schema.bills).where(eq(schema.bills.id, v.billId)).all()[0];
    if (!bill) continue;
    if (bill.status === "passed" || bill.status === "rejected") {
      if ((v.vote === "yes" && bill.status === "passed") || (v.vote === "no" && bill.status === "rejected")) {
        withMajority++;
      }
    }
  }
  const mdbVoteStats = { total: mdbVotes.length, withMajority };

  // 4. partyStats
  let partyStats: { partyId: string; partyName: string; memberCount: number; approvalPerDay: number } | null = null;
  if (user.partyId) {
    const party = db.select({ id: schema.parties.id, name: schema.parties.name }).from(schema.parties).where(eq(schema.parties.id, user.partyId)).all()[0];
    if (party) {
      const memberCountRow = userDb.select({ cnt: count() }).from(schema.users).where(eq(schema.users.partyId, user.partyId)).all()[0];
      const memberCount = memberCountRow?.cnt ?? 0;
      const history = db.select().from(schema.partyHistory)
        .where(eq(schema.partyHistory.partyId, user.partyId))
        .orderBy(desc(schema.partyHistory.dayNumber))
        .limit(2)
        .all();
      let approvalPerDay = 0;
      if (history.length === 2) {
        const dayDiff = history[0].dayNumber - history[1].dayNumber;
        if (dayDiff > 0) {
          approvalPerDay = Math.round(((history[0].approvalRating - history[1].approvalRating) / dayDiff) * 1000) / 1000;
        }
      }
      partyStats = { partyId: party.id, partyName: party.name, memberCount, approvalPerDay };
    }
  }

  res.json({ signalAccuracy, proposalOutcomes, mdbVoteStats, partyStats });
});

// GET /api/users/me/catchup (A7)
router.get("/api/users/me/catchup", (req, res) => {
  const token = getUserToken(req);
  if (!token) { res.status(401).json({ error: "Not authenticated" }); return; }
  const userDb = getUserDb();
  const user = userDb.select().from(schema.users).where(eq(schema.users.id, token)).all()[0];
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const db = getDb();
  const meta = db.select({ currentDay: schema.simulationMeta.currentDay }).from(schema.simulationMeta).limit(1).all()[0];
  const currentDay = meta?.currentDay ?? 0;

  // Find last active sim day from user_actions
  const userRaw = getUserSqlite();
  const lastActionRow = userRaw.prepare("SELECT MAX(sim_day) as maxDay FROM user_actions WHERE user_id = ?").get(token) as { maxDay: number | null } | undefined;
  const lastActiveDay = lastActionRow?.maxDay ?? 0;

  const daysMissed = currentDay - lastActiveDay;

  // If user was recently active, return minimal response
  if (daysMissed < 3) {
    res.json({
      daysMissed,
      billsPassed: [],
      billsRejected: [],
      crisesStarted: [],
      crisesEnded: [],
      partyApprovalDelta: null,
      proposalOutcomes: [],
    });
    return;
  }

  // Bills passed/rejected since last active
  const billsPassed = db.select({ id: schema.bills.id, title: schema.bills.title, status: schema.bills.status })
    .from(schema.bills)
    .where(and(eq(schema.bills.status, "passed"), gte(schema.bills.statusChangedOnDay, lastActiveDay)))
    .all();
  const billsRejected = db.select({ id: schema.bills.id, title: schema.bills.title, status: schema.bills.status })
    .from(schema.bills)
    .where(and(eq(schema.bills.status, "rejected"), gte(schema.bills.statusChangedOnDay, lastActiveDay)))
    .all();

  // Crises started/ended
  const crisesStarted = db.select({ id: schema.crises.id, name: schema.crises.name, severity: schema.crises.severity })
    .from(schema.crises)
    .where(gte(schema.crises.startDay, lastActiveDay))
    .all();
  const simRaw = getSqlite();
  const crisesEndedRows = simRaw.prepare(
    "SELECT id, name FROM crises WHERE end_day >= ? AND end_day <= ? AND resolved = 1"
  ).all(lastActiveDay, currentDay) as { id: string; name: string }[];
  const crisesEnded = crisesEndedRows.map(c => ({ id: c.id, name: c.name }));

  // Party approval delta
  let partyApprovalDelta: number | null = null;
  if (user.partyId) {
    const older = db.select({ approvalRating: schema.partyHistory.approvalRating })
      .from(schema.partyHistory)
      .where(and(eq(schema.partyHistory.partyId, user.partyId), gte(schema.partyHistory.dayNumber, lastActiveDay)))
      .orderBy(asc(schema.partyHistory.dayNumber))
      .limit(1)
      .all()[0];
    const newer = db.select({ approvalRating: schema.partyHistory.approvalRating })
      .from(schema.partyHistory)
      .where(eq(schema.partyHistory.partyId, user.partyId))
      .orderBy(desc(schema.partyHistory.dayNumber))
      .limit(1)
      .all()[0];
    if (older && newer) {
      partyApprovalDelta = Math.round((newer.approvalRating - older.approvalRating) * 100) / 100;
    }
  }

  // Proposal outcomes since last active
  const proposals = userDb.select().from(schema.internalProposals)
    .where(and(eq(schema.internalProposals.proposedBy, token), gte(schema.internalProposals.reviewedOnDay, lastActiveDay)))
    .all();
  const proposalOutcomes = proposals.map(p => ({ title: p.title, status: p.status }));

  res.json({
    daysMissed,
    billsPassed,
    billsRejected,
    crisesStarted,
    crisesEnded,
    partyApprovalDelta,
    proposalOutcomes,
  });
});

// POST /api/users/me/join/:partyId
router.post("/api/users/me/join/:partyId", (req, res) => {
  const token = getUserToken(req);
  if (!token) { res.status(401).json({ error: "Missing X-User-Token header" }); return; }
  const userDb = getUserDb();
  const rows = userDb.select().from(schema.users).where(eq(schema.users.id, token)).all();
  if (rows.length === 0) { res.status(404).json({ error: "User not found" }); return; }
  const user = rows[0];

  const db = getDb();
  const metaRow = db.select({ day: schema.simulationMeta.currentDay }).from(schema.simulationMeta).limit(1).all()[0];
  const currentDay = metaRow?.day ?? 0;

  if (user.switchCooldownUntil != null && currentDay < user.switchCooldownUntil) {
    res.status(403).json({ error: `Cooldown active until Day ${user.switchCooldownUntil}` });
    return;
  }
  const party = db.select().from(schema.parties).where(eq(schema.parties.id, req.params.partyId)).all();
  if (party.length === 0) { res.status(404).json({ error: "Party not found" }); return; }

  // If switching parties, deactivate seat and expire applications
  if (user.partyId != null && user.partyId !== req.params.partyId) {
    deactivateUserSeat(token);
    userDb.update(schema.mdbApplications)
      .set({ status: "expired" as const })
      .where(and(eq(schema.mdbApplications.userId, token), eq(schema.mdbApplications.status, "pending")))
      .run();
  }
  const cooldown = user.partyId != null ? currentDay + 7 : null;
  userDb.update(schema.users)
    .set({ partyId: req.params.partyId, lastActive: Date.now(), switchCooldownUntil: cooldown })
    .where(eq(schema.users.id, token))
    .run();
  const updated = userDb.select().from(schema.users).where(eq(schema.users.id, token)).all()[0];
  try { logUserAction(token, "join_party", currentDay, req.params.partyId, "party"); } catch (err) { console.error("[users] Failed to log action:", err); }
  res.json({ id: updated.id, displayName: updated.displayName, partyId: updated.partyId, createdAt: updated.createdAt, lastActive: updated.lastActive, switchCooldownUntil: updated.switchCooldownUntil });
});

// POST /api/users/me/leave
router.post("/api/users/me/leave", (req, res) => {
  const token = getUserToken(req);
  if (!token) { res.status(401).json({ error: "Missing X-User-Token header" }); return; }
  const userDb = getUserDb();
  const rows = userDb.select().from(schema.users).where(eq(schema.users.id, token)).all();
  if (rows.length === 0) { res.status(404).json({ error: "User not found" }); return; }
  const user = rows[0];
  const db = getDb();
  const metaRow = db.select({ day: schema.simulationMeta.currentDay }).from(schema.simulationMeta).limit(1).all()[0];
  const currentDay = metaRow?.day ?? 0;
  // Deactivate any active Bundestag seat
  deactivateUserSeat(token);
  // Expire pending MdB applications
  userDb.update(schema.mdbApplications)
    .set({ status: "expired" as const })
    .where(and(eq(schema.mdbApplications.userId, token), eq(schema.mdbApplications.status, "pending")))
    .run();
  userDb.update(schema.users)
    .set({ partyId: null, lastActive: Date.now(), switchCooldownUntil: currentDay + 7 })
    .where(eq(schema.users.id, token))
    .run();
  try { logUserAction(token, "leave_party", currentDay, user.partyId ?? undefined, "party"); } catch (err) { console.error("[users] Failed to log action:", err); }
  const updated = userDb.select().from(schema.users).where(eq(schema.users.id, token)).all()[0];
  res.json({ id: updated.id, displayName: updated.displayName, partyId: updated.partyId, createdAt: updated.createdAt, lastActive: updated.lastActive, switchCooldownUntil: updated.switchCooldownUntil });
});

// ── Notifications ────────────────────────────────────────────────────────────

// GET /api/notifications
router.get("/api/notifications", (req, res) => {
  const token = getUserToken(req);
  if (!token) { res.status(401).json({ error: "Not authenticated" }); return; }
  const unreadOnly = req.query.unread === "true";
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
  const notifications = getNotifications(token, { unreadOnly, limit });
  res.json(notifications);
});

// GET /api/notifications/unread-count
router.get("/api/notifications/unread-count", (req, res) => {
  const token = getUserToken(req);
  if (!token) { res.status(401).json({ error: "Not authenticated" }); return; }
  res.json({ count: getUnreadCount(token) });
});

// POST /api/notifications/:id/read
router.post("/api/notifications/:id/read", (req, res) => {
  const token = getUserToken(req);
  if (!token) { res.status(401).json({ error: "Not authenticated" }); return; }
  const ok = markNotificationRead(req.params.id, token);
  if (!ok) { res.status(404).json({ error: "Notification not found" }); return; }
  res.json({ success: true });
});

// POST /api/notifications/read-all
router.post("/api/notifications/read-all", (req, res) => {
  const token = getUserToken(req);
  if (!token) { res.status(401).json({ error: "Not authenticated" }); return; }
  const count = markAllNotificationsRead(token);
  res.json({ marked: count });
});

export default router;
