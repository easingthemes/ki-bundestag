/**
 * runner-bot.ts — Persistent bot activity loop (run via PM2)
 *
 * Runs bot activity ticks at a configurable interval.
 * Designed to be managed with PM2:
 *   pm2 start npx --name ki-bot -- tsx scripts/runner-bot.ts
 *   pm2 stop ki-bot
 *   pm2 restart ki-bot
 *
 * Environment variables:
 *   BOT_INTERVAL_MS — tick interval in ms (default: 14400000 = 4 hours)
 *
 * Usage: npm run bot:start (via PM2)
 */

import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { runBotTick } from "./run-bot-activity.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function findMonorepoRoot(): string {
  let dir = __dirname;
  for (let i = 0; i < 10; i++) {
    const pkgPath = path.join(dir, "package.json");
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
        if (pkg.workspaces) return dir;
      } catch {}
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

const ROOT = findMonorepoRoot();
const SIM_DB_PATH = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.join(ROOT, "data", "simulation.db");

/** Check bots_enabled flag from simulation_meta (DB-backed, toggled via npm run bot:on/off). */
function botsEnabled(): boolean {
  try {
    const db = new Database(SIM_DB_PATH, { readonly: true });
    const row = db.prepare("SELECT bots_enabled FROM simulation_meta LIMIT 1").get() as
      | { bots_enabled: number }
      | undefined;
    db.close();
    return (row?.bots_enabled ?? 1) === 1;
  } catch {
    return true; // default to enabled if DB not available
  }
}

const INTERVAL_MS = parseInt(process.env.BOT_INTERVAL_MS || "14400000", 10); // 4 hours
const INTERVAL_LABEL = `${Math.round(INTERVAL_MS / 60_000)}min`;

let running = true;
let tickCount = 0;
let totalActions = 0;
let totalAiCalls = 0;
let startedAt = new Date();

function log(msg: string) {
  console.log(`[runner-bot] ${new Date().toISOString()} ${msg}`);
}

async function tick() {
  if (!botsEnabled()) {
    log("Bots disabled (BOTS_ENABLED=false) — skipping tick");
    return;
  }
  tickCount++;
  log(`Tick #${tickCount} starting...`);
  try {
    const result = await runBotTick();
    totalActions += result.actions;
    totalAiCalls += result.aiCalls;
    log(`Tick #${tickCount} done — ${result.actions} actions (${result.activeBots}/${result.totalBots} bots active)`);
  } catch (err) {
    log(`Tick #${tickCount} error: ${err}`);
  }
}

async function loop() {
  log(`Started — interval ${INTERVAL_LABEL}, PID ${process.pid}`);

  // Run first tick immediately
  await tick();

  while (running) {
    await new Promise(resolve => setTimeout(resolve, INTERVAL_MS));
    if (!running) break;
    await tick();
  }

  log(`Stopped after ${tickCount} ticks, ${totalActions} total actions, ${totalAiCalls} AI calls`);
}

// Graceful shutdown
function shutdown(signal: string) {
  log(`Received ${signal} — shutting down after current tick...`);
  running = false;
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Export state for status script
export function getRunnerState() {
  return { running, tickCount, totalActions, totalAiCalls, startedAt, intervalMs: INTERVAL_MS };
}

loop().catch(err => {
  log(`Fatal error: ${err}`);
  process.exit(1);
});
