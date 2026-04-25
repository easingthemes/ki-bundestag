import { describe, it, expect } from "vitest";
import type { Party } from "@ki-bundestag/types";
import { tallyChancellorVote } from "./voting.js";
import { MAJORITY_SEATS } from "../config/elections.js";

function makeParty(id: string, seatCount: number, role: Party["coalitionRole"] = "opposition"): Party {
  return {
    id, name: id.toUpperCase(), color: "#000", ideology: "x",
    seatCount, approvalRating: 20,
    policyPriorities: { economy: 0, social: 0, environment: 0, immigration: 0, spending: 0 },
    coalitionRole: role, memberCount: 0, inactiveDays: 0,
  };
}

describe("tallyChancellorVote — absolute mode (Kanzlermehrheit, Art. 63 Abs. 1/3)", () => {
  it("passes when coalition seats >= MAJORITY_SEATS", () => {
    const parties = [
      makeParty("spd", 180, "leader"),
      makeParty("gruene", 150, "junior"),    // coalition = 330 >= 316
      makeParty("cdu", 300, "opposition"),
    ];
    const result = tallyChancellorVote("spd", parties, ["spd", "gruene"], "absolute");
    expect(result.passed).toBe(true);
    expect(result.yes).toBe(330);
    expect(result.no).toBe(300);
  });

  it("fails when coalition seats < MAJORITY_SEATS even with plurality", () => {
    const parties = [
      makeParty("spd", 180, "leader"),
      makeParty("gruene", 100, "junior"),    // coalition = 280 < 316
      makeParty("cdu", 350, "opposition"),
    ];
    const result = tallyChancellorVote("spd", parties, ["spd", "gruene"], "absolute");
    expect(result.passed).toBe(false);
    expect(result.yes).toBe(280);
  });

  it("exactly MAJORITY_SEATS passes (inclusive threshold)", () => {
    const parties = [makeParty("spd", MAJORITY_SEATS, "leader"), makeParty("cdu", 314, "opposition")];
    const result = tallyChancellorVote("spd", parties, ["spd"], "absolute");
    expect(result.passed).toBe(true);
    expect(result.yes).toBe(MAJORITY_SEATS);
  });
});

describe("tallyChancellorVote — relative mode (Art. 63 Abs. 4 Satz 2)", () => {
  it("passes when yes > no, regardless of absolute threshold", () => {
    const parties = [
      makeParty("spd", 200, "leader"),        // yes
      makeParty("cdu", 150, "opposition"),    // no
      makeParty("gruene", 100, "junior"),     // yes (coalition)
    ];
    const result = tallyChancellorVote("spd", parties, ["spd", "gruene"], "relative");
    expect(result.passed).toBe(true);
    expect(result.yes).toBe(300);
    expect(result.no).toBe(150);
  });

  it("fails when yes equals no (strict >)", () => {
    const parties = [
      makeParty("spd", 200, "leader"),
      makeParty("cdu", 200, "opposition"),
      makeParty("afd", 335, "opposition"),  // abstain (neither coalition nor candidate's party)
    ];
    // Third-party abstention: make spd candidate; afd isn't in coalition and
    // isn't the candidate's party — by third-party rule they abstain.
    const result = tallyChancellorVote("spd", parties, ["spd"], "relative");
    expect(result.yes).toBe(200);
    expect(result.no).toBe(535);  // cdu+afd both vote no
    expect(result.passed).toBe(false);
  });
});

describe("tallyChancellorVote — third-party candidate (Phase 2)", () => {
  it("candidate's party votes yes, all others vote no", () => {
    const parties = [
      makeParty("spd", 300, "leader"),
      makeParty("cdu", 250, "opposition"),    // candidate
      makeParty("gruene", 185, "junior"),
    ];
    const result = tallyChancellorVote("cdu", parties, ["spd", "gruene"], "absolute");
    expect(result.yes).toBe(250);
    expect(result.no).toBe(485);
  });
});
