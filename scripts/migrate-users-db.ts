/**
 * One-time migration: move user tables from simulation.db → users.db
 *
 * Tables moved: users, internal_proposals, internal_votes, member_signals
 *
 * Usage: npx tsx scripts/migrate-users-db.ts
 */
import Database from "better-sqlite3";
import { getDbPath, getUserDbPath } from "@ki-bundestag/engine";
import fs from "node:fs";
import path from "node:path";

const USER_TABLE_DDL = `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL UNIQUE,
    party_id TEXT,
    created_at INTEGER NOT NULL,
    last_active INTEGER NOT NULL,
    switch_cooldown_until INTEGER
  );

  CREATE TABLE IF NOT EXISTS internal_proposals (
    id TEXT PRIMARY KEY,
    party_id TEXT NOT NULL,
    proposed_by TEXT NOT NULL,
    proposer_name TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    rationale TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    vote_score INTEGER NOT NULL DEFAULT 0,
    total_votes INTEGER NOT NULL DEFAULT 0,
    created_on_day INTEGER NOT NULL,
    review_by_day INTEGER NOT NULL,
    reviewed_on_day INTEGER,
    decline_reason TEXT,
    bundestag_bill_id TEXT
  );

  CREATE TABLE IF NOT EXISTS internal_votes (
    id TEXT PRIMARY KEY,
    proposal_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    vote INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS member_signals (
    id TEXT PRIMARY KEY,
    bill_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    signal TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
`;

const TABLES_TO_MIGRATE = ["users", "internal_proposals", "internal_votes", "member_signals"] as const;

function main() {
  const simDbPath = getDbPath();
  const userDbPath = getUserDbPath();

  if (!fs.existsSync(simDbPath)) {
    console.error(`Simulation DB not found at ${simDbPath}`);
    process.exit(1);
  }

  console.log(`Source: ${simDbPath}`);
  console.log(`Target: ${userDbPath}`);
  console.log();

  // Ensure target directory exists
  const dir = path.dirname(userDbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const simDb = new Database(simDbPath);
  simDb.pragma("journal_mode = WAL");

  const userDb = new Database(userDbPath);
  userDb.pragma("journal_mode = WAL");
  userDb.pragma("foreign_keys = ON");

  // Create tables in target
  userDb.exec(USER_TABLE_DDL);

  // Copy data
  for (const table of TABLES_TO_MIGRATE) {
    // Check if table exists in source
    const exists = simDb.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
    ).get(table);
    if (!exists) {
      console.log(`  ${table}: not found in source (skipping)`);
      continue;
    }

    const rows = simDb.prepare(`SELECT * FROM ${table}`).all() as Record<string, unknown>[];
    if (rows.length === 0) {
      console.log(`  ${table}: 0 rows (empty)`);
      continue;
    }

    // Check if target already has data
    const targetCount = (userDb.prepare(`SELECT COUNT(*) as cnt FROM ${table}`).get() as { cnt: number }).cnt;
    if (targetCount > 0) {
      console.log(`  ${table}: target already has ${targetCount} rows (skipping — delete target first if you want to re-migrate)`);
      continue;
    }

    const columns = Object.keys(rows[0]);
    const placeholders = columns.map(() => "?").join(", ");
    const insertStmt = userDb.prepare(
      `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`
    );

    const insertAll = userDb.transaction((data: Record<string, unknown>[]) => {
      for (const row of data) {
        insertStmt.run(...columns.map(c => row[c]));
      }
    });
    insertAll(rows);

    console.log(`  ${table}: ${rows.length} rows copied`);
  }

  console.log();

  // Drop tables from source
  console.log("Dropping migrated tables from simulation.db...");
  simDb.exec(`
    DROP TABLE IF EXISTS member_signals;
    DROP TABLE IF EXISTS internal_votes;
    DROP TABLE IF EXISTS internal_proposals;
    DROP TABLE IF EXISTS users;
  `);
  console.log("  Done.");

  simDb.close();
  userDb.close();

  console.log();
  console.log("Migration complete. Verify with:");
  console.log("  npm run dev:api && npm run dev:web");
}

main();
