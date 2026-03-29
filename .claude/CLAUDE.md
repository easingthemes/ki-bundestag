# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

KI Bundestag is an AI-powered simulation of the German parliament. Six political parties, each driven by Claude Haiku, propose bills, debate, vote, and issue statements day by day. After elections, parties negotiate coalition terms over multiple rounds. Results are stored in SQLite and served via a REST API to a React frontend with news feed, polls, and party profiles.

## Commands (run from monorepo root)

```bash
npm run seed              # Fresh start: wipe DB, seed 6 parties + initial state (backs up first)
npm run migrate           # Apply schema changes without clearing data (safe to run repeatedly)
npm run simulate          # Run simulation days (e.g., npm run simulate 5)
npm run simulate:3        # Run 3 simulation days
npm run simulate:6        # Run 6 simulation days
npm run simulate:auto     # Continuous simulation loop (preset-aware delays)
npm run migrate:timing    # Add timing preset support to existing DBs
npm run simulate:visitors # Launch 5 Chrome visitors with random actions (needs dev servers)
npm run trigger:election  # Force next simulate run to trigger an election (testing)
npm run dev:api           # Express API on port 3001
npm run dev:web           # Vite dev server on port 5173 (proxies /api → :3001)
npm run build             # Build all packages via turbo
npm run typecheck         # Typecheck all packages via turbo
npm run lint              # ESLint all packages
npm run format            # Prettier format all packages
npm run format:check      # Prettier check formatting
npm run test              # Run test suite (Vitest)
npm run kill              # Kill dev servers on ports 3001 and 5173
```

## Architecture

Monorepo with npm workspaces + Turborepo. Four packages:

- **`types`** — Pure TypeScript type definitions (`emitDeclarationOnly`), no runtime code
- **`engine`** — Core simulation: AI agent calls, DB access (Drizzle + better-sqlite3), simulation loop
- **`api`** — Express REST server (11 domain routers in `src/routes/`), imports from engine + types
- **`web`** — React 19 SPA (Vite + React Router v7 + Tailwind CSS v4 + shadcn/ui), has its own local type copies in `src/api/`

Dependency chain: `types` ← `engine` ← `api`. Web is standalone (no workspace deps).

## Critical Warnings

**Package exports**: Both `types` and `engine` point `"import"` and `"default"` exports to `./src/index.ts` (not `dist/`). If `"default"` ever points to `dist/`, tsx may load stale compiled code — this previously caused a DB path resolution bug.

**ESM**: All packages use `"type": "module"`. Internal imports within engine use `.js` extensions (Node16 ESM requirement). See `.claude/rules/esm.md` for details.

**DB path resolution**: Path resolved via `import.meta.url` + `findMonorepoRoot()` — independent of working directory. All `npm run` commands must run from monorepo root.

## Domain-Specific Rules

Detailed rules are in `.claude/rules/` (auto-loaded, path-scoped):

- **`esm.md`** — ESM import patterns, `.js` extensions, naming conventions
- **`frontend.md`** — Tailwind v4, shadcn/ui, shared components, color maps
- **`database.md`** — Dual-DB architecture, Drizzle patterns, seed vs migrate
- **`simulation.md`** — Agent actions, `runDay()` flow, AI call patterns
- **`api.md`** — Express REST conventions, route structure, mappers, middleware

## Web Pages (23 routes)

Dashboard, Parties, PartyDetail, Bills, BillDetail, Elections, Budget, NewsFeed, Polls, Media, Questions, Motions, Interpellations, ConfidenceVotes, ConstitutionalCourt, Referendums, Notifications, SimulationLog, MyActivity, Login, About, SimulationInfo.

Routes in `packages/web/src/main.tsx`, API client in `packages/web/src/api/`.

## API Routes (11 domain routers)

All under `/api/` prefix, served from `packages/api/src/routes/`:

| Route | Domain |
|-------|--------|
| `/api/auth` | OAuth login (Google, GitHub), session, logout, providers |
| `/api/parties` | Party profiles, approval, coalition |
| `/api/bills` | Bills, signals, amendments, votes |
| `/api/elections` | Elections, results, coalitions |
| `/api/simulation` | Sim status, day triggers, injections |
| `/api/parliament` | Motions, interpellations, confidence votes, court |
| `/api/content` | Media, polls, questions, referendums, logs |
| `/api/users` | Profile, display name, party join/leave, proposals, MdB |
| `/api/seats` | MdB seat management |
| `/api/budget` | Budget proposals, allocations |
| `/api/admin` | Model config, costs, analytics |

## Model Configuration

AI calls use **Vercel AI SDK v6** with per-party and per-role model selection (see `packages/engine/src/agent/model-config.ts`):

- Per-party: SPD/CDU/Grune/FDP/Linke use `anthropic:claude-haiku-4-5-20251001`; AfD uses `xai:grok-3-mini`
- Per-role: `MODEL_DAILY`, `MODEL_NEGOTIATION` (both Haiku), `MODEL_SYNTHESIS` (Sonnet)
- Override via env vars: `MODEL_PARTY_<ID>`, `MODEL_DAILY`, `MODEL_NEGOTIATION`, `MODEL_SYNTHESIS`
- API keys: `ANTHROPIC_API_KEY`, `XAI_API_KEY`

## Environment

Copy `.env.example` → `.env`. Required: `ANTHROPIC_API_KEY`. Optional: `XAI_API_KEY`, `DATABASE_PATH`, `USER_DATABASE_PATH`, `API_PORT`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `SESSION_SECRET`, `FRONTEND_URL`, `MODEL_DAILY`, `MODEL_NEGOTIATION`, `MODEL_SYNTHESIS`.

## Issue Tracker

Open issues, bugs, and planned work are tracked in `docs/todo/README.md`. Each item has a detail file in `docs/todo/NNN-slug.md` with description, affected files, and fix notes. Check there first when asked about open todos, known issues, or what to work on next.

## Debugging Tips

- **Typecheck**: `npm run typecheck` — always run from monorepo root
- **DB inspection**: `sqlite3 -header -column data/simulation.db "<query>"` (see `/db-query` command)
- **Simulation state**: `sqlite3 data/simulation.db "SELECT * FROM simulation_meta LIMIT 1"`
- **Event trace**: `sqlite3 data/simulation.db "SELECT type, actor, title FROM simulation_events WHERE day_number = N"`
- **Dev servers**: `lsof -i :3001` (API), `lsof -i :5173` (web) — or use `/dev-start`
- **Kill stuck servers**: `npm run kill`

## MCP

Always use Context7 MCP when I need library/API documentation, code generation, setup or configuration steps without me having to explicitly ask.

When using `chrome-devtools` MCP to take screenshots, always save to `docs/screenshots/<name>.png` — never to `.claude/screenshots/`.
