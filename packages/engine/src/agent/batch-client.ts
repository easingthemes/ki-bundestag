/**
 * Batch API client for Anthropic and xAI.
 *
 * Submits multiple AI prompts as a single batch, polls for completion,
 * and returns all results. Saves 50% on token costs vs synchronous calls.
 */

import Anthropic from "@anthropic-ai/sdk";
import { callAI, AIProviderLimitError, detectLimitError, parseResetTime, markProviderLimited } from "./client.js";
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
}

export interface BatchResult {
  customId: string;
  text: string;
  model: string;
  provider: Provider;
  inputTokens: number;
  outputTokens: number;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BATCH_POLL_INTERVAL_MS = Number(process.env.BATCH_POLL_INTERVAL ?? 30) * 1000;
const BATCH_TIMEOUT_MS = Number(process.env.BATCH_TIMEOUT ?? 3600) * 1000;

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

  const batchRequests = requests.map(req => {
    const config = resolveModel(req);
    return {
      custom_id: req.customId,
      params: {
        model: config.model,
        max_tokens: req.maxTokens,
        system: req.system,
        messages: [{ role: "user" as const, content: req.prompt }],
      },
    };
  });

  console.log(`  [Batch] Submitting ${batchRequests.length} Anthropic requests...`);
  const batchStartMs = Date.now();
  let batch;
  try {
    batch = await client.messages.batches.create({ requests: batchRequests });
  } catch (err) {
    // Detect spending-limit errors and mark the provider so the circuit breaker kicks in
    const detected = detectLimitError(err);
    if (detected.type === "hard") {
      const resetAt = parseResetTime(detected.until);
      markProviderLimited("anthropic", detected.until, resetAt);
      console.error(`[Batch] *** ANTHROPIC API LIMIT REACHED — access resumes ${detected.until} ***`);
      throw new AIProviderLimitError("anthropic", detected.until);
    }
    throw err;
  }
  console.log(`  [Batch] Created batch ${batch.id} (status: ${batch.processing_status})`);

  // Poll for completion
  const deadline = Date.now() + BATCH_TIMEOUT_MS;
  let status = batch.processing_status;

  while (status !== "ended" && Date.now() < deadline) {
    await new Promise(r => setTimeout(r, BATCH_POLL_INTERVAL_MS));
    const updated = await client.messages.batches.retrieve(batch.id);
    status = updated.processing_status;
    const counts = updated.request_counts;
    console.log(
      `  [Batch] ${batch.id}: ${counts.succeeded} succeeded, ${counts.processing} processing, ${counts.errored} errored`,
    );
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
