# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

KI Bundestag is an AI-powered simulation of the German parliament. Six political parties, each driven by Claude Haiku, propose bills, debate, vote, and issue statements day by day. After elections, parties negotiate coalition terms over multiple rounds. Results are stored in SQLite and served via a REST API to a React frontend with news feed, polls, and party profiles.

## Commands (run from monorepo root)

```bash
npm run seed              # Fresh start: wipe DB, seed 6 parties + initial state (backs up first)
npm run migrate           # Apply schema changes without clearing data (safe to run repeatedly)
npm run simulate          # Run simulation days (e.g., npm run simulate 5)
npm run simulate:auto     # Continuous simulation loop (preset-aware delays)
npm run migrate:timing    # Add timing preset support to existing DBs
npm run simulate:visitors # Launch 5 Chrome visitors with random actions (needs dev servers)
npm run trigger:election  # Force next simulate run to trigger an election (testing)
npm run dev:api           # Express API on port 3001
npm run dev:web           # Vite dev server on port 5173 (proxies /api → :3001)
npm run build             # Build all packages via turbo
npm run typecheck         # Typecheck all packages via turbo
npm run kill              # Kill dev servers on ports 3001 and 5173
```

No test or lint scripts exist yet.

## Architecture

Monorepo with npm workspaces + Turborepo. Four packages:

- **`types`** — Pure TypeScript type definitions (`emitDeclarationOnly`), no runtime code
- **`engine`** — Core simulation: AI agent calls, DB access (Drizzle + better-sqlite3), simulation loop
- **`api`** — Express REST server (10 domain routers in `src/routes/`), imports from engine + types
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

## Web Pages (21 total)

Dashboard, Parties, PartyDetail, Bills, BillDetail, Elections, Budget, NewsFeed, Polls, Media, Questions, Motions, Interpellations, ConfidenceVotes, ConstitutionalCourt, Referendums, Notifications, SimulationLog, Login, About, Admin, AdminCosts.

Routes in `src/main.tsx`, API client in `src/api/`.

## Model Configuration

AI calls use **Vercel AI SDK v6** with per-party and per-role model selection (see `packages/engine/src/agent/model-config.ts`):

- Per-party: SPD/CDU/Grune/FDP/Linke use `anthropic:claude-haiku-4-5-20251001`; AfD uses `xai:grok-3-mini`
- Per-role: `MODEL_DAILY`, `MODEL_NEGOTIATION` (both Haiku), `MODEL_SYNTHESIS` (Sonnet)
- Override via env vars: `MODEL_PARTY_<ID>`, `MODEL_DAILY`, `MODEL_NEGOTIATION`, `MODEL_SYNTHESIS`
- API keys: `ANTHROPIC_API_KEY`, `XAI_API_KEY`

## Environment

Copy `.env.example` → `.env`. Required: `ANTHROPIC_API_KEY`. Optional: `DATABASE_PATH`, `USER_DATABASE_PATH`, `API_PORT`, `MODEL_DAILY`, `MODEL_NEGOTIATION`, `MODEL_SYNTHESIS`.

## MCP

Always use Context7 MCP when I need library/API documentation, code generation, setup or configuration steps without me having to explicitly ask.

When using `chrome-devtools` MCP to take screenshots, always save to `docs/screenshots/<name>.png` — never to `.claude/screenshots/`.
