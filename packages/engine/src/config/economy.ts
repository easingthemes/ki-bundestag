/**
 * Economic simulation configuration.
 *
 * Controls mean-reversion baselines, daily drift magnitude, hard caps,
 * and per-bill impact limits for all four economic indicators.
 */

/** Mean-reversion baselines (realistic German economy 2025-2026) */
export const ECONOMY_BASELINES = {
  budget: 45,          // ~45B EUR
  unemployment: 5.0,   // ~5% (OECD/Bundesagentur)
  inflation: 2.0,      // ~2% (ECB target)
  gdpGrowth: 0.8,      // ~0.8% (EU Commission forecast)
};

/** Daily reversion rate toward baseline */
export const ECONOMY_REVERSION = {
  budget: 0.01,        // 1%/day
  unemployment: 0.02,  // 2%/day
  inflation: 0.02,     // 2%/day
  gdpGrowth: 0.03,     // 3%/day
};

/** Random drift magnitude per day */
export const ECONOMY_DRIFT = {
  budget: 0.15,
  unemployment: 0.02,
  inflation: 0.015,
  gdpGrowth: 0.008,
};

/** Realistic hard caps [min, max] */
export const ECONOMY_CAPS = {
  budget: [-20, 100] as [number, number],
  unemployment: [2.5, 20] as [number, number],
  inflation: [0, 10] as [number, number],
  gdpGrowth: [-3, 4] as [number, number],
};

/** Max bill impact per indicator (clamp AI proposals) */
export const BILL_IMPACT_CAPS = {
  budget: 3,
  unemployment: 0.3,
  inflation: 0.2,
  gdpGrowth: 0.2,
};
