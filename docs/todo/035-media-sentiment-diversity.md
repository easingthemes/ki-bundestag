# 035 — Media Sentiment Stuck at +0.3 / Lacks Diversity

**Status**: open
**Area**: Engine / Simulation
**Priority**: Low

## Problem

Production logs show media sentiment impact stuck at approximately +0.3 for most simulation days. This suggests:
- Media articles are consistently positive regardless of political events
- Sentiment calculation doesn't vary meaningfully based on content
- Approval ratings may drift uniformly upward without realistic negative press cycles

## Expected Behavior

Media sentiment should vary based on:
- Crises (negative press during Energiekrise, Hochwasser, etc.)
- Failed bills / vetoes (negative for sponsoring party)
- Successful legislation (positive for governing coalition)
- Scandals / confidence votes (strongly negative)

## Investigation Needed

1. Check `applyMediaSentiment()` in `media.ts` — is sentiment always positive?
2. Check media article generation prompt — does it ask for balanced/critical coverage?
3. Check if outlet bias (biased outlets) actually produces varied sentiment scores
4. Run `model-performance` check filtered to `media` task to see token patterns

## Affected Files

- `packages/engine/src/simulation/media.ts` — sentiment calculation, prompt
- `packages/engine/src/agent/prompt.ts` — media generation prompt

## Metrics

After fix, sentiment impact should show variance: some days +0.3 to +0.5, others -0.3 to -0.5.
Check via `simulate-logs` parsed summary or DB query:
```sql
SELECT day_number, sentiment_impact FROM ... -- needs a way to track this
```
