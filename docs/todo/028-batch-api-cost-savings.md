# 028 — Batch API Cost Savings for Scaling Users

**Status**: open
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

## Proposed Architecture: Batch-First Simulation

### Strategy 1: Batch All Day's AI Calls in One Submission

Instead of calling AI sequentially during `runDay()`, collect all prompts first, submit as one batch, wait for results, then process.

```
runDay() new flow:
  1. Collect phase — gather all prompts needed:
     - 6 party agent prompts
     - N speech evaluation prompts
     - N application review prompts
     - 1 daily summary prompt
     - 1 media prompt (if newsworthy)
     - etc.
  2. Submit phase — one batch API call with all requests
  3. Wait phase — poll batch status (typically < 1 hour)
  4. Process phase — parse all results, apply to DB
```

**Savings**: 50% cost on ALL calls. Eliminates sequential latency.

### Strategy 2: Consolidate Per-User Calls Into Group Prompts

Instead of 1 AI call per user action, send one prompt with ALL user actions of that type.

#### MdB Application Review (biggest win)
```
Current:  1 call per application (max 18/day)
Proposed: 1 call per party with ALL pending applications

Prompt: "You are party leadership of SPD. Review these 50 applications
         and decide approve/reject for each. Return JSON array."

Result: 50 decisions in 1 call instead of 50 calls (or 18 with artificial cap)
```

- Removes the 3/party/day cap — can review ALL pending applications
- At 100K users: ~500 pending apps → 6 calls (1/party) instead of 18
- **Cost reduction: ~97%** (6 calls vs 500 if uncapped)

#### Speech Evaluation
```
Current:  1 call per speech (32 max tokens each)
Proposed: 1 call per batch of speeches on same bill

Prompt: "Rate each of these 20 speeches on bill X.
         Return [{speechId, rating}] array."

Result: 20 evaluations in 1 call instead of 20 calls
```

- At 100K users with 200 speeches/day: ~10 calls (grouped by bill) instead of 200
- **Cost reduction: ~95%**

#### Internal Proposal Review
```
Current:  1 call per proposal (top per party)
Proposed: 1 call per party with ALL ready proposals

Prompt: "Review these 8 proposals and decide accept/decline for each."

Result: 8 decisions in 1 call instead of 8 calls
```

#### Citizen Questions
```
Current:  1 call per question, max 3/day
Proposed: 1 call per party with all pending questions for that party

Prompt: "Answer these 15 citizen questions addressed to your party."

Result: 15 answers in 1 call, removes artificial 3/day cap
```

#### Discipline Review
```
Current:  1 call per party with all members (already batched per party)
Proposed: Already efficient — just move to batch API for 50% savings
```

### Strategy 3: Combine Strategies 1 + 2

Group prompts by type AND submit everything as one batch:

```
Day N simulation:
  Batch submission:
    - "party-vote-spd"      → 1 prompt (all bills for SPD)
    - "party-vote-cdu"      → 1 prompt (all bills for CDU)
    - ...6 party vote prompts
    - "app-review-spd"      → 1 prompt (all 80 applications for SPD)
    - "app-review-cdu"      → 1 prompt (all 45 applications for CDU)
    - ...6 application review prompts
    - "speech-eval-bill-1"  → 1 prompt (all 30 speeches on bill 1)
    - "speech-eval-bill-2"  → 1 prompt (all 15 speeches on bill 2)
    - ...N speech eval prompts
    - "questions-spd"       → 1 prompt (all 20 questions for SPD)
    - "summary"             → 1 prompt
    - "media"               → 1 prompt
  Total: ~20-30 prompts in 1 batch (instead of 200+ sequential calls)
  Wait: ~15 min for batch completion
  Process: Apply all results to DB
```

## Cost Projection

### Current Cost (100 users, ~12 calls/day)
- Haiku 4.5: $1/MTok in, $5/MTok out
- ~12 calls × ~2K tokens avg = ~24K tokens/day
- ~$0.12/day = **~$3.60/month**

### Projected Cost at 100K Users

**Without batching (current architecture, uncapped):**
- ~500 calls/day (speeches + applications + questions + proposals + base)
- ~1M tokens/day
- ~$5/day = **~$150/month**

**With Strategy 3 (group + batch):**
- ~25 calls/day (grouped prompts)
- ~200K tokens/day (grouped prompts are longer but fewer)
- 50% batch discount
- ~$0.50/day = **~$15/month**

**Savings: ~90% cost reduction at scale**

### Projected Cost at 1M Users

**Without batching**: ~$1,500/month
**With Strategy 3**: ~$50/month (grouped prompts scale logarithmically, not linearly)

## Implementation Plan

### Phase 1: Batch API Client (`packages/engine/src/agent/batch-client.ts`)

New module alongside `client.ts`:

```typescript
interface BatchRequest {
  customId: string;      // e.g. "app-review-spd-day42"
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
```

### Phase 2: Group Prompt Builders

New module `packages/engine/src/agent/group-prompts.ts`:

```typescript
// Build a single prompt that reviews N applications, returns N decisions
function buildApplicationReviewPrompt(party, applications[]): BatchRequest

// Build a single prompt that evaluates N speeches on a bill
function buildSpeechEvalPrompt(bill, speeches[]): BatchRequest

// Build a single prompt that answers N citizen questions
function buildQuestionAnswerPrompt(party, questions[]): BatchRequest

// Build a single prompt that reviews N proposals
function buildProposalReviewPrompt(party, proposals[]): BatchRequest
```

### Phase 3: Refactor `runDay()` Loop

Refactor `loop.ts` to collect-then-batch pattern:

```typescript
async function runDay() {
  // ... steps 1-3 (no AI calls)

  // Step 4: Collect all AI prompts
  const batchRequests: BatchRequest[] = [];
  batchRequests.push(...buildPartyVotePrompts(parties, bills));
  batchRequests.push(...buildApplicationReviewPrompts(parties, applications));
  batchRequests.push(...buildSpeechEvalPrompts(bills, speeches));
  batchRequests.push(...buildQuestionPrompts(parties, questions));
  batchRequests.push(buildSummaryPrompt(events));
  batchRequests.push(buildMediaPrompt(events, parties));

  // Step 5: Submit batch and wait
  const results = await submitBatchMultiProvider(batchRequests);

  // Step 6: Process all results
  applyPartyVoteResults(results);
  applyApplicationResults(results);
  applySpeechEvalResults(results);
  // ... etc
}
```

### Phase 4: Fallback Mode

Keep `callAI()` as fallback for:
- Single urgent calls during development/testing
- When batch API is unavailable
- Ultra-fast timing preset where 1-hour wait is too long

Config flag: `BATCH_MODE=true|false` (default: true)

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
