# Domain 1: Agentic Architecture & Orchestration (27%)

The heaviest exam domain. Covers agentic loop mechanics, multi-agent orchestration, task decomposition, hub-and-spoke patterns, and session resumption.

## What We Built

KI-Bundestag is fundamentally a **multi-agent orchestration system**: 6 AI party agents + media agents + summary agents + briefing agents, all coordinated through a central simulation loop.

---

## 1. Agentic Loop Mechanics

### Exam concept
An agentic loop is a cycle of: observe state -> decide action -> execute -> update state -> repeat. The exam tests whether you understand when to use loops vs. single-shot calls.

### Our implementation
`packages/engine/src/simulation/loop.ts` — the `runDay()` function is a 13-step agentic loop:

```typescript
// loop.ts — simplified flow
export async function runDay(): Promise<number> {
  // 1. Load current state (observe)
  const meta = db.select().from(schema.simulationMeta).all()[0];
  const currentDay = meta.currentDay + 1;

  // 2-3. Economic drift + crisis system (environment changes)
  applyEconomicDrift(nationalState);
  maybeTriggerCrisis(currentDay, nationalState);

  // 4. Party agents make decisions (decide + act)
  const requests = buildPartyAgentRequests(contexts, currentDay, depthConfig);
  const results = await submitBatch(requests);

  // 5-8. Process actions, update approval, resolve votes (execute + update)
  for (const ctx of partyContexts) {
    const actions = await processPartyAgentResult(result, ctx, votableBills);
    // ... apply each action to state
  }

  // 9-12. Secondary agents: media, polls, summary
  // 13. Persist state, advance day counter (loop boundary)
  db.update(schema.simulationMeta).set({ currentDay }).run();
  return currentDay;
}
```

### Key learning
The day counter is only committed at the **end** of a successful day — if AI calls fail mid-day, `cleanupPartialDay()` removes partial data and the day can be retried. This is a **transactional loop boundary** pattern.

---

## 2. Hub-and-Spoke Orchestration

### Exam concept
A central orchestrator (hub) delegates to specialized agents (spokes) and aggregates their results. The exam contrasts this with peer-to-peer or chain patterns.

### Our implementation
`loop.ts` is the hub. The spokes are:

| Spoke | Module | Batch Group |
|---|---|---|
| 6 Party Agents | `party-agent.ts` | Group A |
| Media Generator | `media.ts` | Group C |
| Daily Summary | `summary.ts` | Group C |
| Daily Briefing | `briefing.ts` | Pre-loop |
| Era Summaries | `era-summary.ts` | Periodic |
| Poll Generator | `polls.ts` | Mid-cycle |
| Referendum Generator | `referendums.ts` | Mid-cycle |
| Coalition Negotiator | `negotiations.ts` | Election phase |
| Knowledge Grounder | `knowledge-fetch.ts` | Weekly |

The hub collects `BatchRequest[]` from each spoke, submits them as a single batch, and routes results back:

```typescript
// Hub collects requests from spokes
const batchA: BatchRequest[] = [
  ...buildPartyAgentRequests(contexts, currentDay),
  ...buildInterpellationRequests(parties),
  ...buildDisciplineRequests(parties),
];

// Single submission to batch API
const results = await submitBatch(batchA);

// Route results back to spokes
for (const ctx of contexts) {
  const result = findResult(results, `agent-${ctx.party.id}-day${currentDay}`);
  const actions = await processPartyAgentResult(result, ctx, votableBills);
}
```

### Key learning
Hub-and-spoke is ideal when spokes are **independent** (party agents don't need each other's output) but the hub needs to **aggregate** results (e.g., tallying votes requires all parties' decisions). The batch API naturally fits this pattern.

---

## 3. Task Decomposition

### Exam concept
Breaking complex tasks into subtasks that can be parallelized or sequenced. The exam tests whether you can identify dependencies.

### Our implementation
The daily simulation decomposes into **dependency groups**:

```
Group A (parallel)          Group B (depends on A)       Group C (depends on B)
├── 6 party agents          ├── Vote tallying            ├── Media generation
├── Internal proposals      ├── Bill status updates      ├── Daily summary
└── MdB actions             ├── Approval drift           └── Era summary (periodic)
                            └── Interpellation answers
```

Within each group, tasks are **parallelized via batch API**. Between groups, there are strict dependencies — you can't tally votes before parties vote.

```typescript
// Dependency-aware execution
const groupAResults = await submitBatch(groupARequests);  // parallel
applyGroupAActions(groupAResults);                        // sequential
const groupBResults = await submitBatch(groupBRequests);  // parallel
applyGroupBActions(groupBResults);                        // sequential
```

### Key learning
The exam asks: "which tasks can be parallelized?" The answer is always about **data dependencies**. If Task B reads Task A's output, they must be sequential. If they're independent, batch them.

---

## 4. Graceful Degradation & Fallback Policies

### Exam concept
What happens when an agent fails? The system must continue operating with reduced capability, not crash.

### Our implementation
Every agent call has a typed fallback:

```typescript
// party-agent.ts — fallback on ANY error
export async function runPartyAgent(ctx: AgentContext, votableBills: Bill[]): Promise<AgentAction[]> {
  try {
    const { text } = await callAI({ system: systemPrompt, prompt: userPrompt, ... });
    const parsed = parseAgentResponse(text);       // may throw
    return validateActions(parsed.actions, ...);    // drops invalid actions
  } catch (error) {
    // Fallback: abstain on all bills (safe default)
    return votableBills.map(bill => ({
      type: "vote",
      billId: bill.id,
      vote: "abstain",
      reason: "Agent error - automatic abstain",
    }));
  }
}
```

Fallback policies by module:

| Module | Fallback | Why |
|---|---|---|
| Party agents | Abstain all bills | Neutral — doesn't distort votes |
| Negotiations | "Open to all partners" | Prevents deadlock |
| Media | Skip (no articles) | Missing news is OK |
| Summaries | Skip (no narrative) | Non-critical |
| Speeches | Score 0 (neutral) | Deterministic fallback |

### Key learning
**Fallbacks should be semantically neutral** — they shouldn't bias the system. Abstaining is neutral. Voting "yes" or "no" would introduce bias. The exam tests this judgment.

---

## 5. Circuit Breaker Pattern

### Exam concept
Stop making API calls to a failing provider to avoid cascading failures and wasted spend.

### Our implementation
```typescript
// client.ts — provider-level circuit breaker
const providerLimits = new Map<Provider, { until: string; resetAt: number }>();

export function detectLimitError(err: unknown): LimitResult {
  // Hard limit: "You have reached your usage limits. Access resumes <date>"
  const limitMatch = body.match(/usage limits?.*?regain access on ([0-9T :ZZ\-]+)/i);
  if (limitMatch) {
    return { type: "hard", provider: inferProvider(e), until: limitMatch[1] };
  }
  // Transient 429
  if (status === 429) return { type: "transient", provider: inferProvider(e) };
  // Network errors
  if (isNetworkError(err)) return { type: "transient", provider: inferProvider(e) };
  return { type: "none" };
}

// Before every API call:
const limit = providerLimits.get(config.provider);
if (limit && Date.now() < limit.resetAt) {
  throw new AIProviderLimitError(config.provider, limit.until);  // skip call
}
```

### Key learning
The circuit breaker has three states: **closed** (normal), **open** (all calls blocked), and **half-open** (try one call after TTL expires). Our implementation uses TTL-based reset (`resetAt` timestamp) — once the time passes, the breaker auto-resets.

---

## 6. Session Resumption / Partial Day Recovery

### Exam concept
If a long-running agentic process fails mid-way, how do you resume?

### Our implementation
```typescript
// loop.ts — cleanup before retry
function cleanupPartialDay(dayNumber: number): void {
  // Delete all events, bills, motions, etc. created during the failed day
  for (const table of simDayNumberTables) {
    sqlite.prepare(`DELETE FROM ${table} WHERE day_number = ?`).run(dayNumber);
  }
}

// The day counter is NOT advanced until everything succeeds:
// Start of day: meta.currentDay is still N-1
// End of day (success only): UPDATE simulation_meta SET currentDay = N
```

### Key learning
The exam asks about **idempotent retries**. Our approach: treat each day as a transaction. If it fails, clean up and replay from scratch. The day counter acts as a **commit point**.

---

## Summary: What This Domain Tests

| Concept | Exam Weight | Our Experience |
|---|---|---|
| Agentic loops | High | 13-step `runDay()` loop |
| Hub-and-spoke | High | Central loop + 9 spoke agents |
| Task decomposition | High | Dependency-grouped batch execution |
| Graceful degradation | Medium | Typed fallbacks per agent |
| Circuit breaker | Medium | Provider-level with TTL reset |
| Session resumption | Medium | Transactional day boundaries |
