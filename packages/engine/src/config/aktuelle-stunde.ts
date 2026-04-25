/**
 * Cycle 2b PR 6 — Aktuelle Stunde configuration.
 *
 * Aktuelle Stunde fires in two modes:
 *   - crisis-hooked: a `crisis_start` with severity >= MIN schedules a session
 *     on the next Thursday Sitzungstag
 *   - baseline: a Poisson tick on each new Sitzungswoche, 1–2 per month
 * Dedup: at most one Aktuelle Stunde per Sitzungswoche.
 *
 * See `docs/plans/043-cycle2b-spec.md` §Design Piece 4.
 */

import type { CrisisSeverity } from "@ki-bundestag/types";

/** Minimum crisis severity that auto-triggers an Aktuelle Stunde. */
export const AKTUELLE_STUNDE_CRISIS_SEVERITY_MIN: CrisisSeverity = "high";

/** Expected baseline Aktuelle-Stunden per month (Poisson λ). */
export const AKTUELLE_STUNDE_BASELINE_MONTHLY_RATE = 1.5;

/** Cap per Sitzungswoche (real Bundestag almost never schedules two). */
export const AKTUELLE_STUNDE_PER_WEEK_MAX = 1;

/** Preferred weekday for Aktuelle Stunde (Mon=1, …, Thu=4). */
export const AKTUELLE_STUNDE_TARGET_WEEKDAY = 4;

/** Max attempts before the AI batch fallback fills in neutral positions. */
export const AKTUELLE_STUNDE_MAX_BATCH_ATTEMPTS = 3;

/** Fallback positions used if the batch AI fails beyond MAX_BATCH_ATTEMPTS. */
export const AKTUELLE_STUNDE_FALLBACK = {
  government: "Die Bundesregierung hat ihre Position zu diesem Thema bereits im Plenum dargelegt.",
  opposition: "Die Oppositionsfraktion fordert klare Antworten und schnelle Maßnahmen.",
} as const;
