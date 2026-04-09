/**
 * Reallocate Bundestag seats using the current timing preset.
 *
 * Use when preset was changed (e.g. ultra-fast → slow) and you want
 * seats to reflect the new ratio without waiting for an election.
 *
 * Usage:  npx tsx scripts/reallocate-seats.ts
 */

import { getDb, getSqlite, schema, resetAllSeats, allocateSeats, closeDb, closeUserDb } from "@ki-bundestag/engine";
import type { TimingPreset } from "@ki-bundestag/engine/src/simulation/timing.js";

const db = getDb();
const sqlite = getSqlite();

// Get current simulation state
const meta = db.select().from(schema.simulationMeta).limit(1).all()[0];
if (!meta) {
  console.error("No simulation meta found. Run npm run seed first.");
  process.exit(1);
}

const currentDay = meta.currentDay;
const preset = (meta.timingPreset ?? "slow") as TimingPreset;
console.log(`Current day: ${currentDay}, preset: ${preset}`);

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

console.log(`\nCurrent seat allocation:`);
for (const row of partySeatCounts) {
  const detail = sqlite.prepare(
    "SELECT controller, COUNT(*) as cnt FROM bundestag_seats WHERE active = 1 AND party_id = ? GROUP BY controller"
  ).all(row.party_id) as Array<{ controller: string; cnt: number }>;
  console.log(`  ${row.party_id}: ${row.cnt} total (${detail.map(d => `${d.cnt} ${d.controller}`).join(", ")})`);
}

console.log(`\nReallocating with "${preset}" preset...`);
resetAllSeats(currentDay);

for (const row of partySeatCounts) {
  allocateSeats(row.party_id, row.cnt, electionId, currentDay, preset);
}

// Show new allocation
console.log(`\nNew seat allocation:`);
const newCounts = sqlite.prepare(
  "SELECT party_id, controller, COUNT(*) as cnt FROM bundestag_seats WHERE active = 1 GROUP BY party_id, controller ORDER BY party_id, controller"
).all() as Array<{ party_id: string; controller: string; cnt: number }>;

let currentParty = "";
for (const row of newCounts) {
  if (row.party_id !== currentParty) {
    currentParty = row.party_id;
    process.stdout.write(`  ${row.party_id}: `);
  }
  process.stdout.write(`${row.cnt} ${row.controller}  `);
  // Check if next row is different party or last row
  const idx = newCounts.indexOf(row);
  if (idx === newCounts.length - 1 || newCounts[idx + 1].party_id !== currentParty) {
    console.log();
  }
}

console.log("\nDone! Users who held seats have been notified.");

closeDb();
closeUserDb();
