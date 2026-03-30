# Plan: Improve AI Context Quality

> **Status**: Implemented (all 8 steps complete)

## Goal

Make party AI agents smarter by giving them cross-day memory (daily briefing), distinct personalities (party profiles), and richer context (expanded token budget). No real-world news fetching (tracked separately in todo #029).

## Current Problems

1. **No cross-day memory**: Parties see only last 5 events and 3 media articles. No memory of own past decisions, bills proposed, votes cast, or statements made.
2. **Identical system prompt**: All 6 parties get the same 108-line system prompt. Differentiation relies on a brief ideology string ("Center-left social democracy") and numeric priority vector.
3. **Shallow secondary call context**: Spokesperson answering questions only sees the question text — not what's happening in parliament or what the party recently did.
4. **Conservative token budget**: 3000 tokens for optional context is very tight given Haiku's 200K window.

## Architecture

### New: Daily Briefing Call (1 extra Haiku call/day)

A single AI call at the start of each day that synthesizes a **political briefing document** from DB history. Runs once, output shared across all party agent prompts.

**Input (from DB):**
- Last 30 days of significant events (bills passed/rejected, elections, crises, statements)
- Each party's recent actions summary (what they proposed, how they voted, approval trend)
- Economic trend over last 14 days (not just current snapshot)
- Coalition dynamics (which parties cooperated/clashed recently)

**Output (~800-1200 tokens):**
- Political narrative arc (2-3 sentences: what's the story?)
- Key tensions and open questions
- Per-party positioning summary (1 line each)
- Economic outlook

**Why shared:** Same facts, different interpretation. Each party gets the same briefing but their party-specific system prompt determines how they react. This saves 5 extra calls vs per-party briefings.

### New: Party Profiles (static, in code)

Per-party personality definitions that go into the system prompt. Each profile includes:
- **Voice & rhetoric style** (e.g., SPD: solidarity-focused, worker-centric language)
- **Strategic tendencies** (e.g., CDU: pragmatic, compromise-oriented, fiscally cautious)
- **Red lines** (e.g., Greens: never vote for fossil fuel subsidies)
- **Relationship dynamics** (e.g., FDP: skeptical of Linke, open to CDU)

These are hand-written, static strings — ~200-300 tokens each.

### Modified: Expanded Context Budget

Increase `CONTEXT_TOKEN_BUDGET` from 3000 to 8000 tokens. Add new context sections:
- Party's own recent actions (last 14 days: bills proposed, votes, statements)
- Daily briefing document (shared across parties)

### Modified: Enriched Secondary Call Context

Pass relevant party/political context to:
- **Questions**: spokesperson knows current positions, recent events, active crises
- **Interpellations**: minister knows their portfolio's recent activity
- **Media**: journalists get the briefing for richer narrative

---

## Implementation Steps

### Step 1: Party Profiles (`packages/engine/src/agent/party-profiles.ts`)
- **New file** with `getPartyProfile(partyId): string`
- 6 hand-written profiles (~15-20 lines each)
- Covers voice, strategy, red lines, typical allies/opponents

### Step 2: Briefing Builder (`packages/engine/src/agent/briefing.ts`)
- **New file** with `buildBriefingBatchRequest()` and `processBriefingResult()`
- Queries DB for last 30 days of events, party actions, economic history
- Returns a `BatchRequest` with `roleKey: "daily"`
- Output: structured briefing text (~800-1200 tokens)

### Step 3: Modify System Prompt (`packages/engine/src/agent/prompt.ts`)
- `buildSystemPrompt(partyId?)` → accepts optional partyId
- Prepends party profile before the rules
- Keep rules/schema section unchanged

### Step 4: Modify User Prompt (`packages/engine/src/agent/prompt.ts`)
- Add briefing text as new Priority 1.5 section (always included, after core lines)
- Add "YOUR RECENT ACTIONS" section (Priority 2, from DB: last 14 days of own bills/votes/statements)
- Increase `CONTEXT_TOKEN_BUDGET` from 3000 to 8000

### Step 5: Wire Briefing into Loop (`packages/engine/src/simulation/loop.ts`)
- Before party agents batch: build + submit briefing request
- Pass briefing result text into each `AgentContext`
- Add `briefing?: string` to `AgentContext` type

### Step 6: Update AgentContext Type (`packages/types/src/types/agent.ts`)
- Add `briefing?: string` field
- Add `recentOwnActions?: { day: number; type: string; title: string }[]` field

### Step 7: Enrich Secondary Calls
- `questions.ts`: Add party context (recent positions, crises) to spokesperson prompt
- `interpellations.ts`: Add portfolio-relevant context to minister prompt
- `media.ts`: Pass briefing into journalist prompt for richer narrative

### Step 8: Update Exports (`packages/engine/src/agent/index.ts`)
- Export new modules (party-profiles, briefing)

---

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `engine/src/agent/party-profiles.ts` | **New** | Per-party personality/voice/strategy profiles |
| `engine/src/agent/briefing.ts` | **New** | Daily briefing batch request builder + processor |
| `engine/src/agent/prompt.ts` | Modify | Accept party profile in system prompt; add briefing + own actions to user prompt; expand budget |
| `engine/src/agent/party-agent.ts` | Modify | Pass partyId to buildSystemPrompt |
| `engine/src/agent/index.ts` | Modify | Export new modules |
| `engine/src/simulation/loop.ts` | Modify | Add briefing call before party agents; query own actions |
| `engine/src/simulation/questions.ts` | Modify | Enrich spokesperson prompt with context |
| `engine/src/simulation/interpellations.ts` | Modify | Enrich minister prompt with portfolio context |
| `engine/src/simulation/media.ts` | Modify | Pass briefing to journalist prompt |
| `types/src/types/agent.ts` | Modify | Add briefing + recentOwnActions fields |

## Cost Impact (Actual)

- +1 Haiku call/day for briefing: ~$0.002/day
- ~33% more input tokens per party agent (profile + briefing + own actions): ~$0.006/day
- Enriched secondary calls (media, questions, interpellations): ~$0.001/day
- **Total increase: ~$0.008/day (~17% increase from $0.047 to $0.055)**
- Per Wahlperiode: ~$58 (was ~$44)

## Risks

- Briefing call could fail → fallback: skip briefing, run agents without it (same as today)
- Larger prompts → slightly slower responses, but well within Haiku limits
- Party profiles need manual tuning — initial version may need iteration

## Not In Scope

- Real-world news fetching (see todo #029)
- Per-party briefings (too expensive — 6x cost for marginal benefit)
- Model upgrades (separate concern)
