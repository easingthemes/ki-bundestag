import { describe, it, expect } from "vitest";
import {
  rollKurzintervention,
  rollZwischenfrage,
  detectDisciplineBreaks,
  type DisciplineBreakInput,
} from "./debate-formats.js";
import {
  KURZINTERVENTION_PROBABILITY,
  ZWISCHENFRAGE_PROBABILITY,
} from "../config/parliament.js";
import type { Bill, Party } from "@ki-bundestag/types";

function makeRng(seed = 1): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 0x7fffffff;
    return state / 0x7fffffff;
  };
}

function makeBill(over: Partial<Bill> = {}): Bill {
  return {
    id: "bill-1", title: "Test", description: "D", category: "economy",
    proposedBy: "spd", status: "first_reading",
    impact: {}, votes: [], proposedOnDay: 1,
    ...over,
  } as Bill;
}

function makeParty(id: string, over: Partial<Party> = {}): Party {
  return {
    id, name: id.toUpperCase(), color: "#000",
    ideology: "centrist", seatCount: 100,
    approvalRating: 30,
    policyPriorities: { economy: 5, social: 5, environment: 5, immigration: 5, spending: 5 },
    coalitionRole: "opposition",
    inactiveDays: 0,
    ...over,
  } as Party;
}

const STANDARD_PARTIES = [
  makeParty("spd", { coalitionRole: "leader" }),
  makeParty("cdu", { coalitionRole: "opposition" }),
  makeParty("gruene", { coalitionRole: "junior" }),
  makeParty("fdp", { coalitionRole: "opposition" }),
  makeParty("afd", { coalitionRole: "opposition" }),
  makeParty("linke", { coalitionRole: "opposition" }),
];

// ── rollKurzintervention ─────────────────────────────────────────────────

describe("rollKurzintervention", () => {
  // Test 1: 50_000-trial convergence at exactly 30% fire rate.
  it("converges to KURZINTERVENTION_PROBABILITY (30%) over 50_000 trials", () => {
    const bill = makeBill();
    const rng = makeRng(11);
    let fired = 0;
    for (let i = 0; i < 50_000; i++) {
      // First rng draw is the probability roll. Subsequent rng draws (used
      // for interjector selection) advance the seed but don't affect the
      // fire count.
      if (rollKurzintervention(bill, STANDARD_PARTIES, "first", 0, rng) !== null) fired++;
    }
    const ratio = fired / 50_000;
    // Expected ≈ 0.30, ±1pp tolerance.
    expect(ratio).toBeGreaterThan(KURZINTERVENTION_PROBABILITY - 0.01);
    expect(ratio).toBeLessThan(KURZINTERVENTION_PROBABILITY + 0.01);
  });

  // Test 2: boundary determinism with seeded rng.
  it("fires at rng=0.299, misses at rng=0.300", () => {
    // First rng() draw is the probability check.
    // Subsequent draws are for interjector picking; we just need them to be valid.
    const bill = makeBill();
    const fireRng = (() => { let i = 0; const seq = [0.299, 0.5]; return () => seq[i++] ?? 0.5; })();
    expect(rollKurzintervention(bill, STANDARD_PARTIES, "first", 0, fireRng)).not.toBeNull();

    const missRng = (() => { let i = 0; const seq = [0.300, 0.5]; return () => seq[i++] ?? 0.5; })();
    expect(rollKurzintervention(bill, STANDARD_PARTIES, "first", 0, missRng)).toBeNull();
  });

  // Test 3: with no eligible interjectors → returns null.
  it("returns null when no Fraktion-bearing non-proposing party exists", () => {
    const onlySpd = [makeParty("spd")];
    const fireRng = (() => { let i = 0; const seq = [0.0, 0.5]; return () => seq[i++] ?? 0.5; })();
    expect(rollKurzintervention(makeBill(), onlySpd, "first", 0, fireRng)).toBeNull();
  });

  // Test 4: interjector is always non-proposing AND Fraktion-bearing.
  it("interjector is always a non-proposing Fraktion party (50_000 trials)", () => {
    const bill = makeBill();
    const rng = makeRng(7);
    for (let i = 0; i < 50_000; i++) {
      const ev = rollKurzintervention(bill, STANDARD_PARTIES, "first", 0, rng);
      if (!ev) continue;
      expect(ev.data?.interjectorPartyId).not.toBe("spd"); // never the proposer
      // All STANDARD_PARTIES have seatCount=100 > FRAKTION_THRESHOLD, so any
      // non-spd pick is valid.
    }
  });
});

// ── rollZwischenfrage ────────────────────────────────────────────────────

describe("rollZwischenfrage", () => {
  // Test 5: independence from Kurzintervention — at the same seed, the joint
  // matrix shows ~9% both, ~21% only-one, ~70% none (within tolerance).
  it("is independent of Kurzintervention (joint roll matrix matches independence)", () => {
    const bill = makeBill();
    const trials = 50_000;
    let both = 0;
    let onlyKi = 0;
    let onlyZf = 0;
    let neither = 0;
    const rng = makeRng(31);
    for (let i = 0; i < trials; i++) {
      const ki = rollKurzintervention(bill, STANDARD_PARTIES, "first", 0, rng) !== null;
      const zf = rollZwischenfrage(bill, STANDARD_PARTIES, "first", 0, rng) !== null;
      if (ki && zf) both++;
      else if (ki) onlyKi++;
      else if (zf) onlyZf++;
      else neither++;
    }
    const expectedBoth = KURZINTERVENTION_PROBABILITY * ZWISCHENFRAGE_PROBABILITY;
    // Independence assertion — observed both/total ≈ 0.09, ±1pp.
    expect(both / trials).toBeGreaterThan(expectedBoth - 0.01);
    expect(both / trials).toBeLessThan(expectedBoth + 0.01);
    void onlyKi; void onlyZf; void neither;
  });

  // Test 6: questioner is never the proposing party.
  it("questioner is never the bill-proposing party", () => {
    const bill = makeBill();
    const rng = makeRng(13);
    for (let i = 0; i < 5_000; i++) {
      const ev = rollZwischenfrage(bill, STANDARD_PARTIES, "second", 0, rng);
      if (!ev) continue;
      expect(ev.data?.questionerPartyId).not.toBe("spd");
    }
  });
});

// ── detectDisciplineBreaks ───────────────────────────────────────────────

describe("detectDisciplineBreaks", () => {
  function makeBreakInput(over: Partial<DisciplineBreakInput> = {}): DisciplineBreakInput {
    return {
      seatId: "s-1",
      partyId: "spd",
      vote: "no",
      disciplineLevel: 2,
      mdbName: "Test MdB",
      ...over,
    };
  }

  // Test 7: emits one event per discipline-break vote.
  it("emits one erklaerung_zur_abstimmung event per break", () => {
    const bill = makeBill({ title: "Bürgergeld-Reform" });
    const inputs: DisciplineBreakInput[] = [
      makeBreakInput({ seatId: "s-1", vote: "no" }),  // breaks (party line is yes)
      makeBreakInput({ seatId: "s-2", vote: "yes" }), // aligns
      makeBreakInput({ seatId: "s-3", vote: "no" }),  // breaks
    ];
    const partyLine = { spd: "yes" as const };
    const events = detectDisciplineBreaks(bill, inputs, partyLine, 100);
    expect(events).toHaveLength(2);
    expect(events.every(e => e.type === "erklaerung_zur_abstimmung")).toBe(true);
  });

  // Test 8: zero events when no MdB has disciplineLevel >= 1.
  it("emits zero events when all disciplineLevel === 0", () => {
    const inputs: DisciplineBreakInput[] = [
      makeBreakInput({ disciplineLevel: 0, vote: "no" }),
      makeBreakInput({ disciplineLevel: 0, vote: "no", seatId: "s-2" }),
    ];
    const partyLine = { spd: "yes" as const };
    expect(detectDisciplineBreaks(makeBill(), inputs, partyLine, 100)).toHaveLength(0);
  });

  // Test 9: zero events when all MdBs vote with party line.
  it("emits zero events when all MdBs vote with party line", () => {
    const inputs: DisciplineBreakInput[] = [
      makeBreakInput({ disciplineLevel: 3, vote: "yes" }),
      makeBreakInput({ disciplineLevel: 2, vote: "yes", seatId: "s-2" }),
    ];
    const partyLine = { spd: "yes" as const };
    expect(detectDisciplineBreaks(makeBill(), inputs, partyLine, 100)).toHaveLength(0);
  });

  // Test 10: templated description includes name + bill + direction + level.
  it("templated description includes name, party id, bill title, direction word, and discipline level", () => {
    const bill = makeBill({ title: "Klimagesetz 2030" });
    const inputs = [makeBreakInput({ vote: "no", disciplineLevel: 2, mdbName: "Anna Müller" })];
    const events = detectDisciplineBreaks(bill, inputs, { spd: "yes" }, 200);
    expect(events).toHaveLength(1);
    const desc = events[0].description;
    expect(desc).toContain("Anna Müller");
    expect(desc).toContain("(spd, MdB)");
    expect(desc).toContain("Klimagesetz 2030");
    expect(desc).toContain("gegen"); // vote=no → "gegen" direction
    expect(desc).toContain("Disziplin-Stufe 2");
  });

  // Bonus: R18 — graceful AI-seat label fallback when mdbName absent.
  it("falls back to 'MdB-Sitz #<seatId>' when mdbName is null (R18)", () => {
    const inputs: DisciplineBreakInput[] = [
      makeBreakInput({ seatId: "seat-42", vote: "no", mdbName: null }),
    ];
    const events = detectDisciplineBreaks(makeBill(), inputs, { spd: "yes" }, 100);
    expect(events[0].title).toBe("Erklärung zur Abstimmung: MdB-Sitz #seat-42");
  });

  // R7 (Cycle 5 PR 4): caller-resolved real name takes precedence over the
  // seat-id template. Documents the contract: `mdbName` set → real name in
  // both title and description; the seatId template is the fallback path,
  // never the primary source.
  it("uses caller-resolved displayName when mdbName is set (R7 real-name path)", () => {
    const inputs: DisciplineBreakInput[] = [
      makeBreakInput({ seatId: "seat-77", vote: "no", mdbName: "Maria Schmidt" }),
    ];
    const events = detectDisciplineBreaks(makeBill(), inputs, { spd: "yes" }, 100);
    expect(events[0].title).toBe("Erklärung zur Abstimmung: Maria Schmidt");
    expect(events[0].title).not.toContain("MdB-Sitz");
    expect(events[0].description).toContain("Maria Schmidt");
    expect(events[0].description).not.toContain("seat-77");
  });
});
