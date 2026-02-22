# Refactor Plan: Engine — `loop.ts` Surgery

## TL;DR

[packages/engine/src/simulation/loop.ts](../../packages/engine/src/simulation/loop.ts) is 2137 lines. It is the 13-step orchestrator for `runDay()`, but several of those steps have significant inline logic rather than delegating to dedicated modules. Extract 4 pieces of logic into new or existing modules; `loop.ts` becomes a clean orchestrator of named function calls, targeting ~700–900 lines.

## What Stays in `loop.ts`

- The overall `runDay()` function and its 13-step structure
- Step sequencing, conditional branching (election phase checks, budget day checks, etc.)
- Loading full simulation state at day start
- Saving state and persisting events at day end
- Calls to existing module functions (already well-delegated)

## What Gets Extracted

| Inline logic | Target location | Approx. lines |
|---|---|---|
| Bill pipeline stage-advancement (proposed → reading stages → passed/rejected) | new `simulation/bill-pipeline.ts` | ~200L |
| Presidential veto probability check on passing bills | new `simulation/veto.ts` | ~50L |
| Approval drift per-party loop | existing `simulation/opinion.ts` | ~40L |
| Media sentiment influence application | existing `simulation/media.ts` | ~30L |

---

## Steps

### 1. Create `src/simulation/bill-pipeline.ts`

Extract the inline bill reading-stage advancement block from `loop.ts`:
- Transitions: `proposed` → `first_reading` → `committee` → `second_reading` → `third_reading`
- Government bills skip `first_reading` step
- On `third_reading` completion: call `tallyBillVotes()` from existing [voting.ts](../../packages/engine/src/simulation/voting.ts)

Export:
```
export function advanceBillPipeline(db: Database, day: number, parties: Party[]): void
```

In `loop.ts`, replace the inline block with: `advanceBillPipeline(db, day, parties)`

### 2. Create `src/simulation/veto.ts`

Extract the presidential veto probability check that currently lives inline in `loop.ts` after a bill passes third reading:
- 3–16% veto probability based on bill economic impact magnitude
- On veto: bill stays `rejected`, sets `vetoedByPresident: true`, proposing party −0.5 approval
- Logs a simulation event

Export:
```
export function checkPresidentialVeto(
  db: Database,
  bill: Bill,
  parties: Party[]
): boolean   // returns true if vetoed
```

In `loop.ts`, replace the inline block with: `const vetoed = checkPresidentialVeto(db, bill, parties)`

### 3. Consolidate approval drift into `src/simulation/opinion.ts`

[opinion.ts](../../packages/engine/src/simulation/opinion.ts) already exports `updateApproval()` and `updateSentiment()`. `loop.ts` currently has an inline loop that applies approval drift and sentiment mean-reversion per-party rather than calling these functions cleanly.

- Move the per-party drift loop body into `opinion.ts` as:
  ```
  export function applyDailyApprovalDrift(db: Database, parties: Party[]): void
  ```
- In `loop.ts`, replace the inline loop with: `applyDailyApprovalDrift(db, parties)`

### 4. Consolidate media sentiment into `src/simulation/media.ts`

[media.ts](../../packages/engine/src/simulation/media.ts) generates articles but the sentiment influence application (±0.5/day cap) is currently inline in `loop.ts` step 11.

- Move into `media.ts` as:
  ```
  export function applyMediaSentiment(db: Database, parties: Party[]): void
  ```
- In `loop.ts`, replace the inline block with: `applyMediaSentiment(db, parties)`

### 5. Review remaining inline logic in `loop.ts`

After steps 1–4, scan remaining inline sections in `loop.ts` for any additional extractable logic:
- Constitutional challenge resolution logic: check if it already delegates cleanly to [constitutional-court.ts](../../packages/engine/src/simulation/constitutional-court.ts). If not, extract.
- Confidence vote tally: should already call `tallyConfidenceVotes()` from [confidence-votes.ts](../../packages/engine/src/simulation/confidence-votes.ts). Verify no inline logic.

### 6. Add `.js` extension imports in new files

All new files in `packages/engine/src/simulation/` must import from siblings using `.js` extensions:
```typescript
import { tallyBillVotes } from "./voting.js";
import { getDb } from "../db/connection.js";
```

## Expected Line Count Reduction

| File | Before | After |
|------|--------|-------|
| `loop.ts` | 2137 | ~700–900 |
| `bill-pipeline.ts` | (new) | ~200 |
| `veto.ts` | (new) | ~80 |
| `opinion.ts` | ~58 | ~100 |
| `media.ts` | ~154 | ~185 |

## Verification

```bash
npm run typecheck
npm run simulate 1   # run one sim day, check full output for errors
npm run simulate 3   # run three days to exercise election/budget paths
```

All simulation events, DB writes, and console output must be identical to pre-refactor behaviour.
