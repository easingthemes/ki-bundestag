# Plan: Context & Memory Management for Long-Running Simulation

> **Status**: Ready for implementation
> **Todos**: #033 (reduce parse/validation failures), #037 (context & memory management)
> **Branch**: `claude/context-memory-management`
> **Validation**: [context-memory-management-validation.md](./context-memory-management-validation.md)

## Goal

Prevent AI response quality degradation as simulation days accumulate. Currently, PARSE_FAIL and VALIDATION_FAIL rates increase over time because party agent prompts grow with more bills, events, and crises. This plan bounds prompt size regardless of simulation length.

## Research References

This plan is informed by:
- [Anthropic: Effective Harnesses for Long-Running Agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) — compaction, progress files, multi-context windows
- [Anthropic: Context Engineering for AI Agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) — just-in-time retrieval, 75% utilization rule
- [Anthropic: Structured Outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs) — JSON schema enforcement (GA, works with Batch API)
- [Stanford Generative Agents (ACM)](https://dl.acm.org/doi/fullHtml/10.1145/3586183.3606763) — memory stream + reflection + planning architecture
- [AgeMem: Agentic Memory (arXiv 2601.01885)](https://arxiv.org/abs/2601.01885) — learned memory policies, proactive summarization
- [Mem0: LLM Chat History Summarization](https://mem0.ai/blog/llm-chat-history-summarization-guide-2025) — 90% token reduction via rolling summary + recent buffer
- [AI Dungeon Memory System](https://help.aidungeon.com/faq/the-memory-system) — two-tier compaction (micro-summaries → era summaries)

### Key Insight: Structured Output Eliminates PARSE_FAIL

Anthropic structured outputs are GA (no beta header) for Haiku 4.5+. Setting `output_config.format` to a JSON schema **guarantees** valid JSON. Verified: `@anthropic-ai/sdk@0.80.0` batch params type is `MessageCreateParamsNonStreaming` which includes `output_config` — no SDK upgrade needed. Combined with context windowing, this eliminates PARSE_FAIL for Anthropic models entirely.

**Note**: xAI/Grok (AfD) does not support structured output — the full parse pipeline must be preserved as a fallback path.

## Root Causes (from production log analysis, Days 9-49)

1. **All simulation events loaded into memory** (`loop.ts:200`): `db.select().from(schema.simulationEvents).all()` loads every event ever created, then takes last 20. On day 400+ this is thousands of rows.
2. **Briefing looks back 30-60 days of raw events** — grows as more events per day accumulate.
3. **No cumulative history** — agents have no knowledge of anything before their lookback window.
4. **No explicit bill ID list** — agents guess bill IDs from context, causing VALIDATION_FAIL.

## Architecture: Four-Phase Implementation

### Phase 1: Context Windowing (High impact, low effort)

Fix the immediate performance and quality issues by bounding what goes into prompts.

#### 1a. Optimize event query (`loop.ts:200`)

**Before:**
```typescript
const recentEvents = db.select().from(schema.simulationEvents).all();
const recentForContext = recentEvents.slice(-20);
```

**After** (use Drizzle query builder to preserve camelCase column mapping):
```typescript
import { gte, desc } from "drizzle-orm";
const recentForContext = db.select().from(schema.simulationEvents)
  .where(gte(schema.simulationEvents.dayNumber, Math.max(1, currentDay - 7)))
  .orderBy(desc(schema.simulationEvents.id))
  .limit(depthConfig.recentEventsMax)
  .all() as unknown as SimulationEvent[];
recentForContext.reverse(); // chronological order
```

**Important**: Use Drizzle, not raw `getSqlite()` — raw SQL returns snake_case columns (`day_number`) but `SimulationEvent` expects camelCase (`dayNumber`).

**Note on `allBills`**: The `allBills` query at `loop.ts:196` loads all bills for use in 7+ downstream functions (`advanceBillPipeline`, `weeklyOpinionRecalc`, constitutional challenges, referendum generation, etc.). This cannot be replaced with an active-only query. The optimization is already sufficient at the `AgentContext.pendingBills` level — which is already filtered to active statuses at line 977. If memory becomes a concern in very long simulations (1000+ days, thousands of bills), an optional optimization is `WHERE proposed_on_day >= currentDay - 90 OR status IN (active statuses)`.

#### 1b. Add explicit bill ID enforcement in prompt (`prompt.ts`)

In the THIRD READING section, add a clear machine-readable list:
```
VALID BILL IDs FOR VOTING: bill-1, bill-2, bill-3
YOU MUST include a vote action for EACH of these bill IDs.
```

In SECOND READING section:
```
VALID BILL IDs FOR AMENDMENTS: bill-4, bill-5
```

#### 1c. Cap briefing event lookback effectively

Add `briefingMaxEvents` to `DepthConfig` (e.g., 30 for normal, 15 for low, 50 for high) so the briefing doesn't grow unboundedly even within its lookback window.

### Phase 2: Era Summaries (High impact, medium effort)

Add periodic AI-generated summaries that compress historical context into bounded narratives.

#### 2a. New `era_summaries` table

```sql
CREATE TABLE IF NOT EXISTS era_summaries (
  id TEXT PRIMARY KEY,
  start_day INTEGER NOT NULL,
  end_day INTEGER NOT NULL,
  summary TEXT NOT NULL,
  key_events TEXT NOT NULL,        -- JSON array of {type, actor, title}
  party_standings TEXT NOT NULL,   -- JSON: {partyId: {approval, seatCount, trend}}
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_era_summaries_days ON era_summaries(start_day, end_day);
```

Added via DDL (`CREATE TABLE IF NOT EXISTS` in `SIM_TABLE_DDL`) + index migration (`SIM_INDEX_MIGRATIONS`), safe for existing DBs.

#### 2b. New module: `packages/engine/src/simulation/era-summary.ts`

Functions:
- `shouldGenerateEraSummary(currentDay, config)` — returns true every N days (configurable, default: 60 to align with budget cycles)
- `buildEraSummaryBatchRequest(currentDay, startDay, endDay)` — builds AI batch request from accumulated `daily_summary` values (cheaper than raw events)
- `processEraSummaryResult(result, startDay, endDay)` — parses and stores in DB
- `getEraSummaries(currentDay)` — retrieves all era summaries for prompt injection

Era summary AI prompt input:
- Accumulated `daily_summary` JSON (`{narrative, mood}`) from `simulation_meta` for each day in the range
- Party approval deltas from `party_history` table
- Crisis start/end events

Era summary AI prompt:
```
You are a political historian. Summarize the following political era from Day X to Day Y
in 150-200 words. Focus on: major legislation, coalition dynamics, crises, and shifts in
public opinion. Output JSON: {summary: string, keyEvents: [{type, actor, title}]}
```

**Failure handling**: If the era summary batch call fails (network error, API limit, unparseable JSON), log a warning and continue without the era summary. Same pattern as `processBriefingResult()` which returns `null` on error. Never block `runDay()` on a failed era summary.

#### 2c. Integration in `loop.ts`

At the start of each day, before briefing:
```typescript
// Generate era summary if needed (e.g., every 60 days)
if (depthConfig.enableEraSummaries && shouldGenerateEraSummary(currentDay, depthConfig)) {
  const eraStart = getLastEraSummaryEnd(currentDay) + 1;
  const eraEnd = currentDay - 1;
  try {
    const eraReq = buildEraSummaryBatchRequest(currentDay, eraStart, eraEnd);
    if (eraReq) {
      const eraResults = await submitBatch([eraReq]);
      processEraSummaryResult(findResult(eraResults, eraReq.customId), eraStart, eraEnd);
    }
  } catch (err) {
    console.warn(`  [EraSummary] Failed to generate era summary for days ${eraStart}-${eraEnd}: ${(err as Error).message}`);
    // Continue without era summary — not critical
  }
}
```

#### 2d. Injection in `prompt.ts`

Add new field to `AgentContext`: `eraSummaries?: Array<{startDay, endDay, summary}>`

In `buildUserPrompt()`, add between Priority 1 (core) and Priority 1.5 (briefing):
```
POLITICAL HISTORY:
  Days 1-60: [era summary 1]
  Days 61-120: [era summary 2]
  ...
```

This replaces the need for 30-60 day event lookbacks in the briefing. The briefing focuses on just the last 7 days since era summaries cover the rest.

#### 2e. Reduce briefing lookback and suppress duplicates

With era summaries handling historical context:
- `briefingEventLookbackDays`: reduce from 30→7 (normal), 60→14 (high)
- **Hard requirement**: When era summaries exist for the current day range, the briefing's "older events" section (briefing.ts "EVENTS — DAYS X TO Y") must be suppressed to avoid duplicate information wasting tokens
- Briefing still generates a narrative from recent 7 days of events

### Phase 3: Prompt Hardening (Medium impact, low effort)

Reduce PARSE_FAIL and VALIDATION_FAIL by strengthening output instructions.

#### 3a. Capabilities-aware negative instructions

When a party has no Fraktion, explicitly state what they CANNOT do:
```
You CANNOT: vote, propose_bill, propose_amendment, submit_motion, file_interpellation
You CAN ONLY: statement, nothing
```

This prevents agents from generating actions that will always fail validation.

#### 3b. JSON schema reinforcement

In `buildSystemPrompt()`, add at the end:
```
CRITICAL: Your response must be ONLY valid JSON. No markdown, no explanation, no code fences.
Start your response with { and end with }
```

### Phase 4: Structured Output (Eliminates PARSE_FAIL for Anthropic)

Anthropic structured outputs are GA for Haiku 4.5+ and work within the Batch API. This guarantees valid JSON matching a schema.

**SDK verification** (confirmed): `@anthropic-ai/sdk@0.80.0` — `BatchCreateParams.Request.params` type is `MessageCreateParamsNonStreaming` which extends `MessageCreateParamsBase` containing `output_config?: OutputConfig`. No upgrade needed.

#### 4a. Define JSON schema for agent response

Define a Zod schema for `AgentResponse` that the Anthropic API enforces:
```typescript
const agentResponseSchema = z.object({
  actions: z.array(z.discriminatedUnion("type", [
    z.object({ type: z.literal("vote"), billId: z.string(), vote: z.enum(["yes","no","abstain"]), reason: z.string() }),
    z.object({ type: z.literal("propose_bill"), title: z.string(), description: z.string(), category: z.enum([...CATEGORIES]), impact: impactSchema }),
    z.object({ type: z.literal("statement"), title: z.string(), statement: z.string() }),
    z.object({ type: z.literal("nothing") }),
    // ... other action types
  ]))
});
```

#### 4b. Pass schema to Anthropic Batch API

When building batch requests in `batch-client.ts`, include the structured output config:
```typescript
{
  model: "claude-haiku-4-5-20251001",
  messages: [...],
  output_config: {
    format: {
      type: "json_schema",
      json_schema: agentResponseSchema,
    }
  }
}
```

#### 4c. Provider-aware fallback chain

xAI/Grok (AfD) does NOT support structured output. The implementation must be provider-aware:

1. Add `structuredOutput: boolean` flag to `BatchResult` interface
2. Anthropic batch results: `structuredOutput: true` — skip JSON parsing, only run `validateActions()`
3. xAI sequential results: `structuredOutput: false` — full parse pipeline (`parseAIJson()` → `parseAgentResponse()` → `validateActions()`)
4. `logAICall()` in `ai-json.ts` should auto-set `parseOk: true` when `structuredOutput: true`
5. `parseAgentResponse()` in `action-parser.ts` gets a bypass path for pre-validated JSON

**Success metrics update**: PARSE_FAIL target is "0% for Anthropic models, unchanged for xAI" — not 0% globally.

## File Changes

### New Files
| File | Purpose |
|------|---------|
| `packages/engine/src/simulation/era-summary.ts` | Era summary generation, storage, retrieval |

### Modified Files
| File | Changes |
|------|---------|
| `packages/engine/src/db/ddl.ts` | Add `era_summaries` CREATE TABLE + index migration |
| `packages/engine/src/db/schema-sim.ts` | Add `eraSummaries` Drizzle table definition |
| `packages/engine/src/db/index.ts` | Re-export `eraSummaries` from schema |
| `packages/engine/src/agent/context-depth.ts` | Add `enableEraSummaries`, `eraSummaryIntervalDays`, `briefingMaxEvents`; reduce briefing lookbacks when era summaries enabled |
| `packages/engine/src/agent/prompt.ts` | Add era summary section, explicit bill ID lists, capabilities-aware instructions |
| `packages/engine/src/agent/party-agent.ts` | Pass era summaries through `AgentContext` |
| `packages/engine/src/agent/batch-client.ts` | Add `output_config` to Anthropic batch requests, add `structuredOutput` flag to `BatchResult` |
| `packages/engine/src/agent/action-parser.ts` | Add bypass path in `parseAgentResponse()` for structured output results |
| `packages/engine/src/agent/ai-json.ts` | Update `logAICall()` to handle structured output (auto `parseOk: true`) |
| `packages/engine/src/agent/briefing.ts` | Suppress "older events" section when era summaries exist; respect `briefingMaxEvents` cap |
| `packages/engine/src/simulation/loop.ts` | Optimize event query (Drizzle), integrate era summary generation, pass to agents |

### Types Changes
| File | Changes |
|------|---------|
| `packages/types/src/types/agent.ts` | Add `eraSummaries` to `AgentContext` interface |

## Implementation Order

1. **Phase 1a**: Event query optimization (loop.ts, Drizzle query builder)
2. **Phase 1b**: Bill ID enforcement in prompt (prompt.ts)
3. **Phase 1c**: Briefing cap (context-depth.ts, briefing.ts)
4. **Phase 3a+3b**: Prompt hardening (prompt.ts)
5. **Phase 4a-4c**: Structured output (batch-client.ts, action-parser.ts, ai-json.ts)
6. **Phase 2a**: Era summaries table + index + schema + db/index.ts export
7. **Phase 2b**: Era summary module with graceful failure handling (era-summary.ts)
8. **Phase 2c+2d+2e**: Loop integration + prompt injection + briefing dedup (loop.ts, prompt.ts, briefing.ts, context-depth.ts)

## DepthConfig Changes

New fields added to `DepthConfig` interface:

| Field | Type | low | normal | high | Description |
|-------|------|-----|--------|------|-------------|
| `enableEraSummaries` | boolean | false | true | true | Whether to generate/inject era summaries |
| `eraSummaryIntervalDays` | number | 0 | 60 | 60 | Days between era summary generations (aligns with budget cycles) |
| `briefingMaxEvents` | number | 15 | 30 | 50 | Max events the briefing can include regardless of lookback window |

Existing fields adjusted when era summaries are enabled:
- `briefingEventLookbackDays`: 30→7 (normal), 60→14 (high) — briefing focuses on recent events only
- `low` depth: era summaries disabled, briefing disabled, no changes

## Cost Impact

| Phase | Token Change | Cost Change |
|-------|-------------|-------------|
| Phase 1 | -30-50% input tokens on party agents | Saves ~$0.005/day |
| Phase 2 | +1 Haiku call every 60 days, -20% briefing tokens | Net saves ~$0.002/day |
| Phase 3 | Fewer retries from failures | Saves ~$0.001/day |
| Phase 4 | Zero PARSE_FAIL retries (Anthropic), slight output token overhead | Saves ~$0.001/day |
| **Total** | ~40% reduction in avg input tokens | **Saves ~$0.009/day** |

## Success Metrics

Track via `error-analysis` and `model-performance` workflow checks:

| Metric | Current (Day 49) | Target |
|--------|-----------------|--------|
| PARSE_FAIL rate (Anthropic) | ~8-10% (increasing) | 0% (structured output) |
| PARSE_FAIL rate (xAI/Grok) | unknown | Unchanged (no structured output) |
| VALIDATION_FAIL rate | ~15% (spiking) | < 5% (flat) |
| Avg input tokens (agent:*) | ~4-6K (growing) | < 4K (bounded) |
| Day-number correlation with fail rate | Positive | None |
| Memory usage (event loading) | All events in RAM | Last 7 days only |

## Risks

- **Era summary quality**: AI-generated summaries may miss important details. Mitigated by keeping recent events (7 days) in full detail and using accumulated `daily_summary` values as input.
- **Era summary failure**: If the AI call fails, agents proceed without long-term context for that era. Logged as warning, not a blocker.
- **Prompt changes affecting behavior**: Changing what agents see changes how they act. Monitor approval drift and bill output rates after deployment.
- **Migration on production DB**: `era_summaries` table creation is additive-only (CREATE TABLE IF NOT EXISTS), safe for running simulations.
- **xAI/Grok not covered by structured output**: AfD will still experience PARSE_FAIL. Mitigation: full parse pipeline preserved as fallback.

## Not Addressed (Future Work)

- **Negotiation prompts**: `runNegotiationRound()` builds separate AI prompts for coalition negotiations that could also benefit from era summaries. Deferred — negotiations are infrequent (only after elections).
- **Per-party memory**: Long-term per-party knowledge (alliances, grudges, evolved positions). Requires a `party_memory` table. Deferred to a future plan.
- **Vector-store retrieval**: Embedding-based memory retrieval (as in Stanford Generative Agents). Overkill for current scale, but may be valuable for multi-term simulations.
