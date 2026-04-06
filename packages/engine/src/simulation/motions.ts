import type { Motion, Party, BillVote } from "@ki-bundestag/types";
import {
  MOTION_COALITION_YES_RATE, MOTION_OPPOSITION_YES_RATE, MOTION_CROSS_YES_RATE,
  MOTION_PASSED_SENTIMENT, RESOLUTION_PASSED_SENTIMENT,
} from "../config/index.js";

/**
 * Algorithmic vote tally for motions/resolutions.
 */
export function tallyMotionVotes(
  motion: Motion,
  parties: Party[],
  coalitionParties: string[],
): { passed: boolean; votes: BillVote[] } {
  const votes: BillVote[] = [];
  let yesSeats = 0;
  let noSeats = 0;

  const proposerIsCoalition = coalitionParties.includes(motion.proposedBy);

  for (const party of parties) {
    if (party.seatCount <= 0) continue;

    let vote: "yes" | "no";
    let reason: string;

    if (party.id === motion.proposedBy) {
      vote = "yes";
      reason = "Eigener Antrag";
    } else if (coalitionParties.includes(party.id) && proposerIsCoalition) {
      vote = Math.random() < MOTION_COALITION_YES_RATE ? "yes" : "no";
      reason = vote === "yes" ? "Koalitionsunterstützung" : "Abweichende Position";
    } else if (!coalitionParties.includes(party.id) && !proposerIsCoalition) {
      vote = Math.random() < MOTION_OPPOSITION_YES_RATE ? "yes" : "no";
      reason = vote === "yes" ? "Gemeinsame Oppositionslinie" : "Unterschiedliche Prioritäten";
    } else {
      vote = Math.random() < MOTION_CROSS_YES_RATE ? "yes" : "no";
      reason = vote === "yes" ? "Sachlich überzeugend" : "Politisch nicht tragbar";
    }

    votes.push({ partyId: party.id, vote, reason });

    if (vote === "yes") yesSeats += party.seatCount;
    else noSeats += party.seatCount;
  }

  return { passed: yesSeats > noSeats, votes };
}

/**
 * Sentiment impact for a passed motion.
 * Motions: +0.3, Resolutions: +0.2
 */
export function motionSentimentImpact(motion: Motion): number {
  if (motion.status !== "passed") return 0;
  return motion.type === "motion" ? MOTION_PASSED_SENTIMENT : RESOLUTION_PASSED_SENTIMENT;
}
