# 038 — Batch API latency monitoring

**Status**: open
**Area**: Engine / Operations
**Priority**: Medium

## Description

When Anthropic's batch API is under load, batch completion times increase significantly (from ~2-4 min to 10-20+ min per batch). This directly impacts sim throughput:

- **Ultra-fast mode**: normally ~10-15 min/day, can balloon to 20-40 min/day
- **Fast mode**: normally ~17-22 min/day, can reach 30-50+ min/day

The simulation doesn't "stuck" — it just takes longer. But it's hard to distinguish "slow but working" from "actually stuck" without monitoring.

## Current mitigations (this PR)

- Increased default `BATCH_TIMEOUT` from 3600s to 5400s (90 min)
- Added slow-batch warning log at poll #10 (~5 min elapsed)
- Extended adaptive poll ramp: 15s → 30s → 45s → 60s (was 15s → 30s → 60s)
- Updated timing preset comments with realistic API latency ranges

## Future monitoring ideas

- [ ] Track per-day wall-clock time in DB (not just AI call latency)
- [ ] Alert in GitHub Actions workflow if a day takes >30 min
- [ ] Dashboard widget showing batch API health (avg poll count, avg completion time)
- [ ] Separate `[Timing]` log for total batch wait time vs sim processing time
- [ ] Consider fallback to synchronous calls if batch API response is consistently >15 min (loses 50% discount but faster)

## Affected files

- `packages/engine/src/agent/batch-client.ts` — polling config, timeout, warning log
- `packages/engine/src/simulation/timing.ts` — preset docs with realistic estimates
- `.github/workflows/simulate.yml` — may need timeout adjustments

## Observed behavior (Day 84-85, 2026-04-01)

- MdB batches: 483s, 242s, 1025s, 306s latency
- Agent batches: up to 16 poll cycles before completing
- VALIDATION_FAIL rate: 1.4% (normal, handled by abstain fallback)
- Sim was NOT stuck — day 85 was mid-batch when logs were captured
