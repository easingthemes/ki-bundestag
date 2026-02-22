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

- **Status**: done
- **Files**: `packages/engine/src/simulation/opinion.ts` (updated), `packages/engine/src/simulation/loop.ts` (updated)
- **Result**: Added `applyDailyApprovalDrift(parties)` to opinion.ts consolidating approval drift + membership bonus loop; loop.ts replaced 18-line block with single call. Removed `count`, `gte`, `applyApprovalDrift`, `membershipBonus` from loop.ts imports. Typecheck passed.

### Step 4: Consolidate media sentiment into `src/simulation/media.ts`

- **Status**: done
- **Files**: `packages/engine/src/simulation/media.ts` (updated), `packages/engine/src/simulation/loop.ts` (updated)
- **Result**: Added `applyMediaSentiment(currentDay, sentiment, stateId)` to media.ts; loop.ts replaced 15-line block with single call. Removed `mediaSentimentImpact` from loop.ts import. Typecheck passed.

### Step 5: Review remaining inline logic in `loop.ts`

- **Status**: pending

### Step 6: Add `.js` extension imports in new files

- **Status**: pending (covered inline in steps 1–4)
