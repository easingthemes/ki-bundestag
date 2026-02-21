# Progress

## Summary
- **Status**: completed (7 steps)
- **Date**: 2026-02-21
- **Changes**:
  1. Timing config module (`timing.ts`) with 4 presets, cycle intervals, event classification, feature availability matrix
  2. All cycle intervals (polls, budgets, elections, referendums) sourced from TIME_CONFIG instead of hardcoded values
  3. Runner preset support — reads `timing_preset` from DB, applies per-preset delays and night pause
  4. Event queue + notification system with 5 API endpoints
  5. Participatory feature gating — 9 POST/DELETE endpoints return 403 in watch-only modes
  6. UI — preset selector on Admin, watch-only banner on Dashboard, notification bell + Notifications page
  7. Migration script for existing simulations (`npm run migrate:timing`)

## Goal
Add simulation speed presets (ultra-fast/fast/normal/slow) with real-world day mapping (1 sim day = 1 calendar day, 1461 days per term), day/night scheduling, and event queuing.

## Steps

### Step 1: Timing configuration module + DB schema
- **Status**: done
- **Files**: Created `packages/engine/src/simulation/timing.ts`; modified `schema.ts`, `seed.ts`, `simulation/index.ts`
- **Result**: TIME_CONFIG with 4 presets, cycle intervals, event classification, feature availability matrix, 8 helpers. DB: `timing_preset` column, `event_queue` table, `notifications` table. Seed defaults updated.

### Step 2: Update cycle intervals and election timing
- **Status**: done
- **Files**: Modified `cycles.ts`, `elections.ts`, `polls.ts`, `referendums.ts`, `loop.ts`, `index.ts`
- **Result**: All cycle intervals sourced from TIME_CONFIG. `isWeeklyDay` kept as deprecated alias. Zero hardcoded values remain.

### Step 3: Runner preset support + delay logic
- **Status**: done
- **Files**: Rewrote `runner-auto.ts`
- **Result**: Preset-aware delay loop (0/7min/30min/1.5h), slow-mode night pause (60s poll), 5s sleep chunks for responsive SIGINT.

### Step 4: Night mode + event queue system
- **Status**: done
- **Files**: Created `event-queue.ts`; modified `simulation/index.ts`, `engine/index.ts`, `api/index.ts`
- **Result**: Event queue + notification CRUD + morning summary. 5 API endpoints. Runner-level night control; per-event queueing deferred.

### Step 5: Participatory feature gating
- **Status**: done
- **Files**: Modified `engine/index.ts`, `api/index.ts`
- **Result**: `requireParticipatory()` guard with 10s TTL cache. 9 endpoints gated. Preset endpoints added.

### Step 6: UI — mode selector, watch-only banner, notifications
- **Status**: done
- **Files**: Modified `api.ts`, `colors.ts`, `Admin.tsx`, `Dashboard.tsx`, `main.tsx`; created `Notifications.tsx`
- **Result**: Admin preset selector, Dashboard watch-only banner, notification bell with unread count, Notifications page.

### Step 7: Migration script for existing simulations
- **Status**: done
- **Files**: Created `scripts/migrate-timing.ts`; modified `package.json`
- **Result**: Idempotent migration: adds columns/tables, sets preset to `'normal'`, rescales `nextElectionDay` 120→1461.

## Future Work
- Per-event queueing within `runDay()` (currently runner-level only)
- Multi-user coordination in Slow mode
- MdB features (speeches, bill voting, amendments) — feature matrix placeholders exist
- Admin auth for `POST /api/simulation/preset`

## Reference
Full design document: `docs/timing-presets-plan.md`
