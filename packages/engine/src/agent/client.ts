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
const providerLimits = new Map<Provider, { until: string; logged: boolean }>();

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
  // Check if the providers we actually use are all limited
  const providers = new Set<Provider>();
  // We always need at least anthropic (daily role default)
  providers.add("anthropic");
  if (process.env.XAI_API_KEY) providers.add("xai");
  for (const p of providers) {
    if (!providerLimits.has(p)) return false;
  }
  return true;
}

/** Reset limit state (e.g. on new process start or manual clear). */
export function clearProviderLimits(): void {
  providerLimits.clear();
}

function detectLimitError(err: unknown): { provider?: Provider; until?: string } {
  if (!err || typeof err !== "object") return {};
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

  // Match "You have reached your specified API usage limits. You will regain access on <date>"
  const limitMatch = body.match(
    /usage limits?.*?regain access on ([0-9T :ZZ\-]+)/i
  );
  if (limitMatch) {
    const until = limitMatch[1].trim();
    // Infer provider from URL or model
    const url = typeof e.url === "string" ? e.url : "";
    const provider: Provider = url.includes("x.ai") || url.includes("xai")
      ? "xai"
      : "anthropic";
    return { provider, until };
  }

  // Match generic rate-limit (429) — short 60s backoff
  const status = typeof e.statusCode === "number" ? e.statusCode : 0;
  if (status === 429) {
    const url = typeof e.url === "string" ? e.url : "";
    const provider: Provider = url.includes("x.ai") || url.includes("xai")
      ? "xai"
      : "anthropic";
    return { provider, until: "rate-limited (retry soon)" };
  }

  return {};
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
export async function callAI(opts: {
  system: string;
  prompt: string;
  maxTokens: number;
  partyId?: string;
  roleKey?: RoleKey;
}): Promise<string> {
  let config: ModelConfig;

  // Determine which model to use
  if (opts.partyId) {
    config = getPartyModel(opts.partyId);
  } else if (opts.roleKey) {
    config = getRoleModel(opts.roleKey);
  } else {
    // Fallback to daily role model
    config = getRoleModel("daily");
  }

  // Circuit breaker: skip call if provider is known-limited
  const limit = providerLimits.get(config.provider);
  if (limit) {
    throw new AIProviderLimitError(config.provider, limit.until);
  }

  const model = getModel(config.provider, config.model);

  try {
    const result = await generateText({
      model,
      system: opts.system,
      prompt: opts.prompt,
      maxOutputTokens: opts.maxTokens,
    });

    return result.text;
  } catch (err) {
    const detected = detectLimitError(err);
    if (detected.provider && detected.until) {
      providerLimits.set(detected.provider, { until: detected.until, logged: false });
      // Log once, clearly
      console.error(
        `\n  *** ${detected.provider.toUpperCase()} API LIMIT REACHED — access resumes ${detected.until} ***` +
        `\n  *** All further ${detected.provider} calls will be skipped this session ***\n`
      );
      throw new AIProviderLimitError(detected.provider, detected.until);
    }
    throw err;
  }
}
