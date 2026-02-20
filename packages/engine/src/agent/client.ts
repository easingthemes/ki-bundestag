import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | null = null;

export function getClient(): Anthropic {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error(
        "ANTHROPIC_API_KEY is not set. Copy .env.example to .env and add your key."
      );
    }
    _client = new Anthropic();
  }
  return _client;
}

export const MODELS = {
  daily: process.env.MODEL_DAILY || "claude-haiku-4-5-20251001",
  negotiation: process.env.MODEL_NEGOTIATION || "claude-haiku-4-5-20251001",
  synthesis: process.env.MODEL_SYNTHESIS || "claude-sonnet-4-5-20250929",
} as const;

export type ModelKey = keyof typeof MODELS;

// Backward compat
export const MODEL = MODELS.daily;

export const MAX_TOKENS: Record<ModelKey, number> = {
  daily: 2048,
  negotiation: 1024,
  synthesis: 4096,
};
