/**
 * Migration: add timing preset support to existing simulations.
 *
 * - Ensures new columns/tables exist (timing_preset, event_queue, notifications)
 * - Sets timing_preset = 'normal' (safe default, preserves participatory features)
 * - Rescales nextElectionDay from old 120-day terms to new 1461-day terms
 *
 * Idempotent — safe to run multiple times.
 *
 * Usage: npx tsx scripts/migrate-timing.ts
 */
import Database from "better-sqlite3";
import { getDbPath, getUserDbPath } from "@ki-bundestag/engine";
import fs from "node:fs";
import path from "node:path";

const OLD_TERM_DAYS = 120;
const NEW_TERM_DAYS = 1461;

function main() {
  const simDbPath = getDbPath();
  const userDbPath = getUserDbPath();

  if (!fs.existsSync(simDbPath)) {
    console.error(`Simulation DB not found at ${simDbPath}`);
    process.exit(1);
  }

  console.log(`Simulation DB: ${simDbPath}`);
  console.log(`User DB:       ${userDbPath}`);
  console.log();

  // ── Simulation DB ──
  const simDb = new Database(simDbPath);
  simDb.pragma("journal_mode = WAL");

  // Ensure timing_preset column exists
  try {
    simDb.exec("ALTER TABLE simulation_meta ADD COLUMN timing_preset TEXT NOT NULL DEFAULT 'normal'");
    console.log("  Added timing_preset column to simulation_meta");
  } catch {
    // Column already exists
  }

  // Ensure event_queue table exists
  simDb.exec(`
    CREATE TABLE IF NOT EXISTS event_queue (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      event_data TEXT NOT NULL DEFAULT '{}',
      scheduled_for_day INTEGER NOT NULL,
      queued_at TEXT NOT NULL,
      processed_at TEXT,
      status TEXT NOT NULL DEFAULT 'queued'
    )
  `);
  console.log("  Ensured event_queue table exists");

  // Read current state
  const meta = simDb.prepare("SELECT current_day, next_election_day, timing_preset FROM simulation_meta LIMIT 1").get() as {
    current_day: number;
    next_election_day: number;
    timing_preset: string;
  } | undefined;

  if (!meta) {
    console.log("  No simulation_meta row found — nothing to migrate.");
    simDb.close();
    return;
  }

  console.log();
  console.log(`  Current state:`);
  console.log(`    currentDay:      ${meta.current_day}`);
  console.log(`    nextElectionDay: ${meta.next_election_day}`);
  console.log(`    timingPreset:    ${meta.timing_preset}`);

  // Set preset to 'normal' if not already set to something valid
  const validPresets = ["ultra-fast", "fast", "normal", "slow"];
  if (!validPresets.includes(meta.timing_preset)) {
    simDb.prepare("UPDATE simulation_meta SET timing_preset = 'normal'").run();
    console.log(`    → Set timing_preset to 'normal'`);
  } else {
    console.log(`    → timing_preset already valid (${meta.timing_preset})`);
  }

  // Rescale nextElectionDay if it looks like old 120-day system
  // Heuristic: if nextElectionDay <= currentDay + OLD_TERM_DAYS + 10, it's old system
  const gap = meta.next_election_day - meta.current_day;
  if (gap <= OLD_TERM_DAYS + 10 && gap > 0) {
    // Proportional rescale
    const dayInTerm = meta.current_day % OLD_TERM_DAYS;
    const proportionRemaining = 1 - (dayInTerm / OLD_TERM_DAYS);
    const newNextElection = meta.current_day + Math.round(proportionRemaining * NEW_TERM_DAYS);

    simDb.prepare("UPDATE simulation_meta SET next_election_day = ?").run(newNextElection);
    console.log(`    → Rescaled nextElectionDay: ${meta.next_election_day} → ${newNextElection}`);
    console.log(`      (dayInTerm=${dayInTerm}, proportionRemaining=${proportionRemaining.toFixed(3)})`);
  } else if (gap <= 0) {
    // Election overdue — set to next term from current day
    const newNextElection = meta.current_day + NEW_TERM_DAYS;
    simDb.prepare("UPDATE simulation_meta SET next_election_day = ?").run(newNextElection);
    console.log(`    → nextElectionDay was overdue (${meta.next_election_day}), reset to ${newNextElection}`);
  } else {
    console.log(`    → nextElectionDay already looks rescaled (gap=${gap}), no change`);
  }

  simDb.close();

  // ── User DB ──
  const dir = path.dirname(userDbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const userDb = new Database(userDbPath);
  userDb.pragma("journal_mode = WAL");
  userDb.pragma("foreign_keys = ON");

  // Ensure notifications table exists
  userDb.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      data TEXT NOT NULL DEFAULT '{}',
      read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      day_number INTEGER NOT NULL DEFAULT 0
    )
  `);
  console.log("  Ensured notifications table exists in user DB");

  userDb.close();

  console.log();
  console.log("Migration complete.");
}

main();
