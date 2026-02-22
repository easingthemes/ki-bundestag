/**
 * MdB speech processing — create simulation events for submitted speeches.
 *
 * V1: All speeches are accepted (1 per reading per user, enforced at API level).
 * Speech slot lottery deferred to v2 if spam becomes an issue.
 */

import { randomUUID } from "node:crypto";
import { eq, gte } from "drizzle-orm";
import { getDb, getUserDb, schema } from "../db/index.js";

/**
 * Process speeches submitted since the last sim day.
 * Creates simulation_event of type "mdb_speech" for each speech,
 * applies small sentiment impact (±0.1), and returns total sentiment delta.
 */
export function processDaySpeeches(currentDay: number): number {
  const db = getDb();
  const userDb = getUserDb();

  // Find speeches submitted for the current day (dayNumber = currentDay)
  // or speeches that haven't been processed yet (dayNumber >= currentDay - 1)
  const speeches = userDb.select().from(schema.mdbSpeeches)
    .where(gte(schema.mdbSpeeches.dayNumber, currentDay - 1))
    .all()
    .filter(s => s.sentimentImpact === null); // Only unprocessed speeches

  if (speeches.length === 0) return 0;

  // Look up user display names
  const userIds = [...new Set(speeches.map(s => s.userId))];
  const userNames = new Map<string, string>();
  for (const uid of userIds) {
    const user = userDb.select().from(schema.users)
      .where(eq(schema.users.id, uid))
      .get();
    if (user) userNames.set(uid, user.displayName);
  }

  // Look up bill titles
  const billIds = [...new Set(speeches.map(s => s.billId))];
  const billTitles = new Map<string, string>();
  for (const bid of billIds) {
    const bill = db.select().from(schema.bills)
      .where(eq(schema.bills.id, bid))
      .get();
    if (bill) billTitles.set(bid, bill.title);
  }

  let processed = 0;
  let sentimentDelta = 0;
  for (const speech of speeches) {
    const displayName = userNames.get(speech.userId) ?? "Unknown MdB";
    const billTitle = billTitles.get(speech.billId) ?? "Unknown Bill";
    const readingLabel = speech.reading === 1 ? "1st" : speech.reading === 2 ? "2nd" : "3rd";

    // Small sentiment impact: ±0.1 (positive by default — speaking shows engagement)
    const impact = 0.1;
    sentimentDelta += impact;

    // Mark speech as processed with sentiment impact
    userDb.update(schema.mdbSpeeches)
      .set({ sentimentImpact: impact })
      .where(eq(schema.mdbSpeeches.id, speech.id))
      .run();

    // Create simulation event
    db.insert(schema.simulationEvents).values({
      id: `evt-${randomUUID().slice(0, 8)}`,
      type: "mdb_speech",
      title: `MdB ${displayName} speaks on "${billTitle}" (${readingLabel} reading)`,
      description: speech.content,
      dayNumber: currentDay,
      actor: displayName,
      data: JSON.stringify({
        userId: speech.userId,
        billId: speech.billId,
        reading: speech.reading,
        sentimentImpact: impact,
      }),
      createdAt: new Date().toISOString(),
    }).run();

    processed++;
  }

  if (processed > 0) {
    console.log(`  [Speeches] Processed ${processed} MdB speech${processed !== 1 ? "es" : ""}`);
  }

  return sentimentDelta;
}
