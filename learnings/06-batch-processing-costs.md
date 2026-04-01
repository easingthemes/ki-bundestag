# Cross-Cutting: Batch Processing & Cost Optimization

This topic spans multiple exam domains. Understanding batch vs synchronous tradeoffs is tested in Domain 4 (Prompt Engineering), while cost management connects to Domain 5 (Reliability).

---

## The KI-Bundestag Batch Architecture

Every AI call in the simulation goes through the Anthropic Message Batches API for a **50% cost reduction**. This is the single biggest cost optimization in the project.

### How It Works

The batch API accepts multiple prompts as a single request, processes them server-side, and returns all results. Pricing is halved compared to synchronous calls.

```
Synchronous:  6 party calls × $0.003 each = $0.018/day
Batch:        6 party calls × $0.0015 each = $0.009/day  (50% savings)
```

### Implementation in `packages/engine/src/agent/batch-client.ts`

```typescript
// batch-client.ts — submit to Anthropic Batch API
async function submitAnthropicBatch(requests: BatchRequest[]): Promise<BatchResult[]> {
  const client = getAnthropicClient();

  // Transform our BatchRequest[] into Anthropic's format
  const batchRequests = requests.map(req => {
    const config = resolveModel(req);
    const baseParams = {
      model: config.model,
      max_tokens: req.maxTokens,
      system: req.system,
      messages: [{ role: "user" as const, content: req.prompt }],
    };

    // Structured output only for Anthropic (xAI doesn't support it)
    if (req.outputSchema) {
      return {
        custom_id: req.customId,
        params: {
          ...baseParams,
          output_config: {
            format: { type: "json_schema", schema: req.outputSchema },
          },
        },
      };
    }
    return { custom_id: req.customId, params: baseParams };
  });

  // Submit batch
  const batch = await client.messages.batches.create({ requests: batchRequests });
  console.log(`[Batch] Created batch ${batch.id}`);

  // Poll for completion with adaptive intervals
  while (status !== "ended" && Date.now() < deadline) {
    await new Promise(r => setTimeout(r, adaptivePollInterval(pollCount)));
    const updated = await client.messages.batches.retrieve(batch.id);
    status = updated.processing_status;
  }

  // Stream results
  const resultsStream = await client.messages.batches.results(batch.id);
  for await (const item of resultsStream) {
    // Parse each result...
  }
}
```

---

## Batch Grouping Strategy

Not all AI calls can be batched together — some depend on earlier results. The simulation groups calls by dependency:

```typescript
// loop.ts — batch groups in runDay()

// GROUP A: Party agents + internal proposals (independent, run first)
const groupARequests: BatchRequest[] = [
  ...buildPartyAgentRequests(contexts, currentDay, depthConfig),    // 6 requests
  ...buildProposalReviewRequests(pendingProposals),                  // 0-12 requests
];
const groupAResults = await submitBatch(groupARequests);
// Process party actions, apply votes, update bills...

// GROUP B: Interpellations + discipline (depends on Group A outcomes)
const groupBRequests: BatchRequest[] = [
  ...buildInterpellationAnswerRequests(pendingInterpellations),     // 0-2 requests
  ...buildDisciplineReviewRequests(bills, parties),                  // 0-6 requests
];
const groupBResults = await submitBatch(groupBRequests);

// GROUP C: Media + summary (depends on everything that happened today)
const groupCRequests: BatchRequest[] = [
  ...buildMediaBatchRequest(dayEvents, allParties),                  // 1 request
  ...buildSummaryBatchRequest(dayEvents, nationalState),             // 1 request
];
const groupCResults = await submitBatch(groupCRequests);

// PERIODIC: Polls + referendums (weekly/monthly cycles)
if (isPollDay(currentDay)) {
  const pollRequests = buildContextPollBatchRequest(...);
  await submitBatch(pollRequests);
}
```

**Key insight for the exam:** Batch groups are defined by **data dependencies**, not arbitrary boundaries. Group C (media) needs to know what happened in the day — so it must wait for Groups A and B.

---

## Adaptive Polling

The batch API doesn't stream — you poll for status. Polling too fast wastes resources; too slow adds latency.

```typescript
// batch-client.ts — adaptive poll intervals
function adaptivePollInterval(pollCount: number): number {
  if (BATCH_POLL_INTERVAL_BASE_MS < 30_000) return BATCH_POLL_INTERVAL_BASE_MS;
  if (pollCount < 3) return 15_000;   // First 3 polls: 15 seconds
  if (pollCount < 10) return 30_000;  // Polls 4-10: 30 seconds
  return BATCH_POLL_INTERVAL_BASE_MS; // After that: 60 seconds (default)
}
```

**Why adaptive:** Small batches (2-3 requests) complete in under a minute. Large batches (20+ requests) can take several minutes. Start fast, slow down over time.

---

## Cost Tracking

Every AI call — batch or synchronous — is recorded with full cost accounting.

### Pricing Tables in `packages/engine/src/agent/cost-tracker.ts`

```typescript
// Batch pricing (50% of standard)
const BATCH_PRICING: Record<string, PricingTier> = {
  "claude-haiku-4-5-20251001": { input: 0.40e-6, output: 1.00e-6 },   // per token
  "claude-sonnet-4-5-20250929": { input: 1.50e-6, output: 5.00e-6 },
};

// Standard pricing (synchronous)
const STANDARD_PRICING: Record<string, PricingTier> = {
  "claude-haiku-4-5-20251001": { input: 0.80e-6, output: 4.00e-6 },
  "claude-sonnet-4-5-20250929": { input: 3.00e-6, output: 15.00e-6 },
  "grok-3-mini": { input: 0.30e-6, output: 0.50e-6 },
};

export function calculateCost(model, inputTokens, outputTokens, isBatch): number {
  const pricing = getPricing(model, isBatch);
  return inputTokens * pricing.input + outputTokens * pricing.output;
}
```

### Per-Call Recording

```typescript
// Every AI call writes to the ai_calls table
recordAICall({
  dayNumber: 42,
  task: "call:spd",           // which agent/module
  provider: "anthropic",
  model: "claude-haiku-4-5-20251001",
  inputTokens: 2847,
  outputTokens: 312,
  costUsd: 0.00145,
  latencyMs: 847,
  batchId: "batch_abc123",    // links to batch
  success: true,
});
```

### Admin Cost Endpoints

```
GET /api/admin/costs          → total cost, by-task breakdown, by-model breakdown
GET /api/admin/costs/daily    → per-day cost history
```

This gives full visibility into where money is going — essential for optimizing token budgets.

---

## Cost per Day by Context Depth

| Depth | Token Budget | Briefing | Era Summaries | Approx. Cost/Day |
|---|---|---|---|---|
| Low | 3,000 | Disabled | Disabled | ~$0.03 |
| Normal | 8,000 | Enabled (7-day lookback) | Enabled (60-day intervals) | ~$0.055 |
| High | 16,000 | Enabled (14-day lookback) | Enabled (60-day intervals) | ~$0.09 |

The difference is driven by prompt size (input tokens) which determines the batch pricing.

---

## Key Exam Takeaways

1. **Batch API = 50% cost savings** on Anthropic — always use it when latency isn't critical
2. **Group batches by data dependencies** — parallelize independent calls, sequence dependent ones
3. **Track costs per-call** — you can't optimize what you don't measure
4. **Adaptive polling** reduces wasted API calls while keeping latency low
5. **Context depth is a cost dial** — let operators choose quality vs cost tradeoff
6. **Multi-provider batching** requires different strategies (Anthropic has batch API, others may not)
