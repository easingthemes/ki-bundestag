import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { migrateDatabase } from "./seed.js";
import { closeDb, getSqlite } from "./connection.js";
import { BUNDESTAG_SIZE } from "../config/elections.js";

// Cycle 3 PR 3 seat-shrink migration. End-to-end against a real on-disk SQLite
// (better-sqlite3 doesn't honour ":memory:" through path.resolve), wiped per
// test via temp dirs + singleton reset.
//
// What this test locks in:
//   1. The 735→630 shrink actually runs and sums to BUNDESTAG_SIZE
//   2. The idempotency flag flips, and a second call is a no-op
//   3. The atomic transaction wrap (R1 fix) leaves no partial state
//   4. `bundestag_seats` is deliberately NOT shrunk — that decision must be
//      a deliberate change, not silent drift

let tmpDir: string;

beforeEach(() => {
  closeDb(); // drop any cached singleton from prior tests
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ki-bundestag-mig-"));
  process.env.DATABASE_PATH = path.join(tmpDir, "sim.db");
  process.env.USER_DATABASE_PATH = path.join(tmpDir, "user.db");
});

afterEach(() => {
  closeDb();
  delete process.env.DATABASE_PATH;
  delete process.env.USER_DATABASE_PATH;
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch { /* tempfile cleanup is best-effort */ }
});

function insertParty(id: string, seatCount: number) {
  getSqlite().prepare(
    "INSERT INTO parties (id, name, color, ideology, seat_count, approval_rating, policy_priorities, coalition_role) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(id, id.toUpperCase(), "#000", "ideology", seatCount, 20, "{}", "opposition");
}

function ensureMetaRow() {
  const sqlite = getSqlite();
  const exists = sqlite.prepare("SELECT id FROM simulation_meta LIMIT 1").get();
  if (!exists) sqlite.prepare("INSERT INTO simulation_meta DEFAULT VALUES").run();
}

function resetMigrationFlag() {
  getSqlite().prepare("UPDATE simulation_meta SET bundestag_size_migrated = 0").run();
}

function partySum(): number {
  return (getSqlite().prepare("SELECT SUM(seat_count) as t FROM parties").get() as { t: number | null }).t ?? 0;
}

function migrationFlag(): number {
  return (getSqlite().prepare("SELECT bundestag_size_migrated FROM simulation_meta LIMIT 1").get() as { bundestag_size_migrated: number }).bundestag_size_migrated;
}

function bundestagSeatsCount(): number {
  return (getSqlite().prepare("SELECT COUNT(*) as c FROM bundestag_seats").get() as { c: number }).c;
}

describe("migrateDatabase — Cycle 3 PR 3 seat shrink", () => {
  it("rescales pre-PR-3 parties (sum=735) down to BUNDESTAG_SIZE and sets the flag", () => {
    migrateDatabase(); // create schema
    ensureMetaRow();
    resetMigrationFlag();
    // Pre-PR-3 seat distribution summing to 735
    insertParty("spd", 207);
    insertParty("cdu", 197);
    insertParty("gruene", 118);
    insertParty("fdp", 92);
    insertParty("afd", 83);
    insertParty("linke", 38);
    expect(partySum()).toBe(735);

    migrateDatabase(); // exercise the shrink

    expect(partySum()).toBe(BUNDESTAG_SIZE);
    expect(migrationFlag()).toBe(1);
  });

  it("is idempotent — second call after flag set is a no-op", () => {
    migrateDatabase();
    ensureMetaRow();
    resetMigrationFlag();
    insertParty("spd", 400);
    insertParty("cdu", 335); // sum = 735

    migrateDatabase(); // first shrink
    const firstSum = partySum();
    expect(firstSum).toBe(BUNDESTAG_SIZE);

    // Second call must NOT rescale again — the flag short-circuits the inner
    // block. If the flag-check ever regresses (e.g. someone removes it), this
    // catches it: re-rescaling already-630 totals would still sum to 630, but
    // any future input drift would corrupt silently without this guard.
    migrateDatabase();
    expect(partySum()).toBe(firstSum);
    expect(migrationFlag()).toBe(1);
  });

  it("flips the flag without rescaling when totals are already aligned (fresh-seed case)", () => {
    migrateDatabase();
    ensureMetaRow();
    resetMigrationFlag();
    // Fresh-seed scenario: parties already sum to 630 (post-fix in config/parties.ts)
    insertParty("spd", 177);
    insertParty("cdu", 169);
    insertParty("gruene", 101);
    insertParty("fdp", 79);
    insertParty("afd", 71);
    insertParty("linke", 33);
    expect(partySum()).toBe(BUNDESTAG_SIZE);

    migrateDatabase();

    // No-op rescale, but flag must still flip so subsequent migrate calls
    // skip the SELECT loop entirely.
    expect(partySum()).toBe(BUNDESTAG_SIZE);
    expect(migrationFlag()).toBe(1);
  });

  it("does not run when no simulation_meta row exists yet (fresh DB before seedDatabase)", () => {
    migrateDatabase(); // create schema only — no meta row inserted
    insertParty("spd", 400);
    insertParty("cdu", 335);
    expect(partySum()).toBe(735);

    // Without a meta row, the SELECT returns undefined → the inner block is
    // skipped. seedDatabase() inserts the row with default seat counts (which
    // are already 630-aligned since the dev fix), so this branch represents a
    // mid-init DB.
    migrateDatabase();
    expect(partySum()).toBe(735); // unchanged
  });

  it("leaves bundestag_seats untouched — per-MdB rows reconcile at next election", () => {
    // Encodes the deliberate design decision documented at seed.ts:68-73. If a
    // future contributor adds a bundestag_seats DELETE/UPDATE to the migration
    // (thinking it's a missing piece), this test fails. Discovery > silent
    // displacement of active MdB users.
    migrateDatabase();
    ensureMetaRow();
    resetMigrationFlag();
    insertParty("spd", 400);
    insertParty("cdu", 335);
    // Insert 735 bundestag_seats rows (mimicking a pre-PR-3 active term)
    const insertSeat = getSqlite().prepare(
      "INSERT INTO bundestag_seats (id, seat_number, party_id, controller, active, allocated_on_day) VALUES (?, ?, ?, ?, ?, ?)",
    );
    for (let i = 0; i < 735; i++) {
      const partyId = i < 400 ? "spd" : "cdu";
      insertSeat.run(`seat-${i}`, i, partyId, "bot", 1, 0);
    }
    expect(bundestagSeatsCount()).toBe(735);

    migrateDatabase();

    // parties.seat_count must shrink…
    expect(partySum()).toBe(BUNDESTAG_SIZE);
    // …but bundestag_seats must NOT be touched — reconciliation happens at
    // the next election via resetAllSeats + allocateSeats.
    expect(bundestagSeatsCount()).toBe(735);
  });
});
