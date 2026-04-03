import { describe, it, expect } from "vitest";
import { shouldTriggerElection, calculateResults, formGovernment, ELECTION_COOLDOWN_DAYS } from "./elections.js";
import type { Election, Party, PolicyPriorities } from "@ki-bundestag/types";

const POLICY: PolicyPriorities = { economy: 5, social: 5, environment: 5, immigration: 5, spending: 5 };

function makeParty(overrides: Partial<Party> = {}): Party {
  return {
    id: "test",
    name: "Test Party",
    shortName: "TP",
    color: "#000",
    ideology: "center",
    seatCount: 120,
    approvalRating: 20,
    policyPriorities: POLICY,
    coalitionRole: "opposition",
    ...overrides,
  } as Party;
}

const PARTIES: Party[] = [
  makeParty({ id: "spd", name: "SPD", seatCount: 206, approvalRating: 25, coalitionRole: "leader" }),
  makeParty({ id: "cdu", name: "CDU", seatCount: 196, approvalRating: 24, coalitionRole: "opposition" }),
  makeParty({ id: "gruene", name: "Grüne", seatCount: 118, approvalRating: 15, coalitionRole: "junior" }),
  makeParty({ id: "fdp", name: "FDP", seatCount: 92, approvalRating: 11, coalitionRole: "junior" }),
  makeParty({ id: "afd", name: "AfD", seatCount: 83, approvalRating: 15, policyPriorities: { economy: 7, social: 2, environment: 2, immigration: 1, spending: 3 } }),
  makeParty({ id: "linke", name: "Linke", seatCount: 40, approvalRating: 8 }),
];

describe("shouldTriggerElection", () => {
  it("triggers on scheduled day", () => {
    const result = shouldTriggerElection(1461, 1461, 0, null);
    expect(result.trigger).toBe(true);
    expect(result.reason).toContain("Scheduled");
  });

  it("triggers on low sentiment streak >= 5", () => {
    const result = shouldTriggerElection(500, 1461, 5, null);
    expect(result.trigger).toBe(true);
    expect(result.reason).toContain("Snap");
  });

  it("does not trigger if election already active", () => {
    const active = { id: "e1", status: "campaign" } as Election;
    const result = shouldTriggerElection(1461, 1461, 10, active);
    expect(result.trigger).toBe(false);
  });

  it("does not trigger before scheduled day with normal sentiment", () => {
    const result = shouldTriggerElection(100, 1461, 2, null);
    expect(result.trigger).toBe(false);
  });

  it("blocks snap election during cooldown period", () => {
    // Day 100, cooldown until day 130 — streak of 10 should NOT trigger
    const result = shouldTriggerElection(100, 1461, 10, null, 130);
    expect(result.trigger).toBe(false);
  });

  it("allows snap election after cooldown expires", () => {
    // Day 131, cooldown until day 130 — streak of 5 should trigger
    const result = shouldTriggerElection(131, 1461, 5, null, 130);
    expect(result.trigger).toBe(true);
    expect(result.reason).toContain("Snap");
  });

  it("allows scheduled election even during cooldown", () => {
    const result = shouldTriggerElection(1461, 1461, 0, null, 1490);
    expect(result.trigger).toBe(true);
    expect(result.reason).toContain("Scheduled");
  });

  it("cooldown period is 30 days", () => {
    expect(ELECTION_COOLDOWN_DAYS).toBe(30);
  });
});

describe("calculateResults", () => {
  it("always assigns exactly 735 total seats", () => {
    // Run multiple times due to randomness
    for (let i = 0; i < 50; i++) {
      const results = calculateResults(PARTIES);
      const totalSeats = results.reduce((s, r) => s + r.seatsWon, 0);
      expect(totalSeats).toBe(735);
    }
  });

  it("respects 5% threshold", () => {
    // Need enough parties so a small one normalizes below 5%
    const parties = [
      makeParty({ id: "big1", approvalRating: 35 }),
      makeParty({ id: "big2", approvalRating: 30 }),
      makeParty({ id: "mid", approvalRating: 20 }),
      makeParty({ id: "small", approvalRating: 10 }),
      makeParty({ id: "tiny", approvalRating: 0.5 }), // Way below 5% when normalized
    ];
    let timesZero = 0;
    for (let i = 0; i < 50; i++) {
      const results = calculateResults(parties);
      const tiny = results.find(r => r.partyId === "tiny");
      if (tiny!.seatsWon === 0) timesZero++;
    }
    // Should almost always be below threshold
    expect(timesZero).toBeGreaterThan(40);
  });

  it("higher approval yields more seats on average", () => {
    let bigWins = 0;
    for (let i = 0; i < 50; i++) {
      const results = calculateResults(PARTIES);
      const spd = results.find(r => r.partyId === "spd")!;
      const linke = results.find(r => r.partyId === "linke")!;
      if (spd.seatsWon > linke.seatsWon) bigWins++;
    }
    expect(bigWins).toBeGreaterThan(40); // SPD should almost always beat Linke
  });
});

describe("formGovernment", () => {
  it("forms a majority coalition", () => {
    const results = calculateResults(PARTIES);
    const { coalition, opposition } = formGovernment(results, PARTIES);
    const coalitionSeats = results
      .filter(r => coalition.includes(r.partyId))
      .reduce((s, r) => s + r.seatsWon, 0);
    expect(coalitionSeats).toBeGreaterThanOrEqual(368); // majority
    expect(coalition.length).toBeGreaterThanOrEqual(1);
    expect(opposition.length).toBeGreaterThanOrEqual(1);
  });

  it("coalition + opposition covers all parties with seats", () => {
    const results = calculateResults(PARTIES);
    const { coalition, opposition } = formGovernment(results, PARTIES);
    const partiesWithSeats = results.filter(r => r.seatsWon > 0).map(r => r.partyId);
    for (const pid of partiesWithSeats) {
      expect(coalition.includes(pid) || opposition.includes(pid)).toBe(true);
    }
  });

  it("returns empty coalition when no parties have seats", () => {
    const { coalition, opposition } = formGovernment([], PARTIES);
    expect(coalition).toEqual([]);
    expect(opposition).toEqual(PARTIES.map(p => p.id));
  });
});
