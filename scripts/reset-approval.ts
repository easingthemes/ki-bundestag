/**
 * Reset party approval ratings and public sentiment to realistic values.
 *
 * Uses realistic polling-based defaults, or accepts custom values via CLI args.
 *
 * Usage:
 *   npx tsx scripts/reset-approval.ts                    # dry-run with defaults
 *   npx tsx scripts/reset-approval.ts --apply            # apply defaults
 *   npx tsx scripts/reset-approval.ts --apply spd=22 cdu=30 gruene=18 fdp=7 afd=12 linke=6
 *   npx tsx scripts/reset-approval.ts --apply sentiment=45   # also reset sentiment
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

const SENTIMENT_BASELINE = 45;

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const customArgs = args.filter(a => a !== "--apply" && a.includes("="));

// Build target map: start with seed values
const targets = new Map<string, number>(Object.entries(SEED_APPROVALS));
let sentimentTarget: number | null = SENTIMENT_BASELINE;

// Override with CLI args (e.g. spd=22, sentiment=50)
for (const arg of customArgs) {
  const [id, val] = arg.split("=");
  const num = parseFloat(val);
  if (!id || isNaN(num)) {
    console.error(`Invalid arg: ${arg} (expected format: partyId=number)`);
    process.exit(1);
  }
  if (id === "sentiment") {
    sentimentTarget = Math.max(5, Math.min(75, num));
    continue;
  }
  if (!targets.has(id)) {
    console.error(`Unknown party: ${id}. Valid: ${[...targets.keys()].join(", ")}, sentiment`);
    process.exit(1);
  }
  targets.set(id, Math.max(1, Math.min(60, num)));
}

const db = getSqlite();

// Show current approval values
const rows = db.prepare("SELECT id, name, approval_rating FROM parties ORDER BY approval_rating DESC").all() as any[];
console.log("\nCurrent approval ratings:");
for (const r of rows) {
  const target = targets.get(r.id) ?? r.approval_rating;
  const arrow = r.approval_rating !== target ? ` → ${target}%` : " (unchanged)";
  console.log(`  ${r.name.padEnd(25)} ${String(r.approval_rating).padStart(5)}%${arrow}`);
}

// Show current sentiment
const state = db.prepare("SELECT public_sentiment FROM national_state LIMIT 1").get() as any;
if (state && sentimentTarget !== null) {
  const current = state.public_sentiment;
  const arrow = current !== sentimentTarget ? ` → ${sentimentTarget}` : " (unchanged)";
  console.log(`\nPublic sentiment:        ${String(current).padStart(5)}${arrow}`);
}

if (!apply) {
  console.log("\nDry run — pass --apply to update the database.");
  closeDb();
  process.exit(0);
}

// Apply updates in a transaction
const updateParty = db.prepare("UPDATE parties SET approval_rating = ? WHERE id = ?");
const updateSentiment = db.prepare("UPDATE national_state SET public_sentiment = ?");
const tx = db.transaction(() => {
  for (const [id, rating] of targets) {
    updateParty.run(rating, id);
  }
  if (sentimentTarget !== null) {
    updateSentiment.run(sentimentTarget);
  }
});
tx();

console.log("\nApproval ratings and sentiment updated successfully.");
closeDb();
