/**
 * Per-party and per-role AI model configuration.
 *
 * Model defaults are defined in config/models.ts.
 * This module provides runtime resolution with env var overrides.
 */

import {
  PARTY_MODELS,
  ROLE_MODELS,
  type Provider,
  type ModelConfig,
} from "../config/index.js";

// Re-export for external consumers
export { PARTY_MODELS, ROLE_MODELS } from "../config/index.js";
export type { Provider, ModelConfig } from "../config/index.js";

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
