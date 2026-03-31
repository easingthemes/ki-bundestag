/**
 * Human-friendly timing estimates for each speed preset
 * Based on 1461-day election cycle (4 sim years including leap year)
 *
 * Calculations (inter-day delay + batch API execution time):
 * - ultra-fast: ~5-15 min/day (AI-bound, batch polling ~2-5 min per submission)
 * - fast: 7 min delay + ~5-15 min batch ≈ ~12-22 min/day
 * - normal: ~30 min delay + 2-15 min batch ≈ 32-45 min/day → ~1 month
 * - slow: ~1.5 hr delay + 2-15 min batch ≈ ~1.5 hr/day → ~5 months
 *
 * Batch overhead depends on user count (1K: ~2 min, 100K: ~5 min, 1M: ~15 min).
 * Normal/slow modes absorb batch latency within their inter-day delay.
 */

import type { TimingPreset } from "../api";

/** Real-time duration for one full election term (1461 sim days) per preset */
export const TERM_DURATION: Record<TimingPreset, string> = {
  "ultra-fast": "~3–7 Tage",
  fast: "~2 Wochen",
  normal: "~1 Monat",
  slow: "~5 Monate",
};

/** Short label for the preset */
export const PRESET_LABEL: Record<TimingPreset, string> = {
  "ultra-fast": "Ultra-Schnell",
  fast: "Schnell",
  normal: "Normal",
  slow: "Langsam",
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
      // ~5 min per day (batch API polling ~2-5 min per submission, multiple batches/day)
      if (daysRemaining < 12) return `~${daysRemaining * 5} minutes`;
      if (daysRemaining < 288) return `~${Math.round((daysRemaining * 5) / 60)} hours`;
      return `~${Math.round((daysRemaining * 5) / 1440)} days`;
    case "fast":
      // 7 min delay + ~5 min batch ≈ 12 min per day
      const fastMins = daysRemaining * 12;
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
