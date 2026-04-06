import type { MediaArticle, Party, SimulationEvent } from "@ki-bundestag/types";
import { desc, eq } from "drizzle-orm";
import { callAI, AIProviderLimitError } from "../agent/client.js";
import { safeParseJson, logAICall } from "../agent/ai-json.js";
import { getDb, schema } from "../db/index.js";
import type { BatchRequest, BatchResult } from "../agent/batch-client.js";
import type { Provider } from "../agent/model-config.js";
import {
  MEDIA_OUTLETS as OUTLETS,
  NEWSWORTHY_TYPES,
  MEDIA_SENTIMENT_SCALE, MEDIA_SENTIMENT_PER_ARTICLE_CAP, MEDIA_SENTIMENT_DAILY_CAP,
  MEDIA_DAILY_ARTICLE_CAP, MEDIA_CATEGORY_SENTIMENT,
  MEDIA_SYSTEM_PROMPT,
} from "../config/index.js";

function generateId(): string {
  return Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}

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
 * Uses AI-provided sentiment when available, falls back to category-based heuristic.
 * Capped at ±0.5/day.
 */
export function mediaSentimentImpact(articles: Array<{ category: string; sentiment?: number }>): number {
  let delta = 0;
  for (const a of articles) {
    if (typeof a.sentiment === "number") {
      delta += Math.max(-MEDIA_SENTIMENT_PER_ARTICLE_CAP, Math.min(MEDIA_SENTIMENT_PER_ARTICLE_CAP, a.sentiment * MEDIA_SENTIMENT_SCALE));
    } else {
      delta += MEDIA_CATEGORY_SENTIMENT[a.category] ?? 0;
    }
  }
  return Math.max(-MEDIA_SENTIMENT_DAILY_CAP, Math.min(MEDIA_SENTIMENT_DAILY_CAP, Math.round(delta * 10) / 10));
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
      system: MEDIA_SYSTEM_PROMPT,
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

    for (const article of articles.slice(0, MEDIA_DAILY_ARTICLE_CAP)) {
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

/**
 * Apply sentiment from already-parsed articles (with AI-provided sentiment scores).
 * Avoids re-reading from DB and uses richer sentiment data from the batch result.
 */
export function applyMediaSentimentFromArticles(
  articles: Array<{ category: string; sentiment?: number }>,
  currentDay: number,
  currentSentiment: number,
  stateId: number,
): number {
  if (articles.length === 0) return currentSentiment;

  const mediaDelta = mediaSentimentImpact(articles);
  if (mediaDelta === 0) return currentSentiment;

  const db = getDb();
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

// MEDIA_SYSTEM_PROMPT imported from config

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
): Array<{ category: string; sentiment?: number }> {
  if (!result || !result.text) {
    logAICall({ task: "media", model: result?.model ?? "unknown", provider: (result?.provider ?? "anthropic") as Provider, latencyMs: 0, parseOk: false, validationOk: false, fallback: "skip" });
    return [];
  }

  const articles = safeParseJson<unknown[]>(result.text);

  if (!Array.isArray(articles) || articles.length === 0) {
    logAICall({ task: "media", model: result.model, provider: result.provider as Provider, latencyMs: 0, parseOk: false, validationOk: false, fallback: "skip" });
    return [];
  }

  const db = getDb();
  let inserted = 0;
  const parsed: Array<{ category: string; sentiment?: number }> = [];

  for (const article of articles.slice(0, MEDIA_DAILY_ARTICLE_CAP)) {
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

    const sentiment = typeof a.sentiment === "number" ? a.sentiment : undefined;
    parsed.push({ category: (a.category as string) || "policy", sentiment });
  }

  logAICall({ task: "media", model: result.model, provider: result.provider as Provider, latencyMs: 0, parseOk: true, validationOk: inserted > 0 });
  return parsed;
}
