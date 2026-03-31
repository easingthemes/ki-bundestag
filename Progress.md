# Progress: Real-World Knowledge Grounding

**Plan**: [docs/plans/real-world-knowledge-grounding.md](docs/plans/real-world-knowledge-grounding.md)
**Goal**: Ground simulation in real German politics via structured APIs, category-based knowledge injection.
**Validation**: `npm run typecheck` from monorepo root (engine/types/api pass; web has pre-existing React type issues).

---

### Step 1: DB table + Drizzle schema

- **Status**: done
- **Files**: `packages/engine/src/db/ddl.ts`, `packages/engine/src/db/schema-sim.ts`, `packages/engine/src/db/seed.ts`
- **Result**: Added `real_world_knowledge` table to SIM_TABLE_DDL + Drizzle schema. Added to seed DROP list.

### Step 2: Knowledge fetch module

- **Status**: done
- **Files**: `packages/engine/src/simulation/knowledge-fetch.ts` (new)
- **Result**: Fetchers for tagesschau API, WELT RSS, abgeordnetenwatch polls, Bundestag DIP bills. All with timeout + graceful fallback.

### Step 3: Digest batch request

- **Status**: done
- **Files**: `packages/engine/src/simulation/knowledge-fetch.ts`
- **Result**: Single Haiku call classifies raw data into landscape/party_positions/shocks/headlines. Structured JSON output.

### Step 4: Knowledge query functions

- **Status**: done
- **Files**: `packages/engine/src/simulation/knowledge-fetch.ts`
- **Result**: `getActiveLandscape()`, `getPartyPositions()`, `getActiveShocks()`, `getHeadlineInspiration()`, `buildRealWorldContext()`.

### Step 5: Wire into AgentContext type

- **Status**: done
- **Files**: `packages/types/src/types/agent.ts`
- **Result**: Added `realWorldContext?: string` and `realPartyPositions?: string` fields.

### Step 6: Inject into prompts

- **Status**: done
- **Files**: `packages/engine/src/agent/prompt.ts`
- **Result**: Real-world context injected at Priority 1.5 (after briefing), gated by `enableKnowledgeGrounding`.

### Step 7: Enrich party profiles

- **Status**: done
- **Files**: `packages/engine/src/agent/party-profiles.ts`, `packages/engine/src/agent/party-agent.ts`, `packages/engine/src/agent/prompt.ts`
- **Result**: `getPartyProfile()` accepts optional `realPositions` overlay. `buildSystemPrompt()` passes it through. Party agent wires `ctx.realPartyPositions`.

### Step 8: Depth config controls

- **Status**: done
- **Files**: `packages/engine/src/agent/context-depth.ts`
- **Result**: Added `enableKnowledgeGrounding: boolean`. Low=disabled, Normal/High=enabled.

### Step 9: Wire into simulation loop

- **Status**: done
- **Files**: `packages/engine/src/simulation/loop.ts`
- **Result**: Knowledge fetch + digest runs before briefing (weekly gate). `buildRealWorldContext()` + `getPartyPositions()` injected into agent contexts.

### Step 10: Handle seed scenario

- **Status**: done
- **Files**: `packages/engine/src/db/seed.ts`
- **Result**: Table created on seed via SIM_TABLE_DDL. First `runDay()` auto-triggers initial fetch.

### Step 11: Update exports

- **Status**: done
- **Files**: `packages/engine/src/simulation/index.ts`
- **Result**: All knowledge functions exported from simulation index.
