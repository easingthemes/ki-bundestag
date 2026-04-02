/**
 * Batch API client for Anthropic and xAI.
 *
 * Submits multiple AI prompts as a single batch, polls for completion,
 * and returns all results. Saves 50% on token costs vs synchronous calls.
 *
 * ## Observed latency (2026-04-01, day 84-85 investigation)
 *
 * Anthropic's batch API latency varies significantly with server load:
 *   - Normal load: 2-4 poll cycles (1-3 min per batch)
 *   - High load:   10-16 poll cycles (10-20+ min per batch)
 *   - MdB seat batches observed: 242s, 306s, 483s, 1025s (17 min!)
 *
 * This makes the simulation appear "stuck" even though it's just waiting
 * for the Anthropic API to finish processing. The sim continues normally
 * once the batch completes.
 *
 * ## Timeout/polling design decisions
 *
 * - Default timeout raised from 3600s → 5400s (90 min) to handle worst-case
 *   API slowdowns without killing the sim. A single day can have 4-6 batches,
 *   each potentially slow. 3600s was too tight for consecutive slow batches.
 *
 * - Adaptive poll intervals (15s → 30s → 45s → 60s) avoid hammering the API
 *   when it's already under load, while still detecting fast completions early.
 *
 * - A warning log at poll #10 (~5 min elapsed) helps operators distinguish
 *   "slow but working" from "actually stuck" in the PM2 logs.
 */

import Anthropic from "@anthropic-ai/sdk";
import { callAI, AIProviderLimitError, AIProviderAuthError, detectLimitError, parseResetTime, markProviderLimited, markProviderAuthFailed, isProviderAuthFailed } from "./client.js";
import { getPartyModel, getRoleModel, type Provider, type RoleKey, type ModelConfig } from "./model-config.js";
import { recordAICall, calculateCost, getTrackingDay } from "./cost-tracker.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BatchRequest {
  /** Unique ID to match results back to requests (e.g. "app-select-spd-day42"). */
  customId: string;
  /** System prompt. */
  system: string;
  /** User prompt. */
  prompt: string;
  /** Max output tokens. */
  maxTokens: number;
  /** Party ID for per-party model selection. */
  partyId?: string;
  /** Role key for system-role model selection. */
  roleKey?: RoleKey;
  /** JSON Schema for Anthropic structured output. Only used for Anthropic provider. */
  outputSchema?: Record<string, unknown>;
}

export interface BatchResult {
  customId: string;
  text: string;
  model: string;
  provider: Provider;
  inputTokens: number;
  outputTokens: number;
  /** Whether this result used Anthropic structured output (guaranteed valid JSON). */
  structuredOutput?: boolean;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BATCH_POLL_INTERVAL_BASE_MS = Number(process.env.BATCH_POLL_INTERVAL ?? 60) * 1000;

/**
 * Maximum time to wait for a single batch to complete.
 *
 * Raised from 3600s → 5400s (90 min) on 2026-04-01 after observing batches
 * take 10-17 min each when Anthropic is under load. A typical day submits
 * 4-6 batches (briefing, agents, interpellations, MdB, media+summary),
 * so worst-case total can exceed 60 min. The old 3600s timeout risked
 * killing the runner mid-day during API slowdowns.
 *
 * Override via env: BATCH_TIMEOUT=7200 (seconds)
 */
const BATCH_TIMEOUT_MS = Number(process.env.BATCH_TIMEOUT ?? 5400) * 1000;

/**
 * Adaptive poll interval: ramps up as batch takes longer.
 *
 *   Tier       Polls   Interval   Cumulative wait at tier end
 *   ─────────  ──────  ─────────  ───────────────────────────
 *   Quick      0-2     15s        ~45s    — catches fast 1-request batches
 *   Normal     3-9     30s        ~4 min  — typical agent batch completion
 *   Slow       10-19   45s        ~11 min — API under moderate load
 *   Fallback   20+     60s        open    — heavy load, just wait patiently
 *
 * The 45s tier (polls 10-19) was added on 2026-04-01 after observing that
 * during Anthropic API slowdowns, batches frequently completed between
 * polls 10-16. The old 15s → 30s → 60s ramp jumped too aggressively from
 * 30s to 60s, wasting time on batches that would finish at ~7-8 min.
 *
 * If BATCH_POLL_INTERVAL env is set to <30s, all adaptive tiers are bypassed
 * and the override is used as a flat interval (useful for testing).
 */
function adaptivePollInterval(pollCount: number): number {
  if (BATCH_POLL_INTERVAL_BASE_MS < 30_000) return BATCH_POLL_INTERVAL_BASE_MS; // respect explicit short override
  if (pollCount < 3) return 15_000;   // quick: small batches finish in <1 min
  if (pollCount < 10) return 30_000;  // normal: most batches complete here
  if (pollCount < 20) return 45_000;  // slow: API under load, observed on day 84-85
  return BATCH_POLL_INTERVAL_BASE_MS; // fallback: heavy load, wait patiently
}

// ---------------------------------------------------------------------------
// Chunking helper
// ---------------------------------------------------------------------------

/**
 * Split a list of items into chunks that fit within a token budget.
 * `tokensPerItem` is the estimated input tokens per item.
 * `maxTokens` is the context window budget (default: 160K, leaving room for system+output).
 */
export function chunkItems<T>(
  items: T[],
  tokensPerItem: number,
  maxTokens = 160_000,
): T[][] {
  const perChunk = Math.max(1, Math.floor(maxTokens / tokensPerItem));
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += perChunk) {
    chunks.push(items.slice(i, i + perChunk));
  }
  return chunks;
}

// ---------------------------------------------------------------------------
// Resolve model config for a batch request
// ---------------------------------------------------------------------------

function resolveModel(req: BatchRequest): ModelConfig {
  if (req.partyId) return getPartyModel(req.partyId);
  if (req.roleKey) return getRoleModel(req.roleKey);
  return getRoleModel("daily");
}

// ---------------------------------------------------------------------------
// Anthropic Batch API
// ---------------------------------------------------------------------------

let _anthropicClient: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
  if (!_anthropicClient) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not set");
    }
    _anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _anthropicClient;
}

async function submitAnthropicBatch(requests: BatchRequest[]): Promise<BatchResult[]> {
  if (requests.length === 0) return [];

  const client = getAnthropicClient();

  // Track which requests use structured output
  const structuredIds = new Set<string>();

  const batchRequests = requests.map(req => {
    const config = resolveModel(req);
    const baseParams = {
      model: config.model,
      max_tokens: req.maxTokens,
      system: req.system,
      messages: [{ role: "user" as const, content: req.prompt }],
    };
    if (req.outputSchema) {
      structuredIds.add(req.customId);
      return {
        custom_id: req.customId,
        params: {
          ...baseParams,
          output_config: {
            format: {
              type: "json_schema" as const,
              schema: req.outputSchema,
            },
          },
        },
      };
    }
    return { custom_id: req.customId, params: baseParams };
  });

  // Skip immediately if Anthropic is already marked as auth-failed
  if (isProviderAuthFailed("anthropic")) {
    throw new AIProviderAuthError("anthropic", "provider marked as auth-failed");
  }

  console.log(`  [Batch] Submitting ${batchRequests.length} Anthropic requests...`);
  const batchStartMs = Date.now();
  let batch;
  try {
    batch = await client.messages.batches.create({ requests: batchRequests });
  } catch (err) {
    const detected = detectLimitError(err);
    // Non-recoverable auth/billing error — mark provider and stop immediately
    if (detected.type === "auth") {
      markProviderAuthFailed("anthropic");
      console.error(`[Batch] *** ANTHROPIC AUTH FAILURE — ${detected.reason} ***`);
      console.error(`[Batch] *** All Anthropic calls will be skipped until process restart ***`);
      throw new AIProviderAuthError("anthropic", detected.reason);
    }
    // Spending-limit error — mark with TTL so circuit breaker can auto-recover
    if (detected.type === "hard") {
      const resetAt = parseResetTime(detected.until);
      markProviderLimited("anthropic", detected.until, resetAt);
      console.error(`[Batch] *** ANTHROPIC API LIMIT REACHED — access resumes ${detected.until} ***`);
      throw new AIProviderLimitError("anthropic", detected.until);
    }
    throw err;
  }
  console.log(`  [Batch] Created batch ${batch.id} (status: ${batch.processing_status})`);

  // Poll for completion with adaptive intervals (15s → 30s → 45s → 60s).
  // Most batches complete in 1-4 polls under normal load.
  // Under high API load (observed 2026-04-01), batches can take 10-16+ polls.
  // The ramping interval reduces API pressure during slow periods.
  const deadline = Date.now() + BATCH_TIMEOUT_MS;
  let status = batch.processing_status;
  let pollFailures = 0;
  let pollCount = 0;
  const MAX_POLL_FAILURES = 3;

  while (status !== "ended" && Date.now() < deadline) {
    await new Promise(r => setTimeout(r, adaptivePollInterval(pollCount)));
    pollCount++;
    try {
      const updated = await client.messages.batches.retrieve(batch.id);
      status = updated.processing_status;
      pollFailures = 0; // reset on success
      const counts = updated.request_counts;
      const elapsedSec = Math.round((Date.now() - batchStartMs) / 1000);
      console.log(
        `  [Batch] ${batch.id}: ${counts.succeeded} succeeded, ${counts.processing} processing, ${counts.errored} errored`,
      );
      // Warn when batch exceeds ~5 min (poll #10 at 15s×3 + 30s×7 = 255s).
      // This helps operators distinguish "slow API" from "stuck sim" in PM2 logs.
      // Observed on day 84-85: agent batches routinely hit 10-16 polls during
      // Anthropic API slowdowns, but always completed successfully.
      if (pollCount === 10) {
        console.warn(`  [Batch] ${batch.id}: slow batch — ${elapsedSec}s elapsed, ${counts.processing} still processing (Anthropic may be under load)`);
      }
    } catch (pollErr) {
      pollFailures++;
      console.warn(`  [Batch] Poll error for ${batch.id} (${pollFailures}/${MAX_POLL_FAILURES}):`, (pollErr as Error).message);
      if (pollFailures >= MAX_POLL_FAILURES) {
        throw new Error(`Batch ${batch.id} polling failed after ${MAX_POLL_FAILURES} consecutive errors: ${(pollErr as Error).message}`);
      }
      // Continue polling — transient network glitch
    }
  }

  if (status !== "ended") {
    throw new Error(`Batch ${batch.id} timed out after ${BATCH_TIMEOUT_MS / 1000}s`);
  }

  // Retrieve results
  const resultsStream = await client.messages.batches.results(batch.id);
  const results: BatchResult[] = [];
  const configMap = new Map(requests.map(r => [r.customId, resolveModel(r)]));
  const batchLatencyMs = Date.now() - batchStartMs;

  for await (const item of resultsStream) {
    const config = configMap.get(item.custom_id);
    const modelName = config?.model ?? "unknown";
    if (item.result.type === "succeeded") {
      const textBlocks = item.result.message.content
        .filter(b => b.type === "text")
        .map(b => b.text);
      const usage = item.result.message.usage;
      const inputTokens = usage?.input_tokens ?? 0;
      const outputTokens = usage?.output_tokens ?? 0;

      recordAICall({
        dayNumber: getTrackingDay(),
        task: item.custom_id,
        provider: "anthropic",
        model: modelName,
        inputTokens,
        outputTokens,
        costUsd: calculateCost(modelName, inputTokens, outputTokens, true),
        latencyMs: batchLatencyMs,
        batchId: batch.id,
        success: true,
      });

      results.push({
        customId: item.custom_id,
        text: textBlocks.join(""),
        model: modelName,
        provider: "anthropic",
        inputTokens,
        outputTokens,
        structuredOutput: structuredIds.has(item.custom_id),
      });
    } else {
      console.warn(`  [Batch] Request ${item.custom_id} failed: ${item.result.type}`);

      recordAICall({
        dayNumber: getTrackingDay(),
        task: item.custom_id,
        provider: "anthropic",
        model: modelName,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        latencyMs: batchLatencyMs,
        batchId: batch.id,
        success: false,
      });

      results.push({
        customId: item.custom_id,
        text: "",
        model: modelName,
        provider: "anthropic",
        inputTokens: 0,
        outputTokens: 0,
      });
    }
  }

  console.log(`  [Batch] Completed: ${results.length} results from batch ${batch.id}`);
  return results;
}

// ---------------------------------------------------------------------------
// xAI sequential (batch API via JSONL can be added later)
// ---------------------------------------------------------------------------

async function submitXaiBatch(requests: BatchRequest[]): Promise<BatchResult[]> {
  const results: BatchResult[] = [];

  for (const req of requests) {
    try {
      const { text, model, provider, inputTokens, outputTokens } = await callAI({
        system: req.system,
        prompt: req.prompt,
        maxTokens: req.maxTokens,
        partyId: req.partyId,
        roleKey: req.roleKey,
      });
      results.push({ customId: req.customId, text, model, provider, inputTokens, outputTokens });
    } catch (err) {
      console.warn(`  [Batch] xAI call failed for ${req.customId}: ${(err as Error).message}`);
      const config = resolveModel(req);
      results.push({ customId: req.customId, text: "", model: config.model, provider: config.provider, inputTokens: 0, outputTokens: 0 });
      if (err instanceof AIProviderLimitError) break;
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Multi-provider batch submission
// ---------------------------------------------------------------------------

/**
 * Submit a batch of AI requests, splitting by provider.
 *
 * - Anthropic requests go via the Message Batches API (50% discount).
 * - xAI requests use sequential calls (xAI JSONL batch can be added later).
 */
export async function submitBatch(requests: BatchRequest[]): Promise<BatchResult[]> {
  if (requests.length === 0) return [];

  // Split by provider
  const anthropicReqs: BatchRequest[] = [];
  const xaiReqs: BatchRequest[] = [];

  for (const req of requests) {
    const config = resolveModel(req);
    if (config.provider === "xai") {
      xaiReqs.push(req);
    } else {
      anthropicReqs.push(req);
    }
  }

  // Submit in parallel
  const [anthropicResults, xaiResults] = await Promise.all([
    anthropicReqs.length > 0
      ? submitAnthropicBatch(anthropicReqs)
      : Promise.resolve([] as BatchResult[]),
    xaiReqs.length > 0
      ? submitXaiBatch(xaiReqs)
      : Promise.resolve([] as BatchResult[]),
  ]);

  return [...anthropicResults, ...xaiResults];
}

// ---------------------------------------------------------------------------
// Utility: find a result by customId
// ---------------------------------------------------------------------------

export function findResult(results: BatchResult[], customId: string): BatchResult | undefined {
  return results.find(r => r.customId === customId);
}
