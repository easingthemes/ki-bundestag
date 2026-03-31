import type { MediaArticle, Party, SimulationEvent } from "@ki-bundestag/types";
import { desc, eq } from "drizzle-orm";
import { callAI, AIProviderLimitError } from "../agent/client.js";
import { safeParseJson, logAICall } from "../agent/ai-json.js";
import { getDb, schema } from "../db/index.js";
import type { BatchRequest, BatchResult } from "../agent/batch-client.js";
import type { Provider } from "../agent/model-config.js";

function generateId(): string {
  return Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}

const OUTLETS = [
  { name: "Berliner Tagesspiegel", bias: "center" },
  { name: "Volksstimme", bias: "left" },
  { name: "Wirtschaftswoche", bias: "right" },
] as const;

const NEWSWORTHY_TYPES = new Set([
  "bill_passed",
  "bill_rejected",
  "crisis_start",
  "crisis_end",
  "election_announced",
  "election_campaign",
  "election_result",
  "government_formed",
  "negotiation_complete",
  "statement",
]);

/**
 * Load the most recent media articles for agent context.
 */
export function getRecentMedia(limit = 3): MediaArticle[] {
  const db = getDb();
  const rows = db.select().from(schema.mediaArticles)
    .orderBy(desc(schema.mediaArticles.dayNumber))
    .limit(limit)
    .all();
  return rows.map(r => ({
    id: r.id,
    headline: r.headline,
    summary: r.summary,
    content: r.content,
    outlet: r.outlet,
    bias: r.bias,
    category: r.category,
    dayNumber: r.dayNumber,
  }));
}

/**
 * Calculate sentiment impact from today's media articles.
 * Crisis articles: -0.2, positive government coverage: +0.1, capped at ±0.5/day.
 */
export function mediaSentimentImpact(articles: Array<{ category: string }>): number {
  let delta = 0;
  for (const a of articles) {
    if (a.category === "crisis") {
      delta -= 0.2;
    } else if (a.category === "economy" || a.category === "policy") {
      delta += 0.1;
    }
  }
  return Math.max(-0.5, Math.min(0.5, Math.round(delta * 10) / 10));
}

/**
 * Generate 2–3 AI-written news articles based on the day's events.
 */
export async function generateDailyMedia(
  dayEvents: Array<Omit<SimulationEvent, "id">>,
  allParties: Party[],
  currentDay: number,
): Promise<void> {
  const newsworthy = dayEvents.filter(e => NEWSWORTHY_TYPES.has(e.type));
  if (newsworthy.length === 0) return;

  const eventSummaries = newsworthy.map(e => `[${e.type}] ${e.title}: ${e.description}`).join("\n");
  const partyNames = allParties.map(p => `${p.name} (${p.id})`).join(", ");

  const t0 = Date.now();
  try {
    const { text, model, provider } = await callAI({
      system: `You are a team of German political journalists writing for different news outlets. Each outlet has a distinct editorial bias that colors their coverage. Respond with ONLY valid JSON.

OUTLETS:
- "Berliner Tagesspiegel" (center): Balanced, factual reporting with moderate analysis
- "Volksstimme" (left): Focuses on social justice, workers' rights, inequality angles
- "Wirtschaftswoche" (right): Focuses on business impact, fiscal responsibility, market effects

RESPONSE SCHEMA (JSON array of 2-3 articles):
[
  {
    "headline": "<newspaper headline, punchy, max 100 chars>",
    "summary": "<1-2 sentence summary>",
    "content": "<2-3 paragraph article body>",
    "outlet": "<exact outlet name from list above>",
    "category": "policy" | "crisis" | "election" | "opinion" | "economy"
  }
]

Rules:
- Write 2-3 articles covering the most important events of the day
- Each article MUST be from a different outlet
- Headlines should be dramatic but realistic German political journalism style
- Content should reflect the outlet's bias
- Write in German (all headlines, summaries, and article content must be in German)
- Category should match the primary topic`,
      prompt: `SIMULATION DAY ${currentDay}\n\nCURRENT PARTIES: ${partyNames}\n\nTODAY'S EVENTS:\n${eventSummaries}\n\nWrite 2-3 news articles covering today's most newsworthy political events, each from a different outlet with its bias. Respond as JSON array.`,
      maxTokens: 2048,
      roleKey: "daily",
    });

    const articles = safeParseJson<unknown[]>(text);

    if (!Array.isArray(articles) || articles.length === 0) {
      logAICall({ task: "media", model, provider, latencyMs: Date.now() - t0, parseOk: false, validationOk: false, fallback: "skip" });
      return;
    }

    const db = getDb();
    let inserted = 0;

    for (const article of articles.slice(0, 3)) {
      const a = article as Record<string, unknown>;
      if (!a.headline || !a.summary || !a.content || !a.outlet) continue;

      const outlet = OUTLETS.find(o => o.name === a.outlet);
      const bias = outlet?.bias ?? "center";

      db.insert(schema.mediaArticles).values({
        id: `media-${generateId()}`,
        headline: a.headline as string,
        summary: a.summary as string,
        content: a.content as string,
        outlet: a.outlet as string,
        bias,
        category: (a.category as string) || "policy",
        dayNumber: currentDay,
      }).run();
      inserted++;
    }

    logAICall({ task: "media", model, provider, latencyMs: Date.now() - t0, parseOk: true, validationOk: inserted > 0 });
  } catch (error) {
    if (error instanceof AIProviderLimitError) {
      console.warn(`  [Media] Skipped (${error.message})`);
    } else {
      console.error("  [Media] Error generating articles:", error);
    }
    logAICall({ task: "media", latencyMs: Date.now() - t0, parseOk: false, validationOk: false, fallback: "skip" });
  }
}

/**
 * Apply today's media sentiment influence to public sentiment.
 *
 * Loads articles for the given day, calculates their aggregate sentiment delta
 * (capped at ±0.5/day), updates national_state in the DB, and returns the
 * updated sentiment value (unchanged if no articles or zero delta).
 */
export function applyMediaSentiment(currentDay: number, currentSentiment: number, stateId: number): number {
  const db = getDb();
  const todaysMedia = getRecentMedia(3).filter(a => a.dayNumber === currentDay);
  if (todaysMedia.length === 0) return currentSentiment;

  const mediaDelta = mediaSentimentImpact(todaysMedia);
  if (mediaDelta === 0) return currentSentiment;

  const newSentiment = Math.max(5, Math.min(75,
    Math.round((currentSentiment + mediaDelta) * 10) / 10,
  ));

  db.update(schema.nationalState)
    .set({ publicSentiment: newSentiment })
    .where(eq(schema.nationalState.id, stateId))
    .run();

  console.log(`  [Media] Sentiment impact: ${mediaDelta > 0 ? "+" : ""}${mediaDelta}`);

  return newSentiment;
}

// ---------------------------------------------------------------------------
// Batch variants
// ---------------------------------------------------------------------------

const MEDIA_SYSTEM_PROMPT = `You are a team of German political journalists writing for different news outlets. Each outlet has a distinct editorial bias that colors their coverage. Respond with ONLY valid JSON.

OUTLETS:
- "Berliner Tagesspiegel" (center): Balanced, factual reporting with moderate analysis
- "Volksstimme" (left): Focuses on social justice, workers' rights, inequality angles
- "Wirtschaftswoche" (right): Focuses on business impact, fiscal responsibility, market effects

RESPONSE SCHEMA (JSON array of 2-3 articles):
[
  {
    "headline": "<newspaper headline, punchy, max 100 chars>",
    "summary": "<1-2 sentence summary>",
    "content": "<2-3 paragraph article body>",
    "outlet": "<exact outlet name from list above>",
    "category": "policy" | "crisis" | "election" | "opinion" | "economy"
  }
]

Rules:
- Write 2-3 articles covering the most important events of the day
- Each article MUST be from a different outlet
- Headlines should be dramatic but realistic German political journalism style
- Content should reflect the outlet's bias
- Write in German (all headlines, summaries, and article content must be in German)
- Category should match the primary topic`;

/**
 * Build a BatchRequest for daily media generation, or null if no newsworthy events.
 */
export function buildMediaBatchRequest(
  dayEvents: Array<Omit<SimulationEvent, "id">>,
  allParties: Party[],
  currentDay: number,
  briefing?: string,
): BatchRequest | null {
  const newsworthy = dayEvents.filter(e => NEWSWORTHY_TYPES.has(e.type));
  if (newsworthy.length === 0) return null;

  const eventSummaries = newsworthy.map(e => `[${e.type}] ${e.title}: ${e.description}`).join("\n");
  const partyStandings = allParties.map(p => `${p.name}: ${p.approvalRating}%, ${p.seatCount} seats`).join(" | ");
  const briefingContext = briefing ? `\n\nPOLITICAL CONTEXT:\n${briefing}` : "";

  return {
    customId: `media-day${currentDay}`,
    system: MEDIA_SYSTEM_PROMPT,
    prompt: `SIMULATION DAY ${currentDay}\n\nPARTY STANDINGS: ${partyStandings}\n\nTODAY'S EVENTS:\n${eventSummaries}${briefingContext}\n\nWrite 2-3 news articles covering today's most newsworthy political events, each from a different outlet with its bias. Respond as JSON array.`,
    maxTokens: 2048,
    roleKey: "daily",
  };
}

/**
 * Process a media batch result — parse articles and insert into DB.
 */
export function processMediaBatchResult(
  result: BatchResult | undefined,
  currentDay: number,
): void {
  if (!result || !result.text) {
    logAICall({ task: "media", model: result?.model ?? "unknown", provider: (result?.provider ?? "anthropic") as Provider, latencyMs: 0, parseOk: false, validationOk: false, fallback: "skip" });
    return;
  }

  const articles = safeParseJson<unknown[]>(result.text);

  if (!Array.isArray(articles) || articles.length === 0) {
    logAICall({ task: "media", model: result.model, provider: result.provider as Provider, latencyMs: 0, parseOk: false, validationOk: false, fallback: "skip" });
    return;
  }

  const db = getDb();
  let inserted = 0;

  for (const article of articles.slice(0, 3)) {
    const a = article as Record<string, unknown>;
    if (!a.headline || !a.summary || !a.content || !a.outlet) continue;

    const outlet = OUTLETS.find(o => o.name === a.outlet);
    const bias = outlet?.bias ?? "center";

    db.insert(schema.mediaArticles).values({
      id: `media-${generateId()}`,
      headline: a.headline as string,
      summary: a.summary as string,
      content: a.content as string,
      outlet: a.outlet as string,
      bias,
      category: (a.category as string) || "policy",
      dayNumber: currentDay,
    }).run();
    inserted++;
  }

  logAICall({ task: "media", model: result.model, provider: result.provider as Provider, latencyMs: 0, parseOk: true, validationOk: inserted > 0 });
}
