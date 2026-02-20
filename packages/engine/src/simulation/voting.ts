import type { Amendment, Bill, BillImpact, BillVote, Party } from "@ki-bundestag/types";

export interface VoteResult {
  passed: boolean;
  yesSeats: number;
  noSeats: number;
  abstainSeats: number;
  totalVotingSeats: number;
}

// Seat-weighted majority voting. Abstentions don't count toward the total.
export function tallyVotes(bill: Bill, parties: Party[]): VoteResult {
  const partyMap = new Map(parties.map(p => [p.id, p]));

  let yesSeats = 0;
  let noSeats = 0;
  let abstainSeats = 0;

  for (const vote of bill.votes) {
    const party = partyMap.get(vote.partyId);
    if (!party) continue;

    switch (vote.vote) {
      case "yes":
        yesSeats += party.seatCount;
        break;
      case "no":
        noSeats += party.seatCount;
        break;
      case "abstain":
        abstainSeats += party.seatCount;
        break;
    }
  }

  const totalVotingSeats = yesSeats + noSeats; // abstentions excluded
  const passed = totalVotingSeats > 0 && yesSeats > noSeats;

  return { passed, yesSeats, noSeats, abstainSeats, totalVotingSeats };
}

/**
 * Algorithmic amendment vote tally.
 * Same-party: always yes. Coalition-aligned: 90% yes. Opposition: 90% no, 10% crossover.
 */
export function tallyAmendmentVotes(
  amendment: Amendment,
  bill: Bill,
  parties: Party[],
  coalitionParties: string[],
): { accepted: boolean; votes: BillVote[] } {
  const votes: BillVote[] = [];
  let yesSeats = 0;
  let noSeats = 0;

  for (const party of parties) {
    if (party.seatCount <= 0) continue;

    let vote: "yes" | "no";
    let reason: string;

    if (party.id === amendment.proposedBy) {
      vote = "yes";
      reason = "Eigener Änderungsantrag";
    } else if (coalitionParties.includes(party.id) && coalitionParties.includes(amendment.proposedBy)) {
      // Coalition alignment: 90% yes
      vote = Math.random() < 0.9 ? "yes" : "no";
      reason = vote === "yes" ? "Koalitionsdisziplin" : "Abweichende Position innerhalb der Koalition";
    } else if (!coalitionParties.includes(party.id) && !coalitionParties.includes(amendment.proposedBy)) {
      // Both opposition: 70% yes
      vote = Math.random() < 0.7 ? "yes" : "no";
      reason = vote === "yes" ? "Gemeinsame Opposition" : "Unterschiedliche Prioritäten";
    } else {
      // Opposition vs coalition or vice versa: 90% no
      vote = Math.random() < 0.1 ? "yes" : "no";
      reason = vote === "yes" ? "Sachlich überzeugend" : "Politisch nicht tragbar";
    }

    votes.push({ partyId: party.id, vote, reason });

    if (vote === "yes") yesSeats += party.seatCount;
    else noSeats += party.seatCount;
  }

  return { accepted: yesSeats > noSeats, votes };
}

/**
 * Merge an accepted amendment's impactChange into a bill's impact.
 * Saves the original impact before first modification.
 */
export function applyAmendmentToBill(bill: Bill, amendment: Amendment): void {
  if (!bill.originalImpact) {
    bill.originalImpact = { ...bill.impact };
  }

  const change = amendment.impactChange;
  if (change.budget != null) bill.impact.budget = (bill.impact.budget ?? 0) + change.budget;
  if (change.unemployment != null) bill.impact.unemployment = (bill.impact.unemployment ?? 0) + change.unemployment;
  if (change.inflation != null) bill.impact.inflation = (bill.impact.inflation ?? 0) + change.inflation;
  if (change.gdpGrowth != null) bill.impact.gdpGrowth = (bill.impact.gdpGrowth ?? 0) + change.gdpGrowth;
  if (change.publicSentiment != null) bill.impact.publicSentiment = (bill.impact.publicSentiment ?? 0) + change.publicSentiment;
}
