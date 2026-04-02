import "dotenv/config";
import { runDay } from "./simulation/index.js";
import { closeDb, getSqlite } from "./db/index.js";
import { getDelayMs, shouldPauseForNight, type TimingPreset } from "./simulation/timing.js";
import { allProvidersLimited, allProvidersUnavailable, AIProviderLimitError, AIProviderAuthError } from "./agent/client.js";
import { getDayAIHealth } from "./agent/cost-tracker.js";
import { printRunSummary } from "./simulation/run-stats.js";

/** Clear dayStartedAt so the frontend stops showing "running" after a failure */
function clearDayStarted(): void {
  try {
    getSqlite().prepare("UPDATE simulation_meta SET day_started_at = NULL").run();
  } catch { /* best-effort */ }
}

/** Read current day number from DB */
function readCurrentDay(): number {
  try {
    const row = getSqlite()
      .prepare("SELECT current_day FROM simulation_meta LIMIT 1")
      .get() as { current_day: number } | undefined;
    return row?.current_day ?? 0;
  } catch {
    return 0;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function readPreset(): TimingPreset {
  try {
    const row = getSqlite()
      .prepare("SELECT timing_preset FROM simulation_meta LIMIT 1")
      .get() as { timing_preset: string } | undefined;
    return (row?.timing_preset as TimingPreset) ?? "normal";
  } catch {
    return "normal";
  }
}

/** Number of consecutive days where ALL AI calls failed (0 successes). */
let consecutiveAIFailDays = 0;

/** Threshold: pause after this many consecutive days with 0% AI success. */
const AI_FAIL_PAUSE_THRESHOLD = 2;

let running = true;

process.on("SIGINT", () => {
  console.log("[Runner] Stopping auto-simulate...");
  running = false;
});

async function main() {
  const preset = readPreset();
  console.log(`[Runner] Auto-simulate: preset="${preset}" (Ctrl+C to stop)`);
  const runStart = Date.now();
  const dayTimings: Array<{ day: number; durationMs: number }> = [];
  let daysCompleted = 0;

  while (running) {
    // Night pause for slow mode: wait until morning
    if (shouldPauseForNight(preset)) {
      console.log("  [Runner] Night pause (slow mode) — waiting until 08:00 CET...");
      while (running && shouldPauseForNight(preset)) {
        await sleep(60_000); // check every 60s
      }
      if (!running) break;
      console.log("  [Runner] Morning — resuming simulation");
    }

    const dayBefore = readCurrentDay();
    const dayStart = Date.now();
    try {
      await runDay();
      const durationMs = Date.now() - dayStart;
      const dayAfter = readCurrentDay();
      dayTimings.push({ day: dayAfter, durationMs });
      daysCompleted++;
      const durationSec = (durationMs / 1000).toFixed(1);
      console.log(`  [Timing] Day ${dayAfter} completed in ${durationSec}s`);

      // Check AI health: did any AI calls succeed this day?
      // Two failure modes: (1) batch submitted but all results failed (totalCalls > 0, successfulCalls = 0)
      // (2) batch submission itself threw, so no results recorded at all (totalCalls = 0)
      // Both indicate the AI provider is broken (expired key, sustained outage, etc.)
      const health = getDayAIHealth(dayAfter);
      const aiCompletelyFailed = health.totalCalls === 0 || health.successfulCalls === 0;
      if (aiCompletelyFailed) {
        consecutiveAIFailDays++;
        const detail = health.totalCalls === 0
          ? "no AI calls recorded (batch submission failed)"
          : `ALL ${health.totalCalls} AI calls failed`;
        console.warn(`  [Runner] Day ${dayAfter}: ${detail} (${consecutiveAIFailDays} consecutive)`);
      } else {
        consecutiveAIFailDays = 0;
      }

      // Print periodic summary every 10 days
      if (daysCompleted % 10 === 0) {
        printRunSummary(dayTimings.slice(-10), Date.now() - runStart, { periodic: true, totalDays: daysCompleted });
      }
    } catch (err) {
      console.error("[Runner] Simulation day failed:", err);
      clearDayStarted();

      // Rollback currentDay if it was advanced during the failed runDay()
      const dayAfter = readCurrentDay();
      if (dayAfter > dayBefore) {
        try {
          getSqlite().prepare("UPDATE simulation_meta SET current_day = ?").run(dayBefore);
          console.log(`  [Runner] Rolled back current_day from ${dayAfter} to ${dayBefore}`);
        } catch { /* best-effort */ }
      }

      // Auth failure = non-recoverable, stop immediately if all providers are down
      if (err instanceof AIProviderAuthError) {
        console.error(`[Runner] Auth failure (${err.provider}) — provider disabled for this session.`);
      }

      // If it's a spending limit error, don't keep looping — fall through to the allProvidersLimited() check
      if (err instanceof AIProviderLimitError) {
        console.error(`[Runner] API limit hit (${err.provider}), will pause below.`);
      }
    }

    if (!running) break;

    // If all providers are unavailable (auth-failed or limited), stop immediately
    if (allProvidersUnavailable()) {
      console.error(`\n  [Runner] *** All AI providers are unavailable (auth failure or usage limit) — stopping simulation ***`);
      console.error(`  [Runner] Fix the API key/billing issue and restart the process.\n`);
      running = false;
      break;
    }

    // If all AI providers are limited (but not auth-failed), pause until limits reset
    if (allProvidersLimited()) {
      console.log("\n  [Runner] All AI providers have hit usage limits. Pausing simulation.");
      console.log("  [Runner] Restart the process after limits reset, or press Ctrl+C to stop.\n");
      while (running && allProvidersLimited()) {
        await sleep(60_000);
      }
      if (!running) break;
    }

    // If N consecutive days had 0% AI success, the API key is likely dead.
    // Stop the loop to avoid producing more empty days.
    if (consecutiveAIFailDays >= AI_FAIL_PAUSE_THRESHOLD) {
      console.error(`\n  [Runner] *** ${consecutiveAIFailDays} consecutive days with 0% AI success — stopping simulation ***`);
      console.error(`  [Runner] Likely cause: expired/invalid API key, or sustained API outage.`);
      console.error(`  [Runner] Fix the issue and restart the process.\n`);
      running = false;
      break;
    }

    const delay = getDelayMs(preset);
    if (delay > 0 && delay !== Infinity) {
      const delaySec = Math.round(delay / 1000);
      console.log(`  [Runner] Next day in ${delaySec}s`);
      // Sleep in 5s chunks so SIGINT is responsive
      const chunks = Math.ceil(delay / 5000);
      for (let i = 0; i < chunks && running; i++) {
        await sleep(Math.min(5000, delay - i * 5000));
      }
    }
    // ultra-fast (delay=0): no wait, loop immediately
  }

  // Final summary
  if (dayTimings.length > 0) {
    printRunSummary(dayTimings, Date.now() - runStart);
  }

  closeDb();
  console.log("[Runner] Auto-simulate stopped.");
}

main();
