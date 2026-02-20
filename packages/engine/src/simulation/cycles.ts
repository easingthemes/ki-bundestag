import type { Bill, EconomyState, Party } from "@ki-bundestag/types";

export function isWeeklyDay(day: number): boolean {
  return day > 0 && day % 7 === 0;
}

export function isMonthlyDay(day: number): boolean {
  return day > 0 && day % 30 === 0;
}

export function isBudgetDay(day: number): boolean {
  return day > 0 && day % 60 === 0;
}

/**
 * Weekly opinion recalculation:
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
  // Bills passed in the last 7 days
  const recentPassed = bills.filter(
    b => b.status === "passed" && b.proposedOnDay >= currentDay - 7,
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
