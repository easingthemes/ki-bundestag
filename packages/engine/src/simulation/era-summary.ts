/**
 * Era summary generation — compressed historical narratives.
 *
 * Periodically (every N days, aligned to budget cycles) generates a summary
 * of the era's events via an AI batch call. These summaries replace raw event
 * lookbacks in agent prompts, bounding prompt size as the simulation grows.
 */

import { desc, gte, lte, and, eq, or } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";
import type { BatchRequest } from "../agent/batch-client.js";
import type { BatchResult } from "../agent/batch-client.js";
import { parseAIJson, logAICall } from "../agent/ai-json.js";
import type { Provider } from "../agent/model-config.js";
import type { DepthConfig } from "../agent/context-depth.js";
import type { EraCaseFacts } from "@ki-bundestag/types";

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
export function getEraSummaries(): Array<{ startDay: number; endDay: number; summary: string; caseFacts?: EraCaseFacts }> {
  const db = getDb();
  const rows = db.select({
    startDay: schema.eraSummaries.startDay,
    endDay: schema.eraSummaries.endDay,
    summary: schema.eraSummaries.summary,
    caseFacts: schema.eraSummaries.caseFacts,
  }).from(schema.eraSummaries)
    .orderBy(schema.eraSummaries.startDay)
    .all();
  return rows.map(r => ({
    startDay: r.startDay,
    endDay: r.endDay,
    summary: r.summary,
    caseFacts: r.caseFacts as EraCaseFacts | undefined ?? undefined,
  }));
}

// ---------------------------------------------------------------------------
// Case facts extraction
// ---------------------------------------------------------------------------

/**
 * Extract structured case facts from DB state at an era boundary.
 * These facts are DB-sourced (not AI-generated) and survive all summarization.
 */
export function extractCaseFacts(startDay: number, endDay: number): EraCaseFacts {
  const db = getDb();

  // Economy + coalition from national_state (single row)
  const ns = db.select().from(schema.nationalState).limit(1).all()[0];
  const economy = ns ? {
    budget: ns.budget,
    unemployment: ns.unemployment,
    inflation: ns.inflation,
    gdpGrowth: ns.gdpGrowth,
    publicSentiment: ns.publicSentiment,
  } : { budget: 0, unemployment: 0, inflation: 0, gdpGrowth: 0, publicSentiment: 0 };

  const coalitionPartyIds = ns ? (ns.coalitionParties as string[]) : [];

  // Active government
  const gov = db.select({
    chancellorName: schema.government.chancellorName,
    chancellorPartyId: schema.government.chancellorPartyId,
  }).from(schema.government)
    .where(eq(schema.government.active, true))
    .limit(1)
    .all()[0];

  // Party approvals and seats
  const parties = db.select({
    id: schema.parties.id,
    approvalRating: schema.parties.approvalRating,
    seatCount: schema.parties.seatCount,
  }).from(schema.parties).all();

  const partyApprovals: Record<string, number> = {};
  const partySeats: Record<string, number> = {};
  for (const p of parties) {
    partyApprovals[p.id] = p.approvalRating;
    partySeats[p.id] = p.seatCount;
  }

  // Bills passed during era
  const billsPassed = db.select({
    id: schema.bills.id,
    title: schema.bills.title,
    category: schema.bills.category,
  }).from(schema.bills)
    .where(and(
      eq(schema.bills.status, "passed"),
      gte(schema.bills.statusChangedOnDay, startDay),
      lte(schema.bills.statusChangedOnDay, endDay),
    ))
    .all();

  // Bills rejected during era
  const billsRejected = db.select({
    id: schema.bills.id,
    title: schema.bills.title,
  }).from(schema.bills)
    .where(and(
      eq(schema.bills.status, "rejected"),
      gte(schema.bills.statusChangedOnDay, startDay),
      lte(schema.bills.statusChangedOnDay, endDay),
    ))
    .all();

  // Elections during era
  const electionRows = db.select({
    triggerReason: schema.elections.triggerReason,
    electionDay: schema.elections.electionDay,
    status: schema.elections.status,
    results: schema.elections.results,
  }).from(schema.elections)
    .where(and(
      gte(schema.elections.electionDay, startDay),
      lte(schema.elections.electionDay, endDay),
    ))
    .all();

  const elections = electionRows.map(e => ({
    reason: e.triggerReason,
    day: e.electionDay,
    outcome: e.status === "completed" ? "completed" : e.status,
  }));

  // Crises during era
  const crisisRows = db.select({
    name: schema.crises.name,
    severity: schema.crises.severity,
    resolved: schema.crises.resolved,
  }).from(schema.crises)
    .where(and(
      gte(schema.crises.startDay, startDay),
      lte(schema.crises.startDay, endDay),
    ))
    .all();

  const crises = crisisRows.map(c => ({
    name: c.name,
    severity: c.severity,
    resolved: c.resolved,
  }));

  // Government changes during era
  const govRows = db.select({
    chancellorName: schema.government.chancellorName,
    chancellorPartyId: schema.government.chancellorPartyId,
    formedOnDay: schema.government.formedOnDay,
    dissolvedOnDay: schema.government.dissolvedOnDay,
  }).from(schema.government)
    .where(or(
      and(gte(schema.government.formedOnDay, startDay), lte(schema.government.formedOnDay, endDay)),
      and(gte(schema.government.dissolvedOnDay, startDay), lte(schema.government.dissolvedOnDay, endDay)),
    ))
    .all();

  const governmentChanges = govRows.map(g => {
    const formed = g.formedOnDay >= startDay && g.formedOnDay <= endDay;
    return {
      type: formed ? "formed" : "dissolved",
      day: formed ? g.formedOnDay : g.dissolvedOnDay!,
      description: `${g.chancellorName} (${g.chancellorPartyId})`,
    };
  });

  return {
    economy,
    coalitionPartyIds,
    government: gov ? { chancellorName: gov.chancellorName, chancellorPartyId: gov.chancellorPartyId } : undefined,
    partyApprovals,
    partySeats,
    billsPassed,
    billsRejected,
    elections,
    crises,
    governmentChanges,
  };
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
  caseFacts?: EraCaseFacts,
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

  // Build optional case facts context for the AI to reference
  let factsStr = "";
  if (caseFacts) {
    const lines: string[] = [];
    lines.push(`  Economy: Budget ${caseFacts.economy.budget.toFixed(0)}B, Unemployment ${caseFacts.economy.unemployment.toFixed(1)}%, GDP Growth ${caseFacts.economy.gdpGrowth.toFixed(1)}%`);
    if (caseFacts.coalitionPartyIds.length > 0) {
      lines.push(`  Coalition: ${caseFacts.coalitionPartyIds.join(", ")}`);
    }
    if (caseFacts.government) {
      lines.push(`  Chancellor: ${caseFacts.government.chancellorName} (${caseFacts.government.chancellorPartyId})`);
    }
    if (caseFacts.billsPassed.length > 0) {
      lines.push(`  Bills passed: ${caseFacts.billsPassed.map(b => `"${b.title}"`).join(", ")}`);
    }
    if (caseFacts.billsRejected.length > 0) {
      lines.push(`  Bills rejected: ${caseFacts.billsRejected.map(b => `"${b.title}"`).join(", ")}`);
    }
    if (caseFacts.elections.length > 0) {
      lines.push(`  Elections: ${caseFacts.elections.map(e => `Day ${e.day} (${e.reason})`).join(", ")}`);
    }
    if (caseFacts.crises.length > 0) {
      lines.push(`  Crises: ${caseFacts.crises.map(c => `${c.name} [${c.severity}${c.resolved ? ", resolved" : ""}]`).join(", ")}`);
    }
    factsStr = `\n\nSTATE AT ERA END:\n${lines.join("\n")}`;
  }

  const prompt = `Summarize the political era from Day ${startDay} to Day ${endDay}:

KEY EVENTS:
${eventStr}

APPROVAL TRENDS:
${trendStr || "  No trend data available."}${factsStr}`;

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
  caseFacts?: EraCaseFacts,
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
    caseFacts: caseFacts ?? null,
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
