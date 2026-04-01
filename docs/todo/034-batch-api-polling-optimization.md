# 034 — Batch API Polling Optimization

**Status**: done
**Area**: Engine / Agent
**Priority**: Medium

## Problem

Production logs show highly variable Anthropic Batch API completion times:
- Most batches complete in 2-3 polling cycles (~2-3 min)
- Some batches take 50+ polling cycles (~50+ min), particularly on Days 23 and 31
- Current polling interval is fixed at 60s with 3600s timeout

This creates unpredictable day durations in ultra-fast mode where batch time dominates wall-clock time.

## Observations

- Long-polling batches seem to correlate with larger prompt sizes (more context = more processing)
- No correlation with time of day observed yet (need more data from `timing-report` workflow)
- Batch size is always small (5-6 requests per party batch) — not a throughput issue

## Proposed Improvements

### 1. Adaptive polling interval
- Start with 15s polls for the first 3 checks (catch fast batches quickly)
- Ramp up to 30s after 3 polls, then 60s after 10 polls
- Reduces average wait for fast batches by ~45s

### 2. Batch timing logging to DB
- Record `batch_submitted_at` and `batch_completed_at` timestamps
- Calculate actual batch processing time (not just latency estimate)
- Enables `timing-report` workflow to show accurate batch durations

### 3. Batch size experimentation
- Currently 5 Anthropic + 1 xAI sequential per party batch
- Test splitting into smaller batches (e.g., 3+3) to see if smaller batches complete faster
- Or merging party + briefing batches to reduce total batch submissions per day

## Affected Files

- `packages/engine/src/agent/batch-client.ts` — polling logic, timing records
- `packages/engine/src/agent/cost-tracker.ts` — new batch timing fields
- `packages/engine/src/db/schema-sim.ts` — optional: batch_timing table

## How to Measure

Run `timing-report` and `model-performance` workflow checks before and after changes.
Compare batch duration distribution buckets.

## Cost Impact

No additional API cost — only changes polling behavior.
