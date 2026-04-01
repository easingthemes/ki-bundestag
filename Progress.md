# Progress: Progressive Summarization with Case Facts Preservation

**Plan**: [docs/plans/progressive-summarization.md](docs/plans/progressive-summarization.md)
**Goal**: Extend the existing era summary system with structured case facts (coalition, economy, bills, elections, crises) that survive all summarization passes, so party agents retain access to specific historical facts as context compresses.
**Validation**: `npm run typecheck && npm test`

---

### Step 1: Define `EraCaseFacts` type and widen `eraSummaries` on `AgentContext`

- **Status**: pending
- **Files**: `packages/types/src/types/agent.ts`

### Step 2: Add `case_facts` column to `era_summaries` table + migration

- **Status**: pending
- **Files**: `packages/engine/src/db/schema-sim.ts`, `packages/engine/src/db/ddl.ts`

### Step 3: Implement `extractCaseFacts()` function

- **Status**: pending
- **Files**: `packages/engine/src/simulation/era-summary.ts`

### Step 4: Update storage — `processEraSummaryResult` and `getEraSummaries`

- **Status**: pending
- **Files**: `packages/engine/src/simulation/era-summary.ts`

### Step 5: Prompt integration — `formatCaseFacts` + P1.25 rendering

- **Status**: pending
- **Files**: `packages/engine/src/agent/prompt.ts`, `packages/engine/src/agent/context-depth.ts`

### Step 6: Wire case facts through simulation loop

- **Status**: pending
- **Files**: `packages/engine/src/simulation/loop.ts`

### Step 7: Enhance summarization prompt with case facts context

- **Status**: pending
- **Files**: `packages/engine/src/simulation/era-summary.ts`
