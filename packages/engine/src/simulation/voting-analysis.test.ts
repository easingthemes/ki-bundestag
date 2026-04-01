import { describe, it, expect } from "vitest";
import {
  calculateVotingAlignment,
  calculateVotingTendencies,
  buildVotingPatternDigest,
  getVotingCalibrationContext,
} from "./voting-analysis.js";
import type { Bill, Party } from "@ki-bundestag/types";

function makeParty(id: string): Party {
  return {
    id,
    name: id.toUpperCase(),
    color: "#000",
    ideology: "center",
    seatCount: 100,
    approvalRating: 20,
    policyPriorities: { economy: 0, social: 0, environment: 0, immigration: 0, spending: 0 },
    coalitionRole: "opposition",
    memberCount: 100,
  };
}

function makeBill(
  id: string,
  votes: Array<{ partyId: string; vote: "yes" | "no" | "abstain" }>,
  opts: { proposedBy?: string; proposedOnDay?: number; isGovernmentBill?: boolean } = {},
): Bill {
  return {
    id,
    title: `Bill ${id}`,
    description: "Test",
    category: "economy",
    proposedBy: opts.proposedBy ?? "spd",
    status: "passed",
    impact: {},
    votes: votes.map(v => ({ ...v, reason: "Test" })),
    proposedOnDay: opts.proposedOnDay ?? 1,
    isGovernmentBill: opts.isGovernmentBill,
  };
}

const parties = [makeParty("spd"), makeParty("cdu"), makeParty("gruene")];

describe("calculateVotingAlignment", () => {
  it("returns 100% for identical voting", () => {
    const bills = [
      makeBill("b1", [{ partyId: "spd", vote: "yes" }, { partyId: "cdu", vote: "yes" }]),
      makeBill("b2", [{ partyId: "spd", vote: "no" }, { partyId: "cdu", vote: "no" }]),
      makeBill("b3", [{ partyId: "spd", vote: "yes" }, { partyId: "cdu", vote: "yes" }]),
    ];
    const result = calculateVotingAlignment(bills, parties);
    expect(result.matrix["spd"]["cdu"]).toBe(100);
  });

  it("returns 0% for opposite voting", () => {
    const bills = [
      makeBill("b1", [{ partyId: "spd", vote: "yes" }, { partyId: "cdu", vote: "no" }]),
      makeBill("b2", [{ partyId: "spd", vote: "no" }, { partyId: "cdu", vote: "yes" }]),
      makeBill("b3", [{ partyId: "spd", vote: "yes" }, { partyId: "cdu", vote: "no" }]),
    ];
    const result = calculateVotingAlignment(bills, parties);
    expect(result.matrix["spd"]["cdu"]).toBe(0);
  });

  it("returns null for fewer than 3 shared votes", () => {
    const bills = [
      makeBill("b1", [{ partyId: "spd", vote: "yes" }, { partyId: "cdu", vote: "yes" }]),
      makeBill("b2", [{ partyId: "spd", vote: "yes" }, { partyId: "cdu", vote: "yes" }]),
    ];
    const result = calculateVotingAlignment(bills, parties);
    expect(result.matrix["spd"]["cdu"]).toBeNull();
  });

  it("self-pair always returns 100", () => {
    const result = calculateVotingAlignment([], parties);
    expect(result.matrix["spd"]["spd"]).toBe(100);
  });

  it("returns all null for empty bills array", () => {
    const result = calculateVotingAlignment([], parties);
    expect(result.matrix["spd"]["cdu"]).toBeNull();
    expect(result.billCount).toBe(0);
  });

  it("window filtering excludes old bills", () => {
    const bills = [
      makeBill("old1", [{ partyId: "spd", vote: "yes" }, { partyId: "cdu", vote: "no" }], { proposedOnDay: 1 }),
      makeBill("old2", [{ partyId: "spd", vote: "yes" }, { partyId: "cdu", vote: "no" }], { proposedOnDay: 2 }),
      makeBill("old3", [{ partyId: "spd", vote: "yes" }, { partyId: "cdu", vote: "no" }], { proposedOnDay: 3 }),
      makeBill("new1", [{ partyId: "spd", vote: "yes" }, { partyId: "cdu", vote: "yes" }], { proposedOnDay: 90 }),
      makeBill("new2", [{ partyId: "spd", vote: "yes" }, { partyId: "cdu", vote: "yes" }], { proposedOnDay: 91 }),
      makeBill("new3", [{ partyId: "spd", vote: "yes" }, { partyId: "cdu", vote: "yes" }], { proposedOnDay: 95 }),
    ];
    // With window=10, currentDay=100 → only bills from day 90+
    const result = calculateVotingAlignment(bills, parties, 10, 100);
    expect(result.matrix["spd"]["cdu"]).toBe(100); // only new bills
    expect(result.billCount).toBe(3);
  });

  it("calculates correct percentage for mixed votes", () => {
    const bills = [
      makeBill("b1", [{ partyId: "spd", vote: "yes" }, { partyId: "cdu", vote: "yes" }]),
      makeBill("b2", [{ partyId: "spd", vote: "yes" }, { partyId: "cdu", vote: "no" }]),
      makeBill("b3", [{ partyId: "spd", vote: "no" }, { partyId: "cdu", vote: "no" }]),
      makeBill("b4", [{ partyId: "spd", vote: "yes" }, { partyId: "cdu", vote: "no" }]),
    ];
    const result = calculateVotingAlignment(bills, parties);
    // 2 agree out of 4 = 50%
    expect(result.matrix["spd"]["cdu"]).toBe(50);
  });
});

describe("calculateVotingTendencies", () => {
  it("returns 100% yesRate for all-yes party", () => {
    const bills = [
      makeBill("b1", [{ partyId: "spd", vote: "yes" }]),
      makeBill("b2", [{ partyId: "spd", vote: "yes" }]),
    ];
    const result = calculateVotingTendencies(bills, [makeParty("spd")], []);
    expect(result[0].yesRate).toBe(100);
    expect(result[0].noRate).toBe(0);
    expect(result[0].totalBillsVoted).toBe(2);
  });

  it("correctly calculates government bill support", () => {
    const bills = [
      makeBill("b1", [{ partyId: "spd", vote: "yes" }], { proposedBy: "spd", isGovernmentBill: true }),
      makeBill("b2", [{ partyId: "spd", vote: "no" }], { proposedBy: "spd", isGovernmentBill: true }),
      makeBill("b3", [{ partyId: "spd", vote: "yes" }], { proposedBy: "cdu" }), // opposition bill
    ];
    const result = calculateVotingTendencies(bills, [makeParty("spd")], ["spd"]);
    expect(result[0].governmentBillSupport).toBe(50); // 1 of 2 govt bills
    expect(result[0].oppositionBillSupport).toBe(100); // 1 of 1 opp bill
  });
});

describe("buildVotingPatternDigest", () => {
  it("parses breakdown strings correctly", () => {
    const breakdowns = [
      "SPD: 180 Ja, 10 Nein, 5 Enthaltung; CDU/CSU: 10 Ja, 190 Nein, 0 Enthaltung; GRÜNE: 100 Ja, 5 Nein, 2 Enthaltung",
      "SPD: 170 Ja, 20 Nein, 5 Enthaltung; CDU/CSU: 5 Ja, 195 Nein, 0 Enthaltung; GRÜNE: 95 Ja, 10 Nein, 2 Enthaltung",
      "SPD: 180 Ja, 10 Nein, 5 Enthaltung; CDU/CSU: 180 Ja, 10 Nein, 5 Enthaltung; GRÜNE: 100 Ja, 5 Nein, 2 Enthaltung",
    ];
    const result = buildVotingPatternDigest(breakdowns, 1);
    expect(result).not.toBeNull();
    expect(result!.pollCount).toBe(3);
    // SPD majority: yes, yes, yes; CDU majority: no, no, yes; Gruene majority: yes, yes, yes
    // SPD-CDU agree on poll 3 only → 33%
    expect(result!.pairwiseAgreement["spd"]["cdu"]).toBe(33);
    // SPD-Gruene agree on all → 100%
    expect(result!.pairwiseAgreement["spd"]["gruene"]).toBe(100);
  });

  it("returns null for empty breakdowns", () => {
    expect(buildVotingPatternDigest([], 1)).toBeNull();
  });

  it("skips unknown factions (BSW)", () => {
    const breakdowns = [
      "BSW: 30 Ja, 0 Nein, 0 Enthaltung",
    ];
    const result = buildVotingPatternDigest(breakdowns, 1);
    // BSW maps to null, so no parties parsed → null
    expect(result).toBeNull();
  });
});

describe("getVotingCalibrationContext", () => {
  it("returns null when totalBillsVoted >= 50", () => {
    // This function reads from DB, but with no DB it should return null
    const result = getVotingCalibrationContext("spd", 50);
    expect(result).toBeNull();
  });

  it("returns null when totalBillsVoted >= 50 (boundary)", () => {
    const result = getVotingCalibrationContext("spd", 100);
    expect(result).toBeNull();
  });
});
