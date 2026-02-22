import type { Party } from "@ki-bundestag/types";
import { callAI, AIProviderLimitError } from "../agent/client.js";
import { parseAIJson, logAICall } from "../agent/ai-json.js";

const VALID_MOODS = [
  "Stable Majority", "Coalition Friction", "Political Pressure",
  "Crisis Response", "Electoral Campaign", "Budget Dispute", "Government Transition",
];

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

export async function generateDailySummary(
  dayEvents: Array<{ type: string; title: string; description: string }>,
  parties: Party[],
  day: number,
  publicSentiment: number,
  coalitionIds: string[],
): Promise<{ narrative: string; mood: string } | null> {
  const notable = dayEvents.filter(e => SIGNIFICANT.has(e.type));
  const eventLines = notable.length > 0
    ? notable.map(e => `- ${e.title}: ${e.description}`).join("\n")
    : "- No major legislative or political events today.";

  const coalitionNames = parties
    .filter(p => coalitionIds.includes(p.id))
    .map(p => p.name).join(", ");

  const prompt = `You are a German parliamentary journalist covering the Bundestag. Today is simulation Day ${day}.

Current coalition: ${coalitionNames}. Public sentiment: ${Math.round(publicSentiment)}/100.

Today's significant events:
${eventLines}

Write a concise journalistic summary of today's most politically significant developments. Focus on coalition dynamics, major bills, crises, elections, surprises.

Respond with ONLY valid JSON (no markdown code fences):
{"narrative": "<2-3 sentence journalistic summary>", "mood": "<one of: Stable Majority, Coalition Friction, Political Pressure, Crisis Response, Electoral Campaign, Budget Dispute, Government Transition>"}

The mood field MUST be exactly one of the 7 values listed above.`;

  const t0 = Date.now();
  try {
    const { text, model, provider } = await callAI({
      system: "You are a concise German political journalist. Respond with ONLY valid JSON.",
      prompt,
      maxTokens: 320,
      roleKey: "daily",
    });
    const result = parseAIJson<{ narrative: string; mood: string }>(
      text,
      (v: unknown) => {
        const o = v as Record<string, unknown>;
        if (typeof o.narrative !== "string" || typeof o.mood !== "string") return null;
        const mood = VALID_MOODS.includes(o.mood) ? o.mood : VALID_MOODS[0];
        return { narrative: o.narrative, mood };
      },
      "Summary",
    );
    logAICall({ task: "summary", model, provider, latencyMs: Date.now() - t0, parseOk: result !== null, validationOk: result !== null, fallback: result ? undefined : "skip" });
    return result;
  } catch (error) {
    if (error instanceof AIProviderLimitError) {
      console.warn(`  [Summary] Skipped (${error.message})`);
    } else {
      console.warn(`  [Summary] Error: ${(error as Error).message?.slice(0, 200)}`);
    }
    logAICall({ task: "summary", latencyMs: Date.now() - t0, parseOk: false, validationOk: false, fallback: "skip" });
    return null;
  }
}
