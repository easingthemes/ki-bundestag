/**
 * Election & coalition configuration.
 *
 * Controls Bundestag size, majority thresholds, electoral rules,
 * snap election triggers, and pariah party designations.
 */

/**
 * Total seats in the Bundestag (Cycle 3 PR 3, Q5).
 * 2023 Wahlrechtsreform caps the Bundestag at 630 seats — no more
 * Überhang/Ausgleichsmandate. Was 735 pre-reform.
 */
export const BUNDESTAG_SIZE = 630;
/** Absolute majority threshold (>50%): Math.ceil(630/2) + 1 = 316. Was 368. */
export const MAJORITY_SEATS = 316;
/** @deprecated Use BUNDESTAG_SIZE. Kept as alias for one cycle to avoid touching every callsite at once. */
export const TOTAL_SEATS = BUNDESTAG_SIZE;
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

// ── Confidence-vote gates (Cycle 3 PR 2, Q3 hybrid) ──────────────────
/**
 * Vertrauensfrage gate (Q3): only open when government is genuinely fragile.
 * Real Bundestag fires Vertrauensfrage ~4× / 75 yr ≈ 0.05/yr; the old impl
 * over-fired by 100×. Three concurrent conditions must hold for the gate
 * to be open.
 */
/** Government parties' weighted approval must be < 25 for at least this many sim days. */
export const VERTRAUENSFRAGE_GATE_LOW_APPROVAL_DAYS = 30;
/** Coalition seat margin above majority threshold beyond which Vertrauensfrage is structurally pointless. */
export const VERTRAUENSFRAGE_GATE_FRAGILE_MARGIN = 5;
/** Government honeymoon — no Vertrauensfrage in the first N sim days after Amtseid. */
export const VERTRAUENSFRAGE_HONEYMOON_DAYS = 90;

/**
 * Konstruktives Misstrauensvotum gate (Q3): only open when an alternative
 * coalition is mathematically possible AND the government has been in office
 * long enough for opposition to coordinate.
 */
/** No Misstrauensvotum in the first N sim days after Amtseid. */
export const MISSTRAUENSVOTUM_GATE_HONEYMOON_DAYS = 180;

// Note: spec piece 2 also mentions CONFIDENCE_VOTE_DAILY_PROBABILITY = 0.005
// as a residual probability roll inside open gates. Deferred — the agent-action
// gate filter alone produces the target ~0.05/yr rate. Re-introduce as a forced
// trigger if a 4-year sim shows agents systematically failing to fire during
// open windows.
