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

  const model = getModel(config.provider, config.model);

  const result = await generateText({
    model,
    system: opts.system,
    prompt: opts.prompt,
    maxOutputTokens: opts.maxTokens,
  });

  return result.text;
}
