# 028 — Batch API Cost Savings for Scaling Users

**Status**: in-progress
**Area**: Engine / Agent
**Priority**: High

## Summary

All AI calls in the simulation are non-real-time — results are consumed on the next simulation day or within the same day loop. Both Anthropic and xAI offer **Batch APIs with 50% cost reduction**. Since no AI call requires an immediate response to a user, every single call can be batched.

## Batch API Overview

### Anthropic Message Batches API
- **Discount**: 50% off all token costs
- **Limit**: 100,000 requests or 256 MB per batch
- **Turnaround**: Most batches complete within 1 hour, max 24 hours
- **Results**: Poll for status, retrieve when done (available 29 days)
- **SDK**: `client.messages.batches.create({ requests: [...] })`
- **Docs**: https://platform.claude.com/docs/en/build-with-claude/batch-processing

### xAI Batch API
- **Discount**: 50% off all token costs (input, output, cached, reasoning)
- **Limit**: 25 MB per batch
- **Turnaround**: Most batches complete within 24 hours
- **Does not count** toward standard rate limits
- **SDK**: Upload JSONL or use SDK batch helpers
- **Docs**: https://docs.x.ai/developers/advanced-api-usage/batch-api

## Current AI Call Inventory (All Batchable)

Every AI call happens during `runDay()` — none are triggered by live HTTP requests. The simulation loop can wait for batch results before proceeding.

| Call Site | File | Calls/Day | Per-What | Current Cost Model |
|-----------|------|-----------|----------|-------------------|
| Party agent voting | `party-agent.ts` | ~6 | Per party | Per-party (Haiku/Grok) |
| Coalition negotiation | `negotiations.ts` | 0–18 | Per party per round | Per-party |
| Coalition synthesis | `negotiations.ts` | ~0.003 | Per election | Role: synthesis (Sonnet) |
| Speech evaluation | `speeches.ts` | 0–N | **Per user speech** | Role: daily (Haiku) |
| Daily media | `media.ts` | 0–1 | Per day | Role: daily (Haiku) |
| Citizen questions | `questions.ts` | 0–3 | **Per user question** | Per-party |
| Interpellations | `interpellations.ts` | 0–2 | Per interpellation | Per-party |
| Context poll | `polls.ts` | 0–1/week | Per week | Role: daily (Haiku) |
| Referendum | `referendums.ts` | ~0.03 | Per 30 days | Role: daily (Haiku) |
| Daily summary | `summary.ts` | 1 | Per day | Role: daily (Haiku) |
| Internal proposals | `internal-proposals.ts` | 0–6 | **Per user proposal** | Per-party |
| MdB applications | `seats.ts` | 0–18 | **Per user application** | Per-party |
| Discipline review | `discipline.ts` | ~0.86 | Per party weekly | Per-party |

**Typical day**: 9–12 calls. **Peak day (high user activity)**: 20–30 calls.

### Calls That Scale With Users (Critical for 100K+)

These are the bottleneck — they grow linearly with user count:

| Call | Current | At 100K Users | Problem |
|------|---------|---------------|---------|
| Speech evaluation | 1 call per speech | Hundreds/day | Sequential, 1 AI call each |
| MdB applications | Max 18/day (3/party) | 1000s pending, 18 reviewed | Artificial cap, huge backlog |
| Internal proposals | 1 per ready proposal/party | Dozens/day | Sequential per party |
| Citizen questions | Max 3/day | 1000s pending, 3 answered | Artificial cap |

## Input Size Analysis Per User Action

Understanding token sizes is critical for calculating how many items fit in a single prompt.

### Actual Field Limits (from `packages/api/src/validation.ts`)

| Field | Min Chars | Max Chars | ~Max Tokens |
|-------|-----------|-----------|-------------|
| Application text | 10 | 500 | ~150 |
| Policy focus | — | 5 items × 100 chars | ~150 |
| Speech content | 20 | 2,000 | ~600 |
| Citizen question | 5 | 500 | ~150 |
| Proposal title | 5 | 80 | ~25 |
| Proposal description | 10 | 500 | ~150 |
| Amendment description | 10 | 500 | ~150 |
| Display name | 2 | 30 | ~10 |

### Tokens Per User Item in a Grouped Prompt

Each item needs: user identifier + content + metadata. Estimated tokens per item:

| Action Type | Per-Item Tokens (input) | Per-Item Output Tokens |
|-------------|------------------------|----------------------|
| MdB application | ~200 (name + text + focus + score) | ~40 (approve/reject + reason) |
| Speech | ~650 (name + bill context + speech text) | ~5 (positive/neutral/negative) |
| Citizen question | ~180 (question + voter score) | ~80 (2-3 sentence answer) |
| Internal proposal | ~220 (title + desc + votes + category) | ~30 (accept/decline + reason) |
| Interpellation | ~200 (title + question + ministry) | ~100 (government answer) |

### Haiku 4.5 Context Window: 200K tokens

How many items fit in ONE prompt call (leaving ~2K for system prompt + output):

| Action | Items per Call | At 100K Users/Day | Calls Needed |
|--------|---------------|-------------------|--------------|
| MdB applications | **~900 per call** | ~500 pending/party | **1 per party** (6 total) |
| Speeches | **~280 per call** | ~200 total/day | **1 per bill** (~5-10 total) |
| Citizen questions | **~1,000 per call** | ~500 pending/party | **1 per party** (6 total) |
| Internal proposals | **~800 per call** | ~50 ready/party | **1 per party** (6 total) |
| Interpellations | **~600 per call** | ~30 pending | **1 total** |

## Key Insight: Selection-Style Prompts (Not Review-All)

The biggest optimization is changing the TASK itself. Instead of "review each application individually", ask the model to SELECT the best ones from a large pool.

### MdB Applications: "Select Top N" Instead of "Review Each"

```
CURRENT (1 call per application, max 3/party/day = 18 calls):
  "Here is 1 application. Approve or reject?"
  × 18 times

BETTER (1 call per party with all apps = 6 calls):
  "Here are 50 applications. Approve or reject each one."
  × 6 parties

BEST (1 call per party, selection mode = 6 calls, MUCH less output):
  "Here are 500 applications for SPD. You have 3 open seats.
   Select the top 3 most qualified applicants. Return their IDs
   and a brief reason for each. All others are implicitly waitlisted."
```

**Why selection is better than review-all:**
- Output tokens drop from ~40 × 500 = 20,000 → ~40 × 3 = 120 (99.4% output savings)
- Model only needs to rank, not justify every rejection
- Mirrors real-world: party leadership picks the best, doesn't write rejection letters for everyone
- The `openSeats` count already exists — use it as the selection target

**Token math at 100K users (500 pending apps for SPD):**
- Input: ~200 tokens × 500 apps + 500 system = ~100,500 tokens (fits in Haiku's 200K window)
- Output: ~40 tokens × 3 selections = ~120 tokens
- Cost: 100K × $0.50/MTok + 120 × $2.50/MTok = **$0.05 per party per day** (batch pricing)
- vs current: 3 calls × 2K tokens × $1/MTok = $0.006/day but only reviews 3 of 500

### Speeches: "Flag Bad Ones" Instead of "Rate Each"

```
CURRENT (1 call per speech, 32 max tokens each):
  "Rate this speech: positive/neutral/negative"
  × 200 speeches

BETTER (1 call per bill, all speeches):
  "Rate each of these 30 speeches: [{id, rating}]"
  × 10 bills

BEST (1 call per bill, exception-based):
  "Here are 30 speeches on bill X. Most parliamentary speeches are
   substantive. Identify ONLY the ones that are spam, nonsensical,
   or disruptive (negative). Everything else defaults to positive.
   Return: {negative: ['id1', 'id2'], notable: ['id3', 'id4']}"
```

**Why exception-based is better:**
- Output drops from 30 ratings → typically 0-2 IDs flagged
- Assumption: most speeches from MdB seat holders are substantive (they applied and got approved)
- Only spam/troll content needs AI detection
- "Notable" tag could highlight exceptional speeches for media/events

### Citizen Questions: "Batch Answer by Topic" Instead of "One at a Time"

```
CURRENT (1 call per question, max 3/day):
  "Answer this citizen question as SPD spokesperson"
  × 3 questions

BETTER (1 call per party, all pending):
  "Answer each of these 50 questions. Return [{id, answer}]"

BEST (1 call per party, topic-grouped with shared context):
  "You are SPD spokesperson. Here are 50 citizen questions grouped
   by topic. Write a brief position statement per topic, then
   answer each question (1-2 sentences). Questions on the same
   topic can share reasoning.
   Topics: Economy (Q1,Q4,Q12), Migration (Q2,Q5), Climate (Q3,Q8,Q15)..."
```

**Why topic-grouping is better:**
- Shared reasoning across related questions = shorter total output
- More consistent party messaging (same topic → same framing)
- Questions often cluster around current events/crises anyway

### Internal Proposals: "Rank and Decide" Instead of "Review One"

```
CURRENT (1 call per proposal, only top-scored):
  "Should SPD sponsor this bill proposal?"
  × 1 per party

BEST (1 call per party, rank all ready proposals):
  "Here are 12 member proposals for SPD, each with vote scores.
   You have bandwidth to sponsor 2 bills this period.
   Select the top 2 that best serve the party's agenda.
   Decline the rest with a brief shared reason."
```

**Why rank-and-select is better:**
- Party can compare proposals against each other (relative merit)
- Current approach reviews blind (doesn't see competing proposals)
- Limits output to the selected N, not all proposals

### Party Agent Voting: Already Grouped, But Can Add User Context

```
CURRENT (1 call per party, already efficient):
  "Vote on these 5 bills as SPD"

ENHANCED (same 1 call, but include aggregated user signals):
  "Vote on these 5 bills as SPD.
   Member signals: Bill A (80% yes, 200 signals), Bill B (45% yes, 150 signals)
   MdB speeches: Bill A had 3 notable speeches in favor.
   Consider member sentiment but maintain party discipline."
```

**Not more calls, but richer input** — user participation data flows into party decisions for free.

## Token Budget Summary: 1 Call Fits How Many Users

| Scenario | Items | Input Tokens | Output Tokens | Total | Fits in 200K? |
|----------|-------|-------------|---------------|-------|--------------|
| 500 MdB apps, select top 3 | 500 | ~100K | ~200 | ~100K | Yes |
| 1000 MdB apps, select top 5 | 1000 | ~200K | ~300 | ~200K | Borderline (chunk at 800) |
| 200 speeches, flag bad ones | 200 | ~130K | ~500 | ~130K | Yes |
| 500 questions, topic-grouped | 500 | ~90K | ~15K | ~105K | Yes |
| 50 proposals, rank top 3 | 50 | ~11K | ~500 | ~12K | Yes, trivially |
| 30 interpellations, answer all | 30 | ~6K | ~3K | ~9K | Yes, trivially |

**At 1M users**: Chunk into pages of ~800 items per call. 1M users with 5% daily activity = 50K actions → ~60 calls total (vs 50,000 calls without grouping).

## Cost Projection (Revised with Selection-Style Prompts)

### Current Cost (100 users, ~12 calls/day)
- Haiku 4.5: $1/MTok in, $5/MTok out
- ~12 calls × ~2K tokens avg = ~24K tokens/day
- ~$0.12/day = **~$3.60/month**

### At 100K Users

**Without any optimization (1 call per action, uncapped):**
- ~500 calls/day × ~2K tokens = ~1M tokens/day
- ~$5/day = **~$150/month**

**With selection-style grouping + batch API (50% discount):**
- ~20 calls/day (6 app-select + 6 question-batch + 5 speech-flag + 1 summary + 1 media + 1 proposals)
- Input: ~600K tokens (big grouped prompts)
- Output: ~5K tokens (selection outputs are tiny)
- Batch cost: 600K × $0.50/MTok + 5K × $2.50/MTok = **$0.31/day = ~$9.50/month**

**Savings: 94% cost reduction**

### At 1M Users

**Without optimization**: ~$1,500/month
**With selection-style + batch + chunking**: ~60 calls/day, ~$1.50/day = **~$45/month**

**Savings: 97% cost reduction**

## Implementation Plan

### Phase 1: Batch API Client (`packages/engine/src/agent/batch-client.ts`)

New module alongside `client.ts`:

```typescript
interface BatchRequest {
  customId: string;      // e.g. "app-select-spd-day42"
  system: string;
  prompt: string;
  maxTokens: number;
  partyId?: string;
  roleKey?: RoleKey;
}

interface BatchResult {
  customId: string;
  text: string;
  model: string;
  provider: Provider;
}

// Submit batch to Anthropic/xAI, poll for results
async function submitBatch(requests: BatchRequest[]): Promise<BatchResult[]>

// Split requests by provider (Anthropic vs xAI) and submit separately
async function submitBatchMultiProvider(requests: BatchRequest[]): Promise<BatchResult[]>

// Chunk large item lists into pages that fit within context window
function chunkItems<T>(items: T[], tokensPerItem: number, maxContextTokens?: number): T[][]
```

### Phase 2: Selection-Style Prompt Builders

New module `packages/engine/src/agent/group-prompts.ts`:

```typescript
// "Select top N applicants from this pool" — not "review each one"
function buildApplicationSelectPrompt(
  party: Party,
  applications: MdbApplication[],
  openSeats: number,             // AI selects this many
): BatchRequest

// "Flag only spam/nonsense speeches" — not "rate each one"
function buildSpeechFlagPrompt(
  bill: { title: string; description: string },
  speeches: { id: string; content: string; author: string }[],
): BatchRequest

// "Answer questions grouped by topic" — shared reasoning across related Qs
function buildQuestionBatchPrompt(
  party: Party,
  questions: { id: string; question: string; voteScore: number }[],
): BatchRequest

// "Rank and select top N proposals" — compare against each other
function buildProposalRankPrompt(
  party: Party,
  proposals: InternalProposal[],
  maxAccept: number,             // Party bandwidth limit
): BatchRequest

// Existing party-agent prompt, but enriched with aggregated user signals
function buildPartyVotePrompt(
  party: Party,
  bills: Bill[],
  userSignals: Map<string, { yes: number; no: number }>,
  mdbSpeeches: Map<string, string[]>,  // Notable speeches per bill
): BatchRequest
```

### Phase 3: Refactor `runDay()` to Collect-Then-Batch

```typescript
async function runDay() {
  // ... steps 1-3 (economic drift, injections, crisis — no AI)

  // Step 4: COLLECT all AI prompts for the day
  const batch: BatchRequest[] = [];

  // Party voting (6 calls, enriched with user signal aggregates)
  for (const party of parties) {
    const signals = aggregateSignalsForBills(votableBills);
    const speeches = getNotableSpeechesForBills(votableBills);
    batch.push(buildPartyVotePrompt(party, votableBills, signals, speeches));
  }

  // MdB applications — select top N per party (6 calls max)
  for (const party of parties) {
    const apps = getPendingApplications(party.id);
    if (apps.length === 0) continue;
    const openSeats = openCounts[party.id] ?? 0;
    if (openSeats === 0) continue;
    // Chunk if >800 apps per party (unlikely but safe)
    for (const chunk of chunkItems(apps, 200, 160_000)) {
      batch.push(buildApplicationSelectPrompt(party, chunk, openSeats));
    }
  }

  // Speeches — flag bad ones per bill (1 call per bill with speeches)
  for (const bill of billsWithSpeeches) {
    const speeches = getUnprocessedSpeeches(bill.id);
    batch.push(buildSpeechFlagPrompt(bill, speeches));
  }

  // Citizen questions — batch per party (6 calls max)
  for (const party of parties) {
    const questions = getPendingQuestionsForParty(party.id);
    if (questions.length === 0) continue;
    for (const chunk of chunkItems(questions, 180, 160_000)) {
      batch.push(buildQuestionBatchPrompt(party, chunk));
    }
  }

  // Proposals — rank per party (6 calls max)
  for (const party of parties) {
    const proposals = getReadyProposals(party.id);
    if (proposals.length === 0) continue;
    batch.push(buildProposalRankPrompt(party, proposals, 2));
  }

  // Summary + media (2 calls)
  batch.push(buildSummaryPrompt(dayEvents));
  if (hasNewsworthyEvents) batch.push(buildMediaPrompt(dayEvents, parties));

  // Step 5: SUBMIT entire day as one batch, wait for results
  const results = await submitBatchMultiProvider(batch);

  // Step 6: PROCESS all results and apply to DB
  applyPartyVoteResults(results);
  applyApplicationSelectResults(results);   // Approve selected IDs, waitlist rest
  applySpeechFlagResults(results);          // Default positive, mark flagged as negative
  applyQuestionAnswerResults(results);
  applyProposalRankResults(results);
  applySummaryResult(results);
  applyMediaResult(results);
}
```

### Phase 4: Fallback & Config

Keep `callAI()` as fallback for:
- Development/testing (instant results)
- Ultra-fast timing preset where 1-hour batch wait is too long
- When batch API is unavailable

```bash
# .env config
BATCH_MODE=true          # Use batch API (default for production)
BATCH_POLL_INTERVAL=30   # Seconds between status checks
BATCH_TIMEOUT=3600       # Max wait before falling back to sync
```

### Phase 5: Pre-Filter to Reduce Input Tokens Further

Before sending to AI, apply deterministic filters to shrink the pool:

```typescript
// MdB applications: pre-score and only send top 10× openSeats to AI
function preFilterApplications(apps: MdbApplication[], openSeats: number) {
  const scored = apps.map(a => ({ ...a, score: calcActivityScore(a) }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, openSeats * 10); // AI picks from top 30, not all 500
}

// Questions: pre-rank by vote score, send top 50 to AI (not all 500)
function preFilterQuestions(questions: Question[], limit = 50) {
  return questions.sort((a, b) => b.voteScore - a.voteScore).slice(0, limit);
}

// Speeches: skip very short ones (< 50 chars) — auto-neutral, no AI needed
function preFilterSpeeches(speeches: Speech[]) {
  return speeches.filter(s => s.content.length >= 50);
}
```

**This reduces input tokens by another 50-90%** at high user counts.

## Affected Files

- `packages/engine/src/agent/client.ts` — Keep as fallback
- `packages/engine/src/agent/batch-client.ts` — **NEW**: Batch submission + polling
- `packages/engine/src/agent/group-prompts.ts` — **NEW**: Multi-item prompt builders
- `packages/engine/src/agent/model-config.ts` — Add batch model IDs
- `packages/engine/src/simulation/loop.ts` — Refactor to collect-then-batch
- `packages/engine/src/simulation/seats.ts` — Extract prompt building from `reviewMdbApplications()`
- `packages/engine/src/simulation/speeches.ts` — Extract prompt building from `processDaySpeeches()`
- `packages/engine/src/simulation/internal-proposals.ts` — Extract prompt building
- `packages/engine/src/simulation/questions.ts` — Extract prompt building
- `packages/engine/src/simulation/discipline.ts` — Already grouped per party, just batch
- `packages/engine/src/simulation/negotiations.ts` — Batch all party positions per round

## Dependencies

- `@anthropic-ai/sdk` — Direct SDK needed for batch API (Vercel AI SDK v6 does not wrap batch endpoints)
- xAI SDK or direct REST calls for xAI batch API
- No changes needed to `api` or `web` packages

## Notes

- Batch API results are available for 29 days (Anthropic) — useful for debugging/auditing
- Prompt caching with 1-hour TTL works well with batch (shared system prompts across requests)
- Group prompts need careful JSON schema design to parse multi-item responses reliably
- The 3/party/day application cap and 3/day question cap can be REMOVED once batching is implemented
- xAI batch does not count toward standard rate limits — removes circuit breaker needs for AfD
