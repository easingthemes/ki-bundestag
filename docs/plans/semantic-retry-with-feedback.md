# Plan: Semantic Retry-with-Feedback Loop

## Problem

`validateActions()` in `action-parser.ts` silently drops invalid actions and auto-fills missing votes with abstain. The LLM never learns what it did wrong. `processPartyAgentResult()` in `party-agent.ts` retries only on full JSON parse failures — there's no path for "parsed OK but semantically invalid."

## Goal

When validation finds **fixable** semantic errors, collect structured error messages and re-prompt the LLM once with the original context + error feedback. Only fall back to drop+abstain if the retry also fails.

---

## Step 1: Define `ValidationError` type and `ValidationResult` interface

**File:** `packages/engine/src/agent/action-parser.ts`

Add a new type at the top of the file:

```ts
export interface ValidationError {
  /** Index of the action in the original actions array */
  actionIndex: number;
  /** The action type that failed (or "unknown" for unrecognized types) */
  actionType: string;
  /** Human-readable error message describing what went wrong */
  message: string;
  /** Whether this error is fixable by the LLM on retry */
  fixable: boolean;
}

export interface ValidationResult {
  /** Actions that passed validation */
  valid: AgentAction[];
  /** Structured errors for actions that failed */
  errors: ValidationError[];
  /** Bills that were auto-filled with abstain (missing votes) */
  autoAbstainBillIds: string[];
}
```

**Fixable vs non-fixable heuristic:**
- **Fixable:** wrong enum value, out-of-range number, wrong bill ID (valid alternatives exist), invalid action type (party has other valid options), duplicate action (can be deduplicated)
- **Non-fixable:** missing required fields with no reasonable default, action requires capability the party doesn't have (no Fraktion, not opposition, etc.)

Non-fixable errors are still reported in `errors` but with `fixable: false`. A retry is only triggered when at least one error has `fixable: true`.

## Step 2: Refactor `validateActions()` to return `ValidationResult`

**File:** `packages/engine/src/agent/action-parser.ts`

Change the signature:

```ts
export function validateActions(
  actions: AgentAction[],
  votableBills: Bill[],
  partyId: string,
  activeElection?: Election,
  hasFraktion?: boolean,
  secondReadingBills?: Bill[],
  isOpposition?: boolean,
  isCoalitionLeader?: boolean,
): ValidationResult { ... }
```

Inside each validation branch, instead of `console.warn(...); continue;`, push a `ValidationError` to the errors array with appropriate `fixable` flag and `continue`. The `console.warn` calls stay (for observability) but now also populate the structured errors.

The auto-abstain loop at the end populates `autoAbstainBillIds` so the retry prompt can mention which votes were missing.

Return `{ valid: validated, errors, autoAbstainBillIds }`.

**Backward compatibility:** All existing callers currently do `const validated = validateActions(...)` and use the result as `AgentAction[]`. These callers must be updated to use `.valid` instead. There are exactly **2 call sites** — both in `party-agent.ts` (one in `runPartyAgent`, one in `processPartyAgentResult`). A quick grep should confirm no others.

## Step 3: Build the retry feedback prompt

**File:** `packages/engine/src/agent/prompt.ts`

Add a new exported function:

```ts
export function buildValidationRetryPrompt(
  originalUserPrompt: string,
  errors: ValidationError[],
  autoAbstainBillIds: string[],
): string
```

This function constructs the retry user prompt:

1. Starts with the **full original user prompt** (so the LLM has all context)
2. Appends a clearly delimited section:

```
--- VALIDATION ERRORS IN YOUR PREVIOUS RESPONSE ---
Your previous response had the following errors:
- [action #1, type "vote"] Vote for bill B-47 is invalid — that bill is not in third reading (valid bill IDs for voting: B-12, B-33, B-41)
- [action #3, type "filibuster"] Unknown action type "filibuster" — not in your allowed actions
- Missing votes for bills: B-12, B-33 (these will default to abstain if not provided)

Re-generate your complete actions JSON. Keep actions that were valid, fix or remove the invalid ones. You MUST vote on all third-reading bills.
---
```

The system prompt is **not modified** — only the user prompt gets the error appendix.

## Step 4: Add semantic retry to `runPartyAgent()` (sequential path)

**File:** `packages/engine/src/agent/party-agent.ts`

After the existing `validateActions()` call, add the retry logic:

```
1. Call validateActions() → get ValidationResult
2. If result.errors has any fixable errors:
   a. Build retry prompt via buildValidationRetryPrompt()
   b. Call callAI() with same system prompt + retry user prompt + same model/party config
   c. Parse the retry response with parseAgentResponse()
   d. Validate again with validateActions()
   e. Use the retry's ValidationResult.valid (even if it still has errors — we only retry once)
   f. Log with task suffix `:semantic-retry`
3. If no fixable errors, or retry also fails: use original ValidationResult.valid (current behavior)
```

The parse-failure retry and abstain-all fallback remain as-is — they are the outer safety net.

Track the retry cost: `callAI()` already calls `recordAICall()` internally, so no extra cost-tracking code needed. The `logAICall()` call should note `:semantic-retry` in the task name.

## Step 5: Add semantic retry to `processPartyAgentResult()` (batch path)

**File:** `packages/engine/src/agent/party-agent.ts`

Same logic as Step 4, but inserted after the existing `validateActions()` call in the batch-result processing path (line ~248). The retry uses `callAI()` sequentially (same as the existing parse-failure retry at line ~229).

The batch path already has a sequential retry for parse failures. The new semantic retry is a **separate, additional** retry that happens after successful parsing but failed validation. The flow becomes:

```
1. Parse batch result (structured output or parseAgentResponse)
   - On parse failure → existing sequential retry → on 2nd parse failure → abstain-all
2. validateActions() on parsed result
3. If fixable errors exist:
   a. buildValidationRetryPrompt() with original user prompt
   b. callAI() sequentially
   c. parseAgentResponse() on retry text
   d. validateActions() on retry result
   e. Use retry's .valid
4. Return .valid (with auto-abstains already included)
```

## Step 6: Extract shared retry helper

**File:** `packages/engine/src/agent/party-agent.ts`

To avoid duplicating the retry logic between `runPartyAgent()` and `processPartyAgentResult()`, extract a helper:

```ts
async function attemptSemanticRetry(
  ctx: AgentContext,
  originalUserPrompt: string,
  validationResult: ValidationResult,
  votableBills: Bill[],
  secondReadingBills: Bill[] | undefined,
  t0: number,
): Promise<{ actions: AgentAction[]; retried: boolean }>
```

This function:
- Checks if `validationResult.errors` has any fixable errors → if not, returns `{ actions: validationResult.valid, retried: false }`
- Builds the retry prompt
- Calls `callAI()` with the same model/party config
- Parses and validates the retry response
- On any failure (parse or exception), falls back to `validationResult.valid`
- Logs appropriately with `:semantic-retry` suffix
- Returns `{ actions: retryValid, retried: true }`

Both `runPartyAgent()` and `processPartyAgentResult()` call this helper after their initial `validateActions()`.

## Step 7: Update `logAICall` calls for observability

**File:** `packages/engine/src/agent/party-agent.ts`

Add a new fallback tag for semantic retry scenarios:

- `fallback: "semantic-retry"` when a retry is attempted
- `fallback: "semantic-retry:failed"` when the retry itself fails validation
- Existing `fallback: "abstain-all"` unchanged

The `logAICall` signature doesn't need to change — it already accepts a `fallback?: string`.

## Step 8: Update existing tests

**File:** Check for tests in `packages/engine/src/agent/__tests__/` or similar.

- Update any tests that call `validateActions()` directly to expect `ValidationResult` instead of `AgentAction[]`
- Add test cases for the new `ValidationError` classification (fixable vs non-fixable)
- Add test for `buildValidationRetryPrompt()` output format

---

## Data Flow Diagram

```
LLM Response (text)
  │
  ▼
parseAgentResponse()  ──parse fail──▶ [existing retry / abstain-all]
  │
  ▼ (AgentAction[])
validateActions()
  │
  ▼ (ValidationResult)
  ├── no fixable errors ──▶ return .valid (unchanged behavior)
  │
  └── has fixable errors
        │
        ▼
      buildValidationRetryPrompt(originalPrompt, errors)
        │
        ▼
      callAI() (same model/config)
        │
        ▼
      parseAgentResponse()  ──fail──▶ return original .valid
        │
        ▼
      validateActions()
        │
        ▼
      return retry .valid (even if imperfect — only 1 retry)
```

## Files Changed

| File | Change |
|------|--------|
| `packages/engine/src/agent/action-parser.ts` | Add `ValidationError`, `ValidationResult` types. Refactor `validateActions()` to return `ValidationResult` with structured errors and fixable flags. |
| `packages/engine/src/agent/prompt.ts` | Add `buildValidationRetryPrompt()` function. |
| `packages/engine/src/agent/party-agent.ts` | Extract `attemptSemanticRetry()` helper. Update `runPartyAgent()` and `processPartyAgentResult()` to use `ValidationResult` and call retry helper. Update `logAICall` tags. |
| `packages/types/src/types/agent.ts` | No changes needed — `ValidationError`/`ValidationResult` are engine-internal types, not shared API types. |
| Test files | Update for new return type, add retry prompt tests. |

## Risk Mitigation

- **Cost:** Each semantic retry is 1 additional LLM call per party per day (worst case: 6 extra calls/day). At Haiku pricing (~$0.01/call), this adds ~$0.06/day max. The retry uses `callAI()` which records costs automatically.
- **Latency:** Sequential retry adds ~1-3s per party. Acceptable since it only triggers on validation failures (should be rare with good prompts).
- **Infinite loops:** Hard-coded to retry exactly once — the helper returns after one attempt regardless of outcome.
- **Batch API compatibility:** Retry always uses sequential `callAI()`, not batch. This matches the existing parse-failure retry pattern.
