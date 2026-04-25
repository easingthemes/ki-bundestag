import { describe, it, expect } from "vitest";
import {
  vertrauensfrageGateOpen,
  misstrauensvotumGateOpen,
  pickKonstruktivCandidate,
} from "./confidence-votes.js";
import {
  MAJORITY_SEATS,
  VERTRAUENSFRAGE_GATE_LOW_APPROVAL_DAYS,
  VERTRAUENSFRAGE_GATE_FRAGILE_MARGIN,
  VERTRAUENSFRAGE_HONEYMOON_DAYS,
  MISSTRAUENSVOTUM_GATE_HONEYMOON_DAYS,
  FRAKTION_THRESHOLD,
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
  makeParty("fdp", 60, 18), // opposition (Fraktion at 735, falls below at 630)
  makeParty("afd", 80, 14), // opposition (Fraktion)
  makeParty("linke", 45, 12), // opposition (Fraktion at 735)
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
