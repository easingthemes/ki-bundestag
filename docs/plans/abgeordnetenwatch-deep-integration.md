# Plan: Abgeordnetenwatch Deep Integration (#031)

**Goal**: Expand abgeordnetenwatch API usage from polls-only to include dynamic parliament periods, voting records, real committee names, and citizen Q&A topics.

**Reference**: `docs/abgeordnetenwatch-api-reference.md`

## Changes

### Phase 1: Dynamic Parliament Period Discovery
**File**: `packages/engine/src/simulation/knowledge-fetch.ts`

Replace hardcoded `ABGEORDNETENWATCH_URLS` with dynamic period discovery:
- New function `fetchCurrentParliamentPeriod()` queries `/api/v2/parliament-periods?parliament=5&type=legislature&sort_by=id&sort_order=desc&range_end=1`
- Caches result in module-level variable (period ID rarely changes)
- Falls back to hardcoded 165/132 on failure

### Phase 2: Voting Records Enrichment
**File**: `packages/engine/src/simulation/knowledge-fetch.ts`

Add `fetchAbgeordnetenwatchVotes()`:
- For each fetched poll, query `/api/v2/votes?poll={id}&range_end=1000`
- Aggregate votes by Fraktion (party)
- Add per-party voting breakdown to `RawParliamentaryItem.detail`
- Enriches the digest prompt with real party discipline data

### Phase 3: Real Committee Names
**File**: `packages/engine/src/simulation/knowledge-fetch.ts`, `packages/engine/src/simulation/bill-pipeline.ts`

- New function `fetchCommitteeNames()` queries `/api/v2/committees?parliament_period={current}&range_end=50`
- Store committee names in DB (new `real_world_knowledge` rows with category `committee`)
- `bill-pipeline.ts` reads real committee names when available, falls back to hardcoded

### Phase 4: Citizen Q&A Topics
**File**: `packages/engine/src/simulation/knowledge-fetch.ts`

- New function `fetchCitizenQuestions()` queries recent questions
- Extract question topics/themes
- Add to digest as "citizen concern" category for question generation inspiration

### Phase 5: Side Job Content
**File**: `packages/engine/src/simulation/knowledge-fetch.ts`

- New function `fetchSidejobs()` queries recent sidejobs
- Feed notable entries to media article generation as scandal inspiration

## Validation

```bash
npx turbo run typecheck
npm test
```
