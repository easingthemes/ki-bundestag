import type { Government, Interpellation, Party } from "@ki-bundestag/types";
import { eq } from "drizzle-orm";
import { callAI, AIProviderLimitError } from "../agent/client.js";
import { logAICall } from "../agent/ai-json.js";
import { getDb, schema } from "../db/index.js";
import { submitBatch, findResult, type BatchRequest } from "../agent/batch-client.js";
import type { Provider } from "../agent/model-config.js";

import {
  INTERPELLATION_MAX_ANSWERS_PER_DAY as MAX_ANSWERS_PER_DAY,
  INTERPELLATION_DEADLINE_DAYS,
  INTERPELLATION_IMPACTS,
} from "../config/index.js";

/**
 * Answer pending interpellations (max 2/day, oldest first) and expire overdue ones.
 */
export async function answerPendingInterpellations(
  allParties: Party[],
  government: Government | null,
  currentDay: number,
  briefing?: string,
): Promise<{ answered: Interpellation[]; expired: Interpellation[] }> {
  const db = getDb();
  const result: { answered: Interpellation[]; expired: Interpellation[] } = { answered: [], expired: [] };

  if (!government) return result;

  // Load all pending interpellations
  const allPending = db.select().from(schema.interpellations)
    .where(eq(schema.interpellations.status, "pending"))
    .all()
    .sort((a, b) => a.dayNumber - b.dayNumber);

  // Expire overdue ones
  for (const row of allPending) {
    if (currentDay - row.dayNumber > INTERPELLATION_DEADLINE_DAYS) {
      const impact = INTERPELLATION_IMPACTS.expired;
      db.update(schema.interpellations)
        .set({ status: "expired", sentimentImpact: impact })
        .where(eq(schema.interpellations.id, row.id))
        .run();

      result.expired.push(mapInterpellation({ ...row, status: "expired", sentimentImpact: impact }));
      console.log(`  [Interpellations] Expired: "${row.title}" (unanswered for ${INTERPELLATION_DEADLINE_DAYS} days)`);
    }
  }

  // Get remaining pending (non-expired), oldest first, max 2
  const toAnswer = allPending
    .filter(row => currentDay - row.dayNumber <= INTERPELLATION_DEADLINE_DAYS)
    .slice(0, MAX_ANSWERS_PER_DAY);

  if (toAnswer.length === 0) return result;

  // Build batch requests for all interpellations to answer
  const batchRequests: BatchRequest[] = [];
  const rowMinisterMap = new Map<string, { row: typeof toAnswer[0]; minister: typeof government.ministers[0]; ministerParty: Party | undefined }>();

  for (const row of toAnswer) {
    const minister = government.ministers.find(m => m.portfolio === row.targetMinistry);
    if (!minister) continue;

    const ministerParty = allParties.find(p => p.id === minister.partyId);
    const customId = `interpellation-${row.id}`;
    rowMinisterMap.set(customId, { row, minister, ministerParty });

    batchRequests.push({
      customId,
      system: `You are ${minister.name}, Minister of ${row.targetMinistry} in the German Bundestag, representing ${ministerParty?.name ?? minister.partyId} (${ministerParty?.ideology ?? ""}). You are responding to a formal parliamentary interpellation (${row.type === "große" ? "Große Anfrage — major inquiry" : "Kleine Anfrage — written question"}). Answer in character as the minister: be politically careful, defend government policy, and stay on-message. Keep your response to 2-3 sentences. IMPORTANT: Write your answer in German.${briefing ? `\n\nCURRENT POLITICAL CONTEXT:\n${briefing}` : ""}`,
      prompt: `Interpellation from the opposition: "${row.title}"\n\nQuestion: ${row.question}`,
      maxTokens: 300,
      partyId: minister.partyId,
    });
  }

  if (batchRequests.length === 0) return result;

  console.log(`  [Batch] Submitting ${batchRequests.length} interpellation answer requests...`);
  const batchResults = await submitBatch(batchRequests);

  for (const [customId, { row, minister }] of rowMinisterMap) {
    const batchResult = findResult(batchResults, customId);

    if (!batchResult || !batchResult.text) {
      logAICall({ task: `interpellation:${minister.partyId}`, model: batchResult?.model ?? "unknown", provider: (batchResult?.provider ?? "anthropic") as Provider, latencyMs: 0, parseOk: false, validationOk: false, fallback: "skip" });
      continue;
    }

    const impact = row.type === "große" ? INTERPELLATION_IMPACTS.grosseAnswered : INTERPELLATION_IMPACTS.kleineAnswered;

    db.update(schema.interpellations)
      .set({
        status: "answered",
        response: batchResult.text.trim(),
        respondedOnDay: currentDay,
        sentimentImpact: impact,
      })
      .where(eq(schema.interpellations.id, row.id))
      .run();

    result.answered.push(mapInterpellation({
      ...row,
      status: "answered",
      response: batchResult.text.trim(),
      respondedOnDay: currentDay,
      sentimentImpact: impact,
    }));

    logAICall({ task: `interpellation:${minister.partyId}`, model: batchResult.model, provider: batchResult.provider as Provider, latencyMs: 0, parseOk: true, validationOk: true });
  }

  return result;
}

/**
 * Returns the sentiment impact for a resolved interpellation.
 * - Große Anfrage answered: +0.3 for filing party
 * - Kleine Anfrage answered: +0.1 for filing party
 * - Expired (unanswered): -0.3 for target minister's party
 */
export function interpellationSentimentImpact(interpellation: Interpellation): number {
  if (interpellation.status === "answered") {
    return interpellation.type === "große" ? INTERPELLATION_IMPACTS.grosseAnswered : INTERPELLATION_IMPACTS.kleineAnswered;
  }
  if (interpellation.status === "expired") {
    return INTERPELLATION_IMPACTS.expired;
  }
  return 0;
}

function mapInterpellation(row: any): Interpellation {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    question: row.question,
    filedByPartyId: row.filedByPartyId,
    targetMinistry: row.targetMinistry,
    targetMinisterName: row.targetMinisterName,
    targetPartyId: row.targetPartyId,
    response: row.response ?? null,
    status: row.status,
    dayNumber: row.dayNumber,
    respondedOnDay: row.respondedOnDay ?? null,
    sentimentImpact: row.sentimentImpact ?? null,
  };
}
