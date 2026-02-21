# Progress

## Summary
- **Status**: completed (2 features)
- **Date**: 2026-02-21
- **Changes**:
  1. Timing presets — 4 speed modes, event queue, notifications, feature gating, migration script (see `docs/time.md` for details)
  2. AI provider error handling — per-provider circuit breaker, clean error logging, runner auto-pause on limit

## Feature: Timing Presets
- **Status**: done
- **Files**: See `docs/time.md` for full step-by-step breakdown
- **Result**: 4 simulation speed presets (ultra-fast/fast/normal/slow), cycle intervals via TIME_CONFIG, event queue + notifications, participatory feature gating, Admin UI selector, migration script

## Feature: AI Provider Error Handling
- **Status**: done
- **Files**: `packages/engine/src/agent/client.ts`, `agent/index.ts`, `agent/party-agent.ts`, `runner-auto.ts`, `engine/index.ts`, + 7 simulation callers (media, polls, questions, interpellations, referendums, negotiations, summary, internal-proposals)
- **Result**: Per-provider circuit breaker in `callAI()` — detects API usage limit errors, caches the provider as unavailable, skips all subsequent calls without hitting the API. `AIProviderLimitError` class for typed error handling. All 8 callers catch it and log a short warning instead of full stack traces. Runner pauses when all providers are limited.

## DB Restore
- **Date**: 2026-02-21
- Restored backup `simulation.db.backup-2026-02-21T17-48-16-953Z` (day 112, 3877 events, 132 bills)
- Ran `npm run migrate` to add `timing_preset` column and `event_queue` table
