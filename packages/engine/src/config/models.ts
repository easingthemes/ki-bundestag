/**
 * AI model configuration.
 *
 * Per-party and per-role model mappings, plus pricing tiers.
 */

export type Provider = "anthropic" | "xai";

export interface ModelConfig {
  provider: Provider;
  model: string;
}

// ── Per-party model defaults ────────────────────────────────────────
export const PARTY_MODELS: Record<string, ModelConfig> = {
  spd: { provider: "anthropic", model: "claude-haiku-4-5-20251001" },
  cdu: { provider: "anthropic", model: "claude-haiku-4-5-20251001" },
  gruene: { provider: "anthropic", model: "claude-haiku-4-5-20251001" },
  fdp: { provider: "anthropic", model: "claude-haiku-4-5-20251001" },
  afd: { provider: "xai", model: "grok-3-mini" },
  linke: { provider: "anthropic", model: "claude-haiku-4-5-20251001" },
};

// ── Per-role model defaults ─────────────────────────────────────────
export const ROLE_MODELS: Record<string, ModelConfig> = {
  daily: { provider: "anthropic", model: "claude-haiku-4-5-20251001" },
  negotiation: { provider: "anthropic", model: "claude-haiku-4-5-20251001" },
  synthesis: { provider: "anthropic", model: "claude-sonnet-4-5-20250929" },
};

// ── Pricing (per token, not per million) ────────────────────────────

interface PricingTier {
  input: number;
  output: number;
}

/** Batch pricing for Anthropic models (50% of standard). */
export const BATCH_PRICING: Record<string, PricingTier> = {
  "claude-haiku-4-5-20251001": { input: 0.40e-6, output: 1.00e-6 },
  "claude-sonnet-4-5-20250929": { input: 1.50e-6, output: 5.00e-6 },
};

/** Standard (non-batch) pricing. */
export const STANDARD_PRICING: Record<string, PricingTier> = {
  "claude-haiku-4-5-20251001": { input: 0.80e-6, output: 4.00e-6 },
  "claude-sonnet-4-5-20250929": { input: 3.00e-6, output: 15.00e-6 },
  "grok-3-mini": { input: 0.30e-6, output: 0.50e-6 },
};

/** Conservative default pricing when model is unknown */
export const DEFAULT_PRICING: PricingTier = { input: 1.00e-6, output: 4.00e-6 };

// ── Runner automation thresholds ────────────────────────────────────
/** Pause after this many consecutive days with total AI failure */
export const AI_FAIL_PAUSE_THRESHOLD = 2;
/** Pause after this many consecutive days with partial AI failures */
export const PARTIAL_FAIL_PAUSE_THRESHOLD = 2;
