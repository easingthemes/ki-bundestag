import { describe, it, expect } from "vitest";
import { tallyVotes, applyAmendmentToBill } from "./voting.js";
import type { Bill, Party } from "@ki-bundestag/types";

function makeBill(votes: Array<{ partyId: string; vote: "yes" | "no" | "abstain" }>): Bill {
  return {
    id: "bill-1",
    title: "Test",
    description: "Test bill",
    category: "economy",
    proposedBy: "spd",
    status: "third_reading",
    impact: {},
    votes: votes.map(v => ({ ...v, reason: "Test" })),
    proposedOnDay: 1,
  };
}

function makeParty(id: string, seatCount: number): Party {
  return {
    id,
    name: id.toUpperCase(),
    color: "#000",
    ideology: "center",
    seatCount,
    approvalRating: 20,
    policyPriorities: { economy: 0, social: 0, environment: 0, immigration: 0, spending: 0 },
    coalitionRole: "opposition", memberCount: 100, inactiveDays: 0,
  };
}

describe("tallyVotes", () => {
  it("bill passes when yes seats > no seats", () => {
    const parties = [makeParty("spd", 200), makeParty("cdu", 150)];
    const bill = makeBill([
      { partyId: "spd", vote: "yes" },
      { partyId: "cdu", vote: "no" },
    ]);
    const result = tallyVotes(bill, parties);
    expect(result.passed).toBe(true);
    expect(result.yesSeats).toBe(200);
    expect(result.noSeats).toBe(150);
  });

  it("bill fails when no seats > yes seats", () => {
    const parties = [makeParty("spd", 100), makeParty("cdu", 200)];
    const bill = makeBill([
      { partyId: "spd", vote: "yes" },
      { partyId: "cdu", vote: "no" },
    ]);
    const result = tallyVotes(bill, parties);
    expect(result.passed).toBe(false);
  });

  it("abstentions do not count toward totalVotingSeats", () => {
    const parties = [makeParty("spd", 100), makeParty("cdu", 100), makeParty("fdp", 50)];
    const bill = makeBill([
      { partyId: "spd", vote: "yes" },
      { partyId: "cdu", vote: "no" },
      { partyId: "fdp", vote: "abstain" },
    ]);
    const result = tallyVotes(bill, parties);
    expect(result.totalVotingSeats).toBe(200); // only yes + no
    expect(result.abstainSeats).toBe(50);
  });

  it("bill fails when all parties abstain (0 voting seats)", () => {
    const parties = [makeParty("spd", 100)];
    const bill = makeBill([{ partyId: "spd", vote: "abstain" }]);
    const result = tallyVotes(bill, parties);
    expect(result.passed).toBe(false);
    expect(result.totalVotingSeats).toBe(0);
  });

  it("handles MdB votes with discipline override", () => {
    const parties = [makeParty("spd", 10)];
    const bill = makeBill([{ partyId: "spd", vote: "yes" }]);
    // 1 human seat votes "no" but has discipline level 3 → forced to party line (yes)
    const mdbVotes = [
      { seatId: "s1", partyId: "spd", userId: "u1", vote: "no" as const, proxyDefault: "party_line", disciplineLevel: 3 },
    ];
    const humanSeatCounts = { spd: 2 };
    const result = tallyVotes(bill, parties, mdbVotes, humanSeatCounts);
    // 1 whipped seat → yes, 1 proxy seat → yes (party line), 8 AI seats → yes
    expect(result.yesSeats).toBe(10);
    expect(result.humanYes).toBe(1);
  });
});

describe("applyAmendmentToBill", () => {
  it("merges amendment impact into bill impact", () => {
    const bill: Bill = {
      id: "b1", title: "T", description: "D", category: "economy",
      proposedBy: "spd", status: "second_reading", impact: { budget: 1.0 },
      votes: [], proposedOnDay: 1,
    };
    const amendment = {
      id: "a1", billId: "b1", title: "Amend", description: "Change",
      proposedBy: "cdu", accepted: false, votes: [],
      impactChange: { budget: 0.5, gdpGrowth: 0.2 },
    };
    applyAmendmentToBill(bill, amendment);
    expect(bill.impact!.budget).toBe(1.5);
    expect(bill.impact!.gdpGrowth).toBe(0.2);
  });

  it("saves original impact before first modification", () => {
    const bill: Bill = {
      id: "b1", title: "T", description: "D", category: "economy",
      proposedBy: "spd", status: "second_reading", impact: { budget: 1.0 },
      votes: [], proposedOnDay: 1,
    };
    const amendment = {
      id: "a1", billId: "b1", title: "A", description: "D",
      proposedBy: "cdu", accepted: false, votes: [],
      impactChange: { budget: 0.5 },
    };
    applyAmendmentToBill(bill, amendment);
    expect(bill.originalImpact).toEqual({ budget: 1.0 });
    // Apply a second amendment — originalImpact should not change
    applyAmendmentToBill(bill, { ...amendment, id: "a2", impactChange: { budget: 0.3 } });
    expect(bill.originalImpact).toEqual({ budget: 1.0 });
    expect(bill.impact!.budget).toBe(1.8);
  });
});
