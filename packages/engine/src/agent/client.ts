import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { xai } from "@ai-sdk/xai";
import {
  getPartyModel,
  getRoleModel,
  type RoleKey,
  type Provider,
  type ModelConfig,
} from "./model-config.js";
import { recordAICall, calculateCost, getTrackingDay } from "./cost-tracker.js";
import { getTestMode } from "./test-mode.js";
import { callOpenAICompatible } from "./openai-compatible-client.js";

// ---------------------------------------------------------------------------
// Provider circuit breaker — skip API calls when a provider is known-limited
// ---------------------------------------------------------------------------

/** Tracks providers that have hit usage limits. */
const providerLimits = new Map<Provider, { until: string; resetAt: number }>();

const MAX_RETRIES = 2;
const RETRY_DELAYS = [2_000, 5_000]; // ms

export class AIProviderLimitError extends Error {
  provider: Provider;
  until: string;
  constructor(provider: Provider, until: string) {
    super(`[AI] ${provider} usage limit reached — access resumes ${until}`);
    this.name = "AIProviderLimitError";
    this.provider = provider;
    this.until = until;
  }
}

export class AIProviderAuthError extends Error {
  provider: Provider;
  constructor(provider: Provider, reason: string) {
    super(`[AI] ${provider} authentication failed — ${reason}`);
    this.name = "AIProviderAuthError";
    this.provider = provider;
  }
}

/** Tracks providers with non-recoverable auth/billing failures. */
const providerAuthFailures = new Set<Provider>();

/** Mark a provider as having a non-recoverable auth failure. */
export function markProviderAuthFailed(provider: Provider): void {
  providerAuthFailures.add(provider);
}

/** Check if a specific provider has an auth failure. */
export function isProviderAuthFailed(provider: Provider): boolean {
  return providerAuthFailures.has(provider);
}

/** Returns true when every configured provider is unavailable (limited OR auth-failed). */
export function allProvidersUnavailable(): boolean {
  const providers = new Set<Provider>();
  providers.add("anthropic");
  if (process.env.XAI_API_KEY) providers.add("xai");
  const now = Date.now();
  for (const p of providers) {
    if (providerAuthFailures.has(p)) continue;
    const limit = providerLimits.get(p);
    if (!limit || now >= limit.resetAt) return false; // this provider is available
  }
  return true;
}

/** Returns true when every configured provider is currently limited. */
export function allProvidersLimited(): boolean {
  if (providerLimits.size === 0) return false;
  const now = Date.now();
  const providers = new Set<Provider>();
  providers.add("anthropic");
  if (process.env.XAI_API_KEY) providers.add("xai");
  for (const p of providers) {
    const limit = providerLimits.get(p);
    if (!limit || now >= limit.resetAt) return false;
  }
  return true;
}

/** Reset all provider state (limits + auth failures). Used on process start or in tests. */
export function clearProviderLimits(): void {
  providerLimits.clear();
  providerAuthFailures.clear();
}

/** Mark a provider as limited (used by batch-client when raw SDK calls hit limits). */
export function markProviderLimited(provider: Provider, until: string, resetAt: number): void {
  providerLimits.set(provider, { until, resetAt });
}

type APIErrorResult =
  | { type: "hard"; provider: Provider; until: string }
  | { type: "auth"; provider: Provider; reason: string }
  | { type: "transient"; provider: Provider }
  | { type: "none" };

/** @deprecated Use APIErrorResult — kept for backward compat */
type LimitResult = APIErrorResult;

function inferProvider(err: Record<string, unknown>): Provider {
  const url = typeof err.url === "string" ? err.url : "";
  return url.includes("x.ai") || url.includes("xai") ? "xai" : "anthropic";
}

function isNetworkError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as Record<string, unknown>).code;
  if (typeof code === "string" && /^(ECONNRESET|ETIMEDOUT|ENOTFOUND|EPIPE|UND_ERR_CONNECT_TIMEOUT)$/.test(code)) return true;
  const msg = (err as Record<string, unknown>).message;
  return typeof msg === "string" && /fetch failed|network|socket hang up/i.test(msg);
}

export function detectLimitError(err: unknown): APIErrorResult {
  if (!err || typeof err !== "object") return { type: "none" };
  const e = err as Record<string, unknown>;

  // Vercel AI SDK wraps API errors with responseBody / data
  const body =
    typeof e.responseBody === "string"
      ? e.responseBody
      : typeof e.data === "object" && e.data
        ? JSON.stringify(e.data)
        : typeof e.message === "string"
          ? e.message
          : "";

  // Hard limit: "You have reached your specified API usage limits. You will regain access on <date>"
  const limitMatch = body.match(
    /usage limits?.*?regain access on ([0-9T :ZZ\-]+)/i
  );
  if (limitMatch) {
    return { type: "hard", provider: inferProvider(e), until: limitMatch[1].trim() };
  }

  // Extract HTTP status from various error shapes:
  // - Anthropic SDK: err.status (AuthenticationError, PermissionDeniedError)
  // - Vercel AI SDK: err.statusCode
  const status =
    (typeof e.status === "number" ? e.status : 0) ||
    (typeof e.statusCode === "number" ? e.statusCode : 0);

  // Non-recoverable auth/billing errors — API key is dead, no point retrying
  // 401 = Unauthorized (invalid/expired key), 403 = Forbidden (revoked), 402 = Payment Required
  if (status === 401 || status === 403 || status === 402) {
    const reason =
      status === 401 ? "invalid or expired API key"
        : status === 403 ? "access denied or key revoked"
          : "billing issue or payment required";
    return { type: "auth", provider: inferProvider(e), reason };
  }

  // Also detect auth errors by error class name (Anthropic SDK throws typed errors)
  const errName = typeof e.name === "string" ? e.name : "";
  if (/AuthenticationError|PermissionDeniedError/i.test(errName)) {
    return { type: "auth", provider: inferProvider(e), reason: `${errName}: ${body.slice(0, 200)}` };
  }

  // Transient 429 rate-limit
  if (status === 429) {
    return { type: "transient", provider: inferProvider(e) };
  }

  // Transient network errors
  if (isNetworkError(err)) {
    return { type: "transient", provider: inferProvider(e) };
  }

  return { type: "none" };
}

// ---------------------------------------------------------------------------

/**
 * Get AI SDK model instance for the specified provider and model.
 */
function getModel(provider: Provider, modelId: string) {
  if (provider === "xai") {
    if (!process.env.XAI_API_KEY) {
      throw new Error(
        "XAI_API_KEY is not set. Add it to .env to use xAI models."
      );
    }
    return xai(modelId);
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Copy .env.example to .env and add your key."
    );
  }
  return anthropic(modelId);
}

/**
 * Unified AI call function using Vercel AI SDK.
 * Supports both per-party and per-role model selection.
 *
 * @param opts.system - System prompt
 * @param opts.prompt - User prompt
 * @param opts.maxTokens - Maximum tokens to generate
 * @param opts.partyId - Optional party ID for per-party model selection
 * @param opts.roleKey - Optional role key for system role model selection
 * @returns Generated text response
 */
/** Parse a date string into a ms timestamp, or return a default TTL offset. */
export function parseResetTime(until: string): number {
  const parsed = Date.parse(until);
  if (!isNaN(parsed) && parsed > Date.now()) return parsed;
  // Default: 10 minutes from now
  return Date.now() + 10 * 60_000;
}

export interface AICallResult {
  text: string;
  model: string;
  provider: Provider;
  inputTokens: number;
  outputTokens: number;
}

export async function callAI(opts: {
  system: string;
  prompt: string;
  maxTokens: number;
  partyId?: string;
  roleKey?: RoleKey;
}): Promise<AICallResult> {
  let config: ModelConfig;

  // Determine which model to use
  if (opts.partyId) {
    config = getPartyModel(opts.partyId);
  } else if (opts.roleKey) {
    config = getRoleModel(opts.roleKey);
  } else {
    config = getRoleModel("daily");
  }

  // Circuit breaker: skip call if provider has auth failure (permanent)
  if (providerAuthFailures.has(config.provider)) {
    throw new AIProviderAuthError(config.provider, "provider marked as auth-failed");
  }

  // Circuit breaker: skip call if provider is known-limited (with TTL check)
  const limit = providerLimits.get(config.provider);
  if (limit) {
    if (Date.now() >= limit.resetAt) {
      providerLimits.delete(config.provider);
      console.log(`  [AI] ${config.provider} limit expired, retrying`);
    } else {
      throw new AIProviderLimitError(config.provider, limit.until);
    }
  }

  // Test mode: route through the OpenAI-compatible client (Ollama/Groq/custom).
  // Skips Vercel AI SDK entirely — keeps the test path zero-dep.
  if (config.provider === "openai-compatible") {
    const testCfg = getTestMode();
    if (!testCfg) {
      throw new Error("[AI] openai-compatible provider requested but TEST_MODE is not set");
    }
    return callOpenAICompatibleWithRetry({
      ...opts,
      config,
      testCfg,
    });
  }

  const model = getModel(config.provider, config.model);

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const startMs = Date.now();
      const result = await generateText({
        model,
        system: opts.system,
        prompt: opts.prompt,
        maxOutputTokens: opts.maxTokens,
        // grok models have built-in reasoning; cap effort so reasoning tokens
        // don't consume the whole (small) completion budget and starve the answer.
        ...(config.provider === "xai"
          ? { providerOptions: { xai: { reasoningEffort: "low" } } }
          : {}),
      });
      const latencyMs = Date.now() - startMs;

      const inputTokens = result.usage?.inputTokens ?? 0;
      const outputTokens = result.usage?.outputTokens ?? 0;

      recordAICall({
        dayNumber: getTrackingDay(),
        task: opts.partyId ? `call:${opts.partyId}` : `call:${opts.roleKey ?? "daily"}`,
        provider: config.provider,
        model: config.model,
        inputTokens,
        outputTokens,
        costUsd: calculateCost(config.model, inputTokens, outputTokens, false),
        latencyMs,
        success: true,
      });

      return { text: result.text, model: config.model, provider: config.provider, inputTokens, outputTokens };
    } catch (err) {
      const detected = detectLimitError(err);

      if (detected.type === "auth") {
        markProviderAuthFailed(detected.provider);
        console.error(
          `[AI] *** ${detected.provider.toUpperCase()} AUTH FAILURE — ${detected.reason} ***\n` +
          `[AI] *** All ${detected.provider} calls will be skipped until process restart ***`
        );
        throw new AIProviderAuthError(detected.provider, detected.reason);
      }

      if (detected.type === "hard") {
        const resetAt = parseResetTime(detected.until);
        providerLimits.set(detected.provider, { until: detected.until, resetAt });
        console.error(
          `[AI] *** ${detected.provider.toUpperCase()} API LIMIT REACHED — access resumes ${detected.until} ***` +
          `\n[AI] *** ${detected.provider} calls skipped until limit resets ***`
        );
        throw new AIProviderLimitError(detected.provider, detected.until);
      }

      if (detected.type === "transient" && attempt < MAX_RETRIES) {
        const delay = RETRY_DELAYS[attempt];
        console.warn(`  [AI] Transient error (attempt ${attempt + 1}/${MAX_RETRIES + 1}), retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      // Not retryable or retries exhausted
      throw err;
    }
  }

  // Unreachable, but satisfies TypeScript
  throw new Error("[AI] Unexpected: retry loop exited without return or throw") as never;
}

async function callOpenAICompatibleWithRetry(opts: {
  system: string;
  prompt: string;
  maxTokens: number;
  partyId?: string;
  roleKey?: RoleKey;
  config: ModelConfig;
  testCfg: NonNullable<ReturnType<typeof getTestMode>>;
}): Promise<AICallResult> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const startMs = Date.now();
      const { text, inputTokens, outputTokens } = await callOpenAICompatible({
        config: opts.testCfg,
        system: opts.system,
        prompt: opts.prompt,
        maxTokens: opts.maxTokens,
      });
      const latencyMs = Date.now() - startMs;

      recordAICall({
        dayNumber: getTrackingDay(),
        task: opts.partyId ? `call:${opts.partyId}` : `call:${opts.roleKey ?? "daily"}`,
        provider: opts.config.provider,
        model: opts.config.model,
        inputTokens,
        outputTokens,
        costUsd: calculateCost(opts.config.model, inputTokens, outputTokens, false),
        latencyMs,
        success: true,
      });

      return { text, model: opts.config.model, provider: opts.config.provider, inputTokens, outputTokens };
    } catch (err) {
      const status = (err as { status?: number }).status ?? 0;
      const transient = status === 429 || status >= 500 || isNetworkError(err);
      if (transient && attempt < MAX_RETRIES) {
        const delay = RETRY_DELAYS[attempt];
        console.warn(`  [AI] Transient ${opts.testCfg.preset} error (attempt ${attempt + 1}/${MAX_RETRIES + 1}), retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw new Error("[AI] Unexpected: retry loop exited without return or throw") as never;
}
