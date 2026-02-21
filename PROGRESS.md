# Progress

**Status**: ✅ Complete — All 5 steps done. Multi-provider AI integration ready for production.

## Goal

Make AI model provider configurable per party, integrating xAI (Grok) via Vercel AI SDK alongside existing Anthropic SDK, with AfD using xAI as first non-Anthropic party.

## Steps

### Step 1: Install Vercel AI SDK + provider packages

- **Status**: done
- **Files**: `packages/engine/package.json`
- **Plan**:
  1. DONE already `npm install ai @ai-sdk/anthropic @ai-sdk/xai --workspace=packages/engine`
  2. Keep `@anthropic-ai/sdk` for now
- **Validate**: `npm run typecheck`

### Step 2: Create per-party model config + unified AI client

- **Status**: done
- **Files**: `packages/engine/src/agent/model-config.ts` (new), `packages/engine/src/agent/client.ts`, `packages/engine/src/agent/index.ts`, `packages/engine/src/index.ts`
- **Result**: Created `PARTY_MODELS` map (AfD→xAI grok-3-mini, others→Anthropic Haiku), `ROLE_MODELS` map (daily/negotiation/synthesis), unified `callAI()` function with Vercel AI SDK using `maxOutputTokens`. Env override support: `MODEL_PARTY_<ID>` and backward-compat `MODEL_DAILY`/`MODEL_NEGOTIATION`/`MODEL_SYNTHESIS`. Typecheck passes.

### Step 3: Migrate party-agent.ts to unified client

- **Status**: done
- **Files**: `packages/engine/src/agent/party-agent.ts`
- **Result**: Replaced `getClient()` + `client.messages.create()` with `callAI()`, passing `partyId` for per-party model selection. All 6 parties produce valid actions: SPD (2845 chars, 6 actions), CDU/CSU (2802 chars, 6 actions), Grüne (2987 chars, 7 actions), FDP (2579 chars, 6 actions), **AfD (1156 chars, 4 actions via xAI grok-3-mini)**, Linke (3140 chars, 7 actions). Day 104 simulation completed successfully with votes, amendments, statements, motions.
- **Plan**:
  1. Replace `getClient()` + `client.messages.create()` with `callAI()`, passing `partyId` from `ctx.party.id`
  2. The response is already `string` — `callAI()` returns text directly, no need to extract from content blocks
  3. Keep the same `parseAgentResponse()` + `validateActions()` pipeline — no change to action parsing
  4. Keep fallback abstain logic on error
- **Validate**: `npm run simulate 1` — verify all 6 parties produce valid actions, AfD uses xAI

### Step 4: Migrate all other AI call sites

- **Status**: done
- **Files**: `negotiations.ts` (2 calls), `media.ts`, `polls.ts`, `referendums.ts`, `interpellations.ts`, `internal-proposals.ts`, `summary.ts`, `questions.ts`
- **Result**: Migrated all 10 AI call sites from Anthropic SDK to `callAI()`. Per-party calls (interpellations, internal-proposals, questions, per-party negotiation) use `partyId` parameter. System-wide calls (media, polls, referendums, summary) use `roleKey: "daily"`. Synthesis call uses `roleKey: "synthesis"`. Day 105 simulation: all agents responded, 2 interpellations answered (via ministers' party models), 3 media articles generated, 2 polls created. Typecheck passes.
  - `packages/engine/src/simulation/negotiations.ts` — 2 calls (per-party negotiation + synthesis)
  - `packages/engine/src/simulation/media.ts` — 1 call (system-wide)
  - `packages/engine/src/simulation/polls.ts` — 1 call (system-wide)
  - `packages/engine/src/simulation/referendums.ts` — 1 call (system-wide)
  - `packages/engine/src/simulation/interpellations.ts` — 1 call (per-minister)
  - `packages/engine/src/simulation/internal-proposals.ts` — 1 call (per-party)
  - `packages/engine/src/simulation/summary.ts` — 1 call (system-wide)
  - `packages/engine/src/simulation/questions.ts` — 1 call (per-party)
- **Plan**: For each file, replace `getClient()` + `client.messages.create({model, max_tokens, system, messages})` with `callAI({system, prompt, maxTokens, partyId?, roleKey?})`:
  - **Party-specific calls** (negotiations per-party, interpellations, proposals, questions): pass `partyId` → uses that party's configured model
  - **System-wide calls** (media, polls, referendums, summary, synthesis): pass `roleKey: "daily"` or `"synthesis"` → uses `ROLE_MODELS` lookup
  - Response handling stays identical — `callAI()` returns `string`, same as what each call site currently extracts from `response.content[0].text`
  - Special case: `interpellations.ts` answers as a minister from the *target party*, so pass `targetPartyId` rather than the filing party
- **Validate**: `npm run typecheck && npm run simulate 1`

### Step 5: Clean up + expose config in Admin page

- **Status**: done
- **Files**:
  - `packages/engine/src/agent/client.ts` — removed old Anthropic SDK imports, `getClient()`, `MODELS`, `MODEL`, `MAX_TOKENS`, `ModelKey`
  - `packages/engine/src/agent/party-agent.ts` — removed `modelKey` parameter, hardcoded maxTokens
  - `packages/engine/src/agent/index.ts` — removed `getClient`, `MODEL` exports
  - `packages/engine/src/simulation/loop.ts` — removed `"daily"` argument from runPartyAgent call
  - `packages/engine/src/simulation/negotiations.ts` — removed MAX_TOKENS import, hardcoded 1024/4096
  - `packages/engine/package.json` — removed `@anthropic-ai/sdk` dependency
  - `.env.example` — added XAI_API_KEY, per-party override examples, improved comments
  - `packages/web/src/pages/Admin.tsx` — updated MODEL_CONFIG to show 6 party models + 3 role models (9 total)
  - `.claude/CLAUDE.md` — updated Model Configuration section with Vercel AI SDK v6 architecture
- **Results**: Typecheck passed (4.657s), Day 106 simulation successful (6 agents responded, 5 proposals, 6 statements, 2 motions, 2 interpellations filed, 2 answered, 3 media articles). Clean build with no old SDK references.
  - `packages/engine/src/agent/client.ts` — remove old `getClient()`, `MODELS`, `MODEL` exports once all callers migrated
  - `packages/engine/package.json` — remove `@anthropic-ai/sdk` dependency
  - `packages/engine/src/agent/index.ts` — clean up exports
  - `.env.example` — add `XAI_API_KEY`
  - `packages/api/src/index.ts` — update `/api/models` or Admin config to show per-party model assignments
- **Plan**:
  1. Remove `@anthropic-ai/sdk` from deps, remove old `getClient()` / `MODELS` / `MODEL` / `MAX_TOKENS` exports
  2. Update `.env.example` with `XAI_API_KEY` and per-party override examples
  3. Update Admin page model config table to show per-party model assignments (currently shows 3 model keys; should show 6 parties + their provider:model)
  4. Update CLAUDE.md model configuration section
- **Validate**: `npm run typecheck && npm run build && npm run simulate 1`
- **Risks**: Other packages might import `getClient` or `MODEL` from engine — need to check all imports

## Notes

- **xAI env var**: `XAI_API_KEY` already set in `.env`, and `@ai-sdk/xai` uses it by default
- **Anthropic env var**: `ANTHROPIC_API_KEY` already set, `@ai-sdk/anthropic` uses it by default
- **10 AI call sites total** across 9 files (negotiations.ts has 2)
- **Pricing comparison**: Haiku = $0.80/$4.00, grok-3-mini = $0.30/$0.50 — xAI is actually cheaper
- **grok-3-mini** chosen for AfD: fast, cheap, good for structured JSON output. Can upgrade to `grok-4` later if quality needs improvement
- Current `MAX_TOKENS` map: daily=2048, negotiation=1024, synthesis=4096 — these stay as-is per call site (some override with hardcoded values anyway)
