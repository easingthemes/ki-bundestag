import { Router } from "express";
import { getDb, schema, getSqlite, getUserSqlite } from "@ki-bundestag/engine";
import type { TimingPreset } from "@ki-bundestag/engine";

const router = Router();

// POST /api/simulation/preset (admin: change preset)
router.post("/api/simulation/preset", (req, res) => {
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

// GET /api/admin/analytics — aggregated user analytics (no auth required)
router.get("/api/admin/analytics", (_req, res) => {
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
      SELECT ua.user_id as userId, u.displayName as displayName, COUNT(*) as actionCount
      FROM user_actions ua
      LEFT JOIN users u ON ua.user_id = u.id
      GROUP BY ua.user_id
      ORDER BY actionCount DESC
      LIMIT 20
    `).all() as { userId: string; displayName: string; actionCount: number }[];

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
    console.error("Analytics error:", err);
    res.status(500).json({ error: "Failed to load analytics" });
  }
});

export default router;
