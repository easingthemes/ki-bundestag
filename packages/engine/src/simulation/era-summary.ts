/**
 * Era summary generation — compressed historical narratives.
 *
 * Periodically (every N days, aligned to budget cycles) generates a summary
 * of the era's events via an AI batch call. These summaries replace raw event
 * lookbacks in agent prompts, bounding prompt size as the simulation grows.
 */

import { desc, gte, and } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";
import type { BatchRequest } from "../agent/batch-client.js";
import type { BatchResult } from "../agent/batch-client.js";
import { parseAIJson, logAICall } from "../agent/ai-json.js";
import type { Provider } from "../agent/model-config.js";
import type { DepthConfig } from "../agent/context-depth.js";

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

/**
 * Get the end day of the last era summary, or 0 if none exist.
 */
export function getLastEraSummaryEnd(): number {
  const db = getDb();
  const row = db.select({ endDay: schema.eraSummaries.endDay })
    .from(schema.eraSummaries)
    .orderBy(desc(schema.eraSummaries.endDay))
    .limit(1)
    .all();
  return row.length > 0 ? row[0].endDay : 0;
}

/**
 * Get all era summaries, ordered chronologically.
 */
export function getEraSummaries(): Array<{ startDay: number; endDay: number; summary: string }> {
  const db = getDb();
  return db.select({
    startDay: schema.eraSummaries.startDay,
    endDay: schema.eraSummaries.endDay,
    summary: schema.eraSummaries.summary,
  }).from(schema.eraSummaries)
    .orderBy(schema.eraSummaries.startDay)
    .all();
}

// ---------------------------------------------------------------------------
// Should generate?
// ---------------------------------------------------------------------------

/**
 * Check if an era summary should be generated for the current day.
 */
export function shouldGenerateEraSummary(
  currentDay: number,
  depthConfig: DepthConfig,
): boolean {
  if (!depthConfig.enableEraSummaries || depthConfig.eraSummaryIntervalDays <= 0) {
    return false;
  }

  const lastEnd = getLastEraSummaryEnd();
  const daysSinceLast = currentDay - lastEnd;
  return daysSinceLast >= depthConfig.eraSummaryIntervalDays;
}

// ---------------------------------------------------------------------------
// Build batch request
// ---------------------------------------------------------------------------

const ERA_SUMMARY_SYSTEM = `You are a senior political historian at the German Bundestag. Write a concise summary of the political era described below. Write in German.

Your summary must be FACTUAL — summarize only what happened based on the data provided. Focus on:
- Major legislative achievements or failures
- Shifts in political power and approval
- Crises and their resolution
- Coalition dynamics and conflicts

FORMAT (respond with ONLY valid JSON, all text in German):
{
  "summary": "<3-5 Sätze: Zusammenfassung der wichtigsten politischen Entwicklungen dieser Ära>"
}`;

/**
 * Build a batch request for era summary generation.
 * Returns null if there's not enough data for a meaningful summary.
 */
export function buildEraSummaryBatchRequest(
  currentDay: number,
  depthConfig: DepthConfig,
): BatchRequest | null {
  const lastEnd = getLastEraSummaryEnd();
  const startDay = lastEnd + 1;
  const endDay = currentDay - 1; // Summarize up to yesterday

  if (endDay < startDay) return null;

  const db = getDb();

  // Gather daily summaries from simulation_meta for the era window
  // These are stored in the daily_summary column
  const events = db.select({
    dayNumber: schema.simulationEvents.dayNumber,
    type: schema.simulationEvents.type,
    actor: schema.simulationEvents.actor,
    title: schema.simulationEvents.title,
  }).from(schema.simulationEvents)
    .where(and(
      gte(schema.simulationEvents.dayNumber, startDay),
      gte(schema.simulationEvents.dayNumber, 1), // sanity
    ))
    .orderBy(schema.simulationEvents.dayNumber)
    .limit(200)
    .all()
    .filter(e => e.dayNumber <= endDay);

  // Get party history for the era
  const partyHistory = db.select({
    partyId: schema.partyHistory.partyId,
    dayNumber: schema.partyHistory.dayNumber,
    approvalRating: schema.partyHistory.approvalRating,
    seatCount: schema.partyHistory.seatCount,
  }).from(schema.partyHistory)
    .where(and(
      gte(schema.partyHistory.dayNumber, startDay),
    ))
    .orderBy(schema.partyHistory.dayNumber)
    .limit(200)
    .all()
    .filter(r => r.dayNumber <= endDay);

  if (events.length === 0) return null;

  // Build compact context string
  const eventStr = events
    .map(e => `  [Day ${e.dayNumber}] ${e.type}: ${e.title}`)
    .join("\n");

  // Summarize party trends
  const partyTrends = new Map<string, { start: number; end: number }>();
  for (const row of partyHistory) {
    const existing = partyTrends.get(row.partyId);
    if (!existing) {
      partyTrends.set(row.partyId, { start: row.approvalRating, end: row.approvalRating });
    } else {
      existing.end = row.approvalRating;
    }
  }

  const trendStr = [...partyTrends.entries()]
    .map(([id, t]) => `  ${id}: ${t.start}% → ${t.end}%`)
    .join("\n");

  const prompt = `Summarize the political era from Day ${startDay} to Day ${endDay}:

KEY EVENTS:
${eventStr}

APPROVAL TRENDS:
${trendStr || "  No trend data available."}`;

  return {
    customId: `era-summary-${startDay}-${endDay}`,
    system: ERA_SUMMARY_SYSTEM,
    prompt,
    maxTokens: 512,
    roleKey: "synthesis",
  };
}

// ---------------------------------------------------------------------------
// Process result
// ---------------------------------------------------------------------------

/**
 * Process an era summary batch result and persist to DB.
 * Returns true on success, false on failure (graceful degradation).
 */
export function processEraSummaryResult(
  result: BatchResult | undefined,
  currentDay: number,
): boolean {
  const lastEnd = getLastEraSummaryEnd();
  const startDay = lastEnd + 1;
  const endDay = currentDay - 1;

  if (!result || !result.text) {
    logAICall({
      task: "era-summary",
      model: result?.model ?? "unknown",
      provider: (result?.provider ?? "anthropic") as Provider,
      latencyMs: 0,
      parseOk: false,
      validationOk: false,
      fallback: "skip",
    });
    return false;
  }

  const parsed = parseAIJson<{ summary: string }>(
    result.text,
    (v: unknown) => {
      const o = v as Record<string, unknown>;
      if (typeof o.summary !== "string" || o.summary.length < 10) return null;
      return { summary: o.summary };
    },
    "EraSummary",
  );

  if (!parsed) {
    logAICall({
      task: "era-summary",
      model: result.model,
      provider: result.provider as Provider,
      latencyMs: 0,
      parseOk: false,
      validationOk: false,
      fallback: "skip",
    });
    return false;
  }

  // Persist to DB
  const db = getDb();
  const id = `era-${startDay}-${endDay}`;
  db.insert(schema.eraSummaries).values({
    id,
    startDay,
    endDay,
    summary: parsed.summary,
    createdAt: new Date().toISOString(),
  }).run();

  logAICall({
    task: "era-summary",
    model: result.model,
    provider: result.provider as Provider,
    latencyMs: 0,
    parseOk: true,
    validationOk: true,
  });

  console.log(`  [EraSummary] Generated summary for days ${startDay}-${endDay}`);
  return true;
}
