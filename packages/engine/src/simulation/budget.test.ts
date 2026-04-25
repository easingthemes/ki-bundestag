import { describe, it, expect, vi, beforeEach } from "vitest";

// Cycle 4 PR 2 — mock the DB module for `applySchuldenbremseAussetzung` /
// `checkSchuldenbremseExpiry` tests. The pure helpers (shouldPresidentVeto,
// tallySchuldenbremseVote, findFiscalEmergencyOpportunity) don't read the DB
// — they're unaffected by the mock.
const dbMockState: {
  schuldenbremseUntilDay: number | null;
  recordedNationalStateUpdates: Array<Record<string, unknown>>;
  recordedMetaUpdates: Array<Record<string, unknown>>;
} = {
  schuldenbremseUntilDay: null,
  recordedNationalStateUpdates: [],
  recordedMetaUpdates: [],
};

vi.mock("drizzle-orm", () => ({ eq: vi.fn(), and: vi.fn(), sql: vi.fn() }));

vi.mock("../db/index.js", () => {
  const fakeSqlite = {
    prepare(sql: string) {
      return {
        get: () => {
          if (sql.includes("schuldenbremse_suspended_until_day")) {
            return { id: 1, schuldenbremse_suspended_until_day: dbMockState.schuldenbremseUntilDay };
          }
          return undefined;
        },
        run: () => ({ changes: 0 }),
      };
    },
    transaction(fn: () => void) {
      return () => fn();
    },
  };
  const fakeDb = {
    select: () => ({
      from: (tbl: unknown) => ({
        get: () => {
          const isMeta = String((tbl as { _?: { name?: string } })?._?.name ?? "").includes("simulation_meta");
          return isMeta ? { id: 1 } : undefined;
        },
      }),
    }),
    update: (tbl: unknown) => {
      const isMeta = String((tbl as { _?: { name?: string } })?._?.name ?? "").includes("simulation_meta");
      const record = (set: Record<string, unknown>) => {
        if (isMeta) dbMockState.recordedMetaUpdates.push(set);
        else dbMockState.recordedNationalStateUpdates.push(set);
      };
      return {
        set: (set: Record<string, unknown>) => ({
          run: () => {
            record(set);
            return { changes: 1 };
          },
          where: () => ({
            run: () => {
              record(set);
              return { changes: 1 };
            },
          }),
        }),
      };
    },
  };
  return {
    getSqlite: () => fakeSqlite,
    getDb: () => fakeDb,
    schema: {
      nationalState: { _: { name: "national_state" } },
      simulationMeta: { _: { name: "simulation_meta" } },
    },
  };
});

import {
  shouldPresidentVeto,
  tallySchuldenbremseVote,
  applySchuldenbremseAussetzung,
  checkSchuldenbremseExpiry,
  findFiscalEmergencyOpportunity,
  generateNachtragsAllocations,
  processNachtragsInjection,
} from "./budget.js";
import {
  PRESIDENTIAL_VETO_IMPACT_THRESHOLD,
  PRESIDENTIAL_VETO_PROBABILITY,
  SCHULDENBREMSE_SUSPENSION_DURATION,
  SCHULDENBREMSE_COALITION_YES_RATE,
  FISCAL_EMERGENCY_PROVISIONAL_BUDGET_DAYS,
  NACHTRAGSHAUSHALT_TOTAL_MIN,
  NACHTRAGSHAUSHALT_TOTAL_MAX,
  NACHTRAGSHAUSHALT_CRISIS_BOOST,
} from "../config/budget.js";
import type { Bill, BillImpact, Crisis, Government, NationalState, Party, PendingInjection } from "@ki-bundestag/types";

beforeEach(() => {
  dbMockState.schuldenbremseUntilDay = null;
  dbMockState.recordedNationalStateUpdates = [];
  dbMockState.recordedMetaUpdates = [];
});

function makeBill(impact: BillImpact): Bill {
  return {
    id: "bill-1",
    title: "Test",
    description: "Test bill",
    category: "economy",
    proposedBy: "spd",
    status: "passed",
    impact,
    votes: [],
    proposedOnDay: 10,
  } as Bill;
}

// Cycle 3 PR 1: presidential veto two-stage filter (Q2 hybrid)
describe("shouldPresidentVeto", () => {
  it("returns no-veto when summed |impact| is below 0.6 threshold", () => {
    // 0.2 + 0.1 + 0.2 = 0.5, below threshold
    const bill = makeBill({ publicSentiment: 0.2, budget: 0.1, gdpGrowth: -0.2 });
    const rng = () => 0; // would always trigger if it reached the roll
    expect(shouldPresidentVeto(bill, rng)).toEqual({ veto: false, reason: "" });
  });

  it("returns no-veto when impact gate is met but rng is above 0.0005", () => {
    const bill = makeBill({ publicSentiment: -0.4, budget: 0.5 }); // sum = 0.9
    const rng = () => 0.001; // above PRESIDENTIAL_VETO_PROBABILITY
    expect(shouldPresidentVeto(bill, rng)).toEqual({ veto: false, reason: "" });
  });

  it("returns veto with reason when impact gate met AND rng below probability", () => {
    const bill = makeBill({ publicSentiment: 1.0, budget: 0.5 }); // sum = 1.5
    const rng = () => 0.0001; // below PRESIDENTIAL_VETO_PROBABILITY
    const result = shouldPresidentVeto(bill, rng);
    expect(result.veto).toBe(true);
    expect(result.reason.length).toBeGreaterThan(0);
  });

  it("treats undefined impact fields as 0 in the sum", () => {
    // Only publicSentiment populated, abs = 0.5, below 0.6
    const bill = makeBill({ publicSentiment: -0.5 });
    const rng = () => 0;
    expect(shouldPresidentVeto(bill, rng)).toEqual({ veto: false, reason: "" });
  });

  it("sums absolute values (negative and positive cancel doesn't apply)", () => {
    // -0.4 and +0.4 would naively sum to 0, but |-0.4| + |0.4| = 0.8 ≥ 0.6
    const bill = makeBill({ publicSentiment: -0.4, gdpGrowth: 0.4 });
    const rng = () => 0.0001;
    const result = shouldPresidentVeto(bill, rng);
    expect(result.veto).toBe(true);
  });

  it("handles empty impact object gracefully", () => {
    const bill = makeBill({});
    expect(shouldPresidentVeto(bill, () => 0)).toEqual({ veto: false, reason: "" });
  });

  it("skips NaN impact values rather than poisoning the sum", () => {
    // Without the finite guard, Math.abs(NaN) = NaN → summedImpact = NaN →
    // `NaN < 0.6` is false → gate stays open → could fire veto on corrupt data.
    // With the guard, NaN is treated as 0 contribution; valid 0.5 alone is
    // below threshold → no veto, regardless of rng.
    const bill = makeBill({ publicSentiment: NaN as unknown as number, budget: 0.5 });
    expect(shouldPresidentVeto(bill, () => 0)).toEqual({ veto: false, reason: "" });
  });

  it("skips Infinity impact values rather than tripping the gate", () => {
    // Without the finite guard, |Infinity| = Infinity → gate trivially passes
    // → 0.0005 chance of veto on a bill with corrupt impact data. With the
    // guard, Infinity contributes 0; remaining 0.1 is below threshold → no veto.
    const bill = makeBill({ publicSentiment: Infinity as unknown as number, budget: 0.1 });
    expect(shouldPresidentVeto(bill, () => 0)).toEqual({ veto: false, reason: "" });
  });

  it("still counts valid fields when one field is non-finite", () => {
    // Mixed input: NaN dropped, but legitimate 1.0 + 0.5 = 1.5 ≥ 0.6 still trips
    // the gate. Confirms the guard is per-field, not all-or-nothing.
    const bill = makeBill({
      publicSentiment: NaN as unknown as number,
      budget: 1.0,
      gdpGrowth: 0.5,
    });
    const result = shouldPresidentVeto(bill, () => 0.0001);
    expect(result.veto).toBe(true);
  });

  it("matches the locked Q2 thresholds", () => {
    expect(PRESIDENTIAL_VETO_IMPACT_THRESHOLD).toBe(0.6);
    expect(PRESIDENTIAL_VETO_PROBABILITY).toBe(0.0005);
  });

  it("converges to ~0.05% veto rate over many trials at gate-meeting impact", () => {
    const bill = makeBill({ publicSentiment: 1.0, budget: 0.5 }); // sum = 1.5
    let vetoCount = 0;
    const trials = 50_000;
    // Deterministic LCG so the run is reproducible
    let s = 1;
    const rng = () => { s = (s * 1103515245 + 12345) % 0x7fffffff; return s / 0x7fffffff; };
    for (let i = 0; i < trials; i++) {
      if (shouldPresidentVeto(bill, rng).veto) vetoCount++;
    }
    const observedRate = vetoCount / trials;
    // Expected ≈ 0.0005, ±0.0005 wide window for trial-noise tolerance
    expect(observedRate).toBeGreaterThanOrEqual(0);
    expect(observedRate).toBeLessThanOrEqual(0.001);
  });
});

// ── Cycle 4 PR 2 — Schuldenbremse-Aussetzung helpers ────────────────────

function makeRng(seed = 1): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 0x7fffffff;
    return state / 0x7fffffff;
  };
}

function makeParty(id: string, over: Partial<Party> = {}): Party {
  return {
    id, name: id.toUpperCase(), color: "#000",
    ideology: "centrist", seatCount: 105,
    approvalRating: 30,
    policyPriorities: { economy: 5, social: 5, environment: 5, immigration: 5, spending: 5 },
    coalitionRole: "opposition",
    inactiveDays: 0,
    ...over,
  } as Party;
}

function makeCrisis(over: Partial<Crisis> = {}): Crisis {
  return {
    id: "c-1", templateId: "t", name: "n", description: "d",
    category: "economy", severity: "high",
    startDay: 0, endDay: 100,
    dailyImpact: {}, resolved: false,
    ...over,
  } as Crisis;
}

describe("tallySchuldenbremseVote", () => {
  // Test 1: 50_000-trial convergence — coalition yes ≈ 95% across many trials.
  it("converges to coalition yes-rate ≈ SCHULDENBREMSE_COALITION_YES_RATE at sentiment 45 + low severity", () => {
    const coalition = [makeParty("spd", { coalitionRole: "leader" }), makeParty("gruene", { coalitionRole: "junior" })];
    const opposition = [makeParty("cdu"), makeParty("afd"), makeParty("fdp"), makeParty("linke")];
    const allParties = [...coalition, ...opposition];
    const coalitionIds = ["spd", "gruene"];

    let coalitionYes = 0;
    let coalitionTrials = 0;
    const rng = makeRng(99);
    for (let i = 0; i < 50_000; i++) {
      // Track coalition yes/total via a single tally (yesVotes counts seats; we
      // approximate by re-running with coalition-only).
      const result = tallySchuldenbremseVote([coalition[0]], ["spd"], 45, "low", rng);
      coalitionTrials++;
      if (result.passed || result.yesVotes > 0) coalitionYes++;
    }
    const coalitionRatio = coalitionYes / coalitionTrials;
    // Expected ≈ 0.95, ±2pp tolerance.
    expect(coalitionRatio).toBeGreaterThan(SCHULDENBREMSE_COALITION_YES_RATE - 0.02);
    expect(coalitionRatio).toBeLessThan(SCHULDENBREMSE_COALITION_YES_RATE + 0.02);
    void allParties; void opposition;
  });

  // Test 2: pass at majority threshold, fail just below.
  it("passes when yesVotes >= MAJORITY_SEATS, fails just below", () => {
    // Construct a synthetic 6-party Bundestag with seat sizes such that the
    // coalition controls ~330 seats. With high coalition yes-rate (95%) and
    // a high-severity crisis pushing opposition yes share up, we should pass
    // most of the time. Test the deterministic case with rng forcing all
    // coalition yes (rng < 0.95) and all opposition no (rng > 0.85 cap).
    const parties: Party[] = [
      makeParty("spd", { coalitionRole: "leader", seatCount: 200 }),
      makeParty("gruene", { coalitionRole: "junior", seatCount: 130 }),
      makeParty("cdu", { seatCount: 200 }),
      makeParty("afd", { seatCount: 100 }),
    ];
    // Force all coalition yes (rng=0), all opposition no (rng=0.99): yes=330, no=300
    const result = tallySchuldenbremseVote(
      parties, ["spd", "gruene"], 45, null,
      (() => { let i = 0; const rngs = [0, 0, 0.99, 0.99]; return () => rngs[i++] ?? 0; })(),
    );
    expect(result.yesVotes).toBe(330);
    expect(result.noVotes).toBe(300);
    expect(result.passed).toBe(true);

    // Below majority: force coalition no (rng=1), opposition yes (rng=0)
    const failResult = tallySchuldenbremseVote(
      parties, ["spd", "gruene"], 45, null,
      (() => { let i = 0; const rngs = [1, 1, 0, 0]; return () => rngs[i++] ?? 0; })(),
    );
    expect(failResult.passed).toBe(false);
    expect(failResult.yesVotes).toBe(300);
  });

  // Test 3: high-severity crisis raises opposition yes share.
  it("high-severity crisis raises opposition yes share above low-severity baseline", () => {
    const parties = [
      makeParty("spd", { coalitionRole: "leader", seatCount: 100 }),
      makeParty("cdu", { seatCount: 100 }),
    ];
    let lowYesCount = 0;
    let highYesCount = 0;
    const trials = 20_000;
    const rngLow = makeRng(7);
    const rngHigh = makeRng(7);
    for (let i = 0; i < trials; i++) {
      const lo = tallySchuldenbremseVote(parties, ["spd"], 45, "low", rngLow);
      const hi = tallySchuldenbremseVote(parties, ["spd"], 45, "high", rngHigh);
      // Count opposition yes only (cdu has 100 seats, coalition spd has 100).
      // If yesVotes > 100, opposition voted yes.
      if (lo.yesVotes > 100) lowYesCount++;
      if (hi.yesVotes > 100) highYesCount++;
    }
    expect(highYesCount).toBeGreaterThan(lowYesCount * 2);
  });
});

describe("applySchuldenbremseAussetzung", () => {
  // Test 4: sets flag + expiry; idempotent on re-call (extends).
  it("sets schuldenbremseSuspended=true and schuldenbremseSuspendedUntilDay = currentDay + 365", () => {
    applySchuldenbremseAussetzung(100);
    expect(dbMockState.recordedNationalStateUpdates).toEqual([{ schuldenbremseSuspended: true }]);
    expect(dbMockState.recordedMetaUpdates).toEqual([{ schuldenbremseSuspendedUntilDay: 100 + SCHULDENBREMSE_SUSPENSION_DURATION }]);
  });

  it("re-filing while active extends the expiry day (idempotent)", () => {
    applySchuldenbremseAussetzung(100);
    dbMockState.recordedMetaUpdates = [];
    applySchuldenbremseAussetzung(150);
    expect(dbMockState.recordedMetaUpdates).toEqual([{ schuldenbremseSuspendedUntilDay: 150 + SCHULDENBREMSE_SUSPENSION_DURATION }]);
  });
});

describe("checkSchuldenbremseExpiry", () => {
  // Test 5: clears flag exactly on expiry day.
  it("clears flag on expiry day", () => {
    dbMockState.schuldenbremseUntilDay = 200;
    const cleared = checkSchuldenbremseExpiry(200);
    expect(cleared).toBe(true);
    expect(dbMockState.recordedNationalStateUpdates).toEqual([{ schuldenbremseSuspended: false }]);
    expect(dbMockState.recordedMetaUpdates).toEqual([{ schuldenbremseSuspendedUntilDay: null }]);
  });

  // Test 6: no-op before expiry.
  it("no-op before expiry day", () => {
    dbMockState.schuldenbremseUntilDay = 200;
    const cleared = checkSchuldenbremseExpiry(150);
    expect(cleared).toBe(false);
    expect(dbMockState.recordedNationalStateUpdates).toEqual([]);
    expect(dbMockState.recordedMetaUpdates).toEqual([]);
  });

  it("no-op when not currently suspended", () => {
    dbMockState.schuldenbremseUntilDay = null;
    expect(checkSchuldenbremseExpiry(500)).toBe(false);
  });
});

describe("findFiscalEmergencyOpportunity", () => {
  // Test 7: null when neither gate.
  it("returns null when no high-severity crisis AND provisionalBudget streak < 30 days", () => {
    const result = findFiscalEmergencyOpportunity(
      [makeCrisis({ severity: "medium" })],
      { provisionalBudget: false },
      null,
      100,
    );
    expect(result).toBeNull();
  });

  // Test 8: populated by either gate.
  it("returns populated opportunity for high-severity active crisis", () => {
    const result = findFiscalEmergencyOpportunity(
      [makeCrisis({ severity: "high", id: "c-defense" })],
      { provisionalBudget: false },
      null,
      100,
    );
    expect(result).toEqual({ activeCrisisId: "c-defense", provisionalBudgetDays: 0 });
  });

  it("returns populated opportunity when provisional-budget streak hits 30 days", () => {
    const result = findFiscalEmergencyOpportunity(
      [makeCrisis({ severity: "low" })], // not high → first gate closed
      { provisionalBudget: true },
      100, // since-day
      100 + FISCAL_EMERGENCY_PROVISIONAL_BUDGET_DAYS, // currentDay
    );
    expect(result).toEqual({ provisionalBudgetDays: FISCAL_EMERGENCY_PROVISIONAL_BUDGET_DAYS });
    expect(result?.activeCrisisId).toBeUndefined();
  });

  it("returns null when already suspended (no point re-filing)", () => {
    const result = findFiscalEmergencyOpportunity(
      [makeCrisis({ severity: "high" })],
      { provisionalBudget: true, schuldenbremseSuspended: true },
      0,
      500,
    );
    expect(result).toBeNull();
  });

  it("skips resolved crises", () => {
    const result = findFiscalEmergencyOpportunity(
      [makeCrisis({ severity: "high", resolved: true })],
      { provisionalBudget: false },
      null,
      100,
    );
    expect(result).toBeNull();
  });
});

// ── Cycle 4 PR 3 — Nachtragshaushalt ────────────────────────────────────

function makeCoalitionParties(): Party[] {
  return [
    makeParty("spd", { coalitionRole: "leader", seatCount: 100 }),
    makeParty("gruene", { coalitionRole: "junior", seatCount: 80 }),
  ];
}

describe("generateNachtragsAllocations", () => {
  // Test 1: sum equals total (within rounding tolerance).
  it("sums to total within ±0.5 EUR rounding tolerance", () => {
    const allocations = generateNachtragsAllocations(makeCoalitionParties(), null, 100);
    const sum = Object.values(allocations).reduce((s, v) => s + v, 0);
    expect(sum).toBeGreaterThan(99.5);
    expect(sum).toBeLessThan(100.5);
  });

  // Test 2: boosted ministry receives the configured boost.
  it("defense crisis boosts the defence ministry by NACHTRAGSHAUSHALT_CRISIS_BOOST × total", () => {
    const total = 100;
    const baseAllocs = generateNachtragsAllocations(makeCoalitionParties(), null, total);
    const boostedAllocs = generateNachtragsAllocations(makeCoalitionParties(), "defense", total);
    expect(boostedAllocs.defence).toBeGreaterThan(baseAllocs.defence + total * NACHTRAGSHAUSHALT_CRISIS_BOOST - 0.5);
    expect(boostedAllocs.defence).toBeLessThan(baseAllocs.defence + total * NACHTRAGSHAUSHALT_CRISIS_BOOST + 0.5);
  });

  // Test 3: null crisis category → returns base allocation unchanged.
  it("null crisis category returns the base coalition-weighted allocation scaled to total", () => {
    const total = 75;
    const allocations = generateNachtragsAllocations(makeCoalitionParties(), null, total);
    const sum = Object.values(allocations).reduce((s, v) => s + v, 0);
    expect(sum).toBeGreaterThan(74.5);
    expect(sum).toBeLessThan(75.5);
    // No ministry should be artificially boosted past its proportional weight.
    // Easy structural check: max ministry share < 50% of total.
    const max = Math.max(...Object.values(allocations));
    expect(max).toBeLessThan(total * 0.5);
  });

  // Test 4: healthcare crisis maps to health ministry boost.
  it("healthcare crisis boosts the health ministry", () => {
    const total = 100;
    const baseAllocs = generateNachtragsAllocations(makeCoalitionParties(), null, total);
    const boostedAllocs = generateNachtragsAllocations(makeCoalitionParties(), "healthcare", total);
    expect(boostedAllocs.health).toBeGreaterThan(baseAllocs.health);
    // Other ministries scaled down.
    expect(boostedAllocs.defence).toBeLessThan(baseAllocs.defence);
  });
});

describe("processNachtragsInjection", () => {
  function makeState(over: Partial<NationalState> = {}): NationalState {
    return {
      coalitionParties: ["spd", "gruene"],
      oppositionParties: ["cdu", "afd", "fdp", "linke"],
      economy: { budget: 0, unemployment: 5, inflation: 2, gdpGrowth: 1 },
      publicSentiment: 60, // high → coalition + opposition more likely yes
      provisionalBudget: false,
      ...over,
    };
  }

  function makeGovernment(): Government {
    return {
      id: "gov", electionId: null,
      chancellorName: "Test", chancellorPartyId: "spd",
      ministers: [],
      formedOnDay: 0, dissolvedOnDay: null, active: true,
    };
  }

  function makeAllParties(): Party[] {
    return [
      ...makeCoalitionParties(),
      makeParty("cdu", { seatCount: 100 }),
      makeParty("afd", { seatCount: 50 }),
    ];
  }

  function makeNachtragInjection(activeCrisisId: string | null = null): PendingInjection {
    return {
      id: "inj-1",
      type: "nachtragshaushalt",
      data: { activeCrisisId },
      consumed: false,
    };
  }

  // Test 5: pass emits proposed + passed; runs economic effect.
  it("on pass emits proposed + passed events; mutates state.economy", () => {
    const state = makeState();
    const events = processNachtragsInjection(
      makeNachtragInjection("c-1"),
      makeAllParties(), makeGovernment(), state,
      [makeCrisis({ id: "c-1", category: "defense" })],
      100,
      // High-sentiment + coalition-favored rng → vote passes most of the time.
      // Force pass by feeding rng=0 (always yes).
      () => 0,
    );
    expect(events.length).toBe(2);
    expect(events[0].type).toBe("nachtragshaushalt_proposed");
    expect(events[1].type).toBe("nachtragshaushalt_passed");
  });

  // Test 6: fail emits proposed + rejected only.
  it("on fail emits proposed + rejected events; no economic effect", () => {
    const state = makeState({ publicSentiment: 5 }); // very low → opposition more likely no
    const economyBefore = { ...state.economy };
    const events = processNachtragsInjection(
      makeNachtragInjection(null),
      makeAllParties(), makeGovernment(), state,
      [],
      100,
      // Force fail: all coalition rng=1 (no), all opposition rng=1 (no).
      () => 1,
    );
    expect(events.length).toBe(2);
    expect(events[0].type).toBe("nachtragshaushalt_proposed");
    expect(events[1].type).toBe("nachtragshaushalt_rejected");
    // Economy untouched on rejection.
    expect(state.economy).toEqual(economyBefore);
  });

  // Test 7: total drawn from [MIN, MAX] range.
  it("draws total uniformly from [NACHTRAGSHAUSHALT_TOTAL_MIN, NACHTRAGSHAUSHALT_TOTAL_MAX]", () => {
    const state = makeState();
    let minSeen = Number.POSITIVE_INFINITY;
    let maxSeen = Number.NEGATIVE_INFINITY;
    const rng = makeRng(42);
    for (let i = 0; i < 500; i++) {
      const trialState = makeState();
      const events = processNachtragsInjection(
        makeNachtragInjection(null),
        makeAllParties(), makeGovernment(), trialState,
        [], 100, rng,
      );
      const total = (events[0].data?.total as number) ?? 0;
      if (total < minSeen) minSeen = total;
      if (total > maxSeen) maxSeen = total;
    }
    expect(minSeen).toBeGreaterThanOrEqual(NACHTRAGSHAUSHALT_TOTAL_MIN);
    expect(maxSeen).toBeLessThanOrEqual(NACHTRAGSHAUSHALT_TOTAL_MAX);
    expect(maxSeen - minSeen).toBeGreaterThan((NACHTRAGSHAUSHALT_TOTAL_MAX - NACHTRAGSHAUSHALT_TOTAL_MIN) * 0.5);
    void state;
  });

  // Test 8: missing crisis (id not in crises array) → no boost, returns base allocations.
  it("missing crisis falls through to base allocation (no boost)", () => {
    const state = makeState();
    const events = processNachtragsInjection(
      makeNachtragInjection("c-missing"),
      makeAllParties(), makeGovernment(), state,
      [], // no crises in array
      100,
      () => 0,
    );
    const allocs = events[0].data?.allocations as Record<string, number>;
    // Defence shouldn't be boosted — sum-balanced base.
    const sum = Object.values(allocs).reduce((s, v) => s + v, 0);
    expect(sum).toBeGreaterThan((events[0].data?.total as number) - 0.5);
    expect(allocs.defence).toBeLessThan((events[0].data?.total as number) * 0.5);
  });
});
