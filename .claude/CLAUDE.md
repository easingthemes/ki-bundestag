# CLAUDE.md

## Project Overview

KI Bundestag is an AI-powered simulation of the German parliament. Six political parties, each driven by Claude Haiku, propose bills, debate, vote, and issue statements day by day. After elections, parties negotiate coalition terms over multiple rounds. Results are stored in SQLite and served via a REST API to a React frontend with news feed, polls, and party profiles.

## Setup (MANDATORY before any work)

**Always run `npm install` from the monorepo root before starting any task.** This ensures all workspace dependencies are resolved. Without it, typecheck and tests will show false errors about missing modules.

## Commands (run from monorepo root)

```bash
npm run seed              # Fresh start: wipe DB, seed 6 parties + initial state (backs up first)
npm run migrate           # Apply schema changes without clearing data (safe to run repeatedly)
npm run simulate          # Run simulation days (e.g., npm run simulate 5)
npm run simulate:auto     # Continuous simulation loop (preset-aware delays)
npm run dev:api           # Express API on port 3001
npm run dev:web           # Vite dev server on port 5173 (proxies /api → :3001)
npm run build             # Build all packages via turbo
npm run typecheck         # Typecheck all packages via turbo
npm run lint              # ESLint all packages
npm run test              # Run test suite (Vitest)
npm run kill              # Kill dev servers on ports 3001 and 5173
```

## Architecture

Monorepo with npm workspaces + Turborepo. Four packages:

- **`types`** — Pure TypeScript type definitions (`emitDeclarationOnly`), no runtime code
- **`engine`** — Core simulation: AI agent calls, DB access (Drizzle + better-sqlite3), simulation loop
- **`api`** — Express REST server (11 domain routers in `src/routes/`), imports from engine + types
- **`web`** — React 19 SPA (Vite + React Router v7 + Tailwind CSS v4 + shadcn/ui)

Dependency chain: `types` ← `engine` ← `api`. Web is standalone (no workspace deps).

## Critical Warnings

**Package exports**: Both `types` and `engine` point `"import"` and `"default"` exports to `./src/index.ts` (not `dist/`). If `"default"` ever points to `dist/`, tsx may load stale compiled code — this previously caused a DB path resolution bug.

**ESM**: All packages use `"type": "module"`. Internal imports within engine use `.js` extensions (Node16 ESM requirement).

**DB path resolution**: Path resolved via `import.meta.url` + `findMonorepoRoot()` — independent of working directory. All `npm run` commands must run from monorepo root.

## Domain-Specific Rules

Detailed rules are in `.claude/rules/` (auto-loaded when working on matching paths):

- **`esm.md`** — ESM import patterns, `.js` extensions, naming conventions
- **`frontend.md`** — Tailwind v4, shadcn/ui, shared components, color maps
- **`database.md`** — Dual-DB architecture, Drizzle patterns, seed vs migrate
- **`simulation.md`** — Agent actions, `runDay()` flow, AI call patterns, model config
- **`api.md`** — Express REST conventions, route structure, mappers, middleware

## Environment

Copy `.env.example` → `.env`. Required: `ANTHROPIC_API_KEY`. See `.env.example` for all optional vars.

## Documentation Structure

When creating or updating documentation, place files in the correct category:

- **`TECHNICAL.md`** — Single canonical technical reference (architecture, AI system, DB, simulation flow). Update this for architectural changes.
- **`docs/operations/`** — Hosting, costs, timing data, production analysis
- **`docs/research/`** — External references, API docs, domain knowledge (e.g., Bundestag rules, abgeordnetenwatch)
- **`docs/marketing/`** — Launch strategy, social media plans
- **`docs/todo/`** — Roadmap + open item detail files
- **`docs/plans/`** — Implementation plans (delete after completion)

Never create loose docs at `docs/` root. Never duplicate content across docs — update the canonical source.

## Roadmap

Project roadmap in `docs/todo/README.md`. Check there for open todos or what to work on next.

## Pre-PR Quality Gates

Before opening a PR, ensure all pass with zero errors:

1. `npm run typecheck`
2. `npm test`
3. `npm run build`

If you find pre-existing errors unrelated to your changes, fix them in the same PR or flag them.

## Debugging Tips

- **Typecheck fails on missing modules?** → Run `npm install` first
- **DB inspection**: `sqlite3 -header -column data/simulation.db "<query>"`
- **Dev servers**: `lsof -i :3001` / `lsof -i :5173` — or use `/dev-start`

## MCP

Always use Context7 MCP for library/API documentation without me having to explicitly ask.

When using `chrome-devtools` MCP for screenshots, save to `docs/screenshots/` — never `.claude/screenshots/`.
