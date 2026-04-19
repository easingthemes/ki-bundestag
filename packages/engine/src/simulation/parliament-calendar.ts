/**
 * Parliamentary calendar — Sitzungswochen / Nicht-Sitzungswochen, Haushaltswoche,
 * and weekday semantics for the Bundestag.
 *
 * Built on the pure date math in `calendar.ts`. Keep date arithmetic there
 * and parliamentary policy here.
 *
 * Opt-out: `CALENDAR_ENFORCED=false` makes every day a Sitzungstag. Used by
 * tests and CI runs where deterministic daily advancement is required.
 */

import { dayToDate, isRecessDay, isPublicHoliday, isWorkday } from "./calendar.js";
import { CALENDAR } from "../config/parliament.js";

const DAY_MS = 86_400_000;

// ── Env gate ─────────────────────────────────────────────────────────────────

function calendarEnforced(): boolean {
  return process.env.CALENDAR_ENFORCED !== "false";
}

// ── Week helpers ─────────────────────────────────────────────────────────────

/** ISO 8601 week number (1–53). */
function isoWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7);
}

/** Monday of the calendar week containing `date` (local time, midnight). */
function mondayOf(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dow = d.getDay(); // Sun=0, Mon=1…
  const offset = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + offset);
  return d;
}

/** 1-indexed ordinal of the Monday within its month (1 = first Monday, …). */
function mondayOrdinalInMonth(monday: Date): number {
  return Math.floor((monday.getDate() - 1) / 7) + 1;
}

// ── Haushaltswoche ───────────────────────────────────────────────────────────

/**
 * One concentrated budget-debate week per year. Modelled as the 2nd Monday-week
 * of November. Overrides the alternating-week rule: Haushaltswoche always sits.
 */
export function isHaushaltsWoche(day: number, startDate: Date): boolean {
  const monday = mondayOf(dayToDate(day, startDate));
  if (monday.getMonth() !== CALENDAR.HAUSHALTS_WEEK_MONTH) return false;
  return mondayOrdinalInMonth(monday) === CALENDAR.HAUSHALTS_WEEK_OF_MONTH;
}

// ── Sitzungswochen / Sitzungstage ────────────────────────────────────────────

function wholeWeekIsRecess(monday: Date): boolean {
  for (let i = 0; i < 5; i++) {
    const d = new Date(monday.getTime() + i * DAY_MS);
    if (!isRecessDay(d) && !isPublicHoliday(d)) return false;
  }
  return true;
}

/**
 * True if `day` falls in a Bundestag sitting week.
 *
 * Rule: even ISO week, AND not fully inside a recess period.
 * Override: Haushaltswoche always counts.
 *
 * Target density ≈ 20–22 Sitzungswochen per calendar year.
 */
export function isSitzungsWoche(day: number, startDate: Date): boolean {
  if (!calendarEnforced()) return true;
  if (isHaushaltsWoche(day, startDate)) return true;
  const date = dayToDate(day, startDate);
  if (isoWeekNumber(date) % 2 !== 0) return false;
  return !wholeWeekIsRecess(mondayOf(date));
}

/**
 * True if `day` is a plenum-eligible sitting day.
 *
 * Rule: Tue–Fri, workday (not weekend, not public holiday), not in recess,
 * and within a Sitzungswoche.
 *
 * Mon is Fraktionstag (closed for plenum). Sat/Sun excluded.
 */
export function isSitzungsTag(day: number, startDate: Date): boolean {
  if (!calendarEnforced()) return true;
  if (!isWorkday(day, startDate)) return false;
  const date = dayToDate(day, startDate);
  if (isRecessDay(date)) return false;
  const dow = date.getDay();
  if (dow < 2 || dow > 5) return false; // Tue=2 … Fri=5
  return isSitzungsWoche(day, startDate);
}

/**
 * Next day (`>= day`) that is a Sitzungstag. Scans up to 100 days forward to
 * clear the worst-case gap: Jul 1 → post-Sommerpause Sitzungstag, which can
 * exceed 75 days when the first eligible week is in odd ISO-alternation.
 * Returns `day` as a fallback if nothing found (should not happen in practice).
 */
export function nextSitzungsTag(day: number, startDate: Date): number {
  if (!calendarEnforced()) return day;
  for (let i = 0; i < 100; i++) {
    if (isSitzungsTag(day + i, startDate)) return day + i;
  }
  return day;
}

// ── Weekday semantics (infrastructure for Cycle 2) ───────────────────────────

export type WeekdaySemantic = "fraktion" | "regierungsbefragung" | "plenum" | "none";

/**
 * Semantic role of the day within a Sitzungswoche.
 * Consumer for Cycle 2 (Regierungsbefragung, Fragestunde). Cycle 1 writes
 * this so the data is available but does not gate events on it.
 */
export function getWeekdaySemantic(day: number, startDate: Date): WeekdaySemantic {
  if (!isSitzungsWoche(day, startDate)) return "none";
  if (!isWorkday(day, startDate)) return "none";
  const dow = dayToDate(day, startDate).getDay();
  switch (dow) {
    case 2: return "fraktion";          // Tue — Fraktionssitzungen
    case 3: return "regierungsbefragung"; // Wed — Regierungsbefragung
    case 4:
    case 5: return "plenum";            // Thu/Fri — Plenum main debates
    default: return "none";             // Mon, Sat, Sun
  }
}
