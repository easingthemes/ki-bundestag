/**
 * Rollback simulation to a specific day.
 *
 * Deletes all data created after the target day and restores simulation state
 * (approval ratings, seats, meta) from party_history snapshots.
 *
 * Usage:
 *   npx tsx scripts/rollback-to-day.ts 140          # dry-run (default)
 *   npx tsx scripts/rollback-to-day.ts 140 --apply   # actually apply changes
 *
 * What it does:
 *   1. Backs up both databases
 *   2. Deletes all rows from day-keyed tables where day > target
 *   3. Reverts bills that had status changes after target day
 *   4. Restores party approval ratings from party_history snapshot
 *   5. Resets simulation_meta to target day
 *   6. Handles elections, governments, fraktionen that span the boundary
 */

import "dotenv/config";
import { getSqlite, getUserSqlite, closeDb } from "@ki-bundestag/engine";
import type Database from "better-sqlite3";
import { existsSync, copyFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// ---------------------------------------------------------------------------
// Parse args
// ---------------------------------------------------------------------------

const targetDay = parseInt(process.argv[2], 10);
const applyMode = process.argv.includes("--apply");

if (!targetDay || targetDay < 1) {
  console.error("Usage: npx tsx scripts/rollback-to-day.ts <day> [--apply]");
  console.error("  <day>     Target day to roll back to (keeps this day, deletes everything after)");
  console.error("  --apply   Actually apply changes (default is dry-run)");
  process.exit(1);
}

const mode = applyMode ? "APPLY" : "DRY-RUN";
console.log(`\n=== Rollback to Day ${targetDay} [${mode}] ===\n`);

// ---------------------------------------------------------------------------
// Open databases (via engine's connection module)
// ---------------------------------------------------------------------------

const simDb = getSqlite();
simDb.pragma("foreign_keys = OFF"); // Disable FK checks during rollback

let userDb: Database.Database | null = null;
try {
  userDb = getUserSqlite();
  userDb.pragma("foreign_keys = OFF");
} catch {
  console.log("(User DB not available — skipping user data cleanup)");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function count(db: Database.Database, sql: string, params: unknown[] = []): number {
  const row = db.prepare(sql).get(...params) as { cnt: number } | undefined;
  return row?.cnt ?? 0;
}

function deleteAndReport(db: Database.Database, table: string, where: string, params: unknown[], label?: string): number {
  const cnt = count(db, `SELECT COUNT(*) as cnt FROM ${table} WHERE ${where}`, params);
  if (cnt > 0) {
    console.log(`  ${label ?? table}: ${cnt} rows to delete`);
    if (applyMode) {
      db.prepare(`DELETE FROM ${table} WHERE ${where}`).run(...params);
    }
  }
  return cnt;
}

// ---------------------------------------------------------------------------
// 0. Verify target day exists
// ---------------------------------------------------------------------------

const meta = simDb.prepare("SELECT * FROM simulation_meta LIMIT 1").get() as Record<string, unknown>;
if (!meta) {
  console.error("No simulation_meta found. Is the DB seeded?");
  process.exit(1);
}

const currentDay = meta.current_day as number;
console.log(`Current day: ${currentDay}`);
console.log(`Target day:  ${targetDay}`);
console.log(`Days to roll back: ${currentDay - targetDay}\n`);

if (targetDay >= currentDay) {
  console.log("Target day is >= current day. Nothing to roll back.");
  process.exit(0);
}

// Check party_history has a snapshot for target day
const historyCount = count(simDb, "SELECT COUNT(*) as cnt FROM party_history WHERE day_number = ?", [targetDay]);
if (historyCount === 0) {
  console.error(`No party_history snapshot found for day ${targetDay}. Cannot restore approval ratings.`);
  console.error("Available snapshots (last 10):");
  const snapshots = simDb.prepare("SELECT DISTINCT day_number FROM party_history ORDER BY day_number DESC LIMIT 10").all() as Array<{ day_number: number }>;
  for (const s of snapshots) console.error(`  Day ${s.day_number}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 1. Backup
// ---------------------------------------------------------------------------

if (applyMode) {
  // Get DB file paths from pragmas
  const simDbPath = (simDb.pragma("database_list") as Array<{ file: string }>)[0]?.file;
  const userDbPath = userDb ? (userDb.pragma("database_list") as Array<{ file: string }>)[0]?.file : null;
  const ts = new Date().toISOString().replace(/[:.]/g, "-");

  console.log("Creating backups...");
  if (simDbPath) {
    const simBackup = `${simDbPath}.rollback-${ts}.bak`;
    copyFileSync(simDbPath, simBackup);
    console.log(`  ${simBackup}`);
  }
  if (userDbPath) {
    const userBackup = `${userDbPath}.rollback-${ts}.bak`;
    copyFileSync(userDbPath, userBackup);
    console.log(`  ${userBackup}`);
  }
  console.log("");
}

// ---------------------------------------------------------------------------
// 2. Delete day-keyed rows from SIM DB (day_number > targetDay)
// ---------------------------------------------------------------------------

console.log("--- Simulation DB ---");

const cutoff = targetDay; // delete where day > cutoff

// Simple day-number-keyed tables
deleteAndReport(simDb, "simulation_events", "day_number > ?", [cutoff]);
deleteAndReport(simDb, "party_history", "day_number > ?", [cutoff]);
deleteAndReport(simDb, "media_articles", "day_number > ?", [cutoff]);
deleteAndReport(simDb, "motions", "day_number > ?", [cutoff]);
deleteAndReport(simDb, "interpellations", "day_number > ?", [cutoff]);
deleteAndReport(simDb, "confidence_votes", "day_number > ?", [cutoff]);
deleteAndReport(simDb, "constitutional_challenges", "day_number > ?", [cutoff]);
deleteAndReport(simDb, "ai_calls", "day_number > ?", [cutoff]);
deleteAndReport(simDb, "day_summaries", "day_number > ?", [cutoff]);
deleteAndReport(simDb, "lobbying_events", "day_number > ?", [cutoff]);
deleteAndReport(simDb, "party_donations", "day_number > ?", [cutoff]);

// Tables with created_on_day
deleteAndReport(simDb, "bills", "proposed_on_day > ?", [cutoff]);
deleteAndReport(simDb, "polls", "created_on_day > ?", [cutoff]);
deleteAndReport(simDb, "referendums", "created_on_day > ?", [cutoff]);
deleteAndReport(simDb, "citizen_questions", "created_on_day > ?", [cutoff]);
deleteAndReport(simDb, "question_suggestions", "created_on_day > ?", [cutoff]);
deleteAndReport(simDb, "budgets", "proposed_on_day > ?", [cutoff]);

// Tables with start_day
deleteAndReport(simDb, "crises", "start_day > ?", [cutoff]);
deleteAndReport(simDb, "elections", "announced_on_day > ?", [cutoff]);

// Fraktionen/Government formed after cutoff
deleteAndReport(simDb, "fraktionen", "formed_on_day > ?", [cutoff]);
deleteAndReport(simDb, "government", "formed_on_day > ?", [cutoff]);

// Seat allocations after cutoff
deleteAndReport(simDb, "bundestag_seats", "allocated_on_day > ?", [cutoff]);
deleteAndReport(simDb, "committees", "created_on_day > ?", [cutoff]);
deleteAndReport(simDb, "committee_memberships", "assigned_on_day > ?", [cutoff]);
deleteAndReport(simDb, "sidejobs", "created_on_day > ?", [cutoff]);
deleteAndReport(simDb, "quiz_theses", "generated_on_day > ?", [cutoff]);

// Event queue: delete events scheduled for future days
deleteAndReport(simDb, "event_queue", "scheduled_for_day > ?", [cutoff]);

// Era summaries that start after cutoff
deleteAndReport(simDb, "era_summaries", "start_day > ?", [cutoff]);

// Real-world knowledge first used after cutoff (mark as unused, don't delete)
const knowledgeCount = count(simDb, "SELECT COUNT(*) as cnt FROM real_world_knowledge WHERE sim_day_first_used > ?", [cutoff]);
if (knowledgeCount > 0) {
  console.log(`  real_world_knowledge: ${knowledgeCount} rows to reset sim_day_first_used → NULL`);
  if (applyMode) {
    simDb.prepare("UPDATE real_world_knowledge SET sim_day_first_used = NULL WHERE sim_day_first_used > ?").run(cutoff);
  }
}

// ---------------------------------------------------------------------------
// 3. Revert bills that existed before cutoff but had status changes after
// ---------------------------------------------------------------------------

const billsToRevert = simDb.prepare(`
  SELECT id, title, status, proposed_on_day, status_changed_on_day
  FROM bills
  WHERE proposed_on_day <= ? AND status_changed_on_day > ?
`).all(cutoff, cutoff) as Array<{
  id: string; title: string; status: string;
  proposed_on_day: number; status_changed_on_day: number;
}>;

if (billsToRevert.length > 0) {
  console.log(`\n  Bills to revert status (proposed before day ${cutoff}, changed after):`);
  for (const bill of billsToRevert) {
    // Determine what status the bill should revert to based on its reading/pipeline stage
    // Bills in third_reading that "passed" with all-abstain votes should revert
    const revertStatus = bill.status === "passed" || bill.status === "rejected" || bill.status === "struck_down"
      ? "third_reading"  // was in voting stage
      : "proposed";      // safe fallback
    console.log(`    "${bill.title}" (day ${bill.proposed_on_day}): ${bill.status} → ${revertStatus}`);
    if (applyMode) {
      simDb.prepare(`
        UPDATE bills SET status = ?, status_changed_on_day = ?, votes = '[]',
          vetoed_by_president = 0
        WHERE id = ?
      `).run(revertStatus, bill.proposed_on_day, bill.id);
    }
  }
}

// Also handle crises that span the boundary (started before, end after)
const crisesToTruncate = count(simDb, "SELECT COUNT(*) as cnt FROM crises WHERE start_day <= ? AND end_day > ? AND resolved = 1", [cutoff, cutoff]);
if (crisesToTruncate > 0) {
  console.log(`\n  Crises spanning boundary: ${crisesToTruncate} to un-resolve`);
  if (applyMode) {
    simDb.prepare("UPDATE crises SET resolved = 0 WHERE start_day <= ? AND end_day > ? AND resolved = 1").run(cutoff, cutoff);
  }
}

// Un-dissolve fraktionen that were dissolved after cutoff but formed before
const fraktionenToRestore = count(simDb, "SELECT COUNT(*) as cnt FROM fraktionen WHERE formed_on_day <= ? AND dissolved_on_day > ?", [cutoff, cutoff]);
if (fraktionenToRestore > 0) {
  console.log(`  Fraktionen to un-dissolve: ${fraktionenToRestore}`);
  if (applyMode) {
    simDb.prepare("UPDATE fraktionen SET dissolved_on_day = NULL, status = 'active' WHERE formed_on_day <= ? AND dissolved_on_day > ?").run(cutoff, cutoff);
  }
}

// Un-dissolve governments that were dissolved after cutoff but formed before
const govToRestore = count(simDb, "SELECT COUNT(*) as cnt FROM government WHERE formed_on_day <= ? AND dissolved_on_day > ?", [cutoff, cutoff]);
if (govToRestore > 0) {
  console.log(`  Governments to un-dissolve: ${govToRestore}`);
  if (applyMode) {
    simDb.prepare("UPDATE government SET dissolved_on_day = NULL, active = 1 WHERE formed_on_day <= ? AND dissolved_on_day > ?").run(cutoff, cutoff);
  }
}

// Reactivate seats that were deactivated after cutoff
const seatsToReactivate = count(simDb, "SELECT COUNT(*) as cnt FROM bundestag_seats WHERE allocated_on_day <= ? AND active = 0", [cutoff]);
if (seatsToReactivate > 0) {
  console.log(`  Bundestag seats to reactivate: ${seatsToReactivate}`);
  if (applyMode) {
    simDb.prepare("UPDATE bundestag_seats SET active = 1 WHERE allocated_on_day <= ? AND active = 0").run(cutoff);
  }
}

// Reactivate polls/referendums that were closed during the corrupted period
const pollsToReactivate = count(simDb, "SELECT COUNT(*) as cnt FROM polls WHERE created_on_day <= ? AND expires_on_day > ? AND active = 0", [cutoff, cutoff]);
if (pollsToReactivate > 0) {
  console.log(`  Polls to reactivate: ${pollsToReactivate}`);
  if (applyMode) {
    simDb.prepare("UPDATE polls SET active = 1 WHERE created_on_day <= ? AND expires_on_day > ? AND active = 0").run(cutoff, cutoff);
  }
}

// Reset citizen questions that were "responded" during corrupted period back to pending
const questionsToReset = count(simDb, "SELECT COUNT(*) as cnt FROM citizen_questions WHERE responded_on_day > ? AND created_on_day <= ?", [cutoff, cutoff]);
if (questionsToReset > 0) {
  console.log(`  Citizen questions to reset to pending: ${questionsToReset}`);
  if (applyMode) {
    simDb.prepare("UPDATE citizen_questions SET response = NULL, responded_on_day = NULL, status = 'pending' WHERE responded_on_day > ? AND created_on_day <= ?").run(cutoff, cutoff);
  }
}

// Reset interpellations that were responded during corrupted period
const interpToReset = count(simDb, "SELECT COUNT(*) as cnt FROM interpellations WHERE responded_on_day > ? AND day_number <= ?", [cutoff, cutoff]);
if (interpToReset > 0) {
  console.log(`  Interpellations to reset to pending: ${interpToReset}`);
  if (applyMode) {
    simDb.prepare("UPDATE interpellations SET response = NULL, responded_on_day = NULL, status = 'pending' WHERE responded_on_day > ? AND day_number <= ?").run(cutoff, cutoff);
  }
}

// ---------------------------------------------------------------------------
// 4. Restore party approval ratings from party_history
// ---------------------------------------------------------------------------

console.log(`\nRestoring party state from day ${targetDay} snapshot:`);
const historyRows = simDb.prepare(`
  SELECT party_id, approval_rating, seat_count
  FROM party_history WHERE day_number = ?
`).all(targetDay) as Array<{ party_id: string; approval_rating: number; seat_count: number }>;

for (const h of historyRows) {
  console.log(`  ${h.party_id}: approval=${h.approval_rating.toFixed(1)}, seats=${h.seat_count}`);
  if (applyMode) {
    simDb.prepare("UPDATE parties SET approval_rating = ?, seat_count = ? WHERE id = ?")
      .run(h.approval_rating, h.seat_count, h.party_id);
  }
}

// ---------------------------------------------------------------------------
// 5. Reset simulation_meta
// ---------------------------------------------------------------------------

// Figure out next_election_day: find the most recent election before/at target day
const lastElection = simDb.prepare(`
  SELECT election_day FROM elections WHERE election_day <= ? ORDER BY election_day DESC LIMIT 1
`).get(targetDay) as { election_day: number } | undefined;

const termDays = 1461; // from TIME_CONFIG
const nextElectionDay = lastElection
  ? lastElection.election_day + termDays
  : (meta.next_election_day as number); // keep existing if no election found

console.log(`\nResetting simulation_meta:`);
console.log(`  current_day: ${currentDay} → ${targetDay}`);
console.log(`  next_election_day: ${meta.next_election_day} → ${nextElectionDay}`);
console.log(`  budget_retry_day: ${meta.budget_retry_day} → NULL`);
console.log(`  low_sentiment_streak: ${meta.low_sentiment_streak} → 0`);

if (applyMode) {
  simDb.prepare(`
    UPDATE simulation_meta SET
      current_day = ?,
      next_election_day = ?,
      budget_retry_day = NULL,
      low_sentiment_streak = 0,
      day_progress = 0,
      daily_summary = NULL,
      day_started_at = NULL,
      heartbeat_at = NULL
  `).run(targetDay, nextElectionDay);
}

// ---------------------------------------------------------------------------
// 6. User DB cleanup
// ---------------------------------------------------------------------------

if (userDb) {
  console.log("\n--- User DB ---");
  deleteAndReport(userDb, "notifications", "day_number > ?", [cutoff]);
  deleteAndReport(userDb, "mdb_speeches", "day_number > ?", [cutoff]);
  deleteAndReport(userDb, "user_actions", "sim_day > ?", [cutoff]);
  deleteAndReport(userDb, "mdb_applications", "created_on_day > ?", [cutoff]);
  deleteAndReport(userDb, "internal_proposals", "created_on_day > ?", [cutoff]);

  // Reset internal proposals that were reviewed during corrupted period
  const proposalsToReset = count(userDb, "SELECT COUNT(*) as cnt FROM internal_proposals WHERE reviewed_on_day > ? AND created_on_day <= ?", [cutoff, cutoff]);
  if (proposalsToReset > 0) {
    console.log(`  Internal proposals to reset to open: ${proposalsToReset}`);
    if (applyMode) {
      userDb.prepare("UPDATE internal_proposals SET status = 'open', reviewed_on_day = NULL, decline_reason = NULL, bundestag_bill_id = NULL WHERE reviewed_on_day > ? AND created_on_day <= ?").run(cutoff, cutoff);
    }
  }

  // Reset MdB application cooldowns that were set during corrupted period
  const appsToReset = count(userDb, "SELECT COUNT(*) as cnt FROM mdb_applications WHERE reviewed_on_day > ? AND created_on_day <= ?", [cutoff, cutoff]);
  if (appsToReset > 0) {
    console.log(`  MdB applications to reset: ${appsToReset}`);
    if (applyMode) {
      userDb.prepare("UPDATE mdb_applications SET status = 'pending', reviewed_on_day = NULL, ai_reasoning = NULL, cooldown_until_day = NULL WHERE reviewed_on_day > ? AND created_on_day <= ?").run(cutoff, cutoff);
    }
  }
}

// ---------------------------------------------------------------------------
// 7. Summary
// ---------------------------------------------------------------------------

console.log(`\n=== ${mode} Complete ===`);
if (!applyMode) {
  console.log("\nThis was a dry run. To apply changes, run:");
  console.log(`  npx tsx scripts/rollback-to-day.ts ${targetDay} --apply\n`);
} else {
  console.log(`\nSimulation rolled back to day ${targetDay}.`);
  console.log("Restart the simulation with: npm run simulate:auto\n");
}

// Cleanup
closeDb();
