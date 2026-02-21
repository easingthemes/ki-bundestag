/**
 * Human-friendly timing estimates for each speed preset
 * Based on 1461-day election cycle (4 sim years including leap year)
 *
 * Calculations:
 * - ultra-fast: ~1 min/day × 1461 = ~24 hours
 * - fast: 7 min/day × 1461 = ~1 week
 * - normal: ~30 min avg/day × 1461 ≈ 30 days
 * - slow: ~1.5 hr/day with night pause ≈ 5 months
 */

import type { TimingPreset } from "../api";

/** Real-time duration for one full election term (1461 sim days) per preset */
export const TERM_DURATION: Record<TimingPreset, string> = {
  "ultra-fast": "~24 hours",
  fast: "~1 week",
  normal: "~1 month",
  slow: "~5 months",
};

/** Short label for the preset */
export const PRESET_LABEL: Record<TimingPreset, string> = {
  "ultra-fast": "Ultra-Fast",
  fast: "Fast",
  normal: "Normal",
  slow: "Slow",
};

/**
 * Get a human-friendly description of how long until next election
 * @param daysRemaining Number of sim days until election
 * @param preset Current timing preset
 */
export function formatTimeToElection(daysRemaining: number, preset: TimingPreset): string {
  // For 4 sim years (1461 days), return term duration
  if (daysRemaining >= 1400) {
    return TERM_DURATION[preset];
  }

  // Calculate rough real-time estimates based on preset
  switch (preset) {
    case "ultra-fast":
      // ~1 min per day
      if (daysRemaining < 60) return `~${daysRemaining} minutes`;
      return `~${Math.round(daysRemaining / 60)} hours`;
    case "fast":
      // 7 min per day
      const fastMins = daysRemaining * 7;
      if (fastMins < 60) return `~${fastMins} minutes`;
      if (fastMins < 1440) return `~${Math.round(fastMins / 60)} hours`;
      return `~${Math.round(fastMins / 1440)} days`;
    case "normal":
      // ~30 min avg per day
      const normalDays = Math.round((daysRemaining * 30) / 1440);
      if (normalDays < 1) return "< 1 day";
      if (normalDays === 1) return "~1 day";
      return `~${normalDays} days`;
    case "slow":
      // ~1.5 hr per day with night pause ≈ 2.2 hr avg
      const slowDays = Math.round((daysRemaining * 2.2 * 60) / 1440);
      if (slowDays < 7) return `~${slowDays} days`;
      if (slowDays < 30) return `~${Math.round(slowDays / 7)} weeks`;
      return `~${Math.round(slowDays / 30)} months`;
  }
}
