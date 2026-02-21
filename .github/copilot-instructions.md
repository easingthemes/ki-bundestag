# KI Bundestag: AI Coding Agent Guidelines

## Project Overview

AI-powered German parliament simulation: 6 Claude Haiku-driven parties propose bills, debate, vote daily. SQLite + Drizzle ORM backend, Express API, React 19 frontend. Monorepo with npm workspaces + Turborepo.

## Quick Start

```bash
npm install                  # Install all workspace dependencies
npm run seed                 # Fresh DB: wipe + seed parties (backs up first)
npm run migrate              # Apply schema changes only (safe)
npm run simulate 5           # Run 5 simulation days
npm run dev:api              # Express API on :3001
npm run dev:web              # Vite dev server on :5173 (proxies /api)
npm run build                # Build all packages via turbo
npm run typecheck            # Check all packages
```

## Critical: ESM Import Pattern

**All packages use ESM** (`"type": "module"`). Internal imports MUST use `.js` extensions:

```typescript
// ✅ Correct
import { runDay } from "./simulation/loop.js";
import { getDb } from "../db/connection.js";

// ❌ Wrong - will fail at runtime
import { runDay } from "./simulation/loop";
```

See [tsconfig.base.json](../tsconfig.base.json) for module config: `Node16` + `.js` extensions required.

## Critical: Package Export Pattern

`types` and `engine` packages export `src/index.ts` directly (not `dist/`) to ensure `tsx` always loads current source:

```json
{
  "exports": {
    ".": {
      "import": "./src/index.ts",
      "default": "./src/index.ts"
    }
  }
}
```

**Never change `default` to `dist/`** — this previously caused DB path bugs. See [packages/engine/package.json](../packages/engine/package.json) for reference.

## Architecture

**Dependency chain**: `types` ← `engine` ← `api`. Web is standalone (no workspace deps, uses local type copies in [packages/web/src/api.ts](../packages/web/src/api.ts)).

**Database**: Two SQLite databases in `data/` (both WAL mode):

- `simulation.db` — Engine state (parties, bills, events, etc.). Access via `getDb()` / `getSqlite()`
- `users.db` — App-owned data (users, proposals, votes, signals). Access via `getUserDb()` / `getUserSqlite()`

Paths resolved via `findMonorepoRoot()` in [packages/engine/src/db/connection.ts](../packages/engine/src/db/connection.ts). Override: `DATABASE_PATH`, `USER_DATABASE_PATH` env vars.

**Simulation**: Entry point is [packages/engine/src/simulation/loop.ts](../packages/engine/src/simulation/loop.ts) `runDay()` function. 13-step daily loop: economic drift → injections → elections → agent calls → action processing → confidence votes → budget cycle → media → summary.

## Code Style Patterns

**Naming**: kebab-case files (`action-parser.ts`), camelCase functions, PascalCase types/components, SCREAMING_SNAKE_CASE constants.

**Error Handling**:

- Agent calls: try-catch with fallback actions ([packages/engine/src/agent/party-agent.ts](../packages/engine/src/agent/party-agent.ts#L33-L52))
- Validation: log warnings + skip invalid actions, never throw ([packages/engine/src/agent/action-parser.ts](../packages/engine/src/agent/action-parser.ts))
- Frontend API: centralized error callback in [packages/web/src/api.ts](../packages/web/src/api.ts#L18-L33)

**Database Queries**: Direct Drizzle pattern:

```typescript
// Select
const rows = db.select().from(schema.parties).all();

// Update
db.update(schema.parties)
  .set({ approvalRating: newValue })
  .where(eq(schema.parties.id, partyId))
  .run();

// Insert
db.insert(schema.bills).values({ id, title, ... }).run();
```

**React State**: `useState` + `useEffect` + custom `usePolling` hook ([packages/web/src/usePolling.ts](../packages/web/src/usePolling.ts)). No CSS-in-JS, global styles in [packages/web/src/styles.css](../packages/web/src/styles.css).

## Model Configuration

AI calls use **Vercel AI SDK v6** with per-party and per-role model selection (see [packages/engine/src/agent/model-config.ts](../packages/engine/src/agent/model-config.ts)):

**Per-Party Models**:

- SPD, CDU, Grüne, FDP, Linke: `anthropic:claude-haiku-4-5-20251001` ($0.80/$4.00 per 1M tokens)
- AfD: `xai:grok-3-mini` ($0.30/$0.50 per 1M tokens) — cost savings
- Override via: `MODEL_PARTY_<ID>` env vars (e.g., `MODEL_PARTY_AFD=xai:grok-3-mini`)

**Per-Role Models**:

- `MODEL_DAILY` (default: anthropic:claude-haiku-4-5-20251001) — system-wide calls
- `MODEL_NEGOTIATION` (default: anthropic:claude-haiku-4-5-20251001) — coalition rounds
- `MODEL_SYNTHESIS` (default: anthropic:claude-sonnet-4-5-20250929) — coalition agreement synthesis

Unified client: [`callAI()`](../packages/engine/src/agent/client.ts) routes to appropriate provider. API keys: `ANTHROPIC_API_KEY`, `XAI_API_KEY`.

## Database Operations

**Seed vs Migrate**:

- `npm run seed` — **Destructive**: drops all tables in both DBs, creates fresh state with parties + govt (backs up both files first)
- `npm run migrate` — **Safe**: applies schema changes only to both DBs ([packages/engine/src/migrate.ts](../packages/engine/src/migrate.ts))

**Schema**: 20+ tables split across two DBs in [packages/engine/src/db/schema.ts](../packages/engine/src/db/schema.ts). JSON columns use `mode: "json"`, booleans use `mode: "boolean"` (stored as integers).

**Migration**: One-time migration script available: `npx tsx scripts/migrate-users-db.ts` (moves user tables from old single-DB layout).

## Testing & Linting

**None currently exist**. No test/lint scripts in any package.json. Validation happens at runtime via TypeScript strict mode.

## Environment

Copy `.env.example` → `.env`. Required: `ANTHROPIC_API_KEY`, `XAI_API_KEY`. Optional: `DATABASE_PATH`, `USER_DATABASE_PATH`, `API_PORT`, per-party model overrides (`MODEL_PARTY_<ID>`), role model overrides (`MODEL_DAILY`, `MODEL_NEGOTIATION`, `MODEL_SYNTHESIS`).

## Key Files to Reference

- **Simulation flow**: [packages/engine/src/simulation/loop.ts](../packages/engine/src/simulation/loop.ts) — main `runDay()` loop
- **Agent actions**: [packages/engine/src/agent/action-parser.ts](../packages/engine/src/agent/action-parser.ts) — validation rules
- **DB schema**: [packages/engine/src/db/schema.ts](../packages/engine/src/db/schema.ts) — 20+ tables
- **API endpoints**: [packages/api/src/index.ts](../packages/api/src/index.ts) — single-file Express REST
- **Type definitions**: [packages/types/src/index.ts](../packages/types/src/index.ts) — shared across engine/api
- **Frontend state**: [packages/web/src/pages/Dashboard.tsx](../packages/web/src/pages/Dashboard.tsx) — typical React pattern
- **Economic logic**: [packages/engine/src/simulation/economy.ts](../packages/engine/src/simulation/economy.ts) — mean-reversion drift

## Development Notes

- **Working directory doesn't matter** — DB path resolution works from any location via `findMonorepoRoot()`
- **No build needed for scripts** — `tsx` runs `.ts` directly (seed, migrate, simulate)
- **Frontend doesn't import workspace packages** — uses local type copies to avoid bundler complexity
- **Scripts run from monorepo root** — all `npm run` commands expect cwd at workspace root
