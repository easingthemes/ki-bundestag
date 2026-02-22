import type { Bill, EconomyState, Party } from "@ki-bundestag/types";
import { TIME_CONFIG } from "./timing.js";
import { snapToNextWorkday, isRealisticSessionDay } from "./calendar.js";

/**
 * Calendar-aware cycle check: a modulo hit is snapped forward to the
 * next workday. The day matches if it equals the snapped target.
 * When `startDate` is omitted, falls back to pure modulo (legacy).
 */
function calendarCycleHit(day: number, interval: number, startDate?: Date): boolean {
  if (day <= 0) return false;
  if (!startDate) return day % interval === 0;
  // Find the latest modulo-hit at or before `day`
  const cycleHit = Math.floor(day / interval) * interval;
  if (cycleHit <= 0) return false;
  return snapToNextWorkday(cycleHit, startDate) === day;
}

export function isPollDay(day: number, startDate?: Date): boolean {
  return calendarCycleHit(day, TIME_CONFIG.POLL_INTERVAL, startDate);
}

/** @deprecated Use isPollDay instead */
export const isWeeklyDay = isPollDay;

export function isMonthlyDay(day: number, startDate?: Date): boolean {
  return calendarCycleHit(day, TIME_CONFIG.ECONOMY_INTERVAL, startDate);
}

export function isBudgetDay(day: number, startDate?: Date): boolean {
  return calendarCycleHit(day, TIME_CONFIG.BUDGET_INTERVAL, startDate);
}

export function isSessionDay(day: number, startDate?: Date): boolean {
  if (startDate) return isRealisticSessionDay(day, startDate);
  return day > 0 && day % TIME_CONFIG.SESSION_INTERVAL === 0;
}

/**
 * Poll-day opinion recalculation:
 * - Proposers of recently passed bills get +1.0 approval
 * - Opposition bonus if sentiment < 40
 * - Coalition penalty if sentiment < 30
 */
export function weeklyOpinionRecalc(
  parties: Party[],
  bills: Bill[],
  publicSentiment: number,
  currentDay: number,
): void {
  // Bills passed since last poll day
  const recentPassed = bills.filter(
    b => b.status === "passed" && b.proposedOnDay >= currentDay - TIME_CONFIG.POLL_INTERVAL,
  );

  // Proposers of recently passed bills get approval boost
  const proposerIds = new Set(recentPassed.map(b => b.proposedBy));
  for (const party of parties) {
    if (proposerIds.has(party.id)) {
      party.approvalRating = clamp(
        Math.round((party.approvalRating + 1.0) * 10) / 10,
        1, 60,
      );
    }
  }

  // Opposition bonus if sentiment is low
  if (publicSentiment < 40) {
    for (const party of parties) {
      if (party.coalitionRole === "opposition") {
        party.approvalRating = clamp(
          Math.round((party.approvalRating + 0.5) * 10) / 10,
          1, 60,
        );
      }
    }
  }

  // Coalition penalty if sentiment very low
  if (publicSentiment < 30) {
    for (const party of parties) {
      if (party.coalitionRole !== "opposition") {
        party.approvalRating = clamp(
          Math.round((party.approvalRating - 0.5) * 10) / 10,
          1, 60,
        );
      }
    }
  }
}

/**
 * Monthly economic report — formatted summary string.
 */
export function monthlyEconomicReport(economy: EconomyState, currentDay: number): string {
  return [
    `=== Monthly Economic Report — Day ${currentDay} ===`,
    `Budget: ${economy.budget}B EUR`,
    `Unemployment: ${economy.unemployment}%`,
    `Inflation: ${economy.inflation}%`,
    `GDP Growth: ${economy.gdpGrowth}%`,
  ].join("\n");
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
