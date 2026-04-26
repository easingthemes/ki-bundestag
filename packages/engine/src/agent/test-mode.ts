/**
 * Test-mode model overrides — run full-term simulations against free/local LLMs.
 *
 * When `TEST_MODE` is set, every party + role resolves to the same
 * OpenAI-compatible test endpoint, and `submitBatch()` fans out via parallel
 * `callAI()` instead of the Anthropic Batches API. Quality is intentionally
 * low — the goal is unlimited zero-cost runs for end-to-end testing.
 *
 * Presets:
 *   TEST_MODE=ollama  → http://localhost:11434/v1, model gemma3:4b
 *   TEST_MODE=groq    → https://api.groq.com/openai/v1, model llama-3.3-70b-versatile
 *   TEST_MODE=custom  → must set TEST_BASE_URL + TEST_MODEL (+ TEST_API_KEY)
 *
 * Per-knob overrides (apply to any preset):
 *   TEST_MODEL, TEST_BASE_URL, TEST_API_KEY
 */

import type { ModelConfig } from "../config/index.js";

export interface TestModeConfig {
  /** Resolved model config used for every party + role. */
  model: ModelConfig;
  /** OpenAI-compatible base URL (must include /v1 if applicable). */
  baseURL: string;
  /** Bearer token. Optional for Ollama; required for Groq. */
  apiKey: string;
  /** Preset label, for logging. */
  preset: "ollama" | "groq" | "custom";
}

interface Preset {
  baseURL: string;
  model: string;
  apiKeyEnv?: string;
}

const PRESETS: Record<"ollama" | "groq", Preset> = {
  ollama: {
    baseURL: "http://localhost:11434/v1",
    model: "gemma3:4b",
  },
  groq: {
    baseURL: "https://api.groq.com/openai/v1",
    model: "llama-3.3-70b-versatile",
    apiKeyEnv: "GROQ_API_KEY",
  },
};

let _cached: TestModeConfig | null | undefined;

/**
 * Returns the active test-mode config, or `null` if `TEST_MODE` is unset.
 * Result is cached on first call.
 */
export function getTestMode(): TestModeConfig | null {
  if (_cached !== undefined) return _cached;

  const mode = process.env.TEST_MODE?.trim().toLowerCase();
  if (!mode) {
    _cached = null;
    return null;
  }

  let baseURL: string;
  let model: string;
  let apiKey = "";
  let preset: TestModeConfig["preset"];

  if (mode === "ollama" || mode === "groq") {
    const p = PRESETS[mode];
    baseURL = process.env.TEST_BASE_URL ?? p.baseURL;
    model = process.env.TEST_MODEL ?? p.model;
    apiKey = process.env.TEST_API_KEY ?? (p.apiKeyEnv ? process.env[p.apiKeyEnv] ?? "" : "");
    preset = mode;
  } else if (mode === "custom") {
    const customBase = process.env.TEST_BASE_URL;
    const customModel = process.env.TEST_MODEL;
    if (!customBase || !customModel) {
      throw new Error(
        "[test-mode] TEST_MODE=custom requires TEST_BASE_URL and TEST_MODEL to be set",
      );
    }
    baseURL = customBase;
    model = customModel;
    apiKey = process.env.TEST_API_KEY ?? "";
    preset = "custom";
  } else {
    throw new Error(
      `[test-mode] Unknown TEST_MODE='${mode}' — expected one of: ollama, groq, custom`,
    );
  }

  _cached = {
    model: { provider: "openai-compatible", model },
    baseURL,
    apiKey,
    preset,
  };
  return _cached;
}

/** Returns true when test mode is active. Equivalent to `!!getTestMode()`. */
export function isTestMode(): boolean {
  return getTestMode() !== null;
}

/** Reset cache — only used in tests. */
export function _resetTestModeCache(): void {
  _cached = undefined;
}
