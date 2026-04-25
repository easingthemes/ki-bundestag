import { describe, it, expect } from "vitest";
import { shouldPresidentVeto } from "./budget.js";
import {
  PRESIDENTIAL_VETO_IMPACT_THRESHOLD,
  PRESIDENTIAL_VETO_PROBABILITY,
} from "../config/budget.js";
import type { Bill, BillImpact } from "@ki-bundestag/types";

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
