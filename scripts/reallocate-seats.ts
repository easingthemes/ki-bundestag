/**
 * Reallocate Bundestag seats using the current or specified timing preset.
 *
 * Use when preset was changed (e.g. ultra-fast → slow) and you want
 * seats to reflect the new ratio without waiting for an election.
 *
 * Usage:
 *   npx tsx scripts/reallocate-seats.ts           # uses current preset from DB
 *   npx tsx scripts/reallocate-seats.ts slow       # override with specific preset
 *   npx tsx scripts/reallocate-seats.ts --dry-run  # preview without changes
 *
 * What this does:
 *   1. Deactivates all current seats (notifies seated users)
 *   2. Allocates new seats with the preset's human/bot/AI ratio
 *   3. Reassigns committee memberships to the new seats
 *   4. Expires pending MdB applications (users must re-apply)
 *
 * Safe to run: old seat rows are kept (active=0) so vote history
 * and other FK references remain intact.
 */

import { getDb, getSqlite, schema, resetAllSeats, allocateSeats, closeDb, getUserSqlite, closeUserDb } from "@ki-bundestag/engine";
import { assignCommitteeMemberships, shouldSeedCommittees, seedCommittees } from "@ki-bundestag/engine/src/simulation/committees.js";
import type { TimingPreset } from "@ki-bundestag/engine/src/simulation/timing.js";

const VALID_PRESETS: TimingPreset[] = ["ultra-fast", "fast", "normal", "slow"];

// Parse CLI args
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const presetArg = args.find(a => !a.startsWith("--")) as TimingPreset | undefined;

if (presetArg && !VALID_PRESETS.includes(presetArg)) {
  console.error(`Invalid preset "${presetArg}". Valid: ${VALID_PRESETS.join(", ")}`);
  process.exit(1);
}

const db = getDb();
const sqlite = getSqlite();

// Get current simulation state
const meta = db.select().from(schema.simulationMeta).limit(1).all()[0];
if (!meta) {
  console.error("No simulation meta found. Run npm run seed first.");
  process.exit(1);
}

const currentDay = meta.currentDay;
const dbPreset = meta.timingPreset as TimingPreset | undefined;
const preset = presetArg ?? dbPreset;

if (!preset) {
  console.error("No preset found in DB and none provided as argument.");
  console.error(`Usage: npx tsx scripts/reallocate-seats.ts <${VALID_PRESETS.join("|")}>`);
  process.exit(1);
}

if (presetArg && dbPreset && presetArg !== dbPreset) {
  console.log(`Note: DB preset is "${dbPreset}", using CLI override "${presetArg}"`);
}

console.log(`Day ${currentDay} | Preset: ${preset}${dryRun ? " | DRY RUN" : ""}`);

// Get current seat counts per party (from active seats)
const partySeatCounts = sqlite.prepare(
  "SELECT party_id, COUNT(*) as cnt FROM bundestag_seats WHERE active = 1 GROUP BY party_id"
).all() as Array<{ party_id: string; cnt: number }>;

if (partySeatCounts.length === 0) {
  console.error("No active seats found.");
  process.exit(1);
}

// Get the election ID from current seats
const currentElection = sqlite.prepare(
  "SELECT election_id FROM bundestag_seats WHERE active = 1 LIMIT 1"
).get() as { election_id: string } | undefined;

const electionId = currentElection?.election_id ?? "manual-realloc";

// Count seated users
const seatedUsers = sqlite.prepare(
  "SELECT COUNT(*) as cnt FROM bundestag_seats WHERE active = 1 AND user_id IS NOT NULL"
).get() as { cnt: number };

console.log(`\nCurrent seat allocation (${seatedUsers.cnt} users seated):`);
for (const row of partySeatCounts) {
  const detail = sqlite.prepare(
    "SELECT controller, COUNT(*) as cnt, SUM(CASE WHEN user_id IS NOT NULL THEN 1 ELSE 0 END) as occupied FROM bundestag_seats WHERE active = 1 AND party_id = ? GROUP BY controller"
  ).all(row.party_id) as Array<{ controller: string; cnt: number; occupied: number }>;
  console.log(`  ${row.party_id}: ${row.cnt} total (${detail.map(d => `${d.cnt} ${d.controller} [${d.occupied} occupied]`).join(", ")})`);
}

if (dryRun) {
  console.log("\n[DRY RUN] No changes made. Remove --dry-run to apply.");
  closeDb();
  closeUserDb();
  process.exit(0);
}

// Reallocate
console.log(`\nReallocating with "${preset}" preset...`);
resetAllSeats(currentDay);

for (const row of partySeatCounts) {
  allocateSeats(row.party_id, row.cnt, electionId, currentDay, preset);
}

// Expire pending applications (same as election flow in loop.ts)
try {
  const userSqlite = getUserSqlite();
  const expired = userSqlite.prepare("UPDATE mdb_applications SET status = 'expired' WHERE status = 'pending'").run();
  if (expired.changes > 0) {
    console.log(`  [Apps] ${expired.changes} pending application(s) expired`);
  }
} catch { /* table may not exist yet */ }

// Reassign committee memberships (same as election flow in loop.ts)
try {
  if (shouldSeedCommittees()) seedCommittees(currentDay);
  assignCommitteeMemberships(currentDay);
  console.log("  [Committees] Memberships reassigned");
} catch (err) {
  console.warn("  [Committees] Assignment failed:", (err as Error).message);
}

// Show new allocation
console.log(`\nNew seat allocation:`);
const newCounts = sqlite.prepare(
  "SELECT party_id, controller, COUNT(*) as cnt FROM bundestag_seats WHERE active = 1 GROUP BY party_id, controller ORDER BY party_id, controller"
).all() as Array<{ party_id: string; controller: string; cnt: number }>;

let currentParty = "";
for (const row of newCounts) {
  if (row.party_id !== currentParty) {
    if (currentParty) console.log();
    currentParty = row.party_id;
    process.stdout.write(`  ${row.party_id}: `);
  }
  process.stdout.write(`${row.cnt} ${row.controller}  `);
}
console.log();

console.log("\nDone! Seated users were notified. They can re-apply for seats.");

closeDb();
closeUserDb();
