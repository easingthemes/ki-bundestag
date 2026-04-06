/**
 * Election & coalition configuration.
 *
 * Controls Bundestag size, majority thresholds, electoral rules,
 * snap election triggers, and pariah party designations.
 */

/** Total seats in the Bundestag */
export const TOTAL_SEATS = 735;
/** Absolute majority threshold (>50%) */
export const MAJORITY_SEATS = 368;
/** Minimum vote share to enter parliament */
export const ELECTORAL_THRESHOLD = 5;
/** Gaussian noise stddev on vote shares during election */
export const ELECTION_NOISE_STDDEV = 2;

/** Days after government formation during which snap elections cannot trigger */
export const ELECTION_COOLDOWN_DAYS = 30;
/** Consecutive low-sentiment days needed to trigger snap election */
export const LOW_SENTIMENT_STREAK_THRESHOLD = 5;

/**
 * Parties that all others refuse to form a coalition with (Brandmauer).
 * Only considered as a last resort when no other majority is possible.
 */
export const PARIAH_PARTIES = new Set(["afd"]);
