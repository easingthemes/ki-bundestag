import type { MediaArticle, Party, SimulationEvent } from "@ki-bundestag/types";
import { desc } from "drizzle-orm";
import { getClient, MODELS } from "../agent/client.js";
import { getDb, schema } from "../db/index.js";

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

  const client = getClient();

  const eventSummaries = newsworthy.map(e => `[${e.type}] ${e.title}: ${e.description}`).join("\n");
  const partyNames = allParties.map(p => `${p.name} (${p.id})`).join(", ");

  try {
    const response = await client.messages.create({
      model: MODELS.daily,
      max_tokens: 2048,
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
- Write in English but use German political terminology where appropriate (Bundestag, Koalition, etc.)
- Category should match the primary topic`,
      messages: [{
        role: "user",
        content: `Day ${currentDay} in the Bundestag. Parties: ${partyNames}\n\nToday's events:\n${eventSummaries}\n\nWrite 2-3 news articles from different outlets covering today's events.`,
      }],
    });

    const text = response.content
      .filter(block => block.type === "text")
      .map(block => block.text)
      .join("");

    let jsonStr = text.trim();
    const match = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) jsonStr = match[1].trim();

    const articles = JSON.parse(jsonStr);

    if (!Array.isArray(articles) || articles.length === 0) return;

    const db = getDb();

    for (const article of articles.slice(0, 3)) {
      if (!article.headline || !article.summary || !article.content || !article.outlet) continue;

      const outlet = OUTLETS.find(o => o.name === article.outlet);
      const bias = outlet?.bias ?? "center";

      db.insert(schema.mediaArticles).values({
        id: `media-${generateId()}`,
        headline: article.headline,
        summary: article.summary,
        content: article.content,
        outlet: article.outlet,
        bias,
        category: article.category || "policy",
        dayNumber: currentDay,
      }).run();
    }

    console.log(`  [Media] Generated ${Math.min(articles.length, 3)} articles`);
  } catch (error) {
    console.error("  [Media] Error generating articles:", error);
  }
}
