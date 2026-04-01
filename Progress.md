# Progress: Semantic Retry-with-Feedback Loop

**Plan**: [docs/plans/semantic-retry-with-feedback.md](docs/plans/semantic-retry-with-feedback.md)
**Goal**: When `validateActions()` finds fixable semantic errors, re-prompt the LLM once with error feedback instead of silently dropping actions. Only fall back to abstain if the retry also fails.
**Validation**: `npm run typecheck && npm test`

---

### Step 1: Define `ValidationError` type and `ValidationResult` interface

- **Status**: done
- **Files**: `packages/engine/src/agent/action-parser.ts`, `packages/engine/src/agent/index.ts`
- **Result**: Added `ValidationError` and `ValidationResult` interfaces. Exported from `index.ts`. Typecheck passes (6/6).

### Step 2: Refactor `validateActions()` to return `ValidationResult`

- **Status**: done
- **Files**: `packages/engine/src/agent/action-parser.ts`, `packages/engine/src/agent/party-agent.ts`, `packages/engine/src/agent/action-parser.test.ts`
- **Result**: Refactored `validateActions()` to return `ValidationResult`. Every validation branch pushes a `ValidationError` with fixable flag. Updated both call sites in party-agent to use `.valid`. Updated existing tests for new return type. Typecheck passes (6/6).

### Step 3: Build the retry feedback prompt

- **Status**: done
- **Files**: `packages/engine/src/agent/prompt.ts`, `packages/engine/src/agent/index.ts`
- **Result**: Added `buildValidationRetryPrompt()` that appends structured error feedback to original user prompt. Exported from index.ts. Typecheck passes (6/6).

### Step 4–6: Add semantic retry helper + integrate in both paths

- **Status**: done
- **Files**: `packages/engine/src/agent/party-agent.ts`
- **Result**: Added `attemptSemanticRetry()` shared helper with fixable-error check, retry prompt, parse+validate, and fallback. Integrated into both `runPartyAgent()` and `processPartyAgentResult()`. Added `:semantic-retry` log tags. Typecheck passes (6/6).

### Step 7: Update existing tests

- **Status**: done
- **Files**: `packages/engine/src/agent/action-parser.test.ts`, `packages/engine/src/agent/party-agent.ts`
- **Result**: Added 7 new tests: unknown action type fixable, non-existent bill fixable with IDs, non-opposition interpellation non-fixable, buildValidationRetryPrompt format/errors/abstains. Fixed lazy prompt building in batch path to avoid crash when retry not needed. All 187 tests pass, typecheck 6/6.
