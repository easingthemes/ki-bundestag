import { and, count, eq, gte } from "drizzle-orm";
import type { AgentAction, BillImpact, Party } from "@ki-bundestag/types";
import { getUserDb, schema } from "../db/index.js";
import {
  SENTIMENT_MIN, SENTIMENT_MAX, SENTIMENT_BASELINE, SENTIMENT_REVERSION_RATE,
  SENTIMENT_DRIFT_NOISE, BILL_SENTIMENT_CAP,
  APPROVAL_MIN, APPROVAL_MAX, APPROVAL_DRIFT_NOISE,
  BILL_PASS_APPROVAL, BILL_REJECT_APPROVAL,
  INACTIVITY_GRACE_DAYS, INACTIVITY_BASE_PENALTY, INACTIVITY_MAX_PENALTY, INACTIVITY_SCALE,
  ACTIVITY_BONUS,
  MEMBERSHIP_BONUS_CAP, MEMBERSHIP_BONUS_SCALE, MEMBERSHIP_BONUS_RATE, MEMBERSHIP_ACTIVE_WINDOW_DAYS,
} from "../config/index.js";

// Update approval ratings based on party actions
export function updateApproval(party: Party, delta: number): number {
  const newRating = party.approvalRating + delta;
  return clamp(Math.round(newRating * 10) / 10, APPROVAL_MIN, APPROVAL_MAX);
}

// Bills passing/failing affects proposer approval
export function approvalFromBillOutcome(passed: boolean, isProposer: boolean): number {
  if (!isProposer) return 0;
  return passed ? BILL_PASS_APPROVAL : BILL_REJECT_APPROVAL;
}

// Update public sentiment based on bill impacts (clamped to realistic range)
export function updateSentiment(currentSentiment: number, impact: BillImpact): number {
  const rawDelta = impact.publicSentiment ?? 0;
  const delta = clamp(rawDelta, -BILL_SENTIMENT_CAP, BILL_SENTIMENT_CAP);
  return clamp(Math.round((currentSentiment + delta) * 10) / 10, SENTIMENT_MIN, SENTIMENT_MAX);
}

// Daily sentiment drift — mean-reverts toward baseline + small random noise
export function applySentimentDrift(currentSentiment: number): number {
  const reversionPull = (SENTIMENT_BASELINE - currentSentiment) * SENTIMENT_REVERSION_RATE;
  const noise = (Math.random() - 0.5) * SENTIMENT_DRIFT_NOISE;
  return clamp(
    Math.round((currentSentiment + reversionPull + noise) * 10) / 10,
    SENTIMENT_MIN,
    SENTIMENT_MAX,
  );
}

// Small random drift in approval each day
export function applyApprovalDrift(party: Party): number {
  const drift = (Math.random() - 0.5) * APPROVAL_DRIFT_NOISE;
  return clamp(Math.round((party.approvalRating + drift) * 10) / 10, APPROVAL_MIN, APPROVAL_MAX);
}

/**
 * Logarithmic membership bonus: 0 active members → 0, ~10 → +0.026/day, ~100 → +0.05/day
 * Hard cap: +5 approval points max per day (only reachable with ~1000+ members)
 */
export function membershipBonus(activeMembers: number): number {
  if (activeMembers <= 0) return 0;
  const bonus = Math.min(MEMBERSHIP_BONUS_CAP, Math.log10(activeMembers + 1) * MEMBERSHIP_BONUS_SCALE);
  return Math.round(bonus * MEMBERSHIP_BONUS_RATE * 100) / 100;
}

/**
 * Determine whether a party was meaningfully active on a given day.
 * "Meaningful" = anything beyond abstain-only votes:
 *   proposals, yes/no votes, statements, motions, interpellations, etc.
 */
export function isPartyActive(actions: AgentAction[]): boolean {
  for (const a of actions) {
    if (a.type === "nothing") continue;
    if (a.type === "vote" && a.vote === "abstain") continue;
    return true; // any non-abstain, non-nothing action counts
  }
  return false;
}

/**
 * Calculate the inactivity penalty for a party based on consecutive inactive days.
 * Returns a positive number (the amount to subtract from approval).
 */
export function inactivityPenalty(consecutiveDays: number): number {
  if (consecutiveDays <= INACTIVITY_GRACE_DAYS) return 0;
  const effective = consecutiveDays - INACTIVITY_GRACE_DAYS;
  return Math.min(INACTIVITY_MAX_PENALTY, INACTIVITY_BASE_PENALTY + effective * INACTIVITY_SCALE);
}

/**
 * Apply daily approval drift, membership bonus, and inactivity penalty to all parties.
 * Mutates each party's approvalRating and inactiveDays in place.
 *
 * @param actionsMap — map of partyId → actions taken this day. If omitted,
 *   no inactivity tracking is applied (backwards compatible).
 */
export function applyDailyApprovalDrift(
  parties: Party[],
  actionsMap?: Map<string, AgentAction[]>,
): void {
  const TWO_WEEKS_MS = MEMBERSHIP_ACTIVE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  for (const party of parties) {
    party.approvalRating = applyApprovalDrift(party);

    // Inactivity tracking + penalty / activity bonus
    if (actionsMap) {
      const actions = actionsMap.get(party.id) ?? [];
      if (isPartyActive(actions)) {
        party.inactiveDays = 0;
        // Small reward for being active
        party.approvalRating = clamp(
          Math.round((party.approvalRating + ACTIVITY_BONUS) * 10) / 10,
          APPROVAL_MIN, APPROVAL_MAX,
        );
      } else {
        party.inactiveDays = (party.inactiveDays ?? 0) + 1;
        const penalty = inactivityPenalty(party.inactiveDays);
        if (penalty > 0) {
          party.approvalRating = clamp(
            Math.round((party.approvalRating - penalty) * 10) / 10,
            APPROVAL_MIN, APPROVAL_MAX,
          );
        }
      }
    }

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
        party.approvalRating = Math.max(APPROVAL_MIN, Math.min(APPROVAL_MAX,
          Math.round((party.approvalRating + bonus) * 10) / 10,
        ));
      }
    } catch { /* table may not exist in old DBs */ }
  }
}

/**
 * Zero-sum normalization: after all daily approval changes, redistribute so that
 * the total approval across all parties stays roughly constant.
 *
 * In real politics, approval is roughly zero-sum — if one party gains 3%,
 * that support comes from other parties. This function enforces that constraint.
 *
 * @param parties — current parties (with already-modified approvalRating)
 * @param startingApprovals — map of partyId → approval at start of day
 * @param redistributionRate — fraction of net change to redistribute (0.8 = 80%)
 */
export function normalizeApprovalChanges(
  parties: Party[],
  startingApprovals: Map<string, number>,
  redistributionRate = 0.8,
): void {
  if (parties.length <= 1) return;

  // Calculate net change across all parties
  let totalDelta = 0;
  for (const party of parties) {
    const start = startingApprovals.get(party.id) ?? party.approvalRating;
    totalDelta += party.approvalRating - start;
  }

  // If net change is negligible, skip
  if (Math.abs(totalDelta) < 0.05) return;

  // Redistribute: subtract proportional share from each party based on current approval
  const amountToRedistribute = totalDelta * redistributionRate;
  const totalApproval = parties.reduce((sum, p) => sum + p.approvalRating, 0);

  if (totalApproval <= 0) return;

  for (const party of parties) {
    const share = party.approvalRating / totalApproval;
    party.approvalRating = clamp(
      Math.round((party.approvalRating - amountToRedistribute * share) * 10) / 10,
      1, 60,
    );
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
