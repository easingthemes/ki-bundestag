/**
 * Per-party and per-role AI model configuration.
 * 
 * PARTY_MODELS: Maps party IDs to their configured AI provider and model.
 * ROLE_MODELS: Maps system roles (daily, negotiation, synthesis) to models.
 * 
 * Environment variable overrides:
 * - MODEL_PARTY_<ID>: Override per-party model (e.g., MODEL_PARTY_AFD=xai:grok-3-mini)
 * - MODEL_DAILY, MODEL_NEGOTIATION, MODEL_SYNTHESIS: Override role models
 */

export type Provider = "anthropic" | "xai";

export interface ModelConfig {
  provider: Provider;
  model: string;
}

/**
 * Per-party model configuration.
 * Used for daily party agent calls, party-specific negotiations, interpellations, internal proposals, and questions.
 */
export const PARTY_MODELS: Record<string, ModelConfig> = {
  spd: { provider: "anthropic", model: "claude-haiku-4-5-20251001" },
  cdu: { provider: "anthropic", model: "claude-haiku-4-5-20251001" },
  gruene: { provider: "anthropic", model: "claude-haiku-4-5-20251001" },
  fdp: { provider: "anthropic", model: "claude-haiku-4-5-20251001" },
  afd: { provider: "xai", model: "grok-3-mini" },
  linke: { provider: "anthropic", model: "claude-haiku-4-5-20251001" },
};

/**
 * Per-role model configuration.
 * Used for system-wide calls: media, polls, referendums, summary, and synthesis.
 */
export const ROLE_MODELS: Record<string, ModelConfig> = {
  daily: { provider: "anthropic", model: "claude-haiku-4-5-20251001" },
  negotiation: { provider: "anthropic", model: "claude-haiku-4-5-20251001" },
  synthesis: { provider: "anthropic", model: "claude-sonnet-4-5-20250929" },
};

export type RoleKey = keyof typeof ROLE_MODELS;

/**
 * Get model config for a specific party, with env var override support.
 * Env override format: MODEL_PARTY_<ID>=<provider>:<model>
 * Example: MODEL_PARTY_AFD=xai:grok-4
 */
export function getPartyModel(partyId: string): ModelConfig {
  const envKey = `MODEL_PARTY_${partyId.toUpperCase()}`;
  const envOverride = process.env[envKey];

  if (envOverride) {
    const [provider, model] = envOverride.split(":");
    if (provider && model && (provider === "anthropic" || provider === "xai")) {
      return { provider: provider as Provider, model };
    }
  }

  return PARTY_MODELS[partyId] ?? ROLE_MODELS.daily;
}

/**
 * Get model config for a system role, with env var override support.
 * Env override: MODEL_DAILY, MODEL_NEGOTIATION, MODEL_SYNTHESIS
 * Override format: <provider>:<model> or just <model> (assumes anthropic)
 */
export function getRoleModel(roleKey: RoleKey): ModelConfig {
  const base = ROLE_MODELS[roleKey];
  
  // Legacy env var support (backward compat)
  const envMap: Record<RoleKey, string> = {
    daily: "MODEL_DAILY",
    negotiation: "MODEL_NEGOTIATION",
    synthesis: "MODEL_SYNTHESIS",
  };
  
  const envValue = process.env[envMap[roleKey]];
  if (envValue) {
    // If format is "provider:model", split it
    if (envValue.includes(":")) {
      const [provider, model] = envValue.split(":");
      if (provider && model && (provider === "anthropic" || provider === "xai")) {
        return { provider: provider as Provider, model };
      }
    }
    // Otherwise assume it's just a model name with anthropic provider (backward compat)
    return { provider: "anthropic", model: envValue };
  }

  return base;
}
