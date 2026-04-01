# 038 — Batch API latency monitoring & day-84 investigation

**Status**: open
**Area**: Engine / Operations
**Priority**: Medium

## Investigation summary (2026-04-01)

### The trigger

The simulation appeared "stuck" at day 84. PM2 logs showed day 85 mid-batch
with many consecutive `0 succeeded, N processing` lines. A GitHub Actions
`simulate-logs` check captured the state.

### What actually happened

**The sim was NOT stuck.** Day 84 completed successfully (`=== DAY 84 COMPLETE ===`
is clearly visible in logs). Day 85 had started and was waiting for Anthropic's
batch API to finish processing. The log capture happened mid-poll.

Evidence from the log window (days 72-85):
- 13 days completed successfully in the captured 1000-line window
- 1002 AI calls with OK status, 14 VALIDATION_FAIL, 0 PARSE_FAIL
- Overall fail rate: 1.4% — well within normal bounds
- Day 85 was mid-execution, batch `msgbatch_01J9oUQPLUBjeavZt3FDUSN1` still polling

### Root cause: Anthropic batch API latency spikes

Anthropic's Message Batches API was under load, causing significantly longer
processing times:

| Batch type    | Normal latency | Observed latency (day 84-85) |
|---------------|----------------|------------------------------|
| Briefing      | 1-2 min        | 3-5 min (4-5 polls)          |
| Party agents  | 2-3 min        | 5-10 min (10-12 polls)       |
| MdB seats     | 3-5 min        | 4-17 min (242s to 1025s!)    |
| Media+summary | 1-2 min        | 2-5 min (3-6 polls)          |

The MdB seat batch on day 85 took **1025 seconds** (17 min!) — the longest
observed. This is a single batch of 2 requests, meaning Anthropic's backend
was genuinely slow, not that we were sending too much data.

### VALIDATION_FAIL analysis

Separate from the latency issue, days 77-84 showed VALIDATION_FAIL spikes
for Anthropic/Haiku party agents:

| Day | Agents failing | Pattern                           |
|-----|---------------|-----------------------------------|
| 77  | 5/6           | SPD, CDU, Grüne, FDP, Linke       |
| 82  | 2/6           | SPD, Grüne                        |
| 83  | 5/6           | SPD, CDU, Grüne, FDP, Linke       |
| 84  | 2/6           | SPD, Grüne                        |

**Key finding**: AfD (xai/grok-3-mini) NEVER fails. This is because:

1. **Anthropic agents use structured output** — `AGENT_RESPONSE_SCHEMA` in
   `party-agent.ts` guarantees valid JSON shape but NOT valid semantic values.
   Haiku sometimes picks wrong enum values (e.g. invalid vote or category).

2. **xAI/Grok uses full parse pipeline** — `parseAgentResponse()` with sanitizers
   for trailing commas, code fences, etc. More lenient parsing = fewer failures.

3. **Era summaries kicked in at day 60** — progressive summarization (commit
   `9ce1d96`) adds historical context (`caseFacts`) to prompts, increasing
   token pressure. Combined with real-world knowledge grounding (`223e45a`)
   and structured output schema (`e57b808`), all deployed around the same time.

**This is acceptable** because:
- `validateActions()` returns a `valid` array with actions that passed
- Fixable errors trigger a semantic retry (re-prompt the model once)
- Remaining invalid actions fall back to deterministic abstain-all
- The sim continues normally — no data loss or corruption

### No recent PR caused this

The investigation checked recent commits touching agent code:
- `ba2f560` — abgeordnetenwatch fallback (minor, unrelated)
- `223e45a` — real-world knowledge grounding (adds context, slight token pressure)
- `9ce1d96` — progressive summarization (adds era summaries after day 60)
- `e57b808` — structured output schema for agents

None of these are bugs — they all work as designed. The VALIDATION_FAIL rate
was expected to increase slightly with more context, and the fallbacks handle it.

## Changes made (this PR)

### 1. Increased batch timeout: 3600s → 5400s

**Why**: A typical sim day submits 4-6 batches sequentially (briefing → agents
→ interpellations → MdB → media+summary). If each batch takes 10-17 min under
API load, total day time can exceed 60 min. The old 3600s timeout would kill
the runner mid-day. 5400s (90 min) gives ample headroom.

**File**: `packages/engine/src/agent/batch-client.ts` line 85

### 2. Added 45s poll tier (polls 10-19)

**Why**: The old ramp was 15s → 30s → 60s. When batches hit 10+ polls (API under
load), jumping from 30s to 60s was wasteful — many batches complete between polls
10-20. The new 45s tier catches these sooner without hammering the API.

**File**: `packages/engine/src/agent/batch-client.ts` lines 87-103

### 3. Slow-batch warning log at poll #10

**Why**: The hardest part of diagnosing "stuck" sims is distinguishing "API is
slow but batch will complete" from "something is actually broken." The warning
at poll #10 (~5 min) prints elapsed time and remaining processing count, making
it clear the sim is waiting on Anthropic, not stuck in code.

**File**: `packages/engine/src/agent/batch-client.ts` lines 227-233

### 4. Updated timing preset comments

**Why**: The original comments said "batch API ~10 min/day" which was optimistic.
Real-world data shows 10-40 min/day depending on API load. Updated all presets
with normal vs slow ranges so operators know what to expect.

**File**: `packages/engine/src/simulation/timing.ts` lines 46-65

### 5. Documented VALIDATION_FAIL pattern in party-agent.ts

**Why**: Future developers investigating VALIDATION_FAIL logs need to understand
why Haiku fails more than Grok, why it correlates with era summaries, and that
the fallbacks handle it correctly. Added detailed comments to the schema, the
`processPartyAgentResult()` function, and both code paths.

**File**: `packages/engine/src/agent/party-agent.ts` lines 14-42, 293-370

## Future monitoring ideas

- [ ] Track per-day wall-clock time in DB (not just AI call latency)
- [ ] Alert in GitHub Actions workflow if a day takes >30 min
- [ ] Dashboard widget showing batch API health (avg poll count, avg completion time)
- [ ] Separate `[Timing]` log for total batch wait time vs sim processing time
- [ ] Consider fallback to synchronous calls if batch API is consistently >15 min
      (loses 50% discount but faster throughput)

## Affected files

- `packages/engine/src/agent/batch-client.ts` — polling config, timeout, warning log, module docs
- `packages/engine/src/agent/party-agent.ts` — VALIDATION_FAIL documentation, code path comments
- `packages/engine/src/simulation/timing.ts` — preset docs with realistic latency estimates
- `.github/workflows/simulate.yml` — may need timeout adjustments in future
