# Progress

## Summary
- **Status**: completed (6 steps)
- **Date**: 2026-02-22
- **Goal**: Harden AI engine output quality and reliability — consistent JSON parsing, schema validation with typed fallbacks, tighter prompts, token-budgeted context, transient-error retry, and standardized degradation — without changing core behavior patterns.
- **Changes**:
  - Step 1: Audited all 13 callAI sites — cataloged parsers, validators, and fallback gaps
  - Step 2: Created shared `parseAIJson()` utility; migrated 9 JSON call sites from ad-hoc parsing
  - Step 3: Added priority-based token-budgeted context trimming + tightened prompt constraints
  - Step 4: Added transient-error retry (2 retries, 2s+5s backoff) + TTL-based circuit breaker reset
  - Step 5: Changed `callAI` return to `AICallResult {text, model, provider}`; added `logAICall()` observability to all 13 sites
  - Step 6: Verified with `npm run simulate 5`; fixed summary empty-system-prompt bug; reconciled docs

## Steps

### Step 1: Audit AI surface and failure points
- **Status**: done
- **Files**: (read-only)
- **Result**: Cataloged 13 callAI sites — 11 JSON, 2 free text. Found 4 ad-hoc parsers, 5 bare JSON.parse, 1 worst-offender (summary: no code-fence strip).

---

### Step 2: Shared JSON parser + per-feature schema validation
- **Status**: done
- **Files**: `ai-json.ts` (NEW), `action-parser.ts`, `media.ts`, `polls.ts`, `referendums.ts`, `summary.ts`, `negotiations.ts`, `internal-proposals.ts`, `seats.ts`, `discipline.ts`, `speeches.ts`
- **Result**: Created `extractJson` + `safeParseJson` + `parseAIJson` in `ai-json.ts`; migrated 9 JSON sites with typed validators. Sanitizers (`stripLeadingPlus`, `stripTrailingCommas`) moved from action-parser.

---

### Step 3: Prompt quality + token-budgeted context
- **Status**: done
- **Files**: `prompt.ts`, `negotiations.ts`, `summary.ts`
- **Result**: Added `CONTEXT_TOKEN_BUDGET=3000` with 3-tier priority trimming in `buildUserPrompt()`. Added "no code fences / no leading + / no trailing commas" rules to system prompts. Tightened negotiation + summary prompts.

---

### Step 4: Transient error retry + provider-limit TTL
- **Status**: done
- **Files**: `client.ts`
- **Result**: `detectLimitError()` classifies hard vs transient (429/network) errors. Retry loop: 2 retries with [2s, 5s] delays. Circuit breaker entries store `resetAt` timestamp; auto-expire on next check. `allProvidersLimited()` checks TTL.

---

### Step 5: Standardized fallback semantics + console observability
- **Status**: done
- **Files**: `ai-json.ts`, `client.ts`, `index.ts` (agent+engine), `party-agent.ts`, `negotiations.ts`, `media.ts`, `polls.ts`, `referendums.ts`, `summary.ts`, `internal-proposals.ts`, `seats.ts`, `discipline.ts`, `speeches.ts`, `questions.ts`, `interpellations.ts`
- **Result**: `callAI` returns `AICallResult {text, model, provider}`. All 13 sites wrapped with `Date.now()` timing + `logAICall()` emitting `[AI] <task> | <provider>/<model> | <ms>ms | OK|PARSE_FAIL|VALIDATION_FAIL`. Fallback policies documented in `ai-json.ts`.

---

### Step 6: Verify and reconcile docs
- **Status**: done
- **Files**: `summary.ts`, `docs/Current_Architecture.md`
- **Result**: Typecheck 6/6 pass. 5-day simulation verified all log lines. Fixed summary bug (`system: ""` rejected by Anthropic API → minimal system prompt). Architecture doc already reconciled with all changes.
