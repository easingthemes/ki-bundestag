import { describe, it, expect } from "vitest";
import { applyEconomicDrift, applyBillImpact, reverseBillImpact } from "./economy.js";
import type { BillImpact, EconomyState } from "@ki-bundestag/types";

const BASE_ECONOMY: EconomyState = {
  budget: 45,
  unemployment: 5.0,
  inflation: 2.0,
  gdpGrowth: 0.8,
};

describe("applyEconomicDrift", () => {
  it("returns values within caps after many iterations", () => {
    let eco = { ...BASE_ECONOMY };
    for (let i = 0; i < 1000; i++) {
      eco = applyEconomicDrift(eco);
    }
    expect(eco.unemployment).toBeGreaterThanOrEqual(2.5);
    expect(eco.unemployment).toBeLessThanOrEqual(20);
    expect(eco.inflation).toBeGreaterThanOrEqual(0);
    expect(eco.inflation).toBeLessThanOrEqual(10);
    expect(eco.gdpGrowth).toBeGreaterThanOrEqual(-3);
    expect(eco.gdpGrowth).toBeLessThanOrEqual(4);
  });

  it("mean-reverts toward baseline over time", () => {
    // Start far from baseline
    let eco: EconomyState = { budget: 0, unemployment: 15, inflation: 8, gdpGrowth: -2 };
    for (let i = 0; i < 500; i++) {
      eco = applyEconomicDrift(eco);
    }
    // After 500 days, should be much closer to baselines
    expect(eco.unemployment).toBeGreaterThan(3);
    expect(eco.unemployment).toBeLessThan(8);
    expect(eco.inflation).toBeGreaterThan(1);
    expect(eco.inflation).toBeLessThan(4);
  });
});

describe("applyBillImpact", () => {
  it("applies impact within per-indicator caps", () => {
    const impact: BillImpact = { budget: 100, unemployment: 5, inflation: 3, gdpGrowth: 2 };
    const result = applyBillImpact(BASE_ECONOMY, impact);
    // Budget cap is ±3, unemployment ±0.3, inflation ±0.2, gdpGrowth ±0.2
    expect(result.budget).toBe(48); // 45 + 3 (capped)
    expect(result.unemployment).toBe(5.3); // 5 + 0.3 (capped)
    expect(result.inflation).toBe(2.2); // 2 + 0.2 (capped)
    expect(result.gdpGrowth).toBe(1.0); // 0.8 + 0.2 (capped)
  });

  it("clamps results within economy caps", () => {
    const eco: EconomyState = { budget: 45, unemployment: 2.5, inflation: 0, gdpGrowth: -3 };
    const negative: BillImpact = { unemployment: -1, inflation: -1, gdpGrowth: -1 };
    const result = applyBillImpact(eco, negative);
    expect(result.unemployment).toBe(2.5); // floor
    expect(result.inflation).toBe(0); // floor
    expect(result.gdpGrowth).toBe(-3); // floor (capped at -0.2 + already at -3)
  });

  it("handles missing impact fields gracefully", () => {
    const impact: BillImpact = { publicSentiment: 1 };
    const result = applyBillImpact(BASE_ECONOMY, impact);
    expect(result).toEqual(BASE_ECONOMY);
  });
});

describe("reverseBillImpact", () => {
  it("reverses a bill impact", () => {
    const impact: BillImpact = { budget: 2, unemployment: -0.1 };
    const after = applyBillImpact(BASE_ECONOMY, impact);
    const reversed = reverseBillImpact(after, impact);
    expect(reversed.budget).toBe(BASE_ECONOMY.budget);
    expect(reversed.unemployment).toBe(BASE_ECONOMY.unemployment);
  });
});
