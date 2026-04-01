# Progressive Summarization with Case Facts Preservation

## Current State

The codebase **already has a working era summary system**:

- **`packages/engine/src/db/schema-sim.ts`**: `eraSummaries` table (`id`, `startDay`, `endDay`, `summary`, `createdAt`)
- **`packages/engine/src/simulation/era-summary.ts`**: `shouldGenerateEraSummary`, `buildEraSummaryBatchRequest`, `processEraSummaryResult`, `getEraSummaries`
- **`packages/engine/src/agent/context-depth.ts`**: `enableEraSummaries` and `eraSummaryIntervalDays` configs (60-day intervals for normal/high depth)
- **`packages/engine/src/agent/prompt.ts`**: Era summaries injected at Priority 1.25 (between core state and briefing)
- **`packages/engine/src/simulation/loop.ts`** (lines ~979-997): Era summary generation and injection into `AgentContext`
- **`packages/types/src/types/agent.ts`**: `eraSummaries` field on `AgentContext`

## What's Missing

The current era summary is a single AI-generated narrative paragraph (3-5 sentences). It does **not** preserve structured factual state — coalition compositions, economic snapshots, bill passage records, government compositions, election outcomes, or crisis resolutions. As eras accumulate, agents lose access to specific facts needed for consistent decision-making.

## Implementation Steps

### Step 1 — Types (`packages/types/src/types/agent.ts`)

Define a new `EraCaseFacts` interface:

```typescript
export interface EraCaseFacts {
  economy: {
    budget: number;
    unemployment: number;
    inflation: number;
    gdpGrowth: number;
    publicSentiment: number;
  };
  coalitionPartyIds: string[];
  government?: {
    chancellorName: string;
    chancellorPartyId: string;
  };
  partyApprovals: Record<string, number>;
  partySeats: Record<string, number>;
  billsPassed: Array<{ id: string; title: string; category: string }>;
  billsRejected: Array<{ id: string; title: string }>;
  elections: Array<{ reason: string; day: number; outcome?: string }>;
  crises: Array<{ name: string; severity: string; resolved: boolean }>;
  governmentChanges: Array<{ type: string; day: number; description: string }>;
}
```

Widen the existing `eraSummaries` field on `AgentContext`:

```typescript
eraSummaries?: Array<{
  startDay: number;
  endDay: number;
  summary: string;
  caseFacts?: EraCaseFacts;
}>;
```

### Step 2 — Schema + Migration

**`packages/engine/src/db/schema-sim.ts`**: Add `caseFacts` column to `eraSummaries` table:
- `case_facts TEXT` (JSON, nullable for backward compat with existing rows)

**`packages/engine/src/db/ddl.ts`**: Add to `SIM_COLUMN_MIGRATIONS`:
- `{ table: "era_summaries", sql: "ALTER TABLE era_summaries ADD COLUMN case_facts TEXT" }`

The existing `migrateDatabase()` handles duplicate column errors gracefully. Old rows get `NULL` case facts — acceptable since their narrative summaries still provide context.

### Step 3 — Case Facts Extraction (`packages/engine/src/simulation/era-summary.ts`)

New function `extractCaseFacts(startDay: number, endDay: number): EraCaseFacts`

Queries:
1. **Economy**: Read current `national_state` row (budget, unemployment, inflation, gdpGrowth, publicSentiment)
2. **Coalition**: Read `national_state.coalitionParties` JSON field
3. **Government**: Query `government` table for active government (`active = true`)
4. **Party approvals/seats**: Query `parties` table for all `approvalRating` and `seatCount`
5. **Bills passed**: Query `bills` where `status = 'passed'` and `status_changed_on_day` within `[startDay, endDay]`
6. **Bills rejected**: Same but `status = 'rejected'`
7. **Elections**: Query `elections` where `election_day` within `[startDay, endDay]`
8. **Crises**: Query `crises` where `start_day` within `[startDay, endDay]`
9. **Government changes**: Query `government` where `formed_on_day` or `dissolved_on_day` within `[startDay, endDay]`

All queries use existing Drizzle schema objects. No new DB access patterns.

### Step 4 — Storage Updates (`packages/engine/src/simulation/era-summary.ts`)

**`processEraSummaryResult`**: Accept `caseFacts: EraCaseFacts` parameter, store `JSON.stringify(caseFacts)` in the new `case_facts` column.

**`getEraSummaries`**: Add `caseFacts` to SELECT, parse JSON on retrieval. Return type becomes `Array<{ startDay, endDay, summary, caseFacts? }>`.

### Step 5 — Prompt Integration (`packages/engine/src/agent/prompt.ts`)

New helper `formatCaseFacts(facts: EraCaseFacts): string` producing a compact one-liner per era:

```
State: Budget 350B, Unemp 5.2%, Coalition: SPD+Grüne+FDP, Chancellor: Scholz (SPD), 3 bills passed
```

Update Priority 1.25 rendering:

```
HISTORICAL CONTEXT (compressed summaries of past eras):
  [Days 1-60]: <narrative>
    State: Budget 350B, Unemp 5.2%, Coalition: SPD+Grüne+FDP, Chancellor: Scholz (SPD), 3 bills passed
  [Days 61-120]: <narrative>
    State: Budget 345B, Unemp 5.5%, Coalition: SPD+Grüne+FDP, 5 bills passed, 1 election
```

Token budget guard: if total era section exceeds threshold (e.g., 2000 tokens), drop oldest eras' case facts lines but keep narratives. Most recent 3 eras always get full case facts.

Optionally add `maxEraSummaryTokens` to `DepthConfig` in `context-depth.ts` (low: 500, normal: 1500, high: 3000).

### Step 6 — Loop Wiring (`packages/engine/src/simulation/loop.ts`)

Update the era summary block (~lines 979-996):
1. After `buildEraSummaryBatchRequest`, call `extractCaseFacts(startDay, endDay)`
2. Pass case facts to `processEraSummaryResult`
3. Include case facts in `ctx.eraSummaries` for prompt building

### Step 7 — Enhanced Summarization Prompt (optional)

In `buildEraSummaryBatchRequest`, include extracted case facts as context so the AI narrative can reference specific numbers. The case facts themselves are DB-sourced, not AI-generated — only the narrative is AI-written.

## Implementation Sequence

1. Types first (Step 1) — no dependencies
2. Schema + DDL (Step 2) — no code dependencies
3. Extraction function (Step 3) — depends on types
4. Storage updates (Step 4) — depends on schema + types
5. Prompt integration (Step 5) — depends on types
6. Loop wiring (Step 6) — depends on all above
7. Test: run simulation past 60 days, verify era summaries contain case facts and prompt renders compact state lines

## Files Changed

| File | Change |
|------|--------|
| `packages/types/src/types/agent.ts` | Add `EraCaseFacts` interface, widen `eraSummaries` type |
| `packages/engine/src/db/schema-sim.ts` | Add `case_facts` column to `eraSummaries` table |
| `packages/engine/src/db/ddl.ts` | Add column migration entry |
| `packages/engine/src/simulation/era-summary.ts` | Add `extractCaseFacts`, update `processEraSummaryResult` and `getEraSummaries` |
| `packages/engine/src/agent/prompt.ts` | Add `formatCaseFacts`, update P1.25 rendering |
| `packages/engine/src/agent/context-depth.ts` | Optional: add `maxEraSummaryTokens` to `DepthConfig` |
| `packages/engine/src/simulation/loop.ts` | Wire case facts through era summary flow |

## Risks & Mitigations

- **Token budget pressure**: Each era's case facts adds ~80-120 tokens. After 10 eras (600 days), that's 800-1200 tokens. Mitigated by trimming oldest eras' case facts.
- **Schema migration**: ALTER TABLE is additive and nullable — no data loss risk. Existing rows get `NULL` case facts.
- **Fact accuracy**: `extractCaseFacts` reads current DB state at era boundary, not historical snapshots. For bills/crises/elections, day-range filters ensure correctness.

## Nice-to-Have (Deferred)

- **Event-driven era breaks**: Force an era boundary after elections or government formation, even if <60 days since last summary. Require at least 7 days since last summary to avoid thrashing.
- **Case facts backfill**: Regenerate case facts for existing era summaries using event logs.
