import type { Party } from "@ki-bundestag/types";
import { parseAIJson, logAICall } from "../agent/ai-json.js";
import type { BatchRequest, BatchResult } from "../agent/batch-client.js";
import type { Provider } from "../agent/model-config.js";
import { VALID_MOODS, SUMMARY_SYSTEM_PROMPT } from "../config/index.js";
import { SUMMARY_SIGNIFICANT_TYPES as SIGNIFICANT } from "../config/index.js";

/**
 * Build a BatchRequest for the daily summary.
 */
export function buildSummaryBatchRequest(
  dayEvents: Array<{ type: string; title: string; description: string }>,
  parties: Party[],
  day: number,
  publicSentiment: number,
  coalitionIds: string[],
): BatchRequest {
  const notable = dayEvents.filter(e => SIGNIFICANT.has(e.type));
  const eventLines = notable.length > 0
    ? notable.map(e => `- ${e.title}: ${e.description}`).join("\n")
    : "- No major legislative or political events today.";

  const coalitionNames = parties
    .filter(p => coalitionIds.includes(p.id))
    .map(p => p.name).join(", ");

  const prompt = `Du bist ein deutscher Parlamentsjournalist und berichtest über den Bundestag. Heute ist Simulationstag ${day}.

Aktuelle Koalition: ${coalitionNames}. Öffentliche Stimmung: ${Math.round(publicSentiment)}/100.

Heutige bedeutsame Ereignisse:
${eventLines}

Schreibe eine prägnante journalistische Zusammenfassung der politisch bedeutsamsten Entwicklungen des Tages auf Deutsch. Konzentriere dich auf Koalitionsdynamiken, wichtige Gesetze, Krisen, Wahlen und Überraschungen.

Antworte NUR mit validem JSON (ohne Markdown-Codeblöcke):
{"narrative": "<2-3 Sätze journalistische Zusammenfassung auf Deutsch>", "mood": "<eines von: Stabile Mehrheit, Koalitionsreibung, Politischer Druck, Krisenreaktion, Wahlkampf, Haushaltsstreit, Regierungswechsel>"}

Das mood-Feld MUSS exakt einer der 7 oben genannten Werte sein.`;

  return {
    customId: `summary-day${day}`,
    system: SUMMARY_SYSTEM_PROMPT,
    prompt,
    maxTokens: 320,
    roleKey: "daily",
  };
}

/**
 * Process a summary batch result.
 */
export function processSummaryBatchResult(
  result: BatchResult | undefined,
): { narrative: string; mood: string } | null {
  if (!result || !result.text) {
    logAICall({ task: "summary", model: result?.model ?? "unknown", provider: (result?.provider ?? "anthropic") as Provider, latencyMs: 0, parseOk: false, validationOk: false, fallback: "skip" });
    return null;
  }

  const parsed = parseAIJson<{ narrative: string; mood: string }>(
    result.text,
    (v: unknown) => {
      const o = v as Record<string, unknown>;
      if (typeof o.narrative !== "string" || typeof o.mood !== "string") return null;
      const mood = VALID_MOODS.includes(o.mood) ? o.mood : VALID_MOODS[0];
      return { narrative: o.narrative, mood };
    },
    "Summary",
  );

  logAICall({ task: "summary", model: result.model, provider: result.provider as Provider, latencyMs: 0, parseOk: parsed !== null, validationOk: parsed !== null, fallback: parsed ? undefined : "skip" });
  return parsed;
}
