import rateLimit from "express-rate-limit";

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
