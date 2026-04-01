# Cross-Cutting: Multi-Provider Architecture

This topic is relevant across exam domains — provider routing (Domain 1), error handling (Domain 5), and tool/model selection (Domain 2).

---

## The Problem

KI-Bundestag uses 6 AI party agents. Five parties use Claude Haiku, but AfD uses xAI's Grok. The system must route calls to the right provider, handle provider-specific features, and gracefully degrade when a provider is down.

---

## 1. Provider-Aware Model Routing

### `packages/engine/src/agent/model-config.ts`

```typescript
export type Provider = "anthropic" | "xai";

export interface ModelConfig {
  provider: Provider;
  model: string;
}

// Per-party model assignment
export const PARTY_MODELS: Record<string, ModelConfig> = {
  spd:    { provider: "anthropic", model: "claude-haiku-4-5-20251001" },
  cdu:    { provider: "anthropic", model: "claude-haiku-4-5-20251001" },
  gruene: { provider: "anthropic", model: "claude-haiku-4-5-20251001" },
  fdp:    { provider: "anthropic", model: "claude-haiku-4-5-20251001" },
  afd:    { provider: "xai",      model: "grok-3-mini" },
  linke:  { provider: "anthropic", model: "claude-haiku-4-5-20251001" },
};

// Per-role model assignment (system-wide calls)
export const ROLE_MODELS: Record<string, ModelConfig> = {
  daily:       { provider: "anthropic", model: "claude-haiku-4-5-20251001" },
  negotiation: { provider: "anthropic", model: "claude-haiku-4-5-20251001" },
  synthesis:   { provider: "anthropic", model: "claude-sonnet-4-5-20250929" },  // higher quality
};
```

### Environment Variable Overrides

Every model assignment can be overridden at runtime without code changes:

```typescript
// model-config.ts — env var overrides
export function getPartyModel(partyId: string): ModelConfig {
  const envKey = `MODEL_PARTY_${partyId.toUpperCase()}`;  // e.g., MODEL_PARTY_AFD
  const envOverride = process.env[envKey];

  if (envOverride) {
    const [provider, model] = envOverride.split(":");  // e.g., "xai:grok-4"
    if (provider && model && (provider === "anthropic" || provider === "xai")) {
      return { provider: provider as Provider, model };
    }
  }

  return PARTY_MODELS[partyId] ?? ROLE_MODELS.daily;  // fallback to daily role
}
```

**Usage:** `MODEL_PARTY_AFD=anthropic:claude-haiku-4-5-20251001` would switch AfD from Grok to Haiku.

---

## 2. Provider-Specific Feature Handling

Not all providers support the same features. Our code handles this explicitly:

### Structured Output (Anthropic only)

```typescript
// party-agent.ts — conditional structured output
export function buildPartyAgentRequests(contexts: AgentContext[]): BatchRequest[] {
  return contexts.map(ctx => {
    const config = getPartyModel(ctx.party.id);
    const isAnthropic = config.provider === "anthropic";
    return {
      customId: `agent-${ctx.party.id}-day${currentDay}`,
      system: buildSystemPrompt(ctx.party.id, ...),
      prompt: buildUserPrompt(ctx),
      maxTokens: 1024,
      partyId: ctx.party.id,
      // xAI/Grok doesn't support structured output
      outputSchema: isAnthropic ? AGENT_RESPONSE_SCHEMA : undefined,
    };
  });
}
```

### Batch API (Anthropic only, xAI falls back to sequential)

```typescript
// batch-client.ts — provider-split submission
export async function submitBatch(requests: BatchRequest[]): Promise<BatchResult[]> {
  const anthropicReqs = requests.filter(r => resolveModel(r).provider === "anthropic");
  const xaiReqs = requests.filter(r => resolveModel(r).provider === "xai");

  // Anthropic: true batch API
  const anthropicResults = await submitAnthropicBatch(anthropicReqs);

  // xAI: sequential callAI() fallback (no batch API available)
  const xaiResults = await submitXaiBatch(xaiReqs);

  return [...anthropicResults, ...xaiResults];
}

// xAI sequential fallback
async function submitXaiBatch(requests: BatchRequest[]): Promise<BatchResult[]> {
  const results: BatchResult[] = [];
  for (const req of requests) {
    try {
      const result = await callAI({
        system: req.system,
        prompt: req.prompt,
        maxTokens: req.maxTokens,
        partyId: req.partyId,
      });
      results.push({
        customId: req.customId,
        text: result.text,
        model: result.model,
        provider: result.provider,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      });
    } catch (err) {
      console.warn(`[Batch] xAI request ${req.customId} failed:`, err);
      // Continues to next request — partial success OK
    }
  }
  return results;
}
```

---

## 3. Provider-Level Circuit Breaker

Each provider has its own circuit breaker state. If Anthropic hits a spending limit, xAI calls still work (and vice versa).

```typescript
// client.ts — per-provider circuit breaker
const providerLimits = new Map<Provider, { until: string; resetAt: number }>();

// Check if ALL providers are down (simulation should pause)
export function allProvidersLimited(): boolean {
  if (providerLimits.size === 0) return false;
  const now = Date.now();
  const providers = new Set<Provider>(["anthropic"]);
  if (process.env.XAI_API_KEY) providers.add("xai");

  for (const p of providers) {
    const limit = providerLimits.get(p);
    if (!limit || now >= limit.resetAt) return false;  // at least one is available
  }
  return true;  // every configured provider is limited
}
```

**Behavior when one provider is down:**
- If Anthropic is limited: 5 parties (SPD, CDU, Grune, FDP, Linke) get abstain-all fallback. AfD (xAI) still works.
- If xAI is limited: AfD gets abstain-all. Other 5 parties work normally.
- If both are limited: `allProvidersLimited()` returns true, simulation loop pauses.

---

## 4. Unified SDK Layer (Vercel AI SDK)

The Vercel AI SDK provides a unified interface across providers:

```typescript
// client.ts — unified model instantiation
import { anthropic } from "@ai-sdk/anthropic";
import { xai } from "@ai-sdk/xai";

function getModel(provider: Provider, modelId: string) {
  if (provider === "xai") return xai(modelId);
  return anthropic(modelId);
}

// Same generateText() call regardless of provider
const result = await generateText({
  model: getModel(config.provider, config.model),  // could be either provider
  system: opts.system,
  prompt: opts.prompt,
  maxOutputTokens: opts.maxTokens,
});

// Unified response shape
return {
  text: result.text,
  model: config.model,
  provider: config.provider,
  inputTokens: result.usage?.inputTokens ?? 0,
  outputTokens: result.usage?.outputTokens ?? 0,
};
```

---

## 5. Provider Inference from Errors

When an error occurs, we need to know which provider it came from to set the right circuit breaker:

```typescript
// client.ts — infer provider from error URL
function inferProvider(err: Record<string, unknown>): Provider {
  const url = typeof err.url === "string" ? err.url : "";
  return url.includes("x.ai") || url.includes("xai") ? "xai" : "anthropic";
}
```

---

## Key Exam Takeaways

1. **Abstract provider differences behind a unified interface** — callers shouldn't know which provider they're using
2. **Handle feature gaps explicitly** — not all providers support batch API or structured output
3. **Per-provider circuit breakers** — one provider failing shouldn't take down the whole system
4. **Environment variable overrides** — make provider/model swaps possible without code changes
5. **Partial success is OK** — if one provider's request fails in a batch, process the others
6. **Use Vercel AI SDK** (or similar) to normalize the interface across providers
