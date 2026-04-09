/**
 * Reset party approval ratings to realistic values.
 *
 * Uses realistic polling-based defaults, or accepts custom values via CLI args.
 *
 * Usage:
 *   npx tsx scripts/reset-approval.ts                    # dry-run with defaults
 *   npx tsx scripts/reset-approval.ts --apply            # apply defaults
 *   npx tsx scripts/reset-approval.ts --apply spd=22 cdu=30 gruene=18 fdp=7 afd=12 linke=6
 */

import "dotenv/config";
import { getSqlite, closeDb } from "@ki-bundestag/engine";

// Realistic approval ratings (matching seed/polling data)
const SEED_APPROVALS: Record<string, number> = {
  spd: 26,
  cdu: 28,
  gruene: 15,
  fdp: 8,
  afd: 14,
  linke: 5,
};

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const customArgs = args.filter(a => a !== "--apply" && a.includes("="));

// Build target map: start with seed values
const targets = new Map<string, number>(Object.entries(SEED_APPROVALS));

// Override with CLI args (e.g. spd=22)
for (const arg of customArgs) {
  const [id, val] = arg.split("=");
  const num = parseFloat(val);
  if (!id || isNaN(num)) {
    console.error(`Invalid arg: ${arg} (expected format: partyId=number)`);
    process.exit(1);
  }
  if (!targets.has(id)) {
    console.error(`Unknown party: ${id}. Valid: ${[...targets.keys()].join(", ")}`);
    process.exit(1);
  }
  targets.set(id, Math.max(1, Math.min(60, num)));
}

const db = getSqlite();

// Show current values
const rows = db.prepare("SELECT id, name, approval_rating FROM parties ORDER BY approval_rating DESC").all() as any[];
console.log("\nCurrent approval ratings:");
for (const r of rows) {
  const target = targets.get(r.id) ?? r.approval_rating;
  const arrow = r.approval_rating !== target ? ` → ${target}%` : " (unchanged)";
  console.log(`  ${r.name.padEnd(25)} ${String(r.approval_rating).padStart(5)}%${arrow}`);
}

if (!apply) {
  console.log("\nDry run — pass --apply to update the database.");
  closeDb();
  process.exit(0);
}

// Apply updates
const update = db.prepare("UPDATE parties SET approval_rating = ? WHERE id = ?");
const tx = db.transaction(() => {
  for (const [id, rating] of targets) {
    update.run(rating, id);
  }
});
tx();

console.log("\nApproval ratings updated successfully.");
closeDb();
