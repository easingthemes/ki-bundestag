# Progress: Context & Memory Management for Long-Running Simulation

**Plan**: [docs/plans/context-memory-management.md](docs/plans/context-memory-management.md)
**Goal**: Prevent AI response quality degradation as simulation days accumulate. Bound prompt size, add era summaries, structured output, and prompt hardening.
**Validation**: `npx turbo run typecheck 2>&1 | tail -5` (engine typecheck has pre-existing errors from missing dev deps — check for NEW errors only)

---

### Step 1: Phase 1a — Event query optimization (loop.ts)

- **Status**: done
- **Files**: `packages/engine/src/simulation/loop.ts`
- **Result**: Replaced unbounded `simulationEvents.all()` + `.slice(-20)` with Drizzle query bounded to last 7 days + `depthConfig.recentEventsMax` limit. Added `gte` import.

### Step 2: Phase 1b — Bill ID enforcement in prompt (prompt.ts)

- **Status**: done
- **Files**: `packages/engine/src/agent/prompt.ts`
- **Result**: Added `VALID BILL IDs FOR VOTING` and `VALID BILL IDs FOR AMENDMENTS` sections after reading sections in `buildUserPrompt()`.

### Step 3: Phase 1c — Briefing cap + DepthConfig additions (context-depth.ts, briefing.ts)

- **Status**: done
- **Files**: `packages/engine/src/agent/context-depth.ts`, `packages/engine/src/agent/briefing.ts`
- **Result**: Added `briefingMaxEvents`, `enableEraSummaries`, `eraSummaryIntervalDays` to DepthConfig. Updated presets (normal lookback 30→7, high 60→14). Added `hasEraSummaries` flag to suppress older events section.

### Step 4: Phase 3a+3b — Prompt hardening (prompt.ts)

- **Status**: done
- **Files**: `packages/engine/src/agent/prompt.ts`
- **Result**: Added CANNOT list based on party capabilities, bill ID usage rule, and JSON schema reinforcement reminder at end of system prompt.

### Step 5: Phase 4a-4c — Structured output (batch-client.ts, action-parser.ts, ai-json.ts)

- **Status**: done
- **Files**: `packages/engine/src/agent/batch-client.ts`, `packages/engine/src/agent/party-agent.ts`
- **Result**: Added `outputSchema` to BatchRequest, `structuredOutput` to BatchResult. Anthropic batch requests include `output_config.format.json_schema`. Party agent requests auto-detect provider. `processPartyAgentResult` bypasses parse pipeline for structured output. Full pipeline preserved for xAI.

### Step 6: Phase 2a — Era summaries table + schema (ddl.ts, schema-sim.ts, db/index.ts)

- **Status**: done
- **Files**: `packages/engine/src/db/ddl.ts`, `packages/engine/src/db/schema-sim.ts`, `packages/types/src/types/agent.ts`
- **Result**: Added `era_summaries` table DDL + index migration. Added Drizzle `eraSummaries` table definition (auto-exported via schema barrel). Added `eraSummaries` field to `AgentContext`.

### Step 7: Phase 2b — Era summary module (era-summary.ts)

- **Status**: done
- **Files**: `packages/engine/src/simulation/era-summary.ts`
- **Result**: Created module with `shouldGenerateEraSummary()`, `buildEraSummaryBatchRequest()`, `processEraSummaryResult()`, `getEraSummaries()`, `getLastEraSummaryEnd()`. Uses simulation events + party history as input. Persists to DB with graceful failure handling.

### Step 8: Phase 2c+2d+2e — Loop integration + prompt injection + briefing dedup

- **Status**: done
- **Files**: `packages/engine/src/simulation/loop.ts`, `packages/engine/src/agent/prompt.ts`
- **Result**: Integrated era summary generation in loop before briefing. Passed `eraSummaries` to agent contexts. Added HISTORICAL CONTEXT section between P1 and P1.5. Passed `hasEraSummaries` to briefing builder to suppress older events section.

### Step 9: Final validation + commit

- **Status**: in-progress
- **Plan**: Run full typecheck. Verify no regressions. Run tests if available. Commit all changes with descriptive message. Push to branch.
- **Files**: (all changed files)
