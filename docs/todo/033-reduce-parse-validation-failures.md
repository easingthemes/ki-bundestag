# 033 — Reduce PARSE_FAIL and VALIDATION_FAIL Rates in Party Agents

**Status**: done
**Area**: Engine / Agent
**Priority**: High

## Problem

Production simulation logs (ultra-fast mode, Days 9-49) show increasing AI response failures:

- **PARSE_FAIL** (agent can't produce valid JSON): Increasing in later days (Days 29-31, 47-48). SPD, FDP, Grune, Linke all failing. Fallback is `abstain-all` — party abstains on every vote that day, distorting simulation results.
- **VALIDATION_FAIL** (JSON parses but actions invalid): Cluster pattern on Days 16, 22, 28, 34, 39, 46 — 5/6 Anthropic agents fail simultaneously. Common causes: extra proposals, invalid bill IDs, wrong vote values.

### Root Cause

Context size grows as simulation progresses. More bills accumulate in the pipeline, more events in history, more crises. Party agent prompts exceed what Haiku can reliably handle for structured JSON output.

### Evidence

- Failure clusters correlate with high bill counts (many third-reading votes)
- Parse failures increase monotonically with day number
- Same-day simultaneous failures across agents suggest shared prompt issue (briefing or bill list)

## Proposed Fixes

### 1. Context windowing for party agent prompts ✅ (done in #037, PR #81)
- Limit bill list to only **active bills** (not all historical)
- Cap event history to last 7-14 days instead of 30
- Summarize older events rather than listing them individually

### 2. Explicit bill ID enumeration in prompt ✅ (done in #037, PR #81)
- Include a clear `VALID_BILL_IDS: [...]` section
- Add `YOU MUST VOTE ON: [bill-1, bill-2]` for mandatory third-reading votes
- This reduces VALIDATION_FAIL from invalid bill references

### 3. Retry on PARSE_FAIL before fallback ✅ (done)
- On first parse failure, retry with a simplified prompt (fewer events, smaller context)
- Only fall back to abstain-all after retry also fails
- Cost: ~$0.001 per retry (rare enough to be negligible)

### 4. JSON output strengthening ✅ (done in #037, PR #81)
- Add JSON schema example at end of prompt (not just beginning)
- Use `"respond with ONLY valid JSON, no markdown"` reinforcement
- Structured output with `output_config.format.json_schema` for Anthropic batch requests

## Affected Files

- `packages/engine/src/agent/prompt.ts` — context windowing, bill ID list
- `packages/engine/src/agent/party-agent.ts` — retry logic on parse fail
- `packages/engine/src/agent/action-parser.ts` — better error messages for debugging
- `packages/engine/src/agent/ai-json.ts` — retry support
- `packages/engine/src/agent/briefing.ts` — briefing size control

## Metrics to Track

Use `error-analysis` workflow check after changes:
- Overall fail rate should drop below 5%
- No day should have >2 simultaneous parse failures
- Input token avg for `agent:*` tasks should stay under 5K

## Cost Impact

Negligible — retries are rare, context reduction saves tokens.
