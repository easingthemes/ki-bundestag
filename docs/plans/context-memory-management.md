# Plan: Context & Memory Management for Long-Running Simulation

> **Status**: Ready for implementation
> **Todos**: #033 (reduce parse/validation failures), #037 (context & memory management)
> **Branch**: `claude/context-memory-management`

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

Anthropic structured outputs are now GA (no beta header) for Haiku 4.5+. Setting `output_config.format` to a JSON schema **guarantees** valid JSON. This works within the Batch API. Combined with context windowing, this should eliminate PARSE_FAIL entirely and reduce VALIDATION_FAIL dramatically.

## Root Causes (from production log analysis, Days 9-49)

1. **All simulation events loaded into memory** (`loop.ts:200`): `db.select().from(schema.simulationEvents).all()` loads every event ever created, then takes last 20. On day 400+ this is thousands of rows.
2. **Briefing looks back 30-60 days of raw events** — grows as more events per day accumulate.
3. **No cumulative history** — agents have no knowledge of anything before their lookback window.
4. **No explicit bill ID list** — agents guess bill IDs from context, causing VALIDATION_FAIL.
5. **All bills loaded** (`loop.ts:196`): `db.select().from(schema.bills).all()` loads every bill ever created including passed/rejected/vetoed ones from months ago.

## Architecture: Three-Phase Implementation

### Phase 1: Context Windowing (High impact, low effort)

Fix the immediate performance and quality issues by bounding what goes into prompts.

#### 1a. Optimize event query (`loop.ts:200`)

**Before:**
```typescript
const recentEvents = db.select().from(schema.simulationEvents).all();
const recentForContext = recentEvents.slice(-20);
```

**After:**
```typescript
const recentForContext = getSqlite().prepare(`
  SELECT * FROM simulation_events
  WHERE day_number >= ?
  ORDER BY id DESC
  LIMIT ?
`).all(Math.max(1, currentDay - 7), depthConfig.recentEventsMax);
```

Only fetch events from the last 7 days, limited to `recentEventsMax` rows. Saves memory and DB time on long runs.

#### 1b. Only load active bills (`loop.ts:196`)

**Before:**
```typescript
const allBills = db.select().from(schema.bills).all();
const pendingBills = allBills.filter(b => activeBillStatuses.includes(b.status));
```

**After:**
```typescript
const pendingBills = getSqlite().prepare(`
  SELECT * FROM bills WHERE status IN ('proposed','first_reading','committee','second_reading','third_reading')
`).all();
// Only load passed bills needed for constitutional challenges (last 14 days)
const passedBillsRecent = getSqlite().prepare(`
  SELECT * FROM bills WHERE status = 'passed' AND status_changed_on_day >= ?
`).all(currentDay - 14);
```

#### 1c. Add explicit bill ID enforcement in prompt (`prompt.ts`)

In the THIRD READING section, add a clear machine-readable list:
```
VALID BILL IDs FOR VOTING: bill-1, bill-2, bill-3
YOU MUST include a vote action for EACH of these bill IDs.
```

In SECOND READING section:
```
VALID BILL IDs FOR AMENDMENTS: bill-4, bill-5
```

#### 1d. Cap briefing event lookback effectively

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
```

Added via DDL migration (safe for existing DBs).

#### 2b. New module: `packages/engine/src/simulation/era-summary.ts`

Functions:
- `shouldGenerateEraSummary(currentDay, config)` — returns true every N days (default: 30)
- `buildEraSummaryBatchRequest(currentDay, startDay, endDay)` — builds AI batch request
- `processEraSummaryResult(result, startDay, endDay)` — parses and stores in DB
- `getEraSummaries(currentDay)` — retrieves all era summaries for prompt injection

Era summary AI prompt:
```
You are a political historian. Summarize the following political events from Day X to Day Y
in 150-200 words. Focus on: major legislation, coalition dynamics, crises, and shifts in
public opinion. Output JSON: {summary: string, keyEvents: [{type, actor, title}]}
```

#### 2c. Integration in `loop.ts`

At the start of each day, before briefing:
```typescript
// Generate era summary if needed (e.g., every 30 days)
if (shouldGenerateEraSummary(currentDay, depthConfig)) {
  const eraStart = getLastEraSummaryEnd(currentDay) + 1;
  const eraEnd = currentDay - 1;
  const eraReq = buildEraSummaryBatchRequest(currentDay, eraStart, eraEnd);
  if (eraReq) {
    const eraResults = await submitBatch([eraReq]);
    processEraSummaryResult(findResult(eraResults, eraReq.customId), eraStart, eraEnd);
  }
}
```

#### 2d. Injection in `prompt.ts`

Add new field to `AgentContext`: `eraSummaries?: Array<{startDay, endDay, summary}>`

In `buildUserPrompt()`, add between Priority 1 (core) and Priority 1.5 (briefing):
```
POLITICAL HISTORY:
  Days 1-30: [era summary 1]
  Days 31-60: [era summary 2]
  ...
```

This replaces the need for 30-60 day event lookbacks in the briefing. The briefing can focus on just the last 7 days since era summaries cover the rest.

#### 2e. Reduce briefing lookback

With era summaries handling historical context:
- `briefingEventLookbackDays`: reduce from 30→7 (normal), 60→14 (high)
- Briefing prompt gets era summaries as context, so it still knows history

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

### Phase 4: Structured Output (Eliminates PARSE_FAIL entirely)

Anthropic structured outputs are now GA for Haiku 4.5+ and work within the Batch API. This guarantees valid JSON matching a schema — completely eliminating PARSE_FAIL.

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

When building batch requests, include the structured output config:
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

#### 4c. Fallback chain

With structured output:
1. JSON is always valid (guaranteed by API)
2. Only validation against game rules remains (VALIDATION_FAIL)
3. `safeParseJson()` becomes a no-op for structured output responses
4. `parseAgentResponse()` just validates action types, not JSON syntax

**Note**: This requires using the Anthropic SDK directly for batch submission (already the case in `batch-client.ts`). The Vercel AI SDK does not natively support Batch API, but the Anthropic SDK's batch endpoint accepts the same parameters including `output_config`.

## File Changes

### New Files
| File | Purpose |
|------|---------|
| `packages/engine/src/simulation/era-summary.ts` | Era summary generation, storage, retrieval |

### Modified Files
| File | Changes |
|------|---------|
| `packages/engine/src/db/ddl.ts` | Add `era_summaries` CREATE TABLE + migration |
| `packages/engine/src/db/schema-sim.ts` | Add `eraSummaries` Drizzle table definition |
| `packages/engine/src/agent/context-depth.ts` | Add `eraSummaryIntervalDays`, `briefingMaxEvents`, reduce briefing lookbacks |
| `packages/engine/src/agent/prompt.ts` | Add era summary section, explicit bill ID lists, capabilities-aware instructions |
| `packages/engine/src/agent/party-agent.ts` | Pass era summaries through `AgentContext` |
| `packages/engine/src/agent/batch-client.ts` | Add structured output (`output_config`) to batch requests |
| `packages/engine/src/simulation/loop.ts` | Optimize queries, integrate era summary generation, pass to agents |

### Types Changes
| File | Changes |
|------|---------|
| `packages/types/src/types/agent.ts` | Add `eraSummaries` to `AgentContext` interface |

## Implementation Order

1. **Phase 1a+1b**: Query optimization (loop.ts) — immediate performance win
2. **Phase 1c**: Bill ID enforcement (prompt.ts) — reduces VALIDATION_FAIL
3. **Phase 1d**: Briefing cap (context-depth.ts, briefing.ts)
4. **Phase 3a+3b**: Prompt hardening (prompt.ts) — reduces PARSE_FAIL + VALIDATION_FAIL
5. **Phase 4a-4c**: Structured output (batch-client.ts) — eliminates PARSE_FAIL
6. **Phase 2a**: Era summaries table (ddl.ts, schema-sim.ts)
7. **Phase 2b**: Era summary module (era-summary.ts)
8. **Phase 2c**: Loop integration (loop.ts)
9. **Phase 2d+2e**: Prompt injection + briefing reduction (prompt.ts, context-depth.ts)

## Cost Impact

| Phase | Token Change | Cost Change |
|-------|-------------|-------------|
| Phase 1 | -30-50% input tokens on party agents | Saves ~$0.005/day |
| Phase 2 | +1 Haiku call every 30 days, -20% briefing tokens | Net saves ~$0.002/day |
| Phase 3 | Fewer retries from failures | Saves ~$0.001/day |
| Phase 4 | Zero PARSE_FAIL retries, slight output token overhead | Saves ~$0.001/day |
| **Total** | ~40% reduction in avg input tokens | **Saves ~$0.009/day** |

## Success Metrics

Track via `error-analysis` and `model-performance` workflow checks:

| Metric | Current (Day 49) | Target |
|--------|-----------------|--------|
| PARSE_FAIL rate | ~8-10% (increasing) | 0% (with structured output) |
| VALIDATION_FAIL rate | ~15% (spiking) | < 5% (flat) |
| Avg input tokens (agent:*) | ~4-6K (growing) | < 4K (bounded) |
| Day-number correlation with fail rate | Positive | None |
| Memory usage (event loading) | All events in RAM | Last 7 days only |

## Risks

- **Era summary quality**: AI-generated summaries may miss important details. Mitigated by keeping recent events (7 days) in full detail.
- **Prompt changes affecting behavior**: Changing what agents see changes how they act. Monitor approval drift and bill output rates after deployment.
- **Migration on production DB**: `era_summaries` table creation is additive-only (CREATE TABLE IF NOT EXISTS), safe for running simulations.
