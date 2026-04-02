# 032 — Collect More Real-World Cost & Timing Data

**Status**: open
**Area**: Operations / Docs
**Priority**: Low

## Summary

Initial cost analysis from a 12-day run (Mar 30–31, 2026) revealed that real costs are ~50% lower than estimated ($0.028/day vs $0.055/day at normal context depth). The main reason is lower output tokens than assumed. However, the sample size is small (12 days, no users, no elections, single context depth). More data is needed to validate projections.

## What to Collect

### High Priority
- [ ] **Normal context depth run (20+ days)** — already measured, but longer sample for better averages
- [ ] **Election cycle costs** — negotiation rounds + coalition synthesis (Sonnet) have never been measured
- [ ] **xAI/Grok billing data** — currently only Anthropic dashboard tracked

### Medium Priority
- [ ] **High context depth run (10+ days)** — verify the projected $0.040/day
- [ ] **Low context depth run (10+ days)** — verify the projected $0.020/day
- [ ] **Run with active users** — measure user-driven call costs (Q&A, speeches, applications)
- [ ] **Batch completion times at different hours** — may vary with Anthropic load

### Low Priority
- [ ] **50+ day run** for better statistical averages across all batch types
- [ ] **Token breakdown by task** — need DB ai_calls table query for precise per-task numbers
- [ ] **Cache hit rate tracking** — measure how often prompt caching saves tokens

## How to Collect

1. Run simulation at desired settings for sufficient days
2. Take screenshots of Anthropic dashboard (daily cost chart, week totals, request log)
3. Query ai_calls table: `SELECT day_number, task, SUM(input_tokens), SUM(output_tokens), SUM(cost_usd) FROM ai_calls GROUP BY day_number, task`
4. Check xAI billing dashboard separately
5. Update `docs/operations/real-cost-analysis.md` with new data points

## Current Data Points

| Run | Days | Context | Preset | Cost/Day | Source |
|-----|------|---------|--------|----------|--------|
| 2026-03-31 | 12 | normal | fast→ultra-fast | $0.028 | Anthropic dashboard |

## Affected Files

- `docs/operations/analysis.md` — add new data sections
- `docs/operations/costs.md` — refine estimates
- `docs/operations/timing.md` — add new timing observations
- `packages/web/src/pages/SimulationCosts.tsx` — update displayed numbers

## Notes

- The Anthropic dashboard "Daily token cost" chart is the primary data source
- The week view shows total input/output tokens filtered by model
- Cache behavior (reads/writes) visible in individual request detail popups
- Rate-limited requests counter should stay at 0 — if it increases, we're hitting Tier 2 limits
