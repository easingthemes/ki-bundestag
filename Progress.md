# Progress: Improve AI Context Quality

**Plan**: [docs/plans/improve-ai-context-quality.md](docs/plans/improve-ai-context-quality.md)
**Goal**: Add cross-day memory (briefing), party profiles, expanded context budget, and enriched secondary calls.
**Validation**: `npm run typecheck` from monorepo root.

---

### Step 1: Update AgentContext Type

- **Status**: done
- **Files**: `packages/types/src/types/agent.ts`
- **Result**: Added `briefing?` and `recentOwnActions?` fields. Types package passes typecheck.

### Step 2: Party Profiles

- **Status**: done
- **Files**: `packages/engine/src/agent/party-profiles.ts` (new)
- **Result**: Created 6 hand-written party profiles (voice, strategy, red lines, relationships).

### Step 3: Briefing Builder

- **Status**: done
- **Files**: `packages/engine/src/agent/briefing.ts` (new)
- **Result**: Created briefing builder with `buildBriefingBatchRequest()`, `processBriefingResult()`, and `getPartyRecentActions()`. Queries 30-day event history + 14-day approval trends.

### Step 4: Modify System Prompt

- **Status**: done
- **Files**: `packages/engine/src/agent/prompt.ts`, `packages/engine/src/agent/party-agent.ts`
- **Result**: `buildSystemPrompt(partyId?)` now prepends party profile. Both sequential and batch party agent calls pass partyId.

### Step 5: Modify User Prompt + Expand Budget

- **Status**: done
- **Files**: `packages/engine/src/agent/prompt.ts`
- **Result**: Budget 3K→8K. Briefing as Priority 1.5 (always included). "YOUR RECENT ACTIONS" added to Priority 2.

### Step 6: Wire Briefing into Loop

- **Status**: done
- **Files**: `packages/engine/src/simulation/loop.ts`
- **Result**: Added briefing call before party agents. Each party context now includes briefing text and own recent actions.

### Step 7: Enrich Secondary Calls

- **Status**: done
- **Files**: `group-prompts.ts`, `questions.ts`, `interpellations.ts`, `media.ts`, `loop.ts`
- **Result**: All three secondary calls now receive briefing context. Questions use `politicalContext` on `PartyContext`. Interpellations and media get briefing via parameter.

### Step 8: Update Exports

- **Status**: done
- **Files**: `packages/engine/src/agent/index.ts`
- **Result**: Exported `getPartyProfile`, `buildBriefingBatchRequest`, `processBriefingResult`, `getPartyRecentActions`.
