/**
 * Public opinion & approval rating configuration.
 *
 * Controls sentiment drift, approval ranges, inactivity penalties,
 * membership bonuses, and bill-outcome impacts.
 */

// ── Sentiment ───────────────────────────────────────────────────────
export const SENTIMENT_MIN = 5;
export const SENTIMENT_MAX = 75;
export const SENTIMENT_BASELINE = 45;
/** Daily mean-reversion pull toward SENTIMENT_BASELINE */
export const SENTIMENT_REVERSION_RATE = 0.03;
/** Daily random noise magnitude (±half this value) */
export const SENTIMENT_DRIFT_NOISE = 0.4;
/** Max per-bill sentiment swing (clamped to prevent AI gaming) */
export const BILL_SENTIMENT_CAP = 2;

// ── Approval ────────────────────────────────────────────────────────
export const APPROVAL_MIN = 1;
export const APPROVAL_MAX = 60;
/** Daily random noise magnitude for approval drift */
export const APPROVAL_DRIFT_NOISE = 0.4;
/** Zero-sum redistribution rate (1.0 = 100% of net change redistributed, fully zero-sum) */
export const APPROVAL_REDISTRIBUTION_RATE = 1.0;

// ── Bill outcome impacts ────────────────────────────────────────────
/** Approval gain for proposer when bill passes */
export const BILL_PASS_APPROVAL = 0.3;
/** Approval loss for proposer when bill is rejected */
export const BILL_REJECT_APPROVAL = -0.2;

// ── Inactivity penalty ──────────────────────────────────────────────
/** Grace period before penalty kicks in (parliamentary recesses are normal) */
export const INACTIVITY_GRACE_DAYS = 5;
/** Base penalty per day once grace period expires */
export const INACTIVITY_BASE_PENALTY = 0.05;
/** Maximum daily penalty (reached after ~55 consecutive inactive days) */
export const INACTIVITY_MAX_PENALTY = 0.15;
/** Penalty grows as BASE + days * SCALE, capped at MAX */
export const INACTIVITY_SCALE = 0.002;
/** Activity resets inactivity counter but gives no free approval */
export const ACTIVITY_BONUS = 0;

// ── Membership bonus ────────────────────────────────────────────────
/** Max approval bonus per day from active members (logarithmic, ~1000+ members needed) */
export const MEMBERSHIP_BONUS_CAP = 5;
/** Membership bonus scaling factor */
export const MEMBERSHIP_BONUS_SCALE = 2.5;
/** Membership bonus percentage (applied as bonus * 0.01) */
export const MEMBERSHIP_BONUS_RATE = 0.01;
/** "Active" means active within this many days */
export const MEMBERSHIP_ACTIVE_WINDOW_DAYS = 14;

// ── Poll result impacts ─────────────────────────────────────────────
/** Approval boost for top-voted party in preference polls */
export const POLL_WINNER_APPROVAL_BOOST = 0.3;
