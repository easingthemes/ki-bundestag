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

/** Reset limit state (e.g. on new process start or manual clear). */
export function clearProviderLimits(): void {
  providerLimits.clear();
}

type LimitResult =
  | { type: "hard"; provider: Provider; until: string }
  | { type: "transient"; provider: Provider }
  | { type: "none" };

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

function detectLimitError(err: unknown): LimitResult {
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

  // Transient 429 rate-limit
  const status = typeof e.statusCode === "number" ? e.statusCode : 0;
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
function parseResetTime(until: string): number {
  const parsed = Date.parse(until);
  if (!isNaN(parsed) && parsed > Date.now()) return parsed;
  // Default: 10 minutes from now
  return Date.now() + 10 * 60_000;
}

export interface AICallResult {
  text: string;
  model: string;
  provider: Provider;
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

  const model = getModel(config.provider, config.model);

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await generateText({
        model,
        system: opts.system,
        prompt: opts.prompt,
        maxOutputTokens: opts.maxTokens,
      });

      return { text: result.text, model: config.model, provider: config.provider };
    } catch (err) {
      const detected = detectLimitError(err);

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
