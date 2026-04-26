import { Router } from "express";
import { getDb, schema, getSqlite, getUserSqlite, logger, isValidContextDepth, getCostOverview, getCostByDay, getCostByTask, getCostByModel } from "@ki-bundestag/engine";
import type { TimingPreset, ContextDepth } from "@ki-bundestag/engine";
import { requireAdmin } from "../middleware/auth.js";

const router = Router();

// POST /api/simulation/preset (admin: change preset)
router.post("/api/simulation/preset", requireAdmin, (req, res) => {
  const { preset } = req.body as { preset?: string };
  const valid: TimingPreset[] = ["ultra-fast", "fast", "normal", "slow"];
  if (!preset || !valid.includes(preset as TimingPreset)) {
    res.status(400).json({ error: "Invalid preset. Must be one of: ultra-fast, fast, normal, slow" });
    return;
  }
  const db = getDb();
  db.update(schema.simulationMeta).set({ timingPreset: preset }).run();
  res.json({ success: true, preset });
});

// POST /api/simulation/context-depth (admin: change context depth)
router.post("/api/simulation/context-depth", requireAdmin, (req, res) => {
  const { contextDepth } = req.body as { contextDepth?: string };
  if (!contextDepth || !isValidContextDepth(contextDepth)) {
    res.status(400).json({ error: "Invalid context depth. Must be one of: low, normal, high" });
    return;
  }
  const db = getDb();
  db.update(schema.simulationMeta).set({ contextDepth } as any).run();
  res.json({ success: true, contextDepth });
});

// GET /api/admin/analytics
router.get("/api/admin/analytics", requireAdmin, (_req, res) => {
  try {
    const userRaw = getUserSqlite();
    const simRaw = getSqlite();

    // Total registered users
    const totalUsersRow = userRaw.prepare("SELECT COUNT(*) as cnt FROM users").get() as { cnt: number };
    const totalUsers = totalUsersRow.cnt;

    // Total actions
    const totalActionsRow = userRaw.prepare("SELECT COUNT(*) as cnt FROM user_actions").get() as { cnt: number };
    const totalActions = totalActionsRow.cnt;

    // DAU — distinct users in last 24h
    const dauRow = userRaw.prepare(
      "SELECT COUNT(DISTINCT user_id) as cnt FROM user_actions WHERE created_at >= datetime('now', '-1 day')"
    ).get() as { cnt: number };
    const dau = dauRow.cnt;

    // WAU — distinct users in last 7 days
    const wauRow = userRaw.prepare(
      "SELECT COUNT(DISTINCT user_id) as cnt FROM user_actions WHERE created_at >= datetime('now', '-7 days')"
    ).get() as { cnt: number };
    const wau = wauRow.cnt;

    // Action breakdown
    const actionBreakdown = userRaw.prepare(
      "SELECT action_type as actionType, COUNT(*) as count FROM user_actions GROUP BY action_type ORDER BY count DESC"
    ).all() as { actionType: string; count: number }[];

    // Top 20 users by action count
    const topUsers = userRaw.prepare(`
      SELECT ua.user_id as userId, u.display_name as displayName, u.is_bot as isBot, COUNT(*) as actionCount
      FROM user_actions ua
      LEFT JOIN users u ON ua.user_id = u.id
      GROUP BY ua.user_id
      ORDER BY actionCount DESC
      LIMIT 20
    `).all() as { userId: string; displayName: string; isBot: number; actionCount: number }[];

    // Funnel
    const registeredRow = userRaw.prepare("SELECT COUNT(*) as cnt FROM users").get() as { cnt: number };
    const joinedPartyRow = userRaw.prepare("SELECT COUNT(*) as cnt FROM users WHERE partyId IS NOT NULL").get() as { cnt: number };
    const firstActionRow = userRaw.prepare(
      "SELECT COUNT(DISTINCT user_id) as cnt FROM user_actions WHERE action_type != 'register'"
    ).get() as { cnt: number };
    const appliedMdbRow = userRaw.prepare(
      "SELECT COUNT(DISTINCT user_id) as cnt FROM user_actions WHERE action_type = 'apply_mdb'"
    ).get() as { cnt: number };
    // Got seat — check sim DB for active human seats
    const gotSeatRow = simRaw.prepare(
      "SELECT COUNT(DISTINCT userId) as cnt FROM bundestagSeats WHERE controller = 'human' AND active = 1 AND userId IS NOT NULL"
    ).get() as { cnt: number };

    const funnel = {
      registered: registeredRow.cnt,
      joinedParty: joinedPartyRow.cnt,
      firstAction: firstActionRow.cnt,
      appliedMdb: appliedMdbRow.cnt,
      gotSeat: gotSeatRow.cnt,
    };

    // Daily actions for last 30 days
    const dailyActions = userRaw.prepare(`
      SELECT date(created_at) as date, COUNT(*) as count
      FROM user_actions
      WHERE created_at >= datetime('now', '-30 days')
      GROUP BY date(created_at)
      ORDER BY date ASC
    `).all() as { date: string; count: number }[];

    res.json({
      totalUsers,
      totalActions,
      dau,
      wau,
      actionBreakdown,
      topUsers,
      funnel,
      dailyActions,
    });
  } catch (err) {
    logger.error("Analytics error:", err);
    res.status(500).json({ error: "Failed to load analytics" });
  }
});

// GET /api/admin/costs — AI call cost overview + breakdowns
router.get("/api/admin/costs", requireAdmin, (req, res) => {
  try {
    const fromDay = req.query.fromDay ? Number(req.query.fromDay) : undefined;
    const toDay = req.query.toDay ? Number(req.query.toDay) : undefined;

    const overview = getCostOverview();
    const byDay = getCostByDay(fromDay, toDay);
    const byTask = getCostByTask();
    const byModel = getCostByModel();

    res.json({ overview, byDay, byTask, byModel });
  } catch (err) {
    logger.error("Cost analytics error:", err);
    res.status(500).json({ error: "Failed to load cost data" });
  }
});

// GET /api/admin/costs/daily — just daily breakdown (for charts)
router.get("/api/admin/costs/daily", requireAdmin, (req, res) => {
  try {
    const fromDay = req.query.fromDay ? Number(req.query.fromDay) : undefined;
    const toDay = req.query.toDay ? Number(req.query.toDay) : undefined;
    res.json(getCostByDay(fromDay, toDay));
  } catch (err) {
    logger.error("Cost daily error:", err);
    res.status(500).json({ error: "Failed to load daily costs" });
  }
});

// DELETE /api/admin/agents/:userId — hard-delete a bot user and its rows.
// Bots only — humans must use OAuth-side account deletion. Useful for sweeping
// orphaned test agents whose API keys were lost. Sim-DB rows that reference
// userId (citizen_questions, pending_injections.data) are NOT FK-constrained
// and are left in place — they show up as authored by `null` in API responses.
router.delete("/api/admin/agents/:userId", requireAdmin, (req, res) => {
  const userId = req.params.userId;
  const userRaw = getUserSqlite();

  const user = userRaw.prepare("SELECT id, display_name, is_bot FROM users WHERE id = ?").get(userId) as { id: string; display_name: string; is_bot: number } | undefined;
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  if (user.is_bot !== 1) {
    res.status(400).json({ error: "Only bot users can be deleted via this endpoint" });
    return;
  }

  // Tables in users.db that FK to users.id — delete in any order since the
  // user row is the parent. Wrapped in a transaction for atomicity.
  const tables = [
    "agent_api_keys",
    "user_actions",
    "notifications",
    "member_signals",
    "internal_votes",
    "question_votes",
    "referendum_votes",
    "mdb_applications",
    "mdb_votes",
    "mdb_speeches",
  ];
  const txn = userRaw.transaction(() => {
    for (const t of tables) {
      userRaw.prepare(`DELETE FROM ${t} WHERE user_id = ?`).run(userId);
    }
    userRaw.prepare("DELETE FROM users WHERE id = ?").run(userId);
  });
  try {
    txn();
  } catch (err) {
    logger.error("[admin] delete agent failed", err);
    res.status(500).json({ error: "Failed to delete agent" });
    return;
  }

  res.json({ deleted: true, userId, displayName: user.display_name });
});

export default router;
