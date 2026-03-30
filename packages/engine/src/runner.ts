import "dotenv/config";
import { runDay } from "./simulation/index.js";
import { closeDb, getSqlite } from "./db/index.js";

const days = parseInt(process.argv[2] || "1", 10);

async function main() {
  console.log(`[SIM] Running ${days} simulation day(s)...`);

  for (let i = 0; i < days; i++) {
    await runDay();
  }

  closeDb();
  console.log("[SIM] Simulation complete.");
}

main().catch(err => {
  console.error("[SIM] Simulation failed:", err);
  // Clear dayStartedAt so the frontend stops showing "running"
  try { getSqlite().prepare("UPDATE simulation_meta SET day_started_at = NULL").run(); } catch { /* best-effort */ }
  closeDb();
  process.exit(1);
});
