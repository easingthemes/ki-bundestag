import type { BillImpact, EconomyState } from "@ki-bundestag/types";

// Mean-reversion baselines (realistic German economy 2025-2026)
const BASELINES = {
  budget: 45,          // ~45B EUR
  unemployment: 5.0,   // ~5% (OECD/Bundesagentur)
  inflation: 2.0,      // ~2% (ECB target)
  gdpGrowth: 0.8,      // ~0.8% (EU Commission forecast)
};

// Daily reversion rate toward baseline
const REVERSION = {
  budget: 0.01,        // 1%/day
  unemployment: 0.02,  // 2%/day
  inflation: 0.02,     // 2%/day
  gdpGrowth: 0.03,     // 3%/day
};

// Random drift magnitude per day
const DRIFT = {
  budget: 0.15,        // was 0.3
  unemployment: 0.02,  // was 0.05
  inflation: 0.015,    // was 0.03
  gdpGrowth: 0.008,    // was 0.02
};

// Realistic caps
const CAPS = {
  budget: [-20, 100] as [number, number],
  unemployment: [2.5, 20] as [number, number],
  inflation: [0, 10] as [number, number],
  gdpGrowth: [-3, 4] as [number, number],
};

// Max bill impact per indicator (clamp AI proposals)
const BILL_IMPACT_CAPS = {
  budget: 3,
  unemployment: 0.3,
  inflation: 0.2,
  gdpGrowth: 0.2,
};

// Apply mean-reversion + small random noise each day
export function applyEconomicDrift(economy: EconomyState): EconomyState {
  return {
    budget: round(economy.budget
      + (BASELINES.budget - economy.budget) * REVERSION.budget
      + randomDrift(DRIFT.budget)),
    unemployment: clamp(round(economy.unemployment
      + (BASELINES.unemployment - economy.unemployment) * REVERSION.unemployment
      + randomDrift(DRIFT.unemployment)), ...CAPS.unemployment),
    inflation: clamp(round(economy.inflation
      + (BASELINES.inflation - economy.inflation) * REVERSION.inflation
      + randomDrift(DRIFT.inflation)), ...CAPS.inflation),
    gdpGrowth: clamp(round(economy.gdpGrowth
      + (BASELINES.gdpGrowth - economy.gdpGrowth) * REVERSION.gdpGrowth
      + randomDrift(DRIFT.gdpGrowth)), ...CAPS.gdpGrowth),
  };
}

export function reverseBillImpact(economy: EconomyState, impact: BillImpact): EconomyState {
  return applyBillImpact(economy, {
    budget:          -(impact.budget ?? 0),
    unemployment:    -(impact.unemployment ?? 0),
    inflation:       -(impact.inflation ?? 0),
    gdpGrowth:       -(impact.gdpGrowth ?? 0),
    publicSentiment: -(impact.publicSentiment ?? 0),
  });
}

export function applyBillImpact(economy: EconomyState, impact: BillImpact): EconomyState {
  return {
    budget: round(economy.budget + clamp(impact.budget ?? 0, -BILL_IMPACT_CAPS.budget, BILL_IMPACT_CAPS.budget)),
    unemployment: clamp(round(economy.unemployment + clamp(impact.unemployment ?? 0, -BILL_IMPACT_CAPS.unemployment, BILL_IMPACT_CAPS.unemployment)), ...CAPS.unemployment),
    inflation: clamp(round(economy.inflation + clamp(impact.inflation ?? 0, -BILL_IMPACT_CAPS.inflation, BILL_IMPACT_CAPS.inflation)), ...CAPS.inflation),
    gdpGrowth: clamp(round(economy.gdpGrowth + clamp(impact.gdpGrowth ?? 0, -BILL_IMPACT_CAPS.gdpGrowth, BILL_IMPACT_CAPS.gdpGrowth)), ...CAPS.gdpGrowth),
  };
}

function randomDrift(magnitude: number): number {
  return (Math.random() - 0.5) * 2 * magnitude;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
