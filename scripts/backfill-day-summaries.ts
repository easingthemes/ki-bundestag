/**
 * Backfill day_summaries for all past days that don't have one yet.
 * Uses event data to build deterministic summaries (no AI calls).
 *
 * Usage: npx tsx scripts/backfill-day-summaries.ts
 */

import { getDb, getSqlite, migrateDatabase, schema } from "@ki-bundestag/engine";

// Ensure schema is up to date
migrateDatabase();

const db = getDb();
const raw = getSqlite();

const meta = db.select().from(schema.simulationMeta).all()[0];
if (!meta) {
  console.log("No simulation meta found — nothing to backfill.");
  process.exit(0);
}

const currentDay = meta.currentDay;
console.log(`Current day: ${currentDay}`);

// Find days that already have summaries
const existingDays = new Set(
  (raw.prepare("SELECT day_number FROM day_summaries").all() as { day_number: number }[])
    .map(r => r.day_number),
);
console.log(`Existing summaries: ${existingDays.size}`);

// Load all events grouped by day
const allEvents = db.select().from(schema.simulationEvents).all() as any[];
const eventsByDay = new Map<number, typeof allEvents>();
for (const evt of allEvents) {
  if (!eventsByDay.has(evt.dayNumber)) eventsByDay.set(evt.dayNumber, []);
  eventsByDay.get(evt.dayNumber)!.push(evt);
}

// Significant event types for summary
const SIGNIFICANT = new Set([
  "bill_passed", "bill_rejected", "presidential_veto",
  "bill_committee_rejected",
  "constitutional_court_ruled", "confidence_vote_passed", "confidence_vote_failed",
  "government_formed", "government_cabinet_formed", "government_dissolved",
  "election_announced", "election_result", "negotiation_complete",
  "crisis_start", "crisis_end",
  "budget_passed", "budget_rejected", "provisional_budget_started", "budget_revision_rejected",
  "motion_passed",
]);

// Mood mapping heuristic
function inferMood(events: typeof allEvents): string {
  const types = new Set(events.map((e: any) => e.type));
  if (types.has("election_result") || types.has("election_announced")) return "Wahlkampf";
  if (types.has("government_formed") || types.has("government_dissolved")) return "Regierungswechsel";
  if (types.has("confidence_vote_passed") || types.has("confidence_vote_failed")) return "Politischer Druck";
  if (types.has("crisis_start")) return "Krisenreaktion";
  if (types.has("budget_rejected") || types.has("budget_revision_rejected")) return "Haushaltsstreit";
  if (types.has("bill_rejected") || types.has("presidential_veto") || types.has("bill_committee_rejected")) return "Koalitionsreibung";
  return "Stabile Mehrheit";
}

const insert = raw.prepare(
  `INSERT INTO day_summaries (day_number, narrative, mood, preview, created_at)
   VALUES (?, ?, ?, ?, ?)
   ON CONFLICT(day_number) DO UPDATE SET
     narrative = COALESCE(day_summaries.narrative, excluded.narrative),
     mood = COALESCE(day_summaries.mood, excluded.mood),
     preview = COALESCE(day_summaries.preview, excluded.preview)`
);

let backfilled = 0;
for (let day = 1; day <= currentDay; day++) {
  if (existingDays.has(day)) continue;

  const events = eventsByDay.get(day) ?? [];
  const significant = events.filter((e: any) => SIGNIFICANT.has(e.type));

  // Build a deterministic narrative from events
  let narrative: string | null = null;
  if (significant.length > 0) {
    const lines = significant.slice(0, 3).map((e: any) => e.title);
    narrative = lines.join(". ") + ".";
  } else if (events.length > 0) {
    narrative = `Tag ${day}: ${events.length} Ereignisse verarbeitet.`;
  }

  const mood = events.length > 0 ? inferMood(events) : "Stabile Mehrheit";

  // Build preview from event types present
  const previewParts: string[] = [];
  const billCount = events.filter((e: any) => e.type === "bill_proposed").length;
  if (billCount > 0) previewParts.push(`${billCount} neue Gesetzentwürfe`);
  const thirdReading = events.filter((e: any) => e.type === "bill_third_reading").length;
  if (thirdReading > 0) previewParts.push(`${thirdReading} dritte Lesung`);
  if (events.some((e: any) => e.type === "crisis_start")) previewParts.push("Krisenbeginn");
  if (events.some((e: any) => e.type === "election_announced")) previewParts.push("Wahlankündigung");
  const preview = previewParts.length > 0 ? previewParts.join(" · ") : "Regulärer Sitzungstag";

  insert.run(day, narrative, mood, preview, new Date().toISOString());
  backfilled++;
}

console.log(`Backfilled ${backfilled} day summaries (days 1–${currentDay}).`);
