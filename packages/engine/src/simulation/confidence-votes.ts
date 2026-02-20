import type { BillVote, Party, VoteChoice } from "@ki-bundestag/types";

export interface ConfidenceTallyResult {
  passed: boolean;
  yesSeats: number;
  noSeats: number;
  votes: BillVote[];
}

/** Absolute majority threshold in the 735-seat Bundestag */
const MAJORITY_THRESHOLD = 368;

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
      // 10% defection risk makes drama possible
      vote = Math.random() < 0.9 ? "yes" : "no";
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
      // Other opposition: 85% probability of supporting the vote
      vote = Math.random() < 0.85 ? "yes" : "no";
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
      if (passed) {
        delta = isCoalition ? 0.5 : -0.3;
      } else {
        // Government falls — coalition takes hit, opposition benefits
        delta = isCoalition ? -2.0 : 1.0;
      }
    } else {
      // misstrauensvotum
      if (passed) {
        if (party.id === proposingPartyId) {
          delta = 2.0; // Proposing party wins big
        } else if (isCoalition) {
          delta = -2.0; // Old coalition ousted
        }
        // Other opposition parties get no direct impact
      } else {
        if (isCoalition) {
          delta = 0.3; // Coalition survives attempt
        } else if (party.id === proposingPartyId) {
          delta = -0.5; // Failed motion hurts proposer
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
