import type { Bill, EconomyState, Party } from "@ki-bundestag/types";
import { TIME_CONFIG } from "./timing.js";

export function isPollDay(day: number): boolean {
  return day > 0 && day % TIME_CONFIG.POLL_INTERVAL === 0;
}

/** @deprecated Use isPollDay instead */
export const isWeeklyDay = isPollDay;

export function isMonthlyDay(day: number): boolean {
  return day > 0 && day % TIME_CONFIG.ECONOMY_INTERVAL === 0;
}

export function isBudgetDay(day: number): boolean {
  return day > 0 && day % TIME_CONFIG.BUDGET_INTERVAL === 0;
}

export function isSessionDay(day: number): boolean {
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
