import { and, count, eq, gte } from "drizzle-orm";
import type { BillImpact, Party } from "@ki-bundestag/types";
import { getUserDb, schema } from "../db/index.js";

const SENTIMENT_MIN = 5;
const SENTIMENT_MAX = 75;
const SENTIMENT_BASELINE = 45;
const SENTIMENT_REVERSION_RATE = 0.03;

// Update approval ratings based on party actions
export function updateApproval(party: Party, delta: number): number {
  const newRating = party.approvalRating + delta;
  return clamp(Math.round(newRating * 10) / 10, 1, 60);
}

// Bills passing/failing affects proposer approval
export function approvalFromBillOutcome(passed: boolean, isProposer: boolean): number {
  if (!isProposer) return 0;
  return passed ? 0.3 : -0.2;
}

// Update public sentiment based on bill impacts (clamped to realistic range)
export function updateSentiment(currentSentiment: number, impact: BillImpact): number {
  // Cap the per-bill sentiment swing to ±2 to prevent AI from gaming the system
  const rawDelta = impact.publicSentiment ?? 0;
  const delta = clamp(rawDelta, -2, 2);
  return clamp(Math.round((currentSentiment + delta) * 10) / 10, SENTIMENT_MIN, SENTIMENT_MAX);
}

// Daily sentiment drift — mean-reverts toward baseline + small random noise
export function applySentimentDrift(currentSentiment: number): number {
  const reversionPull = (SENTIMENT_BASELINE - currentSentiment) * SENTIMENT_REVERSION_RATE;
  const noise = (Math.random() - 0.5) * 0.4; // was 0.6 — tighter daily noise
  return clamp(
    Math.round((currentSentiment + reversionPull + noise) * 10) / 10,
    SENTIMENT_MIN,
    SENTIMENT_MAX,
  );
}

// Small random drift in approval each day
export function applyApprovalDrift(party: Party): number {
  const drift = (Math.random() - 0.5) * 0.4;
  return clamp(Math.round((party.approvalRating + drift) * 10) / 10, 1, 60);
}

/**
 * Logarithmic membership bonus: 0 active members → 0, ~10 → +0.026/day, ~100 → +0.05/day
 * Hard cap: +5 approval points max per day (only reachable with ~1000+ members)
 */
export function membershipBonus(activeMembers: number): number {
  if (activeMembers <= 0) return 0;
  const bonus = Math.min(5, Math.log10(activeMembers + 1) * 2.5);
  return Math.round(bonus * 0.01 * 100) / 100; // e.g. 2.6 → 0.026
}

/**
 * Apply daily approval drift and membership bonus to all parties.
 * Mutates each party's approvalRating in place.
 */
export function applyDailyApprovalDrift(parties: Party[]): void {
  const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;
  for (const party of parties) {
    party.approvalRating = applyApprovalDrift(party);
    // Membership bonus: tiny daily reward for engaged party members
    try {
      const activeCount = getUserDb().select({ cnt: count() }).from(schema.users)
        .where(and(
          eq(schema.users.partyId, party.id),
          gte(schema.users.lastActive, Date.now() - TWO_WEEKS_MS),
        ))
        .get()?.cnt ?? 0;
      if (activeCount > 0) {
        const bonus = membershipBonus(activeCount);
        party.approvalRating = Math.max(1, Math.min(60,
          Math.round((party.approvalRating + bonus) * 10) / 10,
        ));
      }
    } catch { /* table may not exist in old DBs */ }
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
