# KI Bundestag — AI Engine Reference

> **Doc Status**: Active (implementation reference)
> **Use for**: AI call infrastructure, JSON parsing, retry/circuit-breaker, prompt design, fallback policies, console observability

---

## Overview

Every AI-powered step in the simulation flows through a single function `callAI()` in `packages/engine/src/agent/client.ts`. It handles model selection, provider-level circuit breaking, and transient retry. All JSON-returning callers share the `parseAIJson()` utility from `packages/engine/src/agent/ai-json.ts`.

There are **14 `callAI` sites** total: 12 return JSON, 2 return free text (citizen question answers, interpellation answers). The additional call is the **daily briefing** — a shared AI-generated political context document.

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

### Party Profiles (static)

**Location**: [packages/engine/src/agent/party-profiles.ts](packages/engine/src/agent/party-profiles.ts)

Each party has a hand-written personality profile (~200-300 tokens) injected at the top of its system prompt via `getPartyProfile(partyId)`. Profiles include:

- **Voice & rhetoric style** (e.g., SPD: solidarity-focused, worker-centric language)
- **Strategic tendencies** (e.g., CDU: pragmatic, compromise-oriented, fiscally cautious)
- **Red lines** (e.g., Greens: never vote for fossil fuel subsidies)
- **Relationship dynamics** (e.g., FDP: skeptical of Linke, open to CDU)

### Daily Briefing

**Location**: [packages/engine/src/agent/briefing.ts](packages/engine/src/agent/briefing.ts)

A single Haiku call at the start of each day that synthesizes a political briefing document from DB history. Runs once, output shared across all 6 party agents and secondary calls (questions, interpellations, media).

**Input**: Last 30 days of significant events, 14-day approval trends, coalition party IDs.
**Output**: ~800-1200 tokens — political narrative arc, key tensions, outlook.
**Exported**: `buildBriefingBatchRequest()`, `processBriefingResult()`, `getPartyRecentActions()`.

Skipped on days 1-2 (not enough history). On failure, agents run without briefing (same as before this feature).

### Token-budgeted context

`CONTEXT_TOKEN_BUDGET = 8000` estimated tokens (chars / 4 approximation).

**Priority 1 — always included** (core decision-making):
- Party info, coalition/opposition roles, national economic state
- Third-reading and second-reading bills (must vote on third-reading)
- Active crises, active election phase, government/chancellor

**Priority 1.5 — always included** (shared context):
- Daily briefing document (political narrative, tensions, outlook)

**Priority 2 — included if under budget**:
- Recent events (trimmed from 10 → 5 if needed)
- Media headlines (trimmed to 3 if needed)
- Party's own recent actions (14-day lookback: bills proposed, votes, statements)
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

## Batch API — `submitBatch()`

**Location**: [packages/engine/src/agent/batch-client.ts](packages/engine/src/agent/batch-client.ts)

All AI calls in the simulation go through `submitBatch()` instead of individual `callAI()` calls. This uses the **Anthropic Message Batches API** for a 50% cost discount on every token. xAI requests fall back to sequential `callAI()` calls (xAI JSONL batch can be added later).

**Signature**:

```typescript
submitBatch(requests: BatchRequest[]): Promise<BatchResult[]>

interface BatchRequest {
  customId: string;     // e.g. "agent-spd-day42"
  system: string;
  prompt: string;
  maxTokens: number;
  partyId?: string;     // per-party model selection
  roleKey?: RoleKey;    // per-role model selection
}

interface BatchResult {
  customId: string;
  text: string;
  model: string;
  provider: Provider;
}
```

**How it works**:
1. Splits requests by provider (Anthropic vs xAI)
2. Anthropic requests are submitted as a single batch via `client.messages.batches.create()`
3. Polls for completion every `BATCH_POLL_INTERVAL` seconds (default 30s, configurable)
4. Times out after `BATCH_TIMEOUT` seconds (default 3600s)
5. Returns all results matched by `customId`

**Utilities**:
- `findResult(results, customId)` — Look up a specific result by ID
- `chunkItems(items, tokensPerItem, maxTokens)` — Split large inputs within context window

### Batch Groups in `loop.ts`

The simulation loop (`runDay()`) organizes AI calls into batch groups to minimize round-trips:

| Group | Requests | When |
|-------|----------|------|
| **Pre-A: Briefing** | 1 daily briefing call | Every day (day 3+) |
| **A: Party agents** | 6 party agent calls | Every day |
| **B: Interpellations** | 0-2 interpellation answers | Every day |
| **B: Discipline** | 0-6 discipline reasoning calls | Every 7 days |
| **Mid-cycle: Polls + Referendums** | 0-2 conditional calls | Weekly / monthly |
| **C: Media + Summary** | 1-2 end-of-day calls | Every day |
| **Negotiations** | 6 party positions per round | Election only |
| **User-driven** | Q&A, speeches, applications, proposals | Per batch per party/bill |

Each simulation module exports `buildXxxBatchRequest()` and `processXxxBatchResult()` functions. `loop.ts` collects requests from concurrent modules and submits them as single batches.

### Selection-Style Prompts (User-Driven)

**Location**: [packages/engine/src/agent/group-prompts.ts](packages/engine/src/agent/group-prompts.ts)

For user-driven calls that scale with user count, "selection-style" prompts replace per-item review:

| Builder | Strategy | Output Savings |
|---------|----------|---------------|
| `buildApplicationSelectPrompt()` | Select top N from pool | 99% (review 3 of 500) |
| `buildSpeechFlagPrompt()` | Flag bad only, default positive | 95% (flag 0-2 of 200) |
| `buildQuestionBatchPrompt()` | Answer all questions per party | N/A (batch grouping) |
| `buildProposalRankPrompt()` | Rank and select top 2 | 90% (select 2 of 50) |

Pre-filter utilities (`preFilterApplications()`, `preFilterQuestions()`, `preFilterSpeeches()`) reduce input tokens by 50-90% before AI.

---

## Source Anchors

- `callAI()` implementation, circuit breaker, retry: [packages/engine/src/agent/client.ts](packages/engine/src/agent/client.ts#L1-L223)
- Batch API client + polling: [packages/engine/src/agent/batch-client.ts](packages/engine/src/agent/batch-client.ts)
- Selection-style prompt builders: [packages/engine/src/agent/group-prompts.ts](packages/engine/src/agent/group-prompts.ts)
- `parseAIJson()`, `logAICall()`, sanitizers: [packages/engine/src/agent/ai-json.ts](packages/engine/src/agent/ai-json.ts#L1-L207)
- Model routing + env overrides: [packages/engine/src/agent/model-config.ts](packages/engine/src/agent/model-config.ts#L1-L93)
- Token-budgeted prompt builder: [packages/engine/src/agent/prompt.ts](packages/engine/src/agent/prompt.ts#L116-L320)
- Party agent action flow: [packages/engine/src/agent/party-agent.ts](packages/engine/src/agent/party-agent.ts#L1-L120)
- Action parsing + validation: [packages/engine/src/agent/action-parser.ts](packages/engine/src/agent/action-parser.ts#L1-L200)
