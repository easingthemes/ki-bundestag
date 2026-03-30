/**
 * MdB speech processing — create simulation events for submitted speeches.
 *
 * Uses exception-based AI evaluation: instead of rating each speech individually,
 * sends all speeches for a bill in one prompt and asks the AI to flag only the
 * bad ones. Good speeches default to +0.1 (positive).
 *
 * Sentiment impact:
 *   +0.1 — substantive, relevant to the bill (default)
 *    0.0 — auto-neutral (very short speeches, skipped by pre-filter)
 *   -0.1 — spam, nonsensical, or disruptive (flagged by AI)
 */

import { randomUUID } from "node:crypto";
import { eq, gte } from "drizzle-orm";
import { getDb, getUserDb, schema } from "../db/index.js";
import { callAI, AIProviderLimitError } from "../agent/client.js";
import { parseAIJson, logAICall } from "../agent/ai-json.js";
import { submitBatch, isBatchMode, chunkItems, type BatchResult } from "../agent/batch-client.js";
import { buildSpeechFlagPrompt, preFilterSpeeches, type SpeechItem } from "../agent/group-prompts.js";

/**
 * Process speeches submitted since the last sim day.
 * Creates simulation_event of type "mdb_speech" for each speech,
 * applies AI-evaluated sentiment impact (±0.1 or 0), and returns total sentiment delta.
 */
export async function processDaySpeeches(currentDay: number): Promise<number> {
  const db = getDb();
  const userDb = getUserDb();

  // Find unprocessed speeches
  const speeches = userDb.select().from(schema.mdbSpeeches)
    .where(gte(schema.mdbSpeeches.dayNumber, currentDay - 1))
    .all()
    .filter(s => s.sentimentImpact === null);

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

  // Look up bill info
  const billIds = [...new Set(speeches.map(s => s.billId))];
  const billInfo = new Map<string, { title: string; description: string }>();
  for (const bid of billIds) {
    const bill = db.select().from(schema.bills)
      .where(eq(schema.bills.id, bid))
      .get();
    if (bill) billInfo.set(bid, { title: bill.title, description: bill.description ?? "" });
  }

  // Build SpeechItems grouped by bill
  const speechesByBill = new Map<string, SpeechItem[]>();
  for (const speech of speeches) {
    const items = speechesByBill.get(speech.billId) ?? [];
    items.push({
      id: speech.id,
      content: speech.content,
      author: userNames.get(speech.userId) ?? "Unknown MdB",
      reading: speech.reading,
    });
    speechesByBill.set(speech.billId, items);
  }

  // Determine impact for each speech
  const impactMap = new Map<string, number>(); // speechId → impact

  if (isBatchMode() && speeches.length > 1) {
    // --- Batch mode: one prompt per bill, flag exceptions ---
    const batchRequests = [];

    for (const [billId, billSpeeches] of speechesByBill) {
      const bill = billInfo.get(billId) ?? { title: "Unknown Bill", description: "" };
      const { toEval, autoNeutral } = preFilterSpeeches(billSpeeches);

      // Auto-neutral for very short speeches
      for (const s of autoNeutral) {
        impactMap.set(s.id, 0);
      }

      if (toEval.length === 0) continue;

      // Chunk if needed (unlikely for speeches, but safe)
      for (const chunk of chunkItems(toEval, 650, 160_000)) {
        batchRequests.push({
          req: buildSpeechFlagPrompt(bill, chunk, currentDay),
          billId,
          speechIds: chunk.map(s => s.id),
        });
      }
    }

    if (batchRequests.length > 0) {
      const t0 = Date.now();
      let results: BatchResult[];
      try {
        results = await submitBatch(batchRequests.map(b => b.req));
      } catch (err) {
        console.warn(`  [Speeches] Batch failed, falling back to per-speech eval:`, (err as Error).message);
        return processSpeechesLegacy(speeches, userNames, billInfo, currentDay);
      }
      logAICall({ task: "speech-flag-batch", latencyMs: Date.now() - t0, parseOk: true, validationOk: true });

      for (const { req, speechIds } of batchRequests) {
        const result = results.find(r => r.customId === req.customId);
        if (!result || !result.text) {
          // Default all to positive on failure
          for (const id of speechIds) impactMap.set(id, 0.1);
          continue;
        }

        const parsed = parseAIJson<{ negative: string[]; notable: string[] }>(
          result.text,
          (v: unknown) => {
            const o = v as Record<string, unknown>;
            const negative = Array.isArray(o.negative) ? (o.negative as unknown[]).filter(x => typeof x === "string") as string[] : [];
            const notable = Array.isArray(o.notable) ? (o.notable as unknown[]).filter(x => typeof x === "string") as string[] : [];
            return { negative, notable };
          },
          "SpeechFlag",
        );

        const negativeSet = new Set(parsed?.negative ?? []);
        const notableSet = new Set(parsed?.notable ?? []);

        for (const id of speechIds) {
          if (negativeSet.has(id)) {
            impactMap.set(id, -0.1);
          } else if (notableSet.has(id)) {
            impactMap.set(id, 0.1); // Notable speeches get positive impact
          } else {
            impactMap.set(id, 0.1); // Default: positive (substantive)
          }
        }
      }
    }
  } else {
    // --- Legacy mode: per-speech evaluation ---
    return processSpeechesLegacy(speeches, userNames, billInfo, currentDay);
  }

  // Apply impacts and create events
  let sentimentDelta = 0;
  for (const speech of speeches) {
    const impact = impactMap.get(speech.id) ?? 0.1; // Default positive
    sentimentDelta += impact;

    userDb.update(schema.mdbSpeeches)
      .set({ sentimentImpact: impact })
      .where(eq(schema.mdbSpeeches.id, speech.id))
      .run();

    const displayName = userNames.get(speech.userId) ?? "Unknown MdB";
    const bill = billInfo.get(speech.billId);
    const readingLabel = speech.reading === 1 ? "1st" : speech.reading === 2 ? "2nd" : "3rd";
    const impactLabel = impact > 0 ? "+0.1" : impact < 0 ? "-0.1" : "0";

    db.insert(schema.simulationEvents).values({
      id: `evt-${randomUUID().slice(0, 8)}`,
      type: "mdb_speech",
      title: `MdB ${displayName} speaks on "${bill?.title ?? "Unknown Bill"}" (${readingLabel} reading)`,
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
  }

  if (speeches.length > 0) {
    console.log(`  [Speeches] Processed ${speeches.length} MdB speech${speeches.length !== 1 ? "es" : ""} (net sentiment: ${sentimentDelta >= 0 ? "+" : ""}${sentimentDelta.toFixed(1)})`);
  }

  return sentimentDelta;
}

/**
 * Legacy per-speech AI evaluation (fallback).
 */
async function processSpeechesLegacy(
  speeches: Array<{ id: string; userId: string; billId: string; content: string; reading: number }>,
  userNames: Map<string, string>,
  billInfo: Map<string, { title: string; description: string }>,
  currentDay: number,
): Promise<number> {
  const db = getDb();
  const userDb = getUserDb();
  let sentimentDelta = 0;

  for (const speech of speeches) {
    const displayName = userNames.get(speech.userId) ?? "Unknown MdB";
    const bill = billInfo.get(speech.billId);
    const billTitle = bill?.title ?? "Unknown Bill";
    const readingLabel = speech.reading === 1 ? "1st" : speech.reading === 2 ? "2nd" : "3rd";

    const impact = await evaluateSpeechLegacy(speech.content, billTitle, bill?.description ?? "");
    sentimentDelta += impact;

    userDb.update(schema.mdbSpeeches)
      .set({ sentimentImpact: impact })
      .where(eq(schema.mdbSpeeches.id, speech.id))
      .run();

    const impactLabel = impact > 0 ? "+0.1" : impact < 0 ? "-0.1" : "0";
    db.insert(schema.simulationEvents).values({
      id: `evt-${randomUUID().slice(0, 8)}`,
      type: "mdb_speech",
      title: `MdB ${displayName} speaks on "${billTitle}" (${readingLabel} reading)`,
      description: speech.content,
      dayNumber: currentDay,
      actor: displayName,
      data: JSON.stringify({ userId: speech.userId, billId: speech.billId, reading: speech.reading, sentimentImpact: impact, impactLabel }),
      createdAt: new Date().toISOString(),
    }).run();
  }

  if (speeches.length > 0) {
    console.log(`  [Speeches] Processed ${speeches.length} MdB speech${speeches.length !== 1 ? "es" : ""} (net sentiment: ${sentimentDelta >= 0 ? "+" : ""}${sentimentDelta.toFixed(1)})`);
  }

  return sentimentDelta;
}

async function evaluateSpeechLegacy(content: string, billTitle: string, billDescription: string): Promise<number> {
  const t0 = Date.now();
  try {
    const { text: raw, model, provider } = await callAI({
      system: `You are a parliamentary clerk evaluating whether a Bundestag speech is substantive. Respond with ONLY valid JSON: {"rating": "positive" | "neutral" | "negative"}

Rules:
- "positive": The speech engages meaningfully with the bill's subject matter — argues for/against, raises concerns, proposes perspective, or provides relevant analysis.
- "neutral": The speech is vaguely on-topic but generic, or too short to add real substance.
- "negative": The speech is spam, nonsensical, lorem ipsum, copy-pasted filler, completely off-topic, or disruptive gibberish.`,
      prompt: `Bill: "${billTitle}"${billDescription ? `\nBill description: ${billDescription}` : ""}\n\nSpeech text:\n"""\n${content}\n"""\n\nRate this speech:`,
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
