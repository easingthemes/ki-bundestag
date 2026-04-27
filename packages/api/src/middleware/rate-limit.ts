import rateLimit from "express-rate-limit";
import { getUserSqlite, getSqlite, USER_DAILY_LIMITS, BOT_SIM_DAY_LIMITS } from "@ki-bundestag/engine";

// Re-exported so existing callers (`users.ts`) keep working.
export { USER_DAILY_LIMITS, BOT_SIM_DAY_LIMITS };

/** General rate limit for user-facing POST endpoints (votes, submissions) */
export const actionLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 30, // 30 actions per window per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
});

/** Stricter limit for poll/referendum voting */
export const voteLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 10, // 10 votes per window per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many votes, please slow down" },
});

/** Rate limit for admin endpoints — brute-force protection */
export const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per window per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many admin requests, please try again later" },
});

// ---------------------------------------------------------------------------
// Per-user daily caps — wall-clock for humans, sim-day for bots.
// Limit values live in @ki-bundestag/engine/config/rate-limits.ts so an
// admin panel can tune them at runtime without touching the API.
// ---------------------------------------------------------------------------

function getUserIsBot(userId: string): boolean {
  const userSqlite = getUserSqlite();
  const row = userSqlite.prepare("SELECT is_bot FROM users WHERE id = ?").get(userId) as { is_bot: number } | undefined;
  return row?.is_bot === 1;
}

function getCurrentSimDay(): number {
  const sim = getSqlite();
  const row = sim.prepare("SELECT current_day FROM simulation_meta LIMIT 1").get() as { current_day: number } | undefined;
  return row?.current_day ?? 0;
}

/** Count human-style actions in the last 24h wall-clock. */
export function getUserDailyCount(userId: string, actionType: string): number {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const userSqlite = getUserSqlite();
  const row = userSqlite.prepare(
    "SELECT COUNT(*) as cnt FROM user_actions WHERE user_id = ? AND action_type = ? AND created_at >= ?"
  ).get(userId, actionType, cutoff) as { cnt: number };
  return row.cnt;
}

/** Count bot-style actions in the current sim day. */
export function getBotSimDayCount(userId: string, actionType: string, simDay: number): number {
  const userSqlite = getUserSqlite();
  const row = userSqlite.prepare(
    "SELECT COUNT(*) as cnt FROM user_actions WHERE user_id = ? AND action_type = ? AND sim_day = ?"
  ).get(userId, actionType, simDay) as { cnt: number };
  return row.cnt;
}

/**
 * Check if a user has exceeded their daily limit for an action type.
 * Dispatches on `isBot`: humans get a 24h wall-clock window, bots get
 * a per-sim-day window. Returns `{allowed, limit, used}`.
 */
export function checkUserDailyLimit(userId: string, actionType: string): { allowed: boolean; limit: number; used: number } {
  if (getUserIsBot(userId)) {
    const limit = BOT_SIM_DAY_LIMITS[actionType];
    if (limit == null) return { allowed: true, limit: 0, used: 0 };
    const used = getBotSimDayCount(userId, actionType, getCurrentSimDay());
    return { allowed: used < limit, limit, used };
  }
  const limit = USER_DAILY_LIMITS[actionType];
  if (limit == null) return { allowed: true, limit: 0, used: 0 };
  const used = getUserDailyCount(userId, actionType);
  return { allowed: used < limit, limit, used };
}

/**
 * Build a quota object for inclusion in a successful action response.
 * Pass the `used` value from the pre-action `checkUserDailyLimit` call —
 * this helper assumes the action has just been logged, so it adds 1 to
 * compute the post-action `used` and `remaining`. Returns `null` when
 * no cap applies for this action type (e.g. some humans-only actions).
 */
export function quotaSnapshot(
  actionType: string,
  used: number,
  limit: number,
): { actionType: string; limit: number; used: number; remaining: number } | null {
  if (limit <= 0) return null;
  const newUsed = used + 1;
  return {
    actionType,
    limit,
    used: newUsed,
    remaining: Math.max(0, limit - newUsed),
  };
}
