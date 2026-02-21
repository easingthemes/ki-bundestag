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
```

No test or lint scripts exist yet.

## Architecture

Monorepo with npm workspaces + Turborepo. Four packages:

- **`types`** — Pure TypeScript type definitions (`emitDeclarationOnly`), no runtime code
- **`engine`** — Core simulation: AI agent calls, DB access (Drizzle + better-sqlite3), simulation loop
- **`api`** — Express REST server, imports from engine + types
- **`web`** — React 19 SPA (Vite + React Router v7 + Tailwind CSS v4 + shadcn/ui), has its own local type copies in `api.ts`

Dependency chain: `types` ← `engine` ← `api`. Web is standalone (no workspace deps).

## Critical: Package Export Pattern

Both `types` and `engine` point `"import"` and `"default"` exports to `./src/index.ts` (not `dist/`). This ensures `tsx` always loads source files. If `"default"` ever points to `dist/`, tsx may load stale compiled code — this previously caused a DB path resolution bug.

## Database

Two SQLite databases in `data/`, both WAL mode with foreign keys enabled:

- **`simulation.db`** — simulation state, accessed via `getDb()` / `getSqlite()`
  - Tables: `parties`, `bills`, `national_state`, `simulation_events`, `simulation_meta`, `crises`, `elections`, `party_history`, `polls`, `media_articles`, `citizen_questions`, `referendums`, `pending_injections`, `fraktionen`, `motions`, `government`, `interpellations`, `confidence_votes`, `constitutional_challenges`, `budgets`, `event_queue`
  - Override path: `DATABASE_PATH` env var
- **`users.db`** — user-owned data, accessed via `getUserDb()` / `getUserSqlite()`
  - Tables: `users`, `internal_proposals`, `internal_votes`, `member_signals`, `question_votes`, `notifications`
  - Override path: `USER_DATABASE_PATH` env var
- Path resolved via `import.meta.url` + `findMonorepoRoot()` — independent of working directory
- Schema in `packages/engine/src/db/schema.ts` (Drizzle ORM, unified schema object used by both DBs)
- DDL split in `seed.ts`: `SIM_TABLE_DDL` + `USER_TABLE_DDL`
- `closeDb()` closes both connections; `npm run seed` backs up both files
- `national_state` has `provisional_budget` (boolean); `simulation_meta` has `budget_retry_day`, `timing_preset` (default `"normal"`); `budgets` has `revision_attempt`
- Use `getSqlite()` / `getUserSqlite()` for raw sqlite3 access — never access drizzle internals
- One-time migration: `npx tsx scripts/migrate-users-db.ts` (moves user tables from old single-DB layout)

## Model Configuration

AI calls use the **Vercel AI SDK v6** with per-party and per-role model selection (see `packages/engine/src/agent/model-config.ts`):

**Per-Party Models** (`PARTY_MODELS`):

- SPD, CDU, Grüne, FDP, Linke: `anthropic:claude-haiku-4-5-20251001` ($0.80/$4.00 per 1M tokens)
- AfD: `xai:grok-3-mini` ($0.30/$0.50 per 1M tokens) — cost savings
- Used for: daily party agents, interpellation answers (minister uses their party's model)
- Override via: `MODEL_PARTY_<ID>` env vars (e.g., `MODEL_PARTY_AFD=xai:grok-3-mini`)

**Per-Role Models** (`ROLE_MODELS`):

| Role Key | Default | Env Var | Used for |
|----------|---------|---------|----------|
| `daily` | anthropic:claude-haiku-4-5-20251001 | `MODEL_DAILY` | System-wide calls: media, polls, referendums, daily summaries, citizen Q&A |
| `negotiation` | anthropic:claude-haiku-4-5-20251001 | `MODEL_NEGOTIATION` | Coalition negotiation rounds (per-party) |
| `synthesis` | anthropic:claude-sonnet-4-5-20250929 | `MODEL_SYNTHESIS` | Coalition agreement synthesis |

**Unified Client**: [`callAI()`](../packages/engine/src/agent/client.ts) function accepts `{system, prompt, maxTokens, partyId?, roleKey?}` and routes to the appropriate provider + model. Per-provider circuit breaker: on API usage limit errors, the provider is marked unavailable and all subsequent calls throw `AIProviderLimitError` immediately (no API hit). `allProvidersLimited()` returns true when all providers are blocked; runner-auto pauses in this case. API keys: `ANTHROPIC_API_KEY`, `XAI_API_KEY`.

## Simulation Flow

`npm run simulate` → `runner.ts` → `runDay()` loop in `packages/engine/src/simulation/loop.ts`.
`npm run simulate:auto` → `runner-auto.ts` → preset-aware loop reading `timing_preset` from `simulation_meta`.

**Timing Presets** (`packages/engine/src/simulation/timing.ts`): 4 speed modes control how fast sim days tick. `TIME_CONFIG` centralizes all cycle intervals (polls every 15d, economy every 30d, budget every 365d, elections every 1461d). Runner applies per-preset delays and night pause (Europe/Berlin timezone). Ultra-fast/fast are watch-only (non-participatory); normal/slow allow user interaction. Feature availability matrix gates 10 feature keys per preset. Night mode: "none" (24/7), "light" (routine only), "pause" (full stop).

| Preset | Delay | Participatory | Night Mode |
|--------|-------|--------------|------------|
| ultra-fast | 0 (AI-bound) | No | none |
| fast | 7 min | No | none |
| normal | 30/15 min | Yes | light |
| slow | 1.5 h / pause | Yes | pause |

`runDay()` flow:

1. Increment day, load full state (parties, bills, national economy, recent events)
2. Apply economic drift (mean-reversion + noise on all 4 indicators)
3. Process pending injections (user-injected crises, elections, economic shocks, budget triggers) + crisis system (8% daily / 25% monthly trigger chance, max 2 concurrent); provisional budget GDP drag (−0.01/day)
4. Check election status:
   - If `"negotiation"`: run negotiation round (skip normal agents). After 3 rounds, synthesize agreement + form government + form cabinet (Chancellor + 8 Ministers).
   - If `"voting"`: calculate results, transition to `"negotiation"` (skip normal agents).
   - Otherwise: advance election phase normally.
5. If not in election special phase: advance bill pipeline (proposed → 1st reading → committee → 2nd reading → 3rd reading; govt bills skip 1st reading), run each party agent, process proposals/amendments/votes/statements/motions/interpellations/confidence votes.
5b. Process confidence votes: Vertrauensfrage (coalition leader; 10% defection risk; failed → dissolve govt + trigger snap election) and Konstruktives Misstrauensvotum (opposition; 85% other-opposition join; passed → swap coalition roles + form new cabinet immediately, no election).
5c. Process constitutional challenges: first valid `file_constitutional_challenge` action → 30% strike-down → if struck down: reverse bill economic impact, adjust sentiment, update bill status to `"struck_down"`; approval impacts on filing/proposing parties.
5d. Presidential veto check on each passing bill: 3–16% probability based on bill impact magnitude; veto → bill stays `rejected` with `vetoedByPresident: true`, proposer −0.5 approval.
6. Answer pending citizen questions (max 3/day via Haiku)
6b. Answer pending interpellations (max 2/day via Haiku as minister, 14-day deadline) + expire unanswered + apply sentiment
7. Apply approval drift + sentiment mean-reversion (baseline 45, range 5–75)
8. Resolve expired polls + referendums; on weekly days: generate new polls + opinion recalc; on monthly days: economic report
9. Maybe generate referendum (every 30 days via Haiku)
9b. Budget cycle (every 60 days, or admin injection): generate coalition-weighted 300B EUR allocations, sentiment-adjusted vote (97/90/82/72% coalition yes by tier); passed → economy effects + sentiment +0.5, clear provisional; rejected → `provisionalBudget=true`, retry scheduled day+7, asymmetric approval penalties.
9c. Budget retry (on `budgetRetryDay`): revised allocations (3% centrist shift), retry vote (+5pp coalition boost); passed → clear provisional + sentiment +0.3; rejected again → sentiment −2.0 + dissolve govt + snap election.
10. Generate daily media articles (2–3 AI-written articles from biased outlets, skipped on quiet days)
11. Apply media sentiment influence (±0.5/day max)
12. Generate daily narrative summary (Haiku): returns `{narrative, mood}` JSON, stored as JSON string in `simulation_meta.daily_summary`; 7 mood labels
13. Record party history snapshot, save state, persist events

Agent actions are validated in `action-parser.ts`: max 1 proposal + 1 amendment + 1 motion + 1 interpellation + 1 constitutional challenge + 1 statement per turn, must vote on all third-reading bills. Interpellations are opposition+Fraktion only. Constitutional challenges require Fraktion and target passed bills ≤14 days old.

## Web Pages

- **Dashboard**: 2-column grid layout (main + sidebar). Main: hero summary with mood badge, Bundestag seat bar + coalition/opposition chips, economy 4-stat grid, 3 latest events, 2 media highlights. Sidebar: Chancellor card, engagement CTAs (user-aware), public sentiment gauge, active crises, active election, Ask a Party widget. Full-width "Decision of the Month" + "Party of the Month" featured section. Provisional budget amber banner when Art. 111 GG active. Watch-only blue banner when preset is ultra-fast/fast
- **Parties**: Clickable cards → **Party Detail** (approval chart, bills, votes, statements, question form); Vote Alignment Matrix below party grid (pairwise vote-agreement %, color-coded)
- **Bills**: Grouped by status with vote breakdowns, "Govt. Bill" badge on government bills, "Vetoed by President" amber badge on vetoed bills
- **Elections**: Hemicycle, bar chart, result table, negotiation rounds, coalition agreement; Coalition Calculator at bottom (interactive party checkboxes, seat counter, majority indicator, ideological spread)
- **Budget**: Budget cycle cards with ministry allocation bars, seat vote bar, economic effects, party vote breakdown; "Revised" badge on revision attempts; "Retry Day X" note on pending retries
- **News**: Filterable event timeline with breaking news styling, day separators, pagination
- **Polls**: Active polls with voting, results bar chart, past polls
- **Media**: Newspaper-style AI-generated articles from 3 outlets (left/center/right bias), expandable cards
- **Questions**: Citizen questions to parties with AI-generated responses, party/status filters, upvote/downvote on pending questions (top-voted answered first), split Pending/Answered sections
- **Motions**: Motions (Antrag) and resolutions (Entschließung) with type badges, vote breakdowns
- **Anfragen**: Interpellations (Kleine/Große Anfrage) with type+status badges, expandable cards showing question + minister response
- **Vertrauensvoten**: Confidence votes (Vertrauensfrage + Misstrauensvotum) with type/status filters, seat vote bars, outcome text, expandable party breakdown
- **Verfassungsgericht**: Constitutional court challenges to passed bills with status/decision filters, collapsible cards showing arguments + court reasoning
- **Referendums (Votes)**: AI-generated referendums with user voting, impact on simulation
- **Log**: Expandable day-by-day simulation events
- **Login**: Nickname-based login/register page at `/login?redirect=<path>`; single input, try login first, offer register if not found; redirects back after success
- **About**: Project overview and tech stack info
- **Notifications**: User notification list with type filter pills (All/Morning Summary/Queued/Ready), read/unread indicators, mark-read actions, "Mark all as read" header button
- **Admin**: Simulation speed preset selector (4 presets with Interactive/Watch-only badges, Apply button); inject events (crisis, snap election, economic shock, invalidate election, trigger budget cycle); AI model config table; simulation actions reference (27 actions, AI vs Algorithmic, expandable detail)

## Web UI Stack

The web package uses **Tailwind CSS v4** + **shadcn/ui** for all styling:

- **Tailwind v4**: `@import "tailwindcss"` + `@theme inline` block in `src/styles.css` (not v3 directives)
- **shadcn/ui**: 15 components in `src/components/ui/` (card, badge, button, sheet, skeleton, etc.). Config in `components.json`
- **`@` path alias**: `@/components/ui/card` etc. — configured in both `vite.config.ts` and `tsconfig.json`
- **`cn()` utility**: `clsx` + `tailwind-merge` from `src/lib/utils.ts` — used for conditional class merging
- **`src/components/shared.tsx`**: App-level wrappers (Button with variant mapping, SkeletonCard, SkeletonTitle, ShowMoreButton)
- **Party colors**: Stay as inline `style={{ backgroundColor: party.color }}` — dynamic values can't be Tailwind classes
- **Inter font**: Loaded via Google Fonts in `index.html`
- **Global headings**: `h1`/`h2`/`h3` styled globally in `styles.css` (foreground color, semibold, tight tracking — no uppercase)
- **`src/lib/colors.ts`**: Shared semantic color maps (19 exports): `STATUS_BADGE`, `ROLE_BADGE`, `VOTE_COLORS`, `VOTE_HEX`, `MOOD_BADGE`, `ALERT_STYLES`, `PHASE_BADGE`, `SEVERITY_BADGE`, `SEMANTIC_HEX`, etc. All pages import from here — no per-page color maps
- **Common patterns across pages**:
  - Cards: `<Card><CardContent className="p-5">...</CardContent></Card>`
  - Badges: `<Badge variant="outline" className={STATUS_BADGE[status]}>` (using shared color maps from `colors.ts`)
  - Filter pills: `cn("px-3 py-1.5 text-xs font-medium rounded-full border cursor-pointer", isActive ? "bg-foreground text-background" : "...")`
  - Filter selects: `SELECT_CLS` constant with shadcn-style input classes
  - Vote bars: `<div className="flex h-5 rounded overflow-hidden">` with `VOTE_COLORS.yes`/`.no`/`.abstain` children
  - Alert banners: `ALERT_STYLES.info` (blue), `ALERT_STYLES.warning` (amber)
  - Inline dynamic colors: `SEMANTIC_HEX.positive`/`.negative`/`.neutral`/`.warning` for `style={{ }}` attributes

## Environment

Copy `.env.example` → `.env`. Required: `ANTHROPIC_API_KEY`. Optional: `DATABASE_PATH`, `USER_DATABASE_PATH`, `API_PORT`, `MODEL_DAILY`, `MODEL_NEGOTIATION`, `MODEL_SYNTHESIS`.

## ESM

All packages use `"type": "module"`. Internal imports within engine use `.js` extensions (Node16 ESM requirement). Base tsconfig: `module: Node16`, `moduleResolution: Node16`, target `ES2022`.
