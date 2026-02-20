# Progress — Visitor Simulation Script

## Summary

- **Status**: completed (5 steps)
- **Date**: 2026-02-21
- **Changes**:
  - Created `scripts/simulate-visitors.ts` — Playwright-based script launching 5 concurrent Chrome visitors
  - Added `simulate:visitors` npm script + `playwright` devDependency
  - 8 visitor actions: register, ask question, vote poll, vote referendum, submit proposal, vote proposal, signal bill, browse
  - Hybrid approach: direct API calls for reliability, browser navigation for visual feedback

## Steps

### Step 1: Create simulation script infrastructure

- **Status**: done
- **Files**: `scripts/simulate-visitors.ts`, `package.json`
- **Result**: Playwright launches Chrome with 5 isolated browser contexts; `npm run simulate:visitors [iterations]`

### Step 2: Implement user registration + party joining flow

- **Status**: done
- **Result**: Each visitor registers via API, joins a party, sets token in browser localStorage for UI sync

### Step 3: Implement browsing + interactive actions

- **Status**: done
- **Result**: 6 interactive actions (questions, polls, referendums, proposal votes, bill signals, browsing) with skip/fail logging

### Step 4: Implement proposal submission

- **Status**: done
- **Result**: Members submit proposals with German titles/descriptions; one-per-visitor guard prevents duplicates

### Step 5: Orchestrate 5 concurrent visitors with iteration loop

- **Status**: done
- **Result**: Promise.all concurrency, staggered starts, 1-min minimum per iteration with browse fill, SIGINT cleanup

## Notes

- Requires `dev:web` and `dev:api` running before launch
- Pre-flight health check fails fast with clear error if servers are down
- Browser stays open after completion for manual inspection (Ctrl+C to close)
