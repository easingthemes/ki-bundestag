import rateLimit from "express-rate-limit";
import { getUserSqlite } from "@ki-bundestag/engine";

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
// Per-user 24h rolling window caps
// ---------------------------------------------------------------------------

/**
 * Per-user daily limits for content-generating actions (24h rolling window).
 * These caps are preset-independent — they bound what a real human can realistically
 * do in a day, regardless of how many sim days pass in that period.
 */
export const USER_DAILY_LIMITS: Record<string, number> = {
  submit_question: 5,
  submit_speech: 5,
  submit_proposal: 2,
  submit_amendment: 3,
  // apply_mdb: already limited to 1 active + cooldown, no daily cap needed
};

/**
 * Check if a user has exceeded their 24h rolling window cap for an action type.
 * Returns the count used so far, or null if no limit applies.
 */
export function getUserDailyCount(userId: string, actionType: string): number {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const userSqlite = getUserSqlite();
  const row = userSqlite.prepare(
    "SELECT COUNT(*) as cnt FROM user_actions WHERE user_id = ? AND action_type = ? AND created_at >= ?"
  ).get(userId, actionType, cutoff) as { cnt: number };
  return row.cnt;
}

/**
 * Check if a user has exceeded their daily limit for an action type.
 * Returns { allowed: true } or { allowed: false, limit, used }.
 */
export function checkUserDailyLimit(userId: string, actionType: string): { allowed: boolean; limit: number; used: number } {
  const limit = USER_DAILY_LIMITS[actionType];
  if (limit == null) return { allowed: true, limit: 0, used: 0 };
  const used = getUserDailyCount(userId, actionType);
  return { allowed: used < limit, limit, used };
}
