import "dotenv/config";
import { runDay } from "./simulation/index.js";
import { closeDb } from "./db/index.js";

const INTERVAL_MS = parseInt(process.argv[2] || "30000", 10);

async function tick() {
  try {
    await runDay();
  } catch (err) {
    console.error("Simulation day failed:", err);
  }
}

async function main() {
  console.log(`Auto-simulate: running 1 day every ${INTERVAL_MS / 1000}s (Ctrl+C to stop)`);

  // Run first day immediately
  await tick();

  // Then loop on interval
  const timer = setInterval(tick, INTERVAL_MS);

  process.on("SIGINT", () => {
    console.log("\nStopping auto-simulate...");
    clearInterval(timer);
    closeDb();
    process.exit(0);
  });
}

main();
