# Progress: Progressive Summarization with Case Facts Preservation

**Plan**: [docs/plans/progressive-summarization.md](docs/plans/progressive-summarization.md)
**Goal**: Extend the existing era summary system with structured case facts (coalition, economy, bills, elections, crises) that survive all summarization passes, so party agents retain access to specific historical facts as context compresses.
**Validation**: `npm run typecheck && npm test`

---

### Step 1: Define `EraCaseFacts` type and widen `eraSummaries` on `AgentContext`

- **Status**: done
- **Files**: `packages/types/src/types/agent.ts`
- **Result**: Added `EraCaseFacts` interface and widened `eraSummaries` field on `AgentContext`. Typecheck passes (6/6).

### Step 2: Add `case_facts` column to `era_summaries` table + migration

- **Status**: done
- **Files**: `packages/engine/src/db/schema-sim.ts`, `packages/engine/src/db/ddl.ts`
- **Result**: Added `caseFacts` JSON column to Drizzle schema, DDL, and column migration. Typecheck passes (6/6).

### Step 3: Implement `extractCaseFacts()` function

- **Status**: done
- **Files**: `packages/engine/src/simulation/era-summary.ts`
- **Result**: Added `extractCaseFacts()` querying economy, coalition, government, parties, bills, elections, crises, and government changes. Typecheck passes (6/6).

### Step 4: Update storage — `processEraSummaryResult` and `getEraSummaries`

- **Status**: done
- **Files**: `packages/engine/src/simulation/era-summary.ts`
- **Result**: `getEraSummaries` now returns `caseFacts?`, `processEraSummaryResult` accepts and persists `caseFacts`. Typecheck passes (6/6).

### Step 5: Prompt integration — `formatCaseFacts` + P1.25 rendering

- **Status**: done
- **Files**: `packages/engine/src/agent/prompt.ts`, `packages/engine/src/agent/context-depth.ts`
- **Result**: Added `formatCaseFacts` compact renderer, `maxEraSummaryTokens` config (500/1500/3000), and budget-aware P1.25 rendering with recent-3-eras priority. Typecheck passes (6/6).

### Step 6: Wire case facts through simulation loop

- **Status**: done
- **Files**: `packages/engine/src/simulation/loop.ts`
- **Result**: Extract case facts at era boundary and pass to `processEraSummaryResult`. Typecheck passes (6/6).

### Step 7: Enhance summarization prompt with case facts context

- **Status**: done
- **Files**: `packages/engine/src/simulation/era-summary.ts`, `packages/engine/src/simulation/loop.ts`
- **Result**: `buildEraSummaryBatchRequest` now accepts `caseFacts` and includes economy/coalition/bills/elections/crises in AI prompt context. Loop passes case facts to both builder and processor. Typecheck 6/6, all 187 tests pass.
