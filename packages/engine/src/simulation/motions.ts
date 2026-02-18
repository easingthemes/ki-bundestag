import type { Motion, Party, BillVote } from "@ki-bundestag/types";

/**
 * Algorithmic vote tally for motions/resolutions.
 * Same-party: always yes. Coalition alignment: 80% yes. Opposition alignment: 70% yes.
 * Cross-alignment: 80% no.
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
      // Coalition on coalition motion: 80% yes
      vote = Math.random() < 0.8 ? "yes" : "no";
      reason = vote === "yes" ? "Koalitionsunterstützung" : "Abweichende Position";
    } else if (!coalitionParties.includes(party.id) && !proposerIsCoalition) {
      // Opposition on opposition motion: 70% yes
      vote = Math.random() < 0.7 ? "yes" : "no";
      reason = vote === "yes" ? "Gemeinsame Oppositionslinie" : "Unterschiedliche Prioritäten";
    } else {
      // Cross-alignment: 80% no
      vote = Math.random() < 0.2 ? "yes" : "no";
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
  return motion.type === "motion" ? 0.3 : 0.2;
}
