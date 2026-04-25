import { describe, it, expect } from "vitest";
import {
  vertrauensfrageGateOpen,
  misstrauensvotumGateOpen,
  pickKonstruktivCandidate,
  nextLowGovernmentApprovalStreak,
} from "./confidence-votes.js";
import {
  MAJORITY_SEATS,
  VERTRAUENSFRAGE_GATE_LOW_APPROVAL_DAYS,
  VERTRAUENSFRAGE_GATE_FRAGILE_MARGIN,
  VERTRAUENSFRAGE_HONEYMOON_DAYS,
  MISSTRAUENSVOTUM_GATE_HONEYMOON_DAYS,
  FRAKTION_THRESHOLD,
  LOW_GOVERNMENT_APPROVAL_THRESHOLD,
} from "../config/index.js";
import type { Party } from "@ki-bundestag/types";

function makeParty(id: string, seatCount: number, approval: number): Party {
  return {
    id, name: id.toUpperCase(), color: "#000", ideology: "center",
    seatCount, approvalRating: approval,
    policyPriorities: { economy: 0, social: 0, environment: 0, immigration: 0, spending: 0 },
    coalitionRole: "opposition", inactiveDays: 0,
  } as Party;
}

const PARTIES_DEFAULT: Party[] = [
  makeParty("spd", 200, 28), // coalition leader
  makeParty("gruene", 100, 22), // coalition
  makeParty("cdu", 250, 30), // opposition (Fraktion)
  makeParty("fdp", 60, 18), // opposition (Fraktion: 60 >= FRAKTION_THRESHOLD=32)
  makeParty("afd", 80, 14), // opposition (Fraktion)
  makeParty("linke", 45, 12), // opposition (Fraktion: 45 >= FRAKTION_THRESHOLD=32)
];
const COALITION = ["spd", "gruene"];

// ── vertrauensfrageGateOpen ────────────────────────────────────────────

describe("vertrauensfrageGateOpen", () => {
  // Govt formed day 0; current day must be >= 90 for honeymoon to clear.
  const govDay = 0;
  const currentDay = 200;
  // coalition seats < MAJORITY_SEATS + 5 → fragile
  const fragileSeats = MAJORITY_SEATS + VERTRAUENSFRAGE_GATE_FRAGILE_MARGIN - 1;

  it("opens when all three conditions are met", () => {
    expect(
      vertrauensfrageGateOpen(fragileSeats, govDay, currentDay, VERTRAUENSFRAGE_GATE_LOW_APPROVAL_DAYS),
    ).toBe(true);
  });

  it("closed when low-approval streak too short", () => {
    expect(
      vertrauensfrageGateOpen(fragileSeats, govDay, currentDay, VERTRAUENSFRAGE_GATE_LOW_APPROVAL_DAYS - 1),
    ).toBe(false);
  });

  it("closed when coalition seat margin is comfortable", () => {
    const safeSeats = MAJORITY_SEATS + VERTRAUENSFRAGE_GATE_FRAGILE_MARGIN;
    expect(
      vertrauensfrageGateOpen(safeSeats, govDay, currentDay, VERTRAUENSFRAGE_GATE_LOW_APPROVAL_DAYS),
    ).toBe(false);
  });

  it("closed during honeymoon (govt < 90 days old)", () => {
    expect(
      vertrauensfrageGateOpen(fragileSeats, govDay, VERTRAUENSFRAGE_HONEYMOON_DAYS - 1, VERTRAUENSFRAGE_GATE_LOW_APPROVAL_DAYS),
    ).toBe(false);
  });
});

// ── misstrauensvotumGateOpen ───────────────────────────────────────────

describe("misstrauensvotumGateOpen", () => {
  const govDay = 0;
  const currentDay = MISSTRAUENSVOTUM_GATE_HONEYMOON_DAYS + 1;

  it("opens when honeymoon over AND opposition has path to majority AND Fraktion candidate exists", () => {
    // PARTIES_DEFAULT: coalition spd+gruene = 300; opposition cdu+fdp+afd+linke = 435.
    // Path-to-majority: opposition >= MAJORITY_SEATS - 300 + 1.
    expect(misstrauensvotumGateOpen(PARTIES_DEFAULT, COALITION, govDay, currentDay)).toBe(true);
  });

  it("closed during honeymoon", () => {
    expect(misstrauensvotumGateOpen(PARTIES_DEFAULT, COALITION, govDay, MISSTRAUENSVOTUM_GATE_HONEYMOON_DAYS - 1)).toBe(false);
  });

  it("closed when opposition lacks path to majority", () => {
    // Coalition holds an overwhelming supermajority; opposition can't beat it.
    const supermajority = [
      makeParty("spd", 500, 28),
      makeParty("gruene", 200, 22),
      makeParty("cdu", 30, 30),
      makeParty("fdp", 5, 18),
    ];
    expect(misstrauensvotumGateOpen(supermajority, ["spd", "gruene"], govDay, currentDay)).toBe(false);
  });

  it("closed when no opposition party clears Fraktion threshold", () => {
    // Opposition fragmented below FRAKTION_THRESHOLD per party.
    const fragmented = [
      makeParty("spd", 380, 28),
      makeParty("gruene", 100, 22),
      makeParty("cdu", FRAKTION_THRESHOLD - 1, 30),
      makeParty("fdp", FRAKTION_THRESHOLD - 1, 18),
      makeParty("afd", FRAKTION_THRESHOLD - 1, 14),
      makeParty("linke", FRAKTION_THRESHOLD - 1, 12),
    ];
    expect(misstrauensvotumGateOpen(fragmented, ["spd", "gruene"], govDay, currentDay)).toBe(false);
  });
});

// ── pickKonstruktivCandidate ───────────────────────────────────────────

describe("pickKonstruktivCandidate", () => {
  it("returns null when no opposition party clears Fraktion threshold", () => {
    const tinyOpposition = [
      makeParty("spd", 400, 28),
      makeParty("cdu", FRAKTION_THRESHOLD - 1, 30),
    ];
    expect(pickKonstruktivCandidate(tinyOpposition, ["spd"])).toBeNull();
  });

  it("picks the largest opposition party", () => {
    const candidate = pickKonstruktivCandidate(PARTIES_DEFAULT, COALITION);
    expect(candidate?.id).toBe("cdu"); // 250 seats > others
  });

  it("breaks ties by approval", () => {
    const tied = [
      makeParty("spd", 200, 28),
      makeParty("cdu", 250, 30),
      makeParty("fdp", 250, 22), // same seats as CDU but lower approval
    ];
    expect(pickKonstruktivCandidate(tied, ["spd"])?.id).toBe("cdu");
  });

  it("breaks remaining ties by lexicographic party id (deterministic)", () => {
    const fullyTied = [
      makeParty("spd", 200, 28),
      makeParty("zzz", 250, 25),
      makeParty("cdu", 250, 25),
    ];
    expect(pickKonstruktivCandidate(fullyTied, ["spd"])?.id).toBe("cdu");
  });
});

// ── nextLowGovernmentApprovalStreak ────────────────────────────────────

describe("nextLowGovernmentApprovalStreak", () => {
  // Helper: just the two fields the function actually reads.
  const coalitionAt = (pairs: Array<[number, number]>) =>
    pairs.map(([approval, seats]) => ({ approvalRating: approval, seatCount: seats }));

  it("increments when seat-weighted coalition approval is below the threshold", () => {
    // 200 seats × 20 + 100 seats × 22 = 4000 + 2200 = 6200; / 300 = 20.67 < 25
    const next = nextLowGovernmentApprovalStreak(7, coalitionAt([[20, 200], [22, 100]]));
    expect(next).toBe(8);
  });

  it("resets to 0 when seat-weighted approval is at or above the threshold", () => {
    // 200 × 30 + 100 × 25 = 6000 + 2500 = 8500; / 300 = 28.33 >= 25
    expect(nextLowGovernmentApprovalStreak(15, coalitionAt([[30, 200], [25, 100]]))).toBe(0);
  });

  it("resets to 0 during interregnum (null coalition)", () => {
    expect(nextLowGovernmentApprovalStreak(42, null)).toBe(0);
  });

  it("uses seat-weighted (not unweighted) approval", () => {
    // Unweighted mean of [50, 5] = 27.5 (above threshold). Seat-weighted with
    // 1000 seats at approval 5 vs 1 seat at approval 50 → ~5.04 (well below).
    // The streak must reflect the weighted value.
    expect(nextLowGovernmentApprovalStreak(0, coalitionAt([[50, 1], [5, 1000]]))).toBe(1);
  });

  it("treats zero-seat coalition the same as the original inline impl (counts as low)", () => {
    // Pre-extraction loop.ts had `weightedApproval = 0` when totalSeats === 0,
    // so the gate counted it as below threshold. Documented in the helper's
    // docstring; this test pins the behaviour so any future tightening is
    // an explicit decision, not a silent change.
    expect(nextLowGovernmentApprovalStreak(3, coalitionAt([[40, 0], [50, 0]]))).toBe(4);
  });

  it("crosses the LOW_GOVERNMENT_APPROVAL_THRESHOLD boundary correctly", () => {
    // Just below threshold → increment
    const justBelow = LOW_GOVERNMENT_APPROVAL_THRESHOLD - 0.01;
    expect(nextLowGovernmentApprovalStreak(0, coalitionAt([[justBelow, 100]]))).toBe(1);
    // Exactly at threshold → reset (strict-less semantic)
    expect(nextLowGovernmentApprovalStreak(99, coalitionAt([[LOW_GOVERNMENT_APPROVAL_THRESHOLD, 100]]))).toBe(0);
  });

  it("accepts a custom threshold parameter for testability", () => {
    expect(nextLowGovernmentApprovalStreak(0, coalitionAt([[40, 100]]), 50)).toBe(1);
    expect(nextLowGovernmentApprovalStreak(7, coalitionAt([[40, 100]]), 30)).toBe(0);
  });
});
