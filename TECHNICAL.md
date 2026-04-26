# KAI Bundestag — Technical Documentation

For a project overview, see [README.md](README.md).

## Architecture

Monorepo with npm workspaces + Turborepo. Four packages:

```
packages/
  types/    — Shared TypeScript type definitions (emitDeclarationOnly, no runtime code)
  engine/   — Simulation core: AI agent calls, DB access (Drizzle + better-sqlite3), simulation loop
  api/      — Express REST server (12 domain routers)
  web/      — React 19 SPA (Vite + React Router v7 + Tailwind CSS v4 + shadcn/ui)
```

Dependency chain: `types` ← `engine` ← `api`. Web is standalone (no workspace deps).

All packages are ESM (`"type": "module"`). Internal imports within engine use `.js` extensions (Node16 ESM requirement).

## AI System

Uses [Vercel AI SDK v6](https://sdk.vercel.ai/) with per-party and per-role model selection.

### Models

| Party agents | Provider | Model |
|---|---|---|
| SPD, CDU, Grüne, FDP, Linke | Anthropic | claude-haiku-4-5-20251001 |
| AfD | xAI | grok-3-mini |

| Role | Default | Env override | Used for |
|---|---|---|---|
| `daily` | Haiku 4.5 | `MODEL_DAILY` | Media, polls, referendums, summary |
| `negotiation` | Haiku 4.5 | `MODEL_NEGOTIATION` | Per-party negotiation rounds |
| `synthesis` | Sonnet 4.5 | `MODEL_SYNTHESIS` | Coalition agreement synthesis |

Per-party override: `MODEL_PARTY_<ID>=<provider>:<model>`.

Context depth: `low` (~$0.020/day), `normal` (~$0.028/day, measured), `high` (~$0.040/day). Configurable via admin API or DB.

### Infrastructure

- **Batch API** — All simulation AI calls go through the Anthropic Message Batches API (50% cost discount). Requests grouped into phases: A (party agents), B (interpellations + discipline), C (media + summary), mid-cycle (polls + referendums), negotiations. xAI requests fall back to sequential calls.
- **Test mode (free/local LLMs)** — Set `TEST_MODE=ollama|groq|custom` to override every party + role with a single OpenAI-compatible endpoint and bypass the Anthropic Batches API (parallel sync `callAI()` instead). For unlimited zero-cost full-term simulation runs; quality is intentionally lower. See [Test Mode](#test-mode-freelocal-llms-for-cost-free-runs) below.
- **Circuit breaker** — Per-provider rate limit tracking with TTL-based auto-reset. Hard limit errors → stored with `resetAt` timestamp. Subsequent calls throw `AIProviderLimitError` immediately.
- **Transient retry** — Network errors and HTTP 429s retry up to 2× with [2s, 5s] delays.
- **Shared JSON parser** — `parseAIJson()` in `ai-json.ts`: code-fence stripping, sanitization (leading `+`, trailing commas), typed validation with per-module fallback policies.
- **Semantic retry** — `attemptSemanticRetry()` re-prompts the LLM once with structured validation errors when actions parse OK but fail semantic validation.
- **Observability** — `logAICall()` emits `[AI] <task> | <provider>/<model> | <ms>ms | OK|PARSE_FAIL|VALIDATION_FAIL`.

### Structured Output (Disabled)

Anthropic's structured output (`output_config.format.json_schema`) was used for party agent responses from day 1. It guaranteed valid JSON shape via constrained decoding, eliminating parse failures. However, it caused two escalating API errors:

1. **Days 259-270**: `"Schemas contains too many optional parameters (27), limit: 24"` — The action schema had 27 optional params (17 top-level + 5 in `impact` + 5 in `impactChange`). Fixed by marking `impact`/`impactChange` sub-fields as required, reducing to 17.

2. **Day 355+**: `"Grammar compilation timed out"` — Even with 17 optional params, the nested array-of-objects schema exceeded Anthropic's 180-second grammar compilation timeout. The grammar compiler builds a finite-state automaton where each optional field roughly doubles state space.

Structured output was disabled entirely. All parties now use `parseAgentResponse()` — the same parse pipeline (code-fence stripping, trailing comma cleanup, sanitizers) that always worked for AfD/xAI. Semantic validation + retry still catches malformed responses.

See: [Anthropic docs on schema complexity limits](https://platform.claude.com/docs/en/build-with-claude/structured-outputs#schema-complexity-limits), [anthropic-sdk-python#1185](https://github.com/anthropics/anthropic-sdk-python/issues/1185).

### Test Mode (free/local LLMs for cost-free runs)

Set `TEST_MODE` to route every party + role through a single OpenAI-compatible endpoint instead of paid Anthropic/xAI calls. Use this for full-term simulations, CI runs, and end-to-end tests where quality is not the priority.

| `TEST_MODE` | Endpoint | Default model | API key |
|---|---|---|---|
| `ollama` | `http://localhost:11434/v1` | `gemma3:4b` | none (local) |
| `groq` | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` | `GROQ_API_KEY` (free tier: 14.4K req/day, 30 RPM) |
| `custom` | `TEST_BASE_URL` (required) | `TEST_MODEL` (required) | `TEST_API_KEY` (optional) |

Override knobs (apply to any preset): `TEST_MODEL`, `TEST_BASE_URL`, `TEST_API_KEY`, `TEST_MODE_CONCURRENCY` (default 4 — parallel in-flight calls per fan-out batch).

Implementation:

- `agent/test-mode.ts` resolves the env vars into a cached `TestModeConfig`. `getPartyModel()` and `getRoleModel()` short-circuit to the test model when `TEST_MODE` is set, leaving party/role config tables otherwise untouched.
- `agent/openai-compatible-client.ts` is a minimal direct-`fetch` chat-completions client (no Vercel AI SDK dependency for the test path). `callAI()` routes the new `openai-compatible` provider through it, with the same 2× retry on 429/5xx/network errors.
- `submitBatch()` checks `isTestMode()` first and fans requests out as parallel sync `callAI()` calls (Ollama and Groq don't implement Anthropic's batch protocol). The returned `BatchResult[]` shape is identical, so all `processXxxBatchResult()` consumers are unchanged.
- Cost tracking records test models at `$0` for known free models (Gemma/Llama/Qwen entries in `STANDARD_PRICING`); custom models fall back to `DEFAULT_PRICING` and report nominal cost.

Production path is fully untouched when `TEST_MODE` is unset — the Anthropic batches code, circuit breakers, and xAI fallback all behave exactly as before.

### Simulation Safety: Partial Failure Detection

The runner (`runner-auto.ts`) stops the simulation when AI failures create unfair outcomes:

| Check | Trigger | Threshold |
|---|---|---|
| Total AI failure | `successfulCalls === 0` for all AI calls | 2 consecutive days |
| **Party agent fairness** | `successRate < 50%` for party agent batch | 2 consecutive days |
| Provider auth failure | HTTP 401/403/402 + all providers down | Immediate |
| Provider rate limit | All providers hit 429 | Pause until reset |

The fairness check prevents scenarios where e.g. 5 Anthropic parties fail with a schema error but AfD (xAI) succeeds — giving AfD sole legislative power while others auto-abstain.

### AI-Powered Features (14 call sites)

Party daily actions, coalition negotiation + synthesis, citizen question answers, interpellation answers, media generation, poll generation, referendum generation, daily narrative summary, internal proposal review, MdB application review, speech scoring, discipline reasoning, era summaries, knowledge digests.

### Token-Budgeted Context

Priority-based context assembly controlled by context depth (default 8000 tokens for `normal`):

- **P1 (always)** — Party info, coalition roles, economy, votable bills, crises, election state, government
- **P1.25 (always)** — Era summaries with structured case facts (economy snapshots, coalition history)
- **P1.5 (always)** — Daily briefing (synthesized political narrative from 30 days of events)
- **P2 (if budget allows)** — Recent events, media headlines, own actions, proposals, real-world context
- **P3 (dropped if over budget)** — Motions, interpellations, constitutional challenges

### Fallback Policies

| Module | On AI failure |
|---|---|
| Party agent | Abstain all votable bills |
| Negotiation (round) | "Open to negotiations" + accept all partners |
| Negotiation (synthesis) | Algorithmic `findBestCoalition()` |
| Media / Polls / Referendums / Summary | Skip that cycle |
| Proposals / Seats / Discipline | Decline/reject with default reasoning |
| Speeches | Neutral score (0 impact) |
| Questions / Interpellations | Stay pending |

### Prompt Design

System prompts include JSON hardening rules (no code fences, no leading `+`, no trailing commas). Each party gets a hand-written personality profile (~200-300 tokens) with voice, strategy, red lines, and relationship dynamics. Negotiation prompts enforce valid party IDs. Summary prompts enforce mood enum.

## Database

Dual SQLite (WAL mode, foreign keys enabled):

- `data/simulation.db` — Parliament state. Access: `getDb()` / `getSqlite()`
- `data/users.db` — User-owned data. Access: `getUserDb()` / `getUserSqlite()`

Path resolved via `import.meta.url` + `findMonorepoRoot()`. Override: `DATABASE_PATH`, `USER_DATABASE_PATH`.

### Simulation DB Tables (27)

| Table | Purpose |
|---|---|
| `parties` | 6 political parties with ideology, seats, approval ratings, policy priorities |
| `bills` | Legislation pipeline (proposed→1st→committee→2nd→3rd reading), votes, amendments |
| `national_state` | Coalition, economy, public sentiment, provisional budget flag |
| `simulation_events` | Full event timeline by day |
| `simulation_meta` | Current day, timing preset, next election, budget retry, daily summary |
| `crises` | Crisis events with severity, daily impact, resolution |
| `elections` | Election lifecycle (announced→campaign→voting→negotiation→completed) |
| `party_history` | Daily party snapshots (approval, seats) |
| `polls` | Preference + context polls with expiry |
| `media_articles` | AI-generated news from 3 biased outlets |
| `citizen_questions` | Public Q&A with AI answers |
| `referendums` | AI-generated referendums with user voting |
| `pending_injections` | Admin-triggered events (crises, elections, shocks) |
| `fraktionen` | Parliamentary groups (5% threshold) |
| `motions` | Motions and resolutions |
| `government` | Chancellor + 8 ministers, coalition cabinet |
| `interpellations` | Parliamentary questions (Kleine/Große Anfrage) |
| `confidence_votes` | Vertrauensfrage + Misstrauensvotum |
| `constitutional_challenges` | Court challenges with rulings |
| `budgets` | Annual budget cycles with revision attempts |
| `event_queue` | Night-mode queued events |
| `bundestag_seats` | 735 seat allocation (human/AI controller) |
| `committees` | Bundestag committees linked to bill categories |
| `committee_memberships` | MdB-to-committee assignments |
| `sidejobs` | MdB side jobs (Nebentätigkeiten) |
| `era_summaries` | Compressed political history with structured case facts |
| `real_world_knowledge` | Fetched real-world data digests |
| `ai_calls` | AI usage/cost tracking per day/task |

### Users DB Tables (10)

| Table | Purpose |
|---|---|
| `users` | Auth/profile (Google/GitHub OAuth), party membership |
| `internal_proposals` | Member proposals with scoring and review |
| `internal_votes` | Votes on proposals |
| `question_votes` | Question prioritization |
| `referendum_votes` | User referendum votes |
| `mdb_applications` | Seat applications with AI review |
| `mdb_votes` | Seat-level bill votes |
| `mdb_speeches` | Submitted speeches with AI scoring |
| `notifications` | User notifications |
| `user_actions` | Analytics logging |

## Simulation Day Flow

19-step `runDay()` loop in `packages/engine/src/simulation/loop.ts`:

1. Increment day, load state
2. Economic drift (mean-reversion + noise), provisional-budget GDP drag
3. Process pending injections (crisis/election/shock/budget trigger)
4. Crisis system (resolve/trigger, apply daily impacts)
5. Election handling (negotiation rounds, voting, phase advancement)
6. Bill pipeline progression (5 reading stages, government fast-track)
7. Run party agents (batch AI), parse/validate actions
8. Process proposals, amendments, votes, statements, motions, interpellations, confidence actions, challenges
9. Presidential veto check on passed bills
10. Constitutional court rulings
11. Process MdB actions, speeches, proposals, seat applications, discipline review
12. Answer citizen questions + interpellations (batch AI)
13. Approval drift + membership bonus + sentiment mean-reversion
14. Resolve polls/referendums; weekly opinion recalc + poll generation
15. Monthly economic report; referendum generation
16. Budget cycle (annual or injected)
17. Media generation + sentiment influence (batch AI)
18. Daily narrative summary (batch AI)
19. Save state, persist events

### Key Constants

- Bundestag seats: 735; majority: 368; election threshold: 5%
- Sentiment: range 5–75, baseline 45, mean reversion 3%/day
- Term: 1461 days; polls: every 15 days; economy: every 30 days; budget: every 365 days
- Crisis: 8% daily / 25% monthly trigger; max 2 concurrent
- Questions: max 50/party/day (batch); interpellations: max 2/day; both expire 14 days
- Presidential veto: base 3% + impact magnitude
- Era summaries: every 60 days with case facts (economy, coalition, bills, elections, crises)

### Timing Presets

| Preset | Delay | Mode | Features |
|---|---|---|---|
| `ultra-fast` | AI-bound (~10 min/day) | Watch-only | Observation only |
| `fast` | 7 min | Watch-only | Observation only |
| `normal` | 30/15 min (day/night) | Participatory | Full user engagement |
| `slow` | 90 min + night pause | Participatory | Full user engagement |

## API Routes

12 domain routers in `packages/api/src/routes/`, all under `/api/`:

| Router | Prefix | Domain |
|---|---|---|
| `auth.ts` | `/api/auth` | OAuth (Google, GitHub), session, logout |
| `parties.ts` | `/api/parties` | Profiles, approval, coalition, alignment, proposals |
| `bills.ts` | `/api/bills` | Bills, signals, amendments, speeches, MdB votes |
| `elections.ts` | `/api/elections` | Elections, results, government |
| `simulation.ts` | `/api/simulation` | Status, calendar, events, costs, injections |
| `parliament.ts` | `/api/parliament` | Crises, Fraktionen, motions, interpellations, court |
| `content.ts` | `/api/content` | Media, polls, questions, referendums, logs |
| `users.ts` | `/api/users` | Profile, activity, party join/leave, proposals |
| `seats.ts` | `/api/seats` | MdB applications, roster, profiles |
| `budget.ts` | `/api/budget` | Budget cycles |
| `admin.ts` | `/api/admin` | Timing, context depth, analytics, costs |
| `quiz.ts` | `/api/quiz` | Policy quiz, lobbying, donations |

## Commands

All from monorepo root:

| Command | Description |
|---|---|
| `npm run dev:api` | Express API on port 3001 |
| `npm run dev:web` | Vite dev server on port 5173 (proxies /api → :3001) |
| `npm run build` | Build all packages via Turborepo |
| `npm run typecheck` | Typecheck all packages |
| `npm run lint` | ESLint all packages |
| `npm run test` | Run test suite (Vitest) |
| `npm run seed` | Reset DB with fresh party data (backs up first) |
| `npm run migrate` | Apply schema changes (preserves data) |
| `npm run simulate` | Run simulation days (e.g., `npm run simulate 5`) |
| `npm run simulate:auto` | Continuous simulation loop |
| `npm run kill` | Kill dev servers on ports 3001 and 5173 |

## Environment

Copy `.env.example` to `.env`. See the file for all options.

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key for Claude models |
| `XAI_API_KEY` | Optional | xAI API key for Grok (AfD agent) |
| `API_PORT` | Optional | Express port (default: 3001) |
| `DATABASE_PATH` | Optional | Path to simulation.db |
| `USER_DATABASE_PATH` | Optional | Path to users.db |
| `MODEL_DAILY` / `MODEL_NEGOTIATION` / `MODEL_SYNTHESIS` | Optional | Role model overrides |
| `MODEL_PARTY_<ID>` | Optional | Per-party model override (`provider:model-id`) |
| `TEST_MODE` | Optional | `ollama` / `groq` / `custom` — route all calls through a free OpenAI-compatible endpoint and bypass the Anthropic Batches API. See [Test Mode](#test-mode-freelocal-llms-for-cost-free-runs). |
| `TEST_MODEL` / `TEST_BASE_URL` / `TEST_API_KEY` | Optional | Override the active `TEST_MODE` preset's model, endpoint, or auth |
| `TEST_MODE_CONCURRENCY` | Optional | Parallel in-flight calls per fan-out batch (default `4`) |
| `GROQ_API_KEY` | Optional | Used when `TEST_MODE=groq` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Optional | Google OAuth |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | Optional | GitHub OAuth |
| `SESSION_SECRET` | Optional | Session encryption |
| `FRONTEND_URL` | Optional | Frontend URL for CORS |

## Deployment

Hosted on Hetzner Cloud (CX22, ~€5/mo). Deploys via GitHub Actions on push to `main`.

See [docs/operations/hosting.md](docs/operations/hosting.md) for full setup guide (server config, Caddy, PM2, CI/CD, backups).

## Source Anchors

**Engine — Simulation**: [loop.ts](packages/engine/src/simulation/loop.ts), [bill-pipeline.ts](packages/engine/src/simulation/bill-pipeline.ts), [veto.ts](packages/engine/src/simulation/veto.ts), [opinion.ts](packages/engine/src/simulation/opinion.ts), [media.ts](packages/engine/src/simulation/media.ts), [elections.ts](packages/engine/src/simulation/elections.ts), [timing.ts](packages/engine/src/simulation/timing.ts), [budget.ts](packages/engine/src/simulation/budget.ts), [confidence-votes.ts](packages/engine/src/simulation/confidence-votes.ts), [era-summary.ts](packages/engine/src/simulation/era-summary.ts), [knowledge-fetch.ts](packages/engine/src/simulation/knowledge-fetch.ts), [seats.ts](packages/engine/src/simulation/seats.ts), [committees.ts](packages/engine/src/simulation/committees.ts), [sidejobs.ts](packages/engine/src/simulation/sidejobs.ts)

**Engine — AI**: [client.ts](packages/engine/src/agent/client.ts), [batch-client.ts](packages/engine/src/agent/batch-client.ts), [ai-json.ts](packages/engine/src/agent/ai-json.ts), [model-config.ts](packages/engine/src/agent/model-config.ts), [prompt.ts](packages/engine/src/agent/prompt.ts), [party-agent.ts](packages/engine/src/agent/party-agent.ts), [action-parser.ts](packages/engine/src/agent/action-parser.ts), [group-prompts.ts](packages/engine/src/agent/group-prompts.ts)

**Engine — DB**: [schema.ts](packages/engine/src/db/schema.ts) (barrel), [schema-sim.ts](packages/engine/src/db/schema-sim.ts), [schema-user.ts](packages/engine/src/db/schema-user.ts), [ddl.ts](packages/engine/src/db/ddl.ts), [seed-data.ts](packages/engine/src/db/seed-data.ts)

**API**: [index.ts](packages/api/src/index.ts) (bootstrap), [routes/](packages/api/src/routes/), [middleware/](packages/api/src/middleware/), [mappers/](packages/api/src/mappers/)

**Types**: [index.ts](packages/types/src/index.ts) (barrel), [types/](packages/types/src/types/) (parties, economy, bills, elections, parliament, agent, meta)

**Web**: [main.tsx](packages/web/src/main.tsx) (routes), [api/](packages/web/src/api/) (client), [components/](packages/web/src/components/)

## Further Documentation

| Doc | Description |
|---|---|
| [Hosting & Deployment](docs/operations/hosting.md) | Hetzner setup, Caddy, PM2, CI/CD, backups |
| [API Costs & Pricing](docs/operations/costs.md) | Token pricing, tier limits, cost estimates |
| [Batch Timing Log](docs/operations/timing.md) | Observed batch API latency data |
| [Cost Analysis](docs/operations/analysis.md) | Measured cost data from production runs |
| [Bundestag Reference](docs/research/bundestag-reference.md) | German parliamentary rules and structure |
| [Abgeordnetenwatch Features](docs/research/abgeordnetenwatch-features.md) | Implementation record for features inspired by abgeordnetenwatch.de |
| [Abgeordnetenwatch API](docs/research/abgeordnetenwatch-api.md) | External API endpoints and integration guide |
| [Marketing Strategy](docs/marketing/strategy.md) | Launch plan for social media and dev communities |
| [Roadmap](docs/todo/README.md) | Completed work + open items |
