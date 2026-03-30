import "dotenv/config";
import { runDay } from "./simulation/index.js";
import { closeDb, getSqlite } from "./db/index.js";
import { getDelayMs, shouldPauseForNight, type TimingPreset } from "./simulation/timing.js";
import { allProvidersLimited, AIProviderLimitError } from "./agent/client.js";

/** Clear dayStartedAt so the frontend stops showing "running" after a failure */
function clearDayStarted(): void {
  try {
    getSqlite().prepare("UPDATE simulation_meta SET day_started_at = NULL").run();
  } catch { /* best-effort */ }
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

let running = true;

process.on("SIGINT", () => {
  console.log("[Runner] Stopping auto-simulate...");
  running = false;
});

async function main() {
  const preset = readPreset();
  console.log(`[Runner] Auto-simulate: preset="${preset}" (Ctrl+C to stop)`);

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

    try {
      await runDay();
    } catch (err) {
      console.error("[Runner] Simulation day failed:", err);
      clearDayStarted();
      // If it's a spending limit error, don't keep looping — fall through to the allProvidersLimited() check
      if (err instanceof AIProviderLimitError) {
        console.error(`[Runner] API limit hit (${err.provider}), will pause below.`);
      }
    }

    if (!running) break;

    // If all AI providers are limited, pause until limits reset
    if (allProvidersLimited()) {
      console.log("\n  [Runner] All AI providers have hit usage limits. Pausing simulation.");
      console.log("  [Runner] Restart the process after limits reset, or press Ctrl+C to stop.\n");
      while (running && allProvidersLimited()) {
        await sleep(60_000);
      }
      if (!running) break;
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

  closeDb();
  console.log("[Runner] Auto-simulate stopped.");
}

main();
