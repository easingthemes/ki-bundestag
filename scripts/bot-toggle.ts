/**
 * bot-toggle.ts — Enable or disable bot activity via simulation_meta DB flag.
 *
 * Usage:
 *   npx tsx scripts/bot-toggle.ts on       # Enable bots
 *   npx tsx scripts/bot-toggle.ts off      # Disable bots
 *   npx tsx scripts/bot-toggle.ts          # Show current status
 *
 * This persists in the database so it survives restarts and can be
 * triggered by external CI/CD workflows (e.g. GitHub Actions).
 */

import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

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

const db = new Database(SIM_DB_PATH);
db.pragma("journal_mode = WAL");

// Ensure bots_enabled column exists (safe to run before migrate)
try {
  db.prepare("SELECT bots_enabled FROM simulation_meta LIMIT 1").get();
} catch {
  try {
    db.prepare("ALTER TABLE simulation_meta ADD COLUMN bots_enabled INTEGER NOT NULL DEFAULT 1").run();
  } catch {}
}

function setBotsEnabled(value: number): void {
  const row = db.prepare("SELECT id FROM simulation_meta LIMIT 1").get() as { id: number } | undefined;
  if (row) {
    db.prepare("UPDATE simulation_meta SET bots_enabled = ?").run(value);
  } else {
    // No simulation_meta row yet (before first seed/simulate) — insert one
    db.prepare("INSERT INTO simulation_meta (current_day, bots_enabled) VALUES (0, ?)").run(value);
  }
}

function getBotsEnabled(): number {
  const row = db.prepare("SELECT bots_enabled FROM simulation_meta LIMIT 1").get() as
    | { bots_enabled: number }
    | undefined;
  return row?.bots_enabled ?? 1;
}

const arg = process.argv[2]?.toLowerCase();

if (arg === "on" || arg === "enable" || arg === "true" || arg === "1") {
  setBotsEnabled(1);
  console.log("✓ Bots ENABLED");
} else if (arg === "off" || arg === "disable" || arg === "false" || arg === "0") {
  setBotsEnabled(0);
  console.log("✓ Bots DISABLED");
} else {
  const enabled = getBotsEnabled();
  console.log(`Bots are currently ${enabled ? "ENABLED" : "DISABLED"}`);
  if (arg && arg !== "status") {
    console.log("\nUsage: npx tsx scripts/bot-toggle.ts [on|off|status]");
  }
}

db.close();
