import type { BillVote, Party, VoteChoice } from "@ki-bundestag/types";
import {
  MAJORITY_SEATS as MAJORITY_THRESHOLD,
  VERTRAUENSFRAGE_COALITION_YES_RATE,
  MISSTRAUENSVOTUM_OPPOSITION_YES_RATE,
  CONFIDENCE_IMPACTS,
} from "../config/index.js";

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
      party.approvalRating = Math.max(5, Math.min(75,
        Math.round((party.approvalRating + delta) * 10) / 10,
      ));
    }
  }
}
