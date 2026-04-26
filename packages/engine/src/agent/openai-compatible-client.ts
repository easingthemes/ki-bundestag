/**
 * Minimal OpenAI-compatible chat completions client used by test mode
 * (Ollama, Groq, or any other provider exposing `/v1/chat/completions`).
 *
 * We intentionally don't use the Vercel AI SDK here — keeps the test path
 * dependency-free and isolated from the production Anthropic/xAI flow.
 */

import type { TestModeConfig } from "./test-mode.js";

interface ChatCompletionResponse {
  choices?: Array<{
    message?: { content?: string | null };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
}

export interface OpenAICompatibleResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

export async function callOpenAICompatible(opts: {
  config: TestModeConfig;
  system: string;
  prompt: string;
  maxTokens: number;
}): Promise<OpenAICompatibleResult> {
  const { config, system, prompt, maxTokens } = opts;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (config.apiKey) {
    headers["Authorization"] = `Bearer ${config.apiKey}`;
  }

  const body = {
    model: config.model.model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: prompt },
    ],
    max_tokens: maxTokens,
  };

  const url = `${config.baseURL.replace(/\/$/, "")}/chat/completions`;
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    const err = new Error(
      `[test-mode] ${config.preset} ${res.status} ${res.statusText}: ${errBody.slice(0, 500)}`,
    );
    (err as Error & { status: number }).status = res.status;
    throw err;
  }

  const data = (await res.json()) as ChatCompletionResponse;
  const text = data.choices?.[0]?.message?.content ?? "";
  return {
    text,
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
  };
}
