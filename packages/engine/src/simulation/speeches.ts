/**
 * MdB speech processing — create simulation events for submitted speeches.
 *
 * Each speech is evaluated by AI for relevance and quality:
 *   +0.1 — substantive, relevant to the bill
 *    0.0 — generic or off-topic but not harmful
 *   -0.1 — spam, nonsensical, or disruptive
 */

import { randomUUID } from "node:crypto";
import { eq, gte } from "drizzle-orm";
import { getDb, getUserDb, schema } from "../db/index.js";
import { callAI, AIProviderLimitError } from "../agent/client.js";
import { parseAIJson, logAICall } from "../agent/ai-json.js";

/**
 * Process speeches submitted since the last sim day.
 * Creates simulation_event of type "mdb_speech" for each speech,
 * applies AI-evaluated sentiment impact (±0.1 or 0), and returns total sentiment delta.
 */
export async function processDaySpeeches(currentDay: number): Promise<number> {
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

  // Look up bill titles and descriptions
  const billIds = [...new Set(speeches.map(s => s.billId))];
  const billInfo = new Map<string, { title: string; description: string }>();
  for (const bid of billIds) {
    const bill = db.select().from(schema.bills)
      .where(eq(schema.bills.id, bid))
      .get();
    if (bill) billInfo.set(bid, { title: bill.title, description: bill.description ?? "" });
  }

  let processed = 0;
  let sentimentDelta = 0;
  for (const speech of speeches) {
    const displayName = userNames.get(speech.userId) ?? "Unknown MdB";
    const bill = billInfo.get(speech.billId);
    const billTitle = bill?.title ?? "Unknown Bill";
    const readingLabel = speech.reading === 1 ? "1st" : speech.reading === 2 ? "2nd" : "3rd";

    // AI evaluation of speech quality
    const impact = await evaluateSpeech(speech.content, billTitle, bill?.description ?? "");
    sentimentDelta += impact;

    // Mark speech as processed with sentiment impact
    userDb.update(schema.mdbSpeeches)
      .set({ sentimentImpact: impact })
      .where(eq(schema.mdbSpeeches.id, speech.id))
      .run();

    // Create simulation event
    const impactLabel = impact > 0 ? "+0.1" : impact < 0 ? "-0.1" : "0";
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
        impactLabel,
      }),
      createdAt: new Date().toISOString(),
    }).run();

    processed++;
  }

  if (processed > 0) {
    console.log(`  [Speeches] Processed ${processed} MdB speech${processed !== 1 ? "es" : ""} (net sentiment: ${sentimentDelta >= 0 ? "+" : ""}${sentimentDelta.toFixed(1)})`);
  }

  return sentimentDelta;
}

/**
 * AI-evaluate a speech for relevance and quality.
 * Returns +0.1 (good), 0.0 (neutral/generic), or -0.1 (spam/nonsense).
 * Falls back to 0.0 on AI errors.
 */
async function evaluateSpeech(content: string, billTitle: string, billDescription: string): Promise<number> {
  const t0 = Date.now();
  try {
    const { text: raw, model, provider } = await callAI({
      system: `You are a parliamentary clerk evaluating whether a Bundestag speech is substantive. Respond with ONLY valid JSON: {"rating": "positive" | "neutral" | "negative"}

Rules:
- "positive": The speech engages meaningfully with the bill's subject matter — argues for/against, raises concerns, proposes perspective, or provides relevant analysis.
- "neutral": The speech is vaguely on-topic but generic, or too short to add real substance.
- "negative": The speech is spam, nonsensical, lorem ipsum, copy-pasted filler, completely off-topic, or disruptive gibberish.`,
      prompt: `Bill: "${billTitle}"${billDescription ? `\nBill description: ${billDescription}` : ""}

Speech text:
"""
${content}
"""

Rate this speech:`,
      maxTokens: 32,
      roleKey: "daily",
    });

    const parsed = parseAIJson<{ rating: string }>(
      raw,
      (v: unknown) => {
        const o = v as Record<string, unknown>;
        if (typeof o.rating !== "string") return null;
        return { rating: o.rating };
      },
      "Speeches",
    );
    logAICall({ task: "speech-eval", model, provider, latencyMs: Date.now() - t0, parseOk: parsed !== null, validationOk: parsed !== null, fallback: parsed ? undefined : "neutral" });
    if (parsed?.rating === "positive") return 0.1;
    if (parsed?.rating === "negative") return -0.1;
    return 0;
  } catch (err) {
    if (err instanceof AIProviderLimitError) {
      console.warn("  [Speeches] AI provider limited, skipping evaluation (neutral fallback)");
    } else {
      console.warn("  [Speeches] AI evaluation failed, using neutral fallback:", (err as Error).message);
    }
    logAICall({ task: "speech-eval", latencyMs: Date.now() - t0, parseOk: false, validationOk: false, fallback: "neutral" });
    return 0;
  }
}
