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

// ── Kanzlerwahl (Art. 63 GG, Cycle 2a) ───────────────────────────────
/** Phase-2 window (Art. 63 Abs. 3 GG): 14 days for parliament to elect a
 *  Chancellor with absolute majority before the final phase triggers. */
export const KANZLERWAHL_PHASE2_WINDOW_DAYS = 14;
/** Sim-only cap to prevent infinite Phase-2 rounds when the AI keeps losing
 *  ties. Real Art. 63 has no explicit round cap but sim drama needs one. */
export const KANZLERWAHL_PHASE2_MAX_ROUNDS = 3;

/**
 * Parties that all others refuse to form a coalition with (Brandmauer).
 * Only considered as a last resort when no other majority is possible.
 */
export const PARIAH_PARTIES = new Set(["afd"]);
