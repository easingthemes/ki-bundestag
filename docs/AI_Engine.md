# KI Bundestag — AI Engine Reference

> **Doc Status**: Active (implementation reference)
> **Use for**: AI call infrastructure, JSON parsing, retry/circuit-breaker, prompt design, fallback policies, console observability

---

## Overview

Every AI-powered step in the simulation flows through a single function `callAI()` in `packages/engine/src/agent/client.ts`. It handles model selection, provider-level circuit breaking, and transient retry. All JSON-returning callers share the `parseAIJson()` utility from `packages/engine/src/agent/ai-json.ts`.

There are **13 `callAI` sites** total: 11 return JSON, 2 return free text (citizen question answers, interpellation answers).

---

## `callAI()` — Unified AI Call

**Location**: [packages/engine/src/agent/client.ts](packages/engine/src/agent/client.ts)

**Signature**:

```typescript
callAI(opts: {
  system: string;
  prompt: string;
  maxTokens: number;
  partyId?: string;   // use per-party model
  roleKey?: RoleKey;  // use role model (daily/negotiation/synthesis)
}): Promise<AICallResult>

interface AICallResult {
  text: string;
  model: string;
  provider: Provider; // "anthropic" | "xai"
}
```

All call sites destructure `.text`. The `.model` and `.provider` fields are passed to `logAICall()` for structured console observability.

If neither `partyId` nor `roleKey` is supplied, defaults to the `daily` role model.

---

## Model Configuration

**Location**: [packages/engine/src/agent/model-config.ts](packages/engine/src/agent/model-config.ts)

### Per-party models (`PARTY_MODELS`)

Used for daily party agent actions, party-specific negotiations, interpellations, proposal reviews, and question answers:

| Party | Provider | Model |
|---|---|---|
| SPD | anthropic | claude-haiku-4-5-20251001 |
| CDU | anthropic | claude-haiku-4-5-20251001 |
| Grüne | anthropic | claude-haiku-4-5-20251001 |
| FDP | anthropic | claude-haiku-4-5-20251001 |
| AfD | xai | grok-3-mini |
| Linke | anthropic | claude-haiku-4-5-20251001 |

Override: `MODEL_PARTY_<ID>=<provider>:<model>` (e.g., `MODEL_PARTY_AFD=xai:grok-4`)

### Per-role models (`ROLE_MODELS`)

Used for system-wide features not tied to a single party:

| Role key | Default model | Env override | Used for |
|---|---|---|---|
| `daily` | claude-haiku-4-5-20251001 | `MODEL_DAILY` | media, polls, referendums, summary, questions |
| `negotiation` | claude-haiku-4-5-20251001 | `MODEL_NEGOTIATION` | per-party negotiation rounds |
| `synthesis` | claude-sonnet-4-5-20250929 | `MODEL_SYNTHESIS` | coalition agreement synthesis |

---

## Circuit Breaker

`client.ts` maintains a per-provider map of `{ until: string; resetAt: number }`. When an API call fails with a hard usage-limit error (matching `"usage limits? … regain access on <date>"`), the entry is written with `resetAt` parsed from the date string (falls back to `now + 10 min`).

Subsequent calls throw `AIProviderLimitError` immediately without hitting the API. The entry auto-expires: if `Date.now() >= resetAt` it is deleted and the call proceeds normally, logging:

```
[AI] anthropic limit expired, retrying
```

`allProvidersLimited()` returns `true` only when every configured provider has an unexpired entry. `runner-auto` pauses when this is true and resumes once any provider recovers.

---

## Transient Retry

Non-limit failures (HTTP 429 rate-limits, network errors: `ECONNRESET`, `ETIMEDOUT`, `ENOTFOUND`, `EPIPE`, `UND_ERR_CONNECT_TIMEOUT`, fetch failures) are treated as transient. The call retries up to `MAX_RETRIES = 2` times with delays `[2000, 5000]` ms between attempts:

```
[AI] Transient error (attempt 1/3), retrying in 2000ms...
[AI] Transient error (attempt 2/3), retrying in 5000ms...
```

Hard limit errors break the loop immediately and write to the circuit breaker. After all retries are exhausted the error is re-thrown.

---

## Shared JSON Parser (`ai-json.ts`)

**Location**: [packages/engine/src/agent/ai-json.ts](packages/engine/src/agent/ai-json.ts)

All 11 JSON-returning sites use `parseAIJson()` instead of ad-hoc `JSON.parse`. The sanitizers are also exported for use by `action-parser.ts`.

### Functions

**`extractJson(raw: string): string`**
Strips markdown code fences (`` ```json … ``` `` or `` ``` … ``` ``) and trims. Returns the inner text or the original if no fences found.

**`safeParseJson<T>(raw: string): T | null`**
1. `extractJson(raw)`
2. `JSON.parse`; if that fails, apply sanitizers and retry
3. Returns `null` on all parse failures

Sanitizers applied on retry:
- `stripLeadingPlusInJsonNumbers` — removes leading `+` before numeric values (e.g., `+0.5` → `0.5`)
- `stripTrailingCommasInJson` — removes trailing commas before `}` or `]`

**`parseAIJson<T>(raw, validator, label): T | null`**
1. `safeParseJson(raw)`
2. `validator(parsed)` — returns typed `T` or `null`
3. On parse failure: `console.warn('[<label>] Failed to parse AI JSON response')`
4. On validation failure: `console.warn('[<label>] AI response failed schema validation')`

**`logAICall(opts): void`**
Emits a structured `[AI]` line to stdout:

```
[AI] media | anthropic/claude-haiku-4-5-20251001 | 843ms | OK
[AI] summary | anthropic/claude-haiku-4-5-20251001 | 1201ms | PARSE_FAIL fallback=skip
[AI] speeches | xai/grok-3-mini | 512ms | VALIDATION_FAIL fallback=neutral
```

Status values: `OK`, `PARSE_FAIL`, `VALIDATION_FAIL`.

---

## Prompt Design (`prompt.ts`)

**Location**: [packages/engine/src/agent/prompt.ts](packages/engine/src/agent/prompt.ts)

### System prompt hardening rules

All party-agent system prompts include explicit constraints:

- `"Do NOT wrap JSON in markdown code fences. Respond with raw JSON only."`
- `"Impact numbers must be plain numbers, not strings. Do not use leading + signs."`
- `"Do not include trailing commas in JSON arrays or objects."`

Negotiation and synthesis prompts add:

- `"acceptablePartners must only contain valid party IDs from the list provided."`
- `"All party IDs in the response must match the IDs from ELECTION RESULTS."`

Summary prompts include:

- Explicit mood enum: `"mood must be one of: optimistic, tense, divided, hopeful, turbulent, calm, critical"`
- `"narrative should be 2-3 sentences."`

### Token-budgeted context

`CONTEXT_TOKEN_BUDGET = 3000` estimated tokens (chars / 4 approximation).

**Priority 1 — always included** (core decision-making):
- Party info, coalition/opposition roles, national economic state
- Third-reading and second-reading bills (must vote on third-reading)
- Active crises, active election phase, government/chancellor

**Priority 2 — included if under budget**:
- Recent events (trimmed from 10 → 5 if needed)
- Media headlines (trimmed to 3 if needed)
- Internal member proposals, recently proposed bills

**Priority 3 — dropped if over budget**:
- Motions, interpellations, confidence votes, constitutional challenges, past bills for challenge

When sections are trimmed, a `// context trimmed` comment is appended to the prompt.

---

## Per-Module Fallback Policies

Documented in `ai-json.ts` comments and applied by each call site on `null` result:

| Module | File | Fallback behavior |
|---|---|---|
| party-agent | `agent/party-agent.ts` | Abstain all third-reading bills |
| negotiations (round) | `simulation/negotiations.ts` | `"Open to negotiations"` + accept all partners |
| negotiations (synthesis) | `simulation/negotiations.ts` | `null` → algorithmic `findBestCoalition()` |
| media | `simulation/media.ts` | No articles that day |
| polls | `simulation/polls.ts` | No context poll that cycle |
| referendums | `simulation/referendums.ts` | No referendum generated |
| summary | `simulation/summary.ts` | `null` → no daily narrative stored |
| internal-proposals | `simulation/internal-proposals.ts` | Decline with default reason |
| seats (MdB applications) | `simulation/seats.ts` | Reject with default reasoning |
| discipline | `simulation/discipline.ts` | Default German reason strings per member |
| speeches | `simulation/speeches.ts` | 0 (neutral impact, no approval change) |
| questions | `simulation/questions.ts` | Question stays pending (free text, no JSON) |
| interpellations | `simulation/interpellations.ts` | Interpellation stays pending (free text) |

---

## Console Output Format

Every AI invocation emits one structured line:

```
  [AI] <task> | <provider>/<model> | <latency>ms | <status>[fallback=<value>]
```

Examples:

```
  [AI] party:spd | anthropic/claude-haiku-4-5-20251001 | 1034ms | OK
  [AI] media | anthropic/claude-haiku-4-5-20251001 | 892ms | OK
  [AI] summary | anthropic/claude-haiku-4-5-20251001 | 741ms | VALIDATION_FAIL fallback=skip
  [AI] seats | anthropic/claude-haiku-4-5-20251001 | 563ms | PARSE_FAIL fallback=reject
  [AI] anthropic limit expired, retrying
  [AI] Transient error (attempt 1/3), retrying in 2000ms...
  *** ANTHROPIC API LIMIT REACHED — access resumes 2026-02-23T10:00:00Z ***
```

All observability is console-only. No DB writes or telemetry tables.

---

## Source Anchors

- `callAI()` implementation, circuit breaker, retry: [packages/engine/src/agent/client.ts](packages/engine/src/agent/client.ts#L1-L223)
- `parseAIJson()`, `logAICall()`, sanitizers: [packages/engine/src/agent/ai-json.ts](packages/engine/src/agent/ai-json.ts#L1-L207)
- Model routing + env overrides: [packages/engine/src/agent/model-config.ts](packages/engine/src/agent/model-config.ts#L1-L93)
- Token-budgeted prompt builder: [packages/engine/src/agent/prompt.ts](packages/engine/src/agent/prompt.ts#L116-L320)
- Party agent action flow: [packages/engine/src/agent/party-agent.ts](packages/engine/src/agent/party-agent.ts#L1-L120)
- Action parsing + validation: [packages/engine/src/agent/action-parser.ts](packages/engine/src/agent/action-parser.ts#L1-L200)
