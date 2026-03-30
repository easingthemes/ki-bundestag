---
paths:
  - "packages/engine/src/simulation/**"
  - "packages/engine/src/agent/**"
---

# Simulation Rules

## AI Calls

AI calls use **Vercel AI SDK v6** with per-party and per-role model selection (`packages/engine/src/agent/model-config.ts`).

- **`submitBatch()`** in `batch-client.ts` — ALL simulation AI calls go through the Anthropic Message Batches API (50% discount). Zero sequential `callAI()` calls remain in the loop.
- **`callAI()`** accepts `{system, prompt, maxTokens, partyId?, roleKey?}` — used internally by `submitBatch()` for xAI sequential fallback
- **Batch groups**: A (party agents), B (interpellations + discipline), C (media + summary), mid-cycle (polls + referendums), negotiations, user-driven (Q&A + speeches + apps + proposals)
- Each module exports `buildXxxBatchRequest()` and `processXxxBatchResult()` — `loop.ts` collects and submits them as single batches
- Transient-error retry (2 retries, 2s+5s backoff) for 429s and network errors
- Per-provider circuit breaker with TTL-based `resetAt` timestamp
- **Shared JSON parser**: `parseAIJson()` in `ai-json.ts` handles code-fence stripping, sanitization, and typed validation
- **Observability**: `logAICall()` emits `[AI] <task> | <provider>/<model> | <ms>ms | OK|PARSE_FAIL|VALIDATION_FAIL`

## runDay() Flow (loop.ts)

13-step daily loop:
1. Increment day, load state
2. Economic drift (mean-reversion + noise)
3. Process injections + crisis system
4. Election status check (negotiation / voting / normal)
5. Bill pipeline + party agents + motions/interpellations/confidence votes/constitutional challenges/presidential veto
6. Answer citizen questions (batch, up to 50/party) + interpellations (batch, max 2/day)
7. Approval drift + sentiment mean-reversion (baseline 45, range 5–75)
8. Resolve polls/referendums; weekly polls + opinion recalc; monthly economic report
9. Budget cycle (every 60 days) + referendum generation
10. Daily media articles (2–3 from biased outlets)
11. Media sentiment influence (max +/-0.5/day)
12. Daily narrative summary
13. Record history, save state, persist events

## Agent Action Validation (action-parser.ts)

Max per turn: 1 proposal + 1 amendment + 1 motion + 1 interpellation + 1 constitutional challenge + 1 statement. Must vote on all third-reading bills. Interpellations: opposition+Fraktion only. Constitutional challenges: Fraktion + target passed bills ≤14 days old.

## Key Modules

- `bill-pipeline.ts` — 4 reading stages (proposed → 1st → committee → 2nd → 3rd)
- `veto.ts` — Presidential veto check (3–16% based on impact magnitude)
- `opinion.ts` — `applyDailyApprovalDrift()`, sentiment drift, membership bonus
- `media.ts` — `buildMediaBatchRequest()` + `processMediaBatchResult()`, `applyMediaSentiment()`
- `summary.ts` — `buildSummaryBatchRequest()` + `processSummaryBatchResult()`
- `budget.ts` — Budget generation, tallying, economic effects
- `confidence-votes.ts` — Vertrauensfrage + Misstrauensvotum
- `constitutional-court.ts` — Challenge adjudication
- `batch-client.ts` — `submitBatch()`, `chunkItems()`, `findResult()` (agent package)
- `group-prompts.ts` — Selection-style prompt builders for user-driven calls (agent package)
