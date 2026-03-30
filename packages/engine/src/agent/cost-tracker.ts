/**
 * AI call cost tracking — logs token usage and costs to the ai_calls table.
 *
 * Pricing (per million tokens, batch pricing for Anthropic):
 * - Haiku 4.5:  input $0.40, output $1.00 (batch: 50% of standard $0.80/$4.00)
 * - Sonnet 4.5: input $1.50, output $5.00 (batch: 50% of standard $3.00/$15.00)
 * - Grok 3 Mini: input $0.30, output $0.50 (no batch discount)
 */

import { getSqlite } from "../db/connection.js";

// ---------------------------------------------------------------------------
// Pricing (per token, not per million)
// ---------------------------------------------------------------------------

interface PricingTier {
  input: number;   // cost per token
  output: number;  // cost per token
}

/** Batch pricing for Anthropic models (50% of standard). */
const BATCH_PRICING: Record<string, PricingTier> = {
  "claude-haiku-4-5-20251001": { input: 0.40e-6, output: 1.00e-6 },
  "claude-sonnet-4-5-20250929": { input: 1.50e-6, output: 5.00e-6 },
};

/** Standard (non-batch) pricing. */
const STANDARD_PRICING: Record<string, PricingTier> = {
  "claude-haiku-4-5-20251001": { input: 0.80e-6, output: 4.00e-6 },
  "claude-sonnet-4-5-20250929": { input: 3.00e-6, output: 15.00e-6 },
  "grok-3-mini": { input: 0.30e-6, output: 0.50e-6 },
};

function getPricing(model: string, isBatch: boolean): PricingTier {
  if (isBatch && BATCH_PRICING[model]) return BATCH_PRICING[model];
  return STANDARD_PRICING[model] ?? { input: 1.00e-6, output: 4.00e-6 }; // conservative default
}

export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  isBatch: boolean,
): number {
  const pricing = getPricing(model, isBatch);
  return inputTokens * pricing.input + outputTokens * pricing.output;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

export interface AICallRecord {
  dayNumber: number;
  task: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs?: number;
  batchId?: string;
  success: boolean;
}

const INSERT_SQL = `
  INSERT INTO ai_calls (day_number, task, provider, model, input_tokens, output_tokens, cost_usd, latency_ms, batch_id, success, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

/** Current simulation day — set at the start of each runDay() call. */
let _currentDay = 0;

export function setTrackingDay(day: number): void {
  _currentDay = day;
}

export function getTrackingDay(): number {
  return _currentDay;
}

/**
 * Record an AI call to the database.
 * Safe to call — silently logs errors without throwing.
 */
export function recordAICall(record: AICallRecord): void {
  try {
    const sqlite = getSqlite();
    sqlite.prepare(INSERT_SQL).run(
      record.dayNumber,
      record.task,
      record.provider,
      record.model,
      record.inputTokens,
      record.outputTokens,
      record.costUsd,
      record.latencyMs ?? null,
      record.batchId ?? null,
      record.success ? 1 : 0,
      new Date().toISOString(),
    );
  } catch (err) {
    // Don't let cost tracking break the simulation
    console.warn(`  [CostTracker] Failed to record AI call: ${(err as Error).message}`);
  }
}

/**
 * Convenience: record a batch of calls from Anthropic batch results.
 */
export function recordBatchCalls(
  results: Array<{
    task: string;
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    success: boolean;
  }>,
  batchId?: string,
  latencyMs?: number,
): void {
  for (const r of results) {
    recordAICall({
      dayNumber: _currentDay,
      task: r.task,
      provider: r.provider,
      model: r.model,
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
      costUsd: calculateCost(r.model, r.inputTokens, r.outputTokens, !!batchId),
      latencyMs,
      batchId,
      success: r.success,
    });
  }
}

// ---------------------------------------------------------------------------
// Query helpers (for admin API)
// ---------------------------------------------------------------------------

export interface DayCostSummary {
  dayNumber: number;
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  failedCalls: number;
}

export interface TaskCostSummary {
  task: string;
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
}

export interface ModelCostSummary {
  provider: string;
  model: string;
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
}

export interface CostOverview {
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  failedCalls: number;
  firstDay: number | null;
  lastDay: number | null;
}

export function getCostOverview(): CostOverview {
  const sqlite = getSqlite();
  const row = sqlite.prepare(`
    SELECT
      COUNT(*) as totalCalls,
      COALESCE(SUM(input_tokens), 0) as totalInputTokens,
      COALESCE(SUM(output_tokens), 0) as totalOutputTokens,
      COALESCE(SUM(cost_usd), 0) as totalCostUsd,
      SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failedCalls,
      MIN(day_number) as firstDay,
      MAX(day_number) as lastDay
    FROM ai_calls
  `).get() as CostOverview;
  return row;
}

export function getCostByDay(fromDay?: number, toDay?: number): DayCostSummary[] {
  const sqlite = getSqlite();
  let sql = `
    SELECT
      day_number as dayNumber,
      COUNT(*) as totalCalls,
      SUM(input_tokens) as totalInputTokens,
      SUM(output_tokens) as totalOutputTokens,
      SUM(cost_usd) as totalCostUsd,
      SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failedCalls
    FROM ai_calls
  `;
  const params: number[] = [];
  const conditions: string[] = [];
  if (fromDay !== undefined) { conditions.push("day_number >= ?"); params.push(fromDay); }
  if (toDay !== undefined) { conditions.push("day_number <= ?"); params.push(toDay); }
  if (conditions.length) sql += " WHERE " + conditions.join(" AND ");
  sql += " GROUP BY day_number ORDER BY day_number DESC LIMIT 100";
  return sqlite.prepare(sql).all(...params) as DayCostSummary[];
}

export function getCostByTask(): TaskCostSummary[] {
  const sqlite = getSqlite();
  return sqlite.prepare(`
    SELECT
      task,
      COUNT(*) as totalCalls,
      SUM(input_tokens) as totalInputTokens,
      SUM(output_tokens) as totalOutputTokens,
      SUM(cost_usd) as totalCostUsd
    FROM ai_calls
    GROUP BY task
    ORDER BY totalCostUsd DESC
  `).all() as TaskCostSummary[];
}

export function getCostByModel(): ModelCostSummary[] {
  const sqlite = getSqlite();
  return sqlite.prepare(`
    SELECT
      provider,
      model,
      COUNT(*) as totalCalls,
      SUM(input_tokens) as totalInputTokens,
      SUM(output_tokens) as totalOutputTokens,
      SUM(cost_usd) as totalCostUsd
    FROM ai_calls
    GROUP BY provider, model
    ORDER BY totalCostUsd DESC
  `).all() as ModelCostSummary[];
}
