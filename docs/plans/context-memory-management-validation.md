# Validation: Context & Memory Management Plan

> **Validated against**: `docs/plans/context-memory-management.md`
> **Codebase revision**: `claude/context-memory-management` branch
> **Date**: 2026-04-01

## Summary

| Category | Count |
|----------|-------|
| Confirmed | 9 |
| Issues | 12 |
| Improvements | 3 |
| Blockers | 2 |

---

## Blockers

### B1. Phase 1b: `allBills` cannot be replaced with active-only query

**Plan says** (Phase 1b): Replace `const allBills = db.select().from(schema.bills).all()` with queries for only pending/recently-passed bills.

**Problem**: `allBills` is used in at least 7 places beyond agent prompts:

| Location | Usage |
|----------|-------|
| `loop.ts:801` | `advanceBillPipeline(currentDay, allBills, ...)` |
| `loop.ts:848` | `passedBillsForChallenge = allBills.filter(...)` |
| `loop.ts:977` | Agent context: `allBills.filter(b => b.status === "first_reading" \|\| ...)` |
| `loop.ts:1604` | `const targetBill = allBills.find(...)` (constitutional challenges) |
| `loop.ts:1769` | `recentBillTitles = allBills.filter(b => b.proposedOnDay >= currentDay - 7)` |
| `loop.ts:1774` | `weeklyOpinionRecalc(allParties, allBills, ...)` |
| `loop.ts:1797` | `recentBillsForRef = allBills...` (referendum generation) |

`weeklyOpinionRecalc` (cycles.ts:45) filters bills by `status === "passed"` within the last poll interval. Removing passed bills from `allBills` would break weekly approval recalculation.

**Fix**: Keep `allBills` intact for non-prompt uses. Optimize only what enters `AgentContext.pendingBills` — which is already filtered at line 977. If memory is a concern, add a SQL `WHERE` for bills proposed or status-changed within the last 90 days, which covers all downstream uses.

### B2. Phase 4: SDK version `^0.80.0` — structured output + Batch API compatibility unverified

**Plan says** (Phase 4): Pass `output_config.format` with `json_schema` to the Anthropic Batch API.

**Problem**: `packages/engine/package.json` declares `"@anthropic-ai/sdk": "^0.80.0"`. The batch request is built at `batch-client.ts:101-112` with `params: { model, max_tokens, system, messages }`. The `params` type is `MessageCreateParamsNonStreaming`.

Whether `output_config` is accepted in batch request params depends on the resolved SDK version. Structured output for the Messages API was GA'd for Haiku 4.5+, but:
1. The Batch API wraps requests differently — each item's `params` must include `output_config`
2. The SDK types must allow it in `BatchCreateParams.Request['params']`
3. The SDK is not installed in this environment, so types cannot be verified directly

**Fix**: Before implementing Phase 4:
1. Run `npm install` and inspect `node_modules/@anthropic-ai/sdk` types for batch params
2. If `output_config` is not in the batch params type, upgrade the SDK
3. Add a test that confirms the batch request shape is accepted

---

## Issues

### I1. Phase 1a: Raw SQL returns snake_case columns, not camelCase

**Plan says**: Use `getSqlite().prepare(...)` for the optimized event query.

**Problem**: Raw SQLite queries return `{ day_number, ... }` but the code expects `SimulationEvent` with `{ dayNumber, ... }`. The existing code uses Drizzle (`db.select().from(schema.simulationEvents)`) which auto-maps column names.

**Fix**: Use Drizzle's query builder with `.where()`, `.orderBy()`, `.limit()` instead of raw SQL:
```typescript
import { gte, desc } from "drizzle-orm";
const recentForContext = db.select().from(schema.simulationEvents)
  .where(gte(schema.simulationEvents.dayNumber, Math.max(1, currentDay - 7)))
  .orderBy(desc(schema.simulationEvents.id))
  .limit(depthConfig.recentEventsMax)
  .all() as unknown as SimulationEvent[];
```

### I2. Phase 2: Era summary AI failure has no fallback

**Plan says**: Generate era summary via `submitBatch()` at start of each eligible day.

**Problem**: If the batch call fails (network error, API limit, unparseable JSON), the plan doesn't specify behavior. The briefing system (`briefing.ts:208-219`) handles this gracefully — `processBriefingResult()` returns `null` and agents proceed without it.

**Fix**: Era summary generation must follow the same pattern: catch errors, log a warning, continue without the era summary. Never block `runDay()` on a failed era summary.

### I3. Phase 2: Era summaries may duplicate briefing content

**Plan says**: Add era summaries between core context and briefing in the prompt.

**Problem**: The briefing already includes "EVENTS — DAYS X TO Y" (briefing.ts:159) covering older events. If era summaries also describe those events, agents see overlapping information, wasting tokens.

**Fix**: When era summaries are available, the briefing's "older events" section should be suppressed. Phase 2e mentions reducing briefing lookback from 30→7 days — this must be a hard requirement, not optional, when era summaries exist.

### I4. Phase 2: 30-day interval misaligns with existing cycles

**Plan says**: Generate era summaries every 30 days.

**Problem**: Budget cycles are 60 days (`TIME_CONFIG.BUDGET_INTERVAL`), elections at 1461 days. A 30-day boundary can split a budget debate or election campaign mid-way, producing a confusing summary.

**Suggestion**: Use 60-day intervals to align with budget cycles, or make interval configurable per depth level.

### I5. Phase 2: No interaction with `daily_summary` field

**Plan says**: Nothing about `simulation_meta.daily_summary`.

**Problem**: `loop.ts:2090-2125` already generates and stores a daily narrative summary in `simulation_meta.daily_summary`. Era summaries could be built from accumulated daily summaries (cheaper than re-reading raw events), but the plan doesn't consider this.

**Suggestion**: Either use daily summaries as input to era summary generation (reducing input tokens), or document why raw events are preferred.

### I6. Phase 4: xAI/Grok not covered by structured output

**Plan says**: Structured output eliminates PARSE_FAIL entirely.

**Problem**: AfD uses `xai:grok-3-mini` via sequential `callAI()` in `batch-client.ts:235-257`. Structured output is Anthropic-specific. AfD responses will still require full JSON parsing and remain subject to PARSE_FAIL.

**Fix**:
- Phase 4 must preserve the full `parseAgentResponse()` pipeline as a fallback
- Add a `structuredOutput: boolean` flag to `BatchResult` so `processPartyAgentResult()` knows whether to skip parsing
- Update success metrics: PARSE_FAIL target should be "0% for Anthropic, unchanged for xAI" not "0%" globally

### I7. Context-depth: `low` depth should disable era summaries

**Plan says**: Add `eraSummaryIntervalDays` to `DepthConfig`.

**Problem**: `low` depth disables briefing (`enableBriefing: false`, context-depth.ts:44) and all cross-day memory (`ownActionsLookbackDays: 0`). Era summaries require an AI call — they should also be disabled at `low` depth.

**Fix**: Add `enableEraSummaries: boolean` to `DepthConfig`:
- `low`: `false`
- `normal`: `true`
- `high`: `true`

### I8. Missing file: `action-parser.ts`

Phase 4 changes how responses are parsed, but `packages/engine/src/agent/action-parser.ts` is not listed in File Changes. `parseAgentResponse()` and `validateActions()` would need modification — at minimum, a bypass path when structured output guarantees valid JSON.

### I9. Missing file: `ai-json.ts`

`packages/engine/src/agent/ai-json.ts` contains `parseAIJson()` and `logAICall()`. If structured output makes parsing a no-op, the logging should reflect this (auto-mark `parseOk: true`).

### I10. Missing file: `db/index.ts`

The barrel re-export in `packages/engine/src/db/index.ts` must export the new `eraSummaries` Drizzle table from `schema-sim.ts`.

### I11. Era summary table needs an index

The `era_summaries` table schema has no index beyond the primary key. Queries like `getEraSummaries(currentDay)` will scan all rows.

**Fix**: Add `CREATE INDEX IF NOT EXISTS idx_era_summaries_days ON era_summaries(start_day, end_day)` to `SIM_INDEX_MIGRATIONS`.

### I12. Negotiation prompts not addressed

`runNegotiationRound()` builds separate AI prompts for coalition negotiations. These prompts also reference political history but are not mentioned in the plan. Not a blocker, but era summaries could improve negotiation quality too.

---

## Confirmed Assumptions

| # | Claim | Verified |
|---|-------|----------|
| C1 | `loop.ts:200` loads all events with `.all()` then slices last 20 | Yes — line 200-202 |
| C2 | `loop.ts:196` loads all bills with `.all()` then filters | Yes — line 196-198 |
| C3 | `recentForContext` only feeds agent prompts | Yes — used only at line 978 |
| C4 | `weeklyOpinionRecalc` does not use `recentForContext` | Yes — it uses `allBills` (cycles.ts:45) |
| C5 | Briefing already has `.limit(60)` | Yes — briefing.ts:57 |
| C6 | `DepthConfig` interface is extensible | Yes — context-depth.ts:15-39 |
| C7 | `AgentContext` interface supports optional fields | Yes — agent.ts:8-33, many optional fields |
| C8 | DDL migration via `CREATE TABLE IF NOT EXISTS` is safe | Yes — consistent with ddl.ts patterns |
| C9 | Simulation loop is single-threaded (no race condition) | Yes — runner enforces sequential `runDay()` |

---

## Improvements

| # | Suggestion |
|---|------------|
| S1 | Use Drizzle query builder instead of raw SQL for all new queries — maintains type safety and column mapping |
| S2 | Consider building era summaries from accumulated `daily_summary` values instead of raw events — cheaper and more coherent |
| S3 | Add `enableEraSummaries` as a separate boolean in `DepthConfig` rather than inferring from `eraSummaryIntervalDays > 0` — clearer intent |

---

## Recommended Implementation Order (revised)

1. **Phase 1a**: Event query optimization (use Drizzle, not raw SQL)
2. **Phase 1c**: Bill ID enforcement in prompt
3. **Phase 1d**: Briefing cap (add `briefingMaxEvents` to `DepthConfig`)
4. **Phase 3a+3b**: Prompt hardening
5. **Phase 2a**: Era summaries table + index + Drizzle schema + db/index.ts export
6. **Phase 2b**: Era summary module (with graceful failure handling)
7. **Phase 2c+2d+2e**: Loop integration + prompt injection + briefing reduction
8. **Phase 4**: Structured output (after SDK version verification + provider-aware code path)

> **Note**: Phase 1b (bill query optimization) is deferred — the current `allBills` loading is not the bottleneck since `advanceBillPipeline` and other functions depend on it. If optimization is needed, filter by `proposed_on_day >= currentDay - 90` rather than by status alone.
