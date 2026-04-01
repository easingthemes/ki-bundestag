# KAI Bundestag — Technical Documentation

Detailed technical reference for the KAI Bundestag project. For a project overview, see [README.md](README.md).

## Architecture

Monorepo with npm workspaces + Turborepo. Four packages:

```
packages/
  types/    — Shared TypeScript type definitions (emitDeclarationOnly, no runtime code)
  engine/   — Simulation core: AI agent calls, DB access (Drizzle + better-sqlite3), simulation loop
  api/      — Express REST server (11 domain routers)
  web/      — React 19 SPA (Vite + React Router v7 + Tailwind CSS v4 + shadcn/ui)
```

Dependency chain: `types` ← `engine` ← `api`. Web is standalone (no workspace deps).

All packages are ESM (`"type": "module"`). Internal imports within engine use `.js` extensions (Node16 ESM requirement).

## AI Models

Uses [Vercel AI SDK v6](https://sdk.vercel.ai/) with per-party and per-role model selection:

- **Party agents:** Claude Haiku (SPD, CDU, Grune, FDP, Linke) via Anthropic API + Grok (AfD) via xAI API
- **Coalition synthesis:** Claude Sonnet via Anthropic API
- **Per-party/per-role overrides** via env vars (`MODEL_PARTY_<ID>`, `MODEL_DAILY`, `MODEL_NEGOTIATION`, `MODEL_SYNTHESIS`)
- **Context depth:** `low` ($0.03/day), `normal` ($0.055/day, default), `high` ($0.09/day)

### AI Infrastructure

- **Batch API** — All simulation AI calls go through the Anthropic Message Batches API (50% cost discount). Requests are grouped into batch groups: A (party agents), B (interpellations + discipline), C (media + summary), mid-cycle (polls + referendums), and negotiations.
- **Circuit breaker** — Per-provider rate limit tracking with automatic pause and reset.
- **Transient retry** — Network errors and HTTP 429s retry up to 2 times with exponential delays.
- **Shared JSON parser** — Markdown fence stripping, sanitization, typed validation with per-module fallback policies.
- **Token-budgeted context** — Priority-based context assembly with a 3000-token budget per prompt.

### AI-Powered Features

Party daily actions, coalition negotiation rounds + synthesis, citizen question answers, interpellation answers, media article generation, context poll generation, referendum generation, daily narrative summary, internal proposal review, MdB application review, speech scoring, and discipline reasoning.

## Database

Dual SQLite setup (WAL mode):

- `data/simulation.db` — Parliament state, bills, elections, parties, events
- `data/users.db` — User accounts, votes, proposals, notifications

Path resolved via `import.meta.url` + `findMonorepoRoot()` — independent of working directory.

### Simulation DB Tables

| Table | Purpose |
|-------|---------|
| `parties` | 6 political parties with ideology, seats, approval ratings |
| `bills` | Legislation pipeline with status, votes, amendments |
| `national_state` | Coalition, economy, public sentiment |
| `simulation_events` | Full event timeline by day |
| `simulation_meta` | Runtime metadata (current day, timing, etc.) |
| `crises` | Crisis events with severity and impact |
| `elections` | Election lifecycle and negotiation rounds |
| `party_history` | Daily party snapshots |
| `polls` | Preference and context polls |
| `media_articles` | AI-generated news articles |
| `citizen_questions` | Public Q&A |
| `referendums` | AI-generated referendums |
| `fraktionen` | Parliamentary groups |
| `motions` | Motions and resolutions |
| `government` | Federal cabinet |
| `interpellations` | Parliamentary questions |
| `confidence_votes` | Confidence vote records |
| `constitutional_challenges` | Court challenges |
| `budgets` | Budget cycles |
| `bundestag_seats` | Seat allocation map |

### Users DB Tables

| Table | Purpose |
|-------|---------|
| `users` | Auth/profile (Google/GitHub OAuth) |
| `internal_proposals` | Member proposals with scoring |
| `internal_votes` | Votes on proposals |
| `question_votes` | Question prioritization |
| `referendum_votes` | User referendum votes |
| `mdb_applications` | Seat applications |
| `mdb_votes` | Seat-level bill votes |
| `mdb_speeches` | Submitted speeches with AI scoring |
| `notifications` | User notifications |
| `user_actions` | Analytics logging |

## API Routes

All under `/api/` prefix, served from `packages/api/src/routes/`:

| Route | Domain |
|-------|--------|
| `/api/auth` | OAuth login (Google, GitHub), session, logout, providers |
| `/api/parties` | Party profiles, approval, coalition, alignment, proposals |
| `/api/bills` | Bills, signals, amendments, speeches, MdB votes |
| `/api/elections` | Elections, results, government, government history |
| `/api/simulation` | Sim status, calendar, events, costs, state, health, injections |
| `/api/parliament` | Crises, Fraktionen, motions, interpellations, confidence votes, court |
| `/api/content` | Media, polls, questions, referendums |
| `/api/users` | Profile, activity, impact, catchup, notifications, party join/leave, proposals, limits |
| `/api/seats` | MdB seat applications, roster, availability |
| `/api/budgets` | Budget listings |
| `/api/admin` | Timing preset, context depth, analytics, costs |

## Web Pages (24 routes)

Dashboard, Parties, PartyDetail, Bills, BillDetail, Elections, Budget, NewsFeed, Polls, Media, Questions, Motions, Interpellations, ConfidenceVotes, ConstitutionalCourt, Referendums, Notifications, SimulationLog, MyActivity, Login, About, SimulationInfo, Impressum, Datenschutz.

Routes defined in `packages/web/src/main.tsx`, API client in `packages/web/src/api/`.

## Commands

All commands run from the monorepo root:

| Command | Description |
|---------|-------------|
| `npm run dev:api` | Express API on port 3001 |
| `npm run dev:web` | Vite dev server on port 5173 (proxies /api → :3001) |
| `npm run build` | Build all packages via Turborepo |
| `npm run typecheck` | Typecheck all packages |
| `npm run lint` | ESLint all packages |
| `npm run format` | Prettier format all packages |
| `npm run test` | Run test suite (Vitest) |
| `npm run seed` | Reset DB with fresh party data |
| `npm run migrate` | Apply schema changes (preserves data) |
| `npm run simulate` | Run simulation days (e.g., `npm run simulate 5`) |
| `npm run simulate:auto` | Continuous simulation loop |
| `npm run trigger:election` | Force next simulate run to trigger an election |
| `npm run kill` | Kill dev servers on ports 3001 and 5173 |

## Environment Variables

Copy `.env.example` to `.env`. See the file for all options.

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key for Claude models |
| `XAI_API_KEY` | Optional | xAI API key for Grok (AfD agent) |
| `API_PORT` | Optional | Express port (default: 3001) |
| `DATABASE_PATH` | Optional | Path to simulation.db |
| `USER_DATABASE_PATH` | Optional | Path to users.db |
| `MODEL_DAILY` | Optional | Override daily simulation model |
| `MODEL_NEGOTIATION` | Optional | Override coalition negotiation model |
| `MODEL_SYNTHESIS` | Optional | Override coalition synthesis model |
| `MODEL_PARTY_<ID>` | Optional | Per-party model override (format: `provider:model-id`) |
| `GOOGLE_CLIENT_ID` | Optional | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Optional | Google OAuth client secret |
| `GITHUB_CLIENT_ID` | Optional | GitHub OAuth client ID |
| `GITHUB_CLIENT_SECRET` | Optional | GitHub OAuth client secret |
| `SESSION_SECRET` | Optional | Session encryption secret |
| `FRONTEND_URL` | Optional | Frontend URL for CORS |

## Deployment

Hosted on Hetzner Cloud (CX22). Deploys automatically via GitHub Actions on push to `main`:

1. **CI:** Typecheck + build web frontend
2. **Deploy:** rsync to server via [ssh-deploy](https://github.com/easingthemes/ssh-deploy)
3. **Server:** `npm ci` + migrate + PM2 restart

See [Hosting Plan](docs/Hosting_Plan.md) for full setup guide.

## Further Documentation

| Doc | Description |
|-----|-------------|
| [Architecture Reference](docs/Current_Architecture.md) | Full schema, simulation flow, API map, constants |
| [AI Engine](docs/AI_Engine.md) | AI infrastructure, model routing, circuit breaker |
| [Bundestag Details](docs/bundestag-details.md) | German parliamentary rules and structure |
| [Hosting Plan](docs/Hosting_Plan.md) | Deployment, CI/CD, Hetzner setup |
| [Runbook](docs/operations/runbook.md) | Operational commands and troubleshooting |
