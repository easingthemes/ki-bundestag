/**
 * Daily political briefing generator.
 *
 * Produces a shared briefing document from the last 30 days of DB history.
 * This briefing is injected into every party agent prompt, giving them
 * cross-day memory and narrative continuity.
 */

import { getDb, schema } from "../db/index.js";
import { desc } from "drizzle-orm";
import type { Party, SimulationEvent } from "@ki-bundestag/types";
import type { BatchRequest } from "./batch-client.js";
import type { BatchResult } from "./batch-client.js";
import { parseAIJson, logAICall } from "./ai-json.js";
import type { Provider } from "./model-config.js";

/** Significant event types for the briefing. */
const BRIEFING_EVENT_TYPES = new Set([
  "bill_passed",
  "bill_rejected",
  "bill_proposed",
  "crisis_start",
  "crisis_end",
  "election_announced",
  "election_result",
  "government_formed",
  "negotiation_complete",
  "statement",
  "confidence_vote_result",
  "constitutional_court_ruling",
  "presidential_veto",
  "budget_passed",
  "budget_rejected",
]);

/**
 * Query the last N days of significant events from the DB.
 */
function getRecentSignificantEvents(currentDay: number, lookbackDays = 30): Array<{ day: number; type: string; actor: string; title: string }> {
  const db = getDb();
  const minDay = Math.max(1, currentDay - lookbackDays);

  const rows = db.select().from(schema.simulationEvents)
    .orderBy(desc(schema.simulationEvents.dayNumber))
    .all() as unknown as SimulationEvent[];

  return rows
    .filter(e => e.dayNumber >= minDay && BRIEFING_EVENT_TYPES.has(e.type))
    .map(e => ({ day: e.dayNumber, type: e.type, actor: e.actor, title: e.title }))
    .slice(0, 60);
}

/**
 * Query party approval history for trend analysis.
 */
function getApprovalTrends(currentDay: number, lookbackDays = 14): Map<string, { current: number; previous: number }> {
  const db = getDb();
  const minDay = Math.max(1, currentDay - lookbackDays);
  const midDay = Math.max(1, currentDay - Math.floor(lookbackDays / 2));

  const rows = db.select().from(schema.partyHistory).all();
  const trends = new Map<string, { current: number; previous: number }>();

  for (const row of rows) {
    const existing = trends.get(row.partyId);
    if (row.dayNumber >= midDay) {
      // Recent half
      if (!existing || row.dayNumber > (existing as any)._recentDay) {
        trends.set(row.partyId, {
          current: row.approvalRating,
          previous: existing?.previous ?? row.approvalRating,
        });
        (trends.get(row.partyId) as any)._recentDay = row.dayNumber;
      }
    } else if (row.dayNumber >= minDay) {
      // Older half
      const e = trends.get(row.partyId);
      if (e) {
        e.previous = row.approvalRating;
      } else {
        trends.set(row.partyId, { current: row.approvalRating, previous: row.approvalRating });
      }
    }
  }

  return trends;
}

/**
 * Build the raw context string for the briefing AI call.
 */
function buildBriefingContext(
  currentDay: number,
  allParties: Party[],
  coalitionPartyIds: string[],
): string {
  const events = getRecentSignificantEvents(currentDay);
  const trends = getApprovalTrends(currentDay);

  const coalitionNames = allParties
    .filter(p => coalitionPartyIds.includes(p.id))
    .map(p => p.name)
    .join(", ");

  const oppositionNames = allParties
    .filter(p => !coalitionPartyIds.includes(p.id))
    .map(p => p.name)
    .join(", ");

  const partyTrends = allParties.map(p => {
    const t = trends.get(p.id);
    if (!t) return `  ${p.name}: ${p.approvalRating}% (no trend data)`;
    const delta = Math.round((t.current - t.previous) * 10) / 10;
    const arrow = delta > 0 ? "↑" : delta < 0 ? "↓" : "→";
    return `  ${p.name}: ${t.current}% (${arrow}${Math.abs(delta)}pp over 14 days)`;
  }).join("\n");

  // Group events by period
  const recentEvents = events.filter(e => e.day >= currentDay - 7);
  const olderEvents = events.filter(e => e.day < currentDay - 7);

  const recentStr = recentEvents.length > 0
    ? recentEvents.map(e => `  [Day ${e.day}] ${e.title}`).join("\n")
    : "  No significant events.";

  const olderStr = olderEvents.length > 0
    ? olderEvents.slice(0, 20).map(e => `  [Day ${e.day}] ${e.title}`).join("\n")
    : "  No earlier events.";

  return `CURRENT DAY: ${currentDay}
COALITION: ${coalitionNames}
OPPOSITION: ${oppositionNames}

PARTY APPROVAL TRENDS (last 14 days):
${partyTrends}

EVENTS — LAST 7 DAYS:
${recentStr}

EVENTS — DAYS ${Math.max(1, currentDay - 30)} TO ${currentDay - 7}:
${olderStr}`;
}

const BRIEFING_SYSTEM_PROMPT = `You are a senior political analyst at the Bundestag. Write a concise daily briefing for party leaders summarizing the current political landscape.

Your briefing must be FACTUAL — summarize only what happened, the current state, and emerging dynamics. Do not invent events.

FORMAT (respond with ONLY valid JSON):
{
  "narrative": "<2-3 sentences: What is the political story right now? What are the key dynamics shaping decisions?>",
  "tensions": "<1-2 sentences: What are the main points of conflict or open questions between parties?>",
  "outlook": "<1 sentence: What should party leaders watch for in the coming days?>"
}`;

/**
 * Build a BatchRequest for the daily briefing, or null if too early (day 1-2).
 */
export function buildBriefingBatchRequest(
  currentDay: number,
  allParties: Party[],
  coalitionPartyIds: string[],
): BatchRequest | null {
  // No briefing needed on the first couple of days — not enough history
  if (currentDay <= 2) return null;

  const context = buildBriefingContext(currentDay, allParties, coalitionPartyIds);

  return {
    customId: `briefing-day${currentDay}`,
    system: BRIEFING_SYSTEM_PROMPT,
    prompt: `Analyze the following political data and write today's briefing:\n\n${context}`,
    maxTokens: 512,
    roleKey: "daily",
  };
}

/**
 * Parse a briefing batch result into a formatted briefing string.
 * Returns null on parse failure (graceful degradation — agents run without briefing).
 */
export function processBriefingResult(result: BatchResult | undefined): string | null {
  if (!result || !result.text) {
    logAICall({
      task: "briefing",
      model: result?.model ?? "unknown",
      provider: (result?.provider ?? "anthropic") as Provider,
      latencyMs: 0,
      parseOk: false,
      validationOk: false,
      fallback: "skip",
    });
    return null;
  }

  const parsed = parseAIJson<{ narrative: string; tensions: string; outlook: string }>(
    result.text,
    (v: unknown) => {
      const o = v as Record<string, unknown>;
      if (typeof o.narrative !== "string" || typeof o.tensions !== "string" || typeof o.outlook !== "string") return null;
      return { narrative: o.narrative, tensions: o.tensions, outlook: o.outlook };
    },
    "Briefing",
  );

  if (!parsed) {
    logAICall({
      task: "briefing",
      model: result.model,
      provider: result.provider as Provider,
      latencyMs: 0,
      parseOk: false,
      validationOk: false,
      fallback: "skip",
    });
    return null;
  }

  logAICall({
    task: "briefing",
    model: result.model,
    provider: result.provider as Provider,
    latencyMs: 0,
    parseOk: true,
    validationOk: true,
  });

  return `POLITICAL BRIEFING:
${parsed.narrative}
Tensions: ${parsed.tensions}
Outlook: ${parsed.outlook}`;
}

/**
 * Query a party's own recent actions from simulation events.
 */
export function getPartyRecentActions(
  partyId: string,
  currentDay: number,
  lookbackDays = 14,
): Array<{ day: number; type: string; title: string }> {
  const db = getDb();
  const minDay = Math.max(1, currentDay - lookbackDays);

  const rows = db.select().from(schema.simulationEvents)
    .orderBy(desc(schema.simulationEvents.dayNumber))
    .all() as unknown as SimulationEvent[];

  return rows
    .filter(e => e.dayNumber >= minDay && e.actor === partyId)
    .map(e => ({ day: e.dayNumber, type: e.type, title: e.title }))
    .slice(0, 15);
}
