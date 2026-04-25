import type { BillVote, Party, VoteChoice } from "@ki-bundestag/types";
import {
  MAJORITY_SEATS as MAJORITY_THRESHOLD,
  VERTRAUENSFRAGE_COALITION_YES_RATE,
  MISSTRAUENSVOTUM_OPPOSITION_YES_RATE,
  CONFIDENCE_IMPACTS,
  VERTRAUENSFRAGE_GATE_LOW_APPROVAL_DAYS,
  VERTRAUENSFRAGE_GATE_FRAGILE_MARGIN,
  VERTRAUENSFRAGE_HONEYMOON_DAYS,
  MISSTRAUENSVOTUM_GATE_HONEYMOON_DAYS,
  FRAKTION_THRESHOLD,
} from "../config/index.js";
import { clampApproval } from "./opinion.js";

export interface ConfidenceTallyResult {
  passed: boolean;
  yesSeats: number;
  noSeats: number;
  votes: BillVote[];
}

/**
 * Vertrauensfrage: Chancellor requests confidence.
 * Coalition votes YES with 90% probability (10% defection risk).
 * Opposition always votes NO.
 * Passes if yesSeats >= 368.
 */
export function tallyVertrauensfrage(
  allParties: Party[],
  coalitionParties: string[],
): ConfidenceTallyResult {
  const votes: BillVote[] = [];
  let yesSeats = 0;
  let noSeats = 0;

  for (const party of allParties) {
    if (party.seatCount <= 0) continue;

    const isCoalition = coalitionParties.includes(party.id);
    let vote: VoteChoice;

    if (isCoalition) {
      vote = Math.random() < VERTRAUENSFRAGE_COALITION_YES_RATE ? "yes" : "no";
    } else {
      vote = "no";
    }

    votes.push({
      partyId: party.id,
      vote,
      reason: vote === "yes" ? "Coalition solidarity — supports Chancellor's mandate" : "Opposition against government",
    });

    if (vote === "yes") yesSeats += party.seatCount;
    else noSeats += party.seatCount;
  }

  return { passed: yesSeats >= MAJORITY_THRESHOLD, yesSeats, noSeats, votes };
}

/**
 * Konstruktives Misstrauensvotum: Opposition proposes replacement Chancellor.
 * Proposing party always YES. Other opposition YES with 85% probability.
 * Coalition always NO.
 * Passes if yesSeats >= 368 → new government formed without election.
 */
export function tallyMisstrauensvotum(
  allParties: Party[],
  coalitionParties: string[],
  proposingPartyId: string,
): ConfidenceTallyResult {
  const votes: BillVote[] = [];
  let yesSeats = 0;
  let noSeats = 0;

  for (const party of allParties) {
    if (party.seatCount <= 0) continue;

    const isCoalition = coalitionParties.includes(party.id);
    let vote: VoteChoice;

    if (party.id === proposingPartyId) {
      vote = "yes";
    } else if (!isCoalition) {
      vote = Math.random() < MISSTRAUENSVOTUM_OPPOSITION_YES_RATE ? "yes" : "no";
    } else {
      vote = "no";
    }

    votes.push({
      partyId: party.id,
      vote,
      reason: vote === "yes" ? "Supports replacement government" : "Defends coalition government",
    });

    if (vote === "yes") yesSeats += party.seatCount;
    else noSeats += party.seatCount;
  }

  return { passed: yesSeats >= MAJORITY_THRESHOLD, yesSeats, noSeats, votes };
}

/**
 * Apply approval rating changes to parties after a confidence vote.
 * Mutates party.approvalRating in place (clamped 5–75).
 */
export function confidenceVoteSentimentImpact(
  type: "vertrauensfrage" | "misstrauensvotum",
  passed: boolean,
  allParties: Party[],
  coalitionParties: string[],
  proposingPartyId?: string,
): void {
  for (const party of allParties) {
    const isCoalition = coalitionParties.includes(party.id);
    let delta = 0;

    if (type === "vertrauensfrage") {
      const impacts = passed ? CONFIDENCE_IMPACTS.vertrauensfrage.passed : CONFIDENCE_IMPACTS.vertrauensfrage.failed;
      delta = isCoalition ? impacts.coalition : impacts.opposition;
    } else {
      if (passed) {
        if (party.id === proposingPartyId) {
          delta = CONFIDENCE_IMPACTS.misstrauensvotum.passed.proposer;
        } else if (isCoalition) {
          delta = CONFIDENCE_IMPACTS.misstrauensvotum.passed.coalition;
        }
      } else {
        if (isCoalition) {
          delta = CONFIDENCE_IMPACTS.misstrauensvotum.failed.coalition;
        } else if (party.id === proposingPartyId) {
          delta = CONFIDENCE_IMPACTS.misstrauensvotum.failed.proposer;
        }
      }
    }

    if (delta !== 0) {
      party.approvalRating = clampApproval(party.approvalRating + delta);
    }
  }
}

// ── Cycle 3 PR 2: structural gates (Q3 hybrid) ───────────────────────

/**
 * Vertrauensfrage gate. Three concurrent conditions for the gate to open:
 *   1. Government parties' weighted approval has been below 25 for
 *      ≥ VERTRAUENSFRAGE_GATE_LOW_APPROVAL_DAYS (default 30) sim days
 *   2. Coalition seat margin is below MAJORITY_SEATS + 5 (genuinely fragile)
 *   3. Government has been in office for ≥ VERTRAUENSFRAGE_HONEYMOON_DAYS
 *      (default 90) — Chancellor doesn't call confidence vote in honeymoon
 *
 * `coalitionSeats` is the sum of seat counts across all coalition parties.
 * `lowGovernmentApprovalStreak` is read from `simulation_meta`.
 */
export function vertrauensfrageGateOpen(
  coalitionSeats: number,
  governmentFormedOnDay: number,
  currentDay: number,
  lowGovernmentApprovalStreak: number,
): boolean {
  if (lowGovernmentApprovalStreak < VERTRAUENSFRAGE_GATE_LOW_APPROVAL_DAYS) return false;
  if (coalitionSeats >= MAJORITY_THRESHOLD + VERTRAUENSFRAGE_GATE_FRAGILE_MARGIN) return false;
  if (currentDay - governmentFormedOnDay < VERTRAUENSFRAGE_HONEYMOON_DAYS) return false;
  return true;
}

/**
 * Konstruktives Misstrauensvotum gate. Two conditions:
 *   1. Government has been in office ≥ MISSTRAUENSVOTUM_GATE_HONEYMOON_DAYS
 *      (default 180) — opposition needs time to coordinate alternative
 *   2. Opposition holds enough seats AND a Fraktion-bearing candidate
 *      exists to potentially beat the coalition
 *
 * Path-to-majority math: opposition seats + 1 must reach MAJORITY_THRESHOLD,
 * which is equivalent to oppositionSeats >= MAJORITY_THRESHOLD - coalitionSeats + 1.
 */
export function misstrauensvotumGateOpen(
  parties: Party[],
  coalitionPartyIds: string[],
  governmentFormedOnDay: number,
  currentDay: number,
): boolean {
  if (currentDay - governmentFormedOnDay < MISSTRAUENSVOTUM_GATE_HONEYMOON_DAYS) return false;
  const coalitionSet = new Set(coalitionPartyIds);
  const coalitionSeats = parties.filter(p => coalitionSet.has(p.id)).reduce((s, p) => s + p.seatCount, 0);
  const oppositionSeats = parties.filter(p => !coalitionSet.has(p.id)).reduce((s, p) => s + p.seatCount, 0);
  if (oppositionSeats < MAJORITY_THRESHOLD - coalitionSeats + 1) return false;
  return pickKonstruktivCandidate(parties, coalitionPartyIds) !== null;
}

/**
 * Pick the largest Fraktion-bearing opposition party as the konstruktiv
 * candidate (S3). Tie-break: higher approval, then lexicographic party id
 * (deterministic — important for reproducible regression tests).
 *
 * Returns null if no opposition party meets the Fraktion threshold.
 */
export function pickKonstruktivCandidate(
  parties: Party[],
  coalitionPartyIds: string[],
): Party | null {
  const coalitionSet = new Set(coalitionPartyIds);
  const eligible = parties.filter(p => !coalitionSet.has(p.id) && p.seatCount >= FRAKTION_THRESHOLD);
  if (eligible.length === 0) return null;
  return eligible
    .slice()
    .sort((a, b) => {
      if (a.seatCount !== b.seatCount) return b.seatCount - a.seatCount;
      if (a.approvalRating !== b.approvalRating) return b.approvalRating - a.approvalRating;
      return a.id.localeCompare(b.id);
    })[0];
}
