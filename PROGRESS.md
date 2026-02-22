# Progress

## Summary

- **Status**: completed (16 steps)
- **Date**: 2026-02-22
- **Changes**: Split `packages/api/src/index.ts` (2826L monolith) into 10 domain routers, middleware, and mappers. `index.ts` → 45-line bootstrap.

## Goal

Split `packages/api/src/index.ts` (2826-line monolith, 87 routes) into 10 domain Express routers, middleware, and mapper modules. `index.ts` becomes a thin ~80-line bootstrap.

## Source

docs/plans/01-api-refactor.md

## Steps

### Step 1: Create `src/middleware/auth.ts`

- **Status**: done
- **Files**: `packages/api/src/middleware/auth.ts`
- **Result**: Extracted `sessionTracking()`, `getTimingPreset()`, `requireParticipatory()`, `getUserToken()`. Typecheck pass.

### Step 2: Create `src/middleware/index.ts`

- **Status**: done
- **Files**: `packages/api/src/middleware/index.ts`
- **Result**: Barrel re-export from `./auth.js`. Typecheck pass.

### Step 3: Create `src/mappers/party.ts`

- **Status**: done
- **Files**: `packages/api/src/mappers/party.ts`
- **Result**: Extracted `mapParty()` + `getMemberCounts()`. Typecheck pass.

### Step 4: Create `src/mappers/bill.ts`

- **Status**: done
- **Files**: `packages/api/src/mappers/bill.ts`
- **Result**: Extracted `mapBill()`. Typecheck pass.

### Step 5: Create `src/mappers/index.ts`

- **Status**: done
- **Files**: `packages/api/src/mappers/index.ts`
- **Result**: Barrel re-export from party + bill. Typecheck pass.

### Step 6: Create `src/routes/parties.ts`

- **Status**: done
- **Files**: `packages/api/src/routes/parties.ts` (336L)
- **Result**: 11 party + proposal routes. Includes `mapProposal()` helper. Smoke test pass.

### Step 7: Create `src/routes/bills.ts`

- **Status**: done
- **Files**: `packages/api/src/routes/bills.ts` (334L)
- **Result**: 9 bill routes (signals, speeches, mdb-votes, amendments). Smoke test pass.

### Step 8: Create `src/routes/elections.ts`

- **Status**: done
- **Files**: `packages/api/src/routes/elections.ts` (94L)
- **Result**: 5 election + government routes. Includes `mapElection()`, `mapGovernmentRow()`. Smoke test pass.

### Step 9: Create `src/routes/simulation.ts`

- **Status**: done
- **Files**: `packages/api/src/routes/simulation.ts` (464L)
- **Result**: 13 simulation/state/calendar/injection routes. Smoke test pass.

### Step 10: Create `src/routes/parliament.ts`

- **Status**: done
- **Files**: `packages/api/src/routes/parliament.ts` (401L)
- **Result**: Motions, interpellations, confidence-votes, constitutional-court, fraktionen, crises routes. 6 mapper functions.

### Step 11: Create `src/routes/content.ts`

- **Status**: done
- **Files**: `packages/api/src/routes/content.ts` (439L)
- **Result**: Media, questions, polls, referendums routes. 4 mapper functions.

### Step 12: Create `src/routes/users.ts`

- **Status**: done
- **Files**: `packages/api/src/routes/users.ts` (441L)
- **Result**: Login, register, /me, join/leave, notifications. Smoke test pass.

### Step 13: Create `src/routes/seats.ts`

- **Status**: done
- **Files**: `packages/api/src/routes/seats.ts` (140L)
- **Result**: 4 seat routes (apply, my-seat, party roster, available).

### Step 14: Create `src/routes/budget.ts`

- **Status**: done
- **Files**: `packages/api/src/routes/budget.ts` (49L)
- **Result**: 2 budget routes + `mapBudgetRow()`. Smoke test pass.

### Step 15: Create `src/routes/admin.ts`

- **Status**: done
- **Files**: `packages/api/src/routes/admin.ts` (108L)
- **Result**: POST /api/simulation/preset + GET /api/admin/analytics.

### Step 16: Rewrite `src/index.ts`

- **Status**: done
- **Files**: `packages/api/src/index.ts` (45L)
- **Result**: Thin bootstrap: cors, json, session middleware, 10 router mounts. Typecheck + build + smoke test pass.

## Notes

- Pre-existing bug in admin analytics: raw SQL uses `displayName`/`partyId` but DB columns are `display_name`/`party_id` — not in scope for this refactor
