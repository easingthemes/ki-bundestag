import "dotenv/config";
import { runDay } from "./simulation/index.js";
import { closeDb, getSqlite } from "./db/index.js";
import { printRunSummary } from "./simulation/run-stats.js";

const days = parseInt(process.argv[2] || "1", 10);

async function main() {
  console.log(`[SIM] Running ${days} simulation day(s)...`);
  const runStart = Date.now();
  const dayTimings: Array<{ day: number; durationMs: number }> = [];

  for (let i = 0; i < days; i++) {
    const dayStart = Date.now();
    const dayNum = readCurrentDay() + 1;
    await runDay();
    const durationMs = Date.now() - dayStart;
    dayTimings.push({ day: dayNum, durationMs });
    const durationSec = (durationMs / 1000).toFixed(1);
    console.log(`  [Timing] Day ${dayNum} completed in ${durationSec}s`);
  }

  printRunSummary(dayTimings, Date.now() - runStart);
  closeDb();
  console.log("[SIM] Simulation complete.");
}

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

main().catch(err => {
  console.error("[SIM] Simulation failed:", err);
  // Clear dayStartedAt and rollback currentDay so the failed day gets retried
  try {
    const sqlite = getSqlite();
    sqlite.prepare("UPDATE simulation_meta SET day_started_at = NULL").run();
  } catch { /* best-effort */ }
  closeDb();
  process.exit(1);
});
