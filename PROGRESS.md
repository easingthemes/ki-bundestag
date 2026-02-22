# Progress: Engine — `loop.ts` Surgery

**Goal**: Extract 4 pieces of inline logic from `loop.ts` into dedicated modules so `loop.ts` becomes a clean orchestrator targeting ~700–900 lines.

**Ref**: docs/plans/05-engine-loop.md

---

### Step 1: Create `src/simulation/bill-pipeline.ts`

- **Status**: done
- **Files**: `packages/engine/src/simulation/bill-pipeline.ts` (created), `packages/engine/src/simulation/loop.ts` (updated)
- **Result**: Extracted ~215 lines of bill pipeline logic (stages 1–4) into new module; loop.ts replaced with 4-line delegate. Removed unused `assignCommittee`, `generateRecommendation`, `tallyAmendmentVotes`, `applyAmendmentToBill` imports from loop.ts. Typecheck passed.

### Step 2: Create `src/simulation/veto.ts`

- **Status**: done
- **Files**: `packages/engine/src/simulation/veto.ts` (created), `packages/engine/src/simulation/loop.ts` (updated)
- **Result**: Extracted presidential veto logic (~20 lines) into new module; loop.ts replaced with 5-line delegate. Removed `shouldPresidentVeto` from budget.js import in loop.ts. Typecheck passed.

### Step 3: Consolidate approval drift into `src/simulation/opinion.ts`

- **Status**: pending

### Step 4: Consolidate media sentiment into `src/simulation/media.ts`

- **Status**: pending

### Step 5: Review remaining inline logic in `loop.ts`

- **Status**: pending

### Step 6: Add `.js` extension imports in new files

- **Status**: pending (covered inline in steps 1–4)
