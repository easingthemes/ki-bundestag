import type { BillImpact, EconomyState } from "@ki-bundestag/types";
import {
  ECONOMY_BASELINES as BASELINES,
  ECONOMY_REVERSION as REVERSION,
  ECONOMY_DRIFT as DRIFT,
  ECONOMY_CAPS as CAPS,
  BILL_IMPACT_CAPS,
} from "../config/index.js";

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
