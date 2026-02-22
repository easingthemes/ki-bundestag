import type { Amendment, Bill, BillImpact, BillVote, Party, VoteChoice } from "@ki-bundestag/types";

export interface MdbVoteEntry {
  seatId: string;
  partyId: string;
  userId: string;
  vote: VoteChoice;
  proxyDefault: string;
  disciplineLevel: number;
}

export interface VoteResult {
  passed: boolean;
  yesSeats: number;
  noSeats: number;
  abstainSeats: number;
  totalVotingSeats: number;
  humanYes?: number;
  humanNo?: number;
  humanAbstain?: number;
}

/**
 * Seat-weighted majority voting with optional MdB (human) vote integration.
 * Abstentions don't count toward the total.
 *
 * If mdbVotes are provided, the seat count for each party is split:
 *   - Human-voted seats: counted directly per their vote
 *   - Human seats with no vote (proxy): follow party AI vote (party_line) or abstain
 *   - AI seats: follow party AI vote as before
 *
 * If no mdbVotes: works exactly as before (backward compatible).
 */
export function tallyVotes(
  bill: Bill,
  parties: Party[],
  mdbVotes?: MdbVoteEntry[],
  humanSeatCounts?: Record<string, number>,
): VoteResult {
  const partyMap = new Map(parties.map(p => [p.id, p]));

  // No MdB votes — original behavior
  if (!mdbVotes || mdbVotes.length === 0 || !humanSeatCounts) {
    let yesSeats = 0;
    let noSeats = 0;
    let abstainSeats = 0;

    for (const vote of bill.votes) {
      const party = partyMap.get(vote.partyId);
      if (!party) continue;

      switch (vote.vote) {
        case "yes": yesSeats += party.seatCount; break;
        case "no": noSeats += party.seatCount; break;
        case "abstain": abstainSeats += party.seatCount; break;
      }
    }

    const totalVotingSeats = yesSeats + noSeats;
    const passed = totalVotingSeats > 0 && yesSeats > noSeats;
    return { passed, yesSeats, noSeats, abstainSeats, totalVotingSeats };
  }

  // With MdB votes — split seat counting
  let yesSeats = 0;
  let noSeats = 0;
  let abstainSeats = 0;
  let humanYes = 0;
  let humanNo = 0;
  let humanAbstain = 0;

  // Group MdB votes by party
  const mdbByParty = new Map<string, MdbVoteEntry[]>();
  for (const mv of mdbVotes) {
    const arr = mdbByParty.get(mv.partyId) ?? [];
    arr.push(mv);
    mdbByParty.set(mv.partyId, arr);
  }

  for (const partyVote of bill.votes) {
    const party = partyMap.get(partyVote.partyId);
    if (!party) continue;

    const totalHumanSeats = humanSeatCounts[party.id] ?? 0;
    const aiSeats = party.seatCount - totalHumanSeats;
    const partyMdbVotes = mdbByParty.get(party.id) ?? [];

    // Count direct human votes
    let humanVotedCount = 0;
    for (const mv of partyMdbVotes) {
      // Whipped MdBs (level 3) are forced to party line
      const effectiveVote = mv.disciplineLevel >= 3 ? partyVote.vote : mv.vote;
      switch (effectiveVote) {
        case "yes": yesSeats++; humanYes++; break;
        case "no": noSeats++; humanNo++; break;
        case "abstain": abstainSeats++; humanAbstain++; break;
      }
      humanVotedCount++;
    }

    // Proxy for human seats without a vote
    const proxySeats = totalHumanSeats - humanVotedCount;
    if (proxySeats > 0) {
      // For proxy, we follow the party AI vote (party_line is the default)
      // Individual proxy defaults would require per-seat lookup; for simplicity,
      // all unvoted human seats follow party line
      switch (partyVote.vote) {
        case "yes": yesSeats += proxySeats; break;
        case "no": noSeats += proxySeats; break;
        case "abstain": abstainSeats += proxySeats; break;
      }
    }

    // AI seats follow party vote
    if (aiSeats > 0) {
      switch (partyVote.vote) {
        case "yes": yesSeats += aiSeats; break;
        case "no": noSeats += aiSeats; break;
        case "abstain": abstainSeats += aiSeats; break;
      }
    }
  }

  const totalVotingSeats = yesSeats + noSeats;
  const passed = totalVotingSeats > 0 && yesSeats > noSeats;

  return { passed, yesSeats, noSeats, abstainSeats, totalVotingSeats, humanYes, humanNo, humanAbstain };
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
