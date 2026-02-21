import type { Party } from "@ki-bundestag/types";
import { callAI, AIProviderLimitError } from "../agent/client.js";

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

Respond with ONLY valid JSON in this exact format (no markdown):
{"narrative": "2-3 sentence journalistic summary here.", "mood": "one of: Stable Majority, Coalition Friction, Political Pressure, Crisis Response, Electoral Campaign, Budget Dispute, Government Transition"}`;

  try {
    const raw = await callAI({
      system: "",
      prompt,
      maxTokens: 320,
      roleKey: "daily",
    });
    const parsed = JSON.parse(raw) as { narrative: string; mood: string };
    if (typeof parsed.narrative !== "string" || typeof parsed.mood !== "string") return null;
    return parsed;
  } catch (error) {
    if (error instanceof AIProviderLimitError) {
      console.warn(`  [Summary] Skipped (${error.message})`);
    }
    return null;
  }
}
