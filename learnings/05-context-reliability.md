# Domain 5: Context Management & Reliability (15%)

Covers long-context handling, "lost in the middle" effect, section headers, trimming strategies, and confidence calibration. The smallest domain by weight, but failures here cascade into every other domain.

---

## Key Exam Concept: "Lost in the Middle"

Research shows that language models pay most attention to the **beginning** and **end** of long prompts, with reduced attention to information in the middle. The exam tests whether you know to:
1. Put critical information at the **top** of the prompt
2. Use clear **section headers** for navigation
3. **Trim** low-priority content rather than stuffing everything in

---

## 1. Token-Budgeted Context Assembly

### Exam concept
You have a fixed context window. How do you decide what to include? The answer is **priority-based greedy packing** with a token budget.

### Our implementation
`packages/engine/src/agent/context-depth.ts` defines three depth levels:

```typescript
export const DEPTH_CONFIGS: Record<ContextDepth, DepthConfig> = {
  low: {
    contextTokenBudget: 3000,       // tight budget
    briefingEventLookbackDays: 0,   // no briefing at all
    ownActionsLookbackDays: 0,      // no cross-day memory
    recentEventsMax: 5,
    recentMediaMax: 2,
    includeP3: false,               // skip motions, interpellations
    enableBriefing: false,
    enableKnowledgeGrounding: false,
    enableEraSummaries: false,
    label: "Low",                   // ~$0.03/day
  },
  normal: {
    contextTokenBudget: 8000,       // balanced budget
    briefingEventLookbackDays: 7,
    ownActionsLookbackDays: 14,     // 2-week memory
    ownActionsMaxItems: 15,
    recentEventsMax: 10,
    recentMediaMax: 3,
    includeP3: true,
    enableBriefing: true,
    enableKnowledgeGrounding: true,
    enableEraSummaries: true,
    eraSummaryIntervalDays: 60,
    label: "Normal",                // ~$0.055/day
  },
  high: {
    contextTokenBudget: 16000,      // rich context
    briefingEventLookbackDays: 14,
    ownActionsLookbackDays: 30,     // 30-day memory
    ownActionsMaxItems: 30,
    recentEventsMax: 20,
    recentMediaMax: 5,
    includeP3: true,
    enableBriefing: true,
    enableKnowledgeGrounding: true,
    enableEraSummaries: true,
    eraSummaryIntervalDays: 60,
    label: "High",                  // ~$0.09/day
  },
};
```

---

## 2. Priority-Based Prompt Assembly

### Exam concept
Content should be included in priority order. When the budget runs out, the least important content gets dropped.

### Our implementation
`packages/engine/src/agent/prompt.ts` assembles the user prompt in 4 priority tiers:

```typescript
export function buildUserPrompt(ctx: AgentContext, depthConfig?: DepthConfig): string {
  // PRIORITY 1 (always included) — core decision-making context
  // Current day, party state, national economy, active bills, election, crises, government
  const coreLines = `CURRENT DAY: ${ctx.currentDay}
YOUR PARTY: ${ctx.party.name} (${ctx.party.coalitionRole})
  Seats: ${ctx.party.seatCount}/735 | Approval: ${ctx.party.approvalRating}%
NATIONAL STATE:
  Budget: ${ctx.nationalState.economy.budget}B EUR | ...
THIRD READING — MANDATORY VOTES:
  - [bill-abc] "Mindestlohnerhöhung" (economy) ...`;

  // PRIORITY 1.5 (included if enabled) — cross-day memory
  if (depth.enableBriefing && ctx.briefing) {
    briefingSection = `\nDAILY BRIEFING:\n${ctx.briefing}\n`;
  }

  // PRIORITY 2 (budget-limited) — high-value optional context
  // Recent own actions, events, media, proposed bills, internal proposals
  const p2Sections: string[] = [...];

  // PRIORITY 3 (budget-limited, after P2) — supplementary context
  // Motions, interpellations, confidence votes, constitutional challenges
  const p3Sections: string[] = [...];

  // Greedy inclusion within token budget
  let tokenBudget = depth.contextTokenBudget;
  const includedSections: string[] = [];

  for (const section of p2Sections) {
    const cost = estimateTokens(section);  // ~4 chars per token
    if (cost <= tokenBudget) {
      includedSections.push(section);
      tokenBudget -= cost;
    }
  }

  if (depth.includeP3) {
    for (const section of p3Sections) {
      const cost = estimateTokens(section);
      if (cost <= tokenBudget) {
        includedSections.push(section);
        tokenBudget -= cost;
      }
    }
  }

  // Notify when trimming occurred
  if (includedSections.length < totalSections) {
    includedSections.push("(Some context sections trimmed for token budget.)");
  }
}
```

### Why priority tiers matter (exam answer)
```
Priority 1:  Bills to vote on, party state, economy  →  ALWAYS included (decisions depend on this)
Priority 1.5: Briefing, era summaries               →  Included if enabled (provides continuity)
Priority 2:  Recent events, media, own actions       →  Included if budget allows (enriches decisions)
Priority 3:  Motions, interpellations, court cases   →  Included last (supplementary awareness)
```

If you have 3000 tokens, you get Priority 1 only. If you have 16000, you get everything. The agent makes good decisions either way — just richer ones with more context.

---

## 3. Section Headers for Navigation

### Exam concept
Clear section headers help the model locate relevant information in long prompts. This directly mitigates the "lost in the middle" effect.

### Our implementation
Every section in the user prompt has a screaming-caps header:

```
CURRENT DAY: 42
YOUR PARTY: SPD (coalition leader)
NATIONAL STATE: ...
PARTIES: ...
THIRD READING — MANDATORY VOTES: ...
SECOND READING: ...
ACTIVE CRISES: ...
FEDERAL GOVERNMENT: ...
HISTORICAL CONTEXT (compressed summaries of past eras): ...
DAILY BRIEFING: ...
YOUR RECENT ACTIONS (last 14 days): ...
RECENT EVENTS: ...
RECENT MEDIA COVERAGE: ...
VALID BILL IDs FOR VOTING: bill-abc, bill-xyz
```

**Why this works:** The model can scan headers to find relevant data for each action type. When deciding how to vote on a bill, it can jump to `THIRD READING — MANDATORY VOTES`. When deciding whether to file an interpellation, it can check `RECENT INTERPELLATIONS`.

---

## 4. Era Summaries (Compressed Historical Narratives)

### Exam concept
As conversations or simulations grow, you need **compression strategies** to keep historical context without exceeding token budgets.

### Our implementation
`packages/engine/src/simulation/era-summary.ts` generates compressed narratives every 60 days:

```typescript
// era-summary.ts — periodic compression
export function shouldGenerateEraSummary(currentDay: number, depthConfig: DepthConfig): boolean {
  if (!depthConfig.enableEraSummaries) return false;
  const lastEnd = getLastEraSummaryEnd();
  return (currentDay - lastEnd) >= depthConfig.eraSummaryIntervalDays; // 60 days
}

// The AI compresses 60 days of events into a paragraph:
const ERA_SUMMARY_SYSTEM = `You are a senior political historian at the German Bundestag.
Write a concise summary of the political era described below. Write in German.
Focus on:
- Major legislative achievements or failures
- Shifts in political power and approval
- Crises and their resolution
- Coalition dynamics and conflicts`;
```

**Injected into agent prompts as:**
```
HISTORICAL CONTEXT (compressed summaries of past eras):
  [Days 1-60]: Die erste Legislaturperiode war geprägt von wirtschaftlicher Stabilität...
  [Days 61-120]: Die Koalitionskrise um den Haushalt dominierte die zweite Phase...
```

### Key learning
Without era summaries, a simulation at day 300 would need 300 days of events (~30K+ tokens). With summaries, it needs ~5 summaries (~500 tokens) plus the last 7 days of raw events. This is **lossy compression** — you lose detail but keep narrative continuity.

---

## 5. Cross-Day Memory via Briefings

### Exam concept
Stateless AI calls have no memory between invocations. How do you give agents continuity?

### Our implementation
`packages/engine/src/agent/briefing.ts` generates a daily briefing from the last 30 days of DB history:

```typescript
// briefing.ts — query last 30 days, synthesize into briefing
function getRecentSignificantEvents(currentDay, lookbackDays = 30, maxEvents = 60) {
  return db.select({ dayNumber, type, actor, title })
    .from(schema.simulationEvents)
    .where(gte(schema.simulationEvents.dayNumber, currentDay - lookbackDays))
    .orderBy(desc(schema.simulationEvents.id))
    .limit(maxEvents)
    .all();
}

function getApprovalTrends(currentDay, lookbackDays = 14) {
  // Returns per-party approval rating changes over time
}

// The briefing AI call digests events + trends into a compact narrative:
// "SPD approval is rising (+2.3% this week). The Grüne environmental bill
//  passed with opposition support. Crisis: energy shortage still unresolved."
```

This briefing is then injected as `DAILY BRIEFING` in every party agent's prompt, giving all agents shared situational awareness.

---

## 6. Real-World Knowledge Grounding

### Exam concept
Grounding AI responses in external data improves accuracy. The exam tests approaches: RAG, retrieval, live data injection.

### Our implementation
`packages/engine/src/simulation/knowledge-fetch.ts` fetches real-world data weekly:

```typescript
// Sources:
// 1. Tagesschau API (German public news)
// 2. WELT RSS (German news)
// 3. Abgeordnetenwatch API (real politician data)
// 4. Bundestag DIP API (real legislation)

// AI digests into 4 categories:
// - landscape: timeless themes (always in briefing)
// - party_position: real political stances (merged into profiles)
// - shock: major disruptions (persist until resolved)
// - headline: dated items (one sim day only)
```

This is **not vector-based RAG** — it's structured retrieval + AI digestion, stored in a `knowledge_items` table. The exam may ask about different retrieval approaches; this is a simpler alternative to full embeddings-based RAG.

---

## 7. Observability & Logging

### Exam concept
You need to monitor AI call quality in production. The exam tests what to log and how.

### Our implementation
```typescript
// ai-json.ts — structured logging for every AI call
export function logAICall(opts: {
  task: string;
  model?: string;
  provider?: string;
  latencyMs: number;
  parseOk: boolean;
  validationOk: boolean;
  fallback?: string;
}): void {
  const status = !opts.parseOk ? "PARSE_FAIL"
    : !opts.validationOk ? "VALIDATION_FAIL"
    : "OK";
  const fb = opts.fallback ? ` fallback=${opts.fallback}` : "";
  console.log(`  [AI] ${opts.task} | ${opts.provider}/${opts.model} | ${opts.latencyMs}ms | ${status}${fb}`);
}

// Output:
// [AI] agent:spd | anthropic/claude-haiku-4-5-20251001 | 847ms | OK
// [AI] agent:afd | xai/grok-3-mini | 1203ms | PARSE_FAIL fallback=abstain-all
```

Plus cost tracking persisted to DB:
```typescript
// cost-tracker.ts — every call recorded
recordAICall({
  dayNumber: 42,
  task: "call:spd",
  provider: "anthropic",
  model: "claude-haiku-4-5-20251001",
  inputTokens: 2847,
  outputTokens: 312,
  costUsd: 0.00145,
  latencyMs: 847,
  success: true,
});
```

---

## 8. Retry Strategy with Exponential Backoff

### Exam concept
Transient errors (429s, network issues) should be retried. Hard errors (spending limits) should not.

### Our implementation
```typescript
// client.ts — differentiated retry logic
const MAX_RETRIES = 2;
const RETRY_DELAYS = [2_000, 5_000]; // 2s then 5s

for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
  try {
    return await generateText({ model, system, prompt, maxOutputTokens });
  } catch (err) {
    const detected = detectLimitError(err);

    if (detected.type === "hard") {
      // HARD LIMIT — do NOT retry, set circuit breaker
      providerLimits.set(detected.provider, { until, resetAt });
      throw new AIProviderLimitError(detected.provider, detected.until);
    }

    if (detected.type === "transient" && attempt < MAX_RETRIES) {
      // TRANSIENT — wait and retry
      await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]));
      continue;
    }

    throw err; // exhausted retries or unknown error
  }
}
```

---

## Summary: What This Domain Tests

| Concept | Exam Weight | Our Experience |
|---|---|---|
| Token budget management | High | 3-tier depth config (3K/8K/16K budgets) |
| Priority-based trimming | High | P1 → P1.5 → P2 → P3 greedy packing |
| "Lost in the middle" mitigation | High | Important info first, section headers |
| History compression | Medium | Era summaries every 60 days |
| Cross-day memory | Medium | Daily briefing injection |
| Retry/backoff strategy | Medium | 2 retries with 2s/5s delays |
| Observability | Medium | Structured logging + DB cost tracking |
| Real-world grounding | Low | Weekly knowledge fetch + digest |
