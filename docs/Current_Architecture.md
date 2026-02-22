# KI Bundestag — Current Architecture Reference

> **Doc Status**: Canonical (source of truth)
> **Use for**: Current schema, simulation flow, endpoints, constants

Last updated: 2026-02-22 (synced to code)

## Project Policy

- Greenfield-first project: prioritize the cleanest current design over historical compatibility.
- No backward-compatibility requirement for legacy docs, old schemas, legacy routes, or outdated UI behavior.
- When architecture evolves, update canonical docs to the new truth and retire obsolete material rather than preserving compatibility layers.

## Monorepo Structure

```
packages/
  types/     — shared TypeScript types (emitDeclarationOnly)
  engine/    — simulation core (agents, DB, loop)
  api/       — Express REST server
  web/       — React 19 SPA (Vite + React Router)
```

Dependency chain: `types` ← `engine` ← `api`; `web` is standalone.

All packages are ESM (`"type": "module"`), and internal imports use `.js` extensions.

## Database Architecture

Two SQLite databases are used:

- `simulation.db` (engine state)
- `users.db` (user-owned participation data)

Both are accessed via engine helpers (`getDb()/getSqlite()` and `getUserDb()/getUserSqlite()`).

### `simulation.db` tables

| Table | Purpose | Key fields |
|---|---|---|
| `parties` | 6 political parties | id, ideology, seat_count, approval_rating, policy_priorities, coalition_role |
| `bills` | Legislation pipeline | status (includes `struck_down`), impact, votes, amendments, is_government_bill, vetoed_by_president, member_initiative |
| `national_state` | Global state | coalition_parties/opposition_parties, economy fields, public_sentiment, provisional_budget |
| `simulation_events` | Event timeline | day_number, type, actor, title, description, data |
| `simulation_meta` | Runtime metadata | current_day, day_started_at, next_election_day, low_sentiment_streak, budget_retry_day, daily_summary, timing_preset, start_date |
| `crises` | Crisis instances | template_id, severity, day range, daily_impact, resolved |
| `elections` | Election lifecycle | status (`announced/campaign/voting/negotiation/completed/invalidated`), results, negotiation_rounds, coalition_agreement |
| `party_history` | Daily party snapshots | party_id, day_number, approval_rating, seat_count |
| `polls` | Preference + context polls | options, votes, active, expires_on_day, category |
| `media_articles` | AI-generated media | outlet, bias, category, content, day_number |
| `citizen_questions` | Public Q&A | question, target_party_id, response, status, day fields |
| `referendums` | AI-generated referendums | status (`active/passed/rejected/expired`), impact, closes_on_day |
| `pending_injections` | Admin-triggered injections | type, data, consumed |
| `fraktionen` | Parliamentary groups | party_id, leader_name, status, formed/dissolved days |
| `motions` | Motions/resolutions | type, votes, status, sentiment_impact |
| `government` | Federal cabinet | chancellor, ministers (JSON), election_id, active |
| `interpellations` | Parliamentary questions | type, target ministry/minister/party, response, status, sentiment_impact |
| `confidence_votes` | Confidence records | type, status, votes, proposer/replacement info |
| `constitutional_challenges` | Court challenges | bill, filing party, decision/reasoning, status, sentiment_impact |
| `budgets` | Budget cycles | cycle_number, allocations, votes, yes/no seats, economic_effect, revision_attempt |
| `event_queue` | Night-mode queued events | event_type, event_data, scheduled_for_day, status |
| `notifications` | User notifications | type, title/message, read, day_number |
| `bundestag_seats` | Seat allocation map | seat_number, party_id, controller (`human/ai`), user_id, discipline/proxy fields |

### `users.db` tables

| Table | Purpose | Key fields |
|---|---|---|
| `users` | Auth/profile | id (token), display_name, party_id, activity/cooldown fields |
| `internal_proposals` | Member proposals | score/votes, review deadlines, accepted/declined/expired states |
| `internal_votes` | Votes on proposals | proposal_id, user_id, vote (+1/-1) |
| `question_votes` | Question prioritization votes | question_id, user_id, vote (+1/-1) |
| `referendum_votes` | User referendum votes | referendum_id, user_id, option |
| `mdb_applications` | Seat applications | status, ai_reasoning, priority_score, cooldown |
| `mdb_votes` | Seat-level bill votes | seat_id, bill_id, user_id, vote |
| `mdb_speeches` | Submitted speeches | bill_id, reading, content, AI score fields |

## AI Usage Map

Central call path:

- `runDay()` → feature module → `callAI()` (`packages/engine/src/agent/client.ts`)
- model routing by party or role (`packages/engine/src/agent/model-config.ts`)

Default model setup:

- Party models: SPD/CDU/Grüne/FDP/Linke → Anthropic Haiku; AfD → xAI Grok mini
- Role models: `daily` Haiku, `negotiation` Haiku, `synthesis` Sonnet

AI-powered features include:

- party daily actions
- coalition negotiation rounds + synthesis
- citizen question answers
- interpellation answers
- media generation
- context poll generation
- referendum generation
- daily narrative summary
- internal proposal review
- MdB application review
- speech scoring
- discipline reasoning

### AI Infrastructure

**`callAI()` return type** — returns `AICallResult { text: string; model: string; provider: Provider }`, not a plain string. All 13 callAI sites destructure `.text`; `.model` and `.provider` feed into `logAICall()`.

**Circuit breaker** — per-provider map of `{ until: string; resetAt: number }`. Hard API limit errors (matching "usage limits"/"regain access") write an entry with a parsed `resetAt` timestamp (falls back to now + 10 min). Subsequent calls throw `AIProviderLimitError` immediately without hitting the API. Entries auto-expire: if `Date.now() >= resetAt` the entry is deleted and the call proceeds.

**Transient retry** — network errors (ECONNRESET, ETIMEDOUT, etc.) and HTTP 429s are treated as transient. The call retries up to `MAX_RETRIES = 2` times with delays `[2000, 5000]` ms before re-throwing. Hard limit errors break the loop immediately.

**Shared JSON parser** — `packages/engine/src/agent/ai-json.ts` provides:
- `extractJson(raw)` — strip markdown code fences + trim
- `safeParseJson<T>(raw)` — extract + sanitize (leading `+`, trailing commas) + `JSON.parse`; returns `null` on failure
- `parseAIJson<T>(raw, validator, label)` — `safeParseJson` + typed validator; `console.warn` with `label` on failure
- `logAICall(opts)` — emits a `[AI] <task> | <provider>/<model> | <ms>ms | OK|PARSE_FAIL|VALIDATION_FAIL [fallback=...]` line

All 11 JSON-returning callAI sites use `parseAIJson`. The 2 free-text sites (questions, interpellations) use `logAICall` for observability only.

**Token-budgeted context** — `prompt.ts` uses `CONTEXT_TOKEN_BUDGET = 3000` (estimated tokens, chars/4). Priority 1 sections (party info, coalition, state, active bills, crises, election, government) always included. Priority 2 (events, media, proposals, recent bills) greedily added if under budget. Priority 3 (motions, interpellations, challenges) dropped if over budget; a `// context trimmed` comment is added.

**Per-module fallback policies** — documented in `ai-json.ts`:

| Module | Fallback |
|---|---|
| party-agent | Abstain all votable bills |
| negotiations (round) | "Open to negotiations" + all partners |
| negotiations (synthesis) | `null` → algorithmic `findBestCoalition()` |
| media | No articles that day |
| polls | No context poll that cycle |
| referendums | No referendum |
| summary | `null` — no narrative |
| internal-proposals | Decline with default reason |
| seats | Reject with default reasoning |
| discipline | Default German reason strings |
| speeches | 0 (neutral impact) |
| questions | Question stays pending |
| interpellations | Interpellation stays pending |

Provider-limit circuit breaker is implemented in `callAI()`. If all providers are limited, `runner-auto` pauses.

## Agent Actions (per party/day)

| Action | Type | Who | Limit |
|---|---|---|---|
| `vote` | Parliamentary | Parties with Fraktion | Must vote on all third-reading bills |
| `propose_bill` | Parliamentary | Parties with Fraktion | Max 1 |
| `propose_amendment` | Parliamentary | Parties with Fraktion | Max 1 (second reading only) |
| `submit_motion` | Parliamentary | Parties with Fraktion | Max 1 |
| `file_interpellation` | Parliamentary | Opposition + Fraktion | Max 1 |
| `call_vertrauensfrage` | Parliamentary | Coalition leader + Fraktion | Max 1 |
| `file_misstrauensvotum` | Parliamentary | Opposition + Fraktion | Max 1 |
| `file_constitutional_challenge` | Parliamentary | Fraktion parties | Max 1 (global effective) |
| `statement` | Public | Any party | Max 1 |
| `campaign_statement` | Public | Any party (campaign phase) | Max 1 |
| `negotiation_position` | Special | Parties with election seats | Negotiation phase only |
| `nothing` | — | Any | — |

Bill categories: economy, social, environment, immigration, defense, education, healthcare, infrastructure.

## Simulation Day Flow (`runDay`)

1. Increment day; persist `currentDay`/`dayStartedAt`; load parties/state/bills/events/meta
2. Apply economic drift; apply provisional-budget GDP drag if active
3. Process pending injections (crisis/election/economic shock/invalidation/budget trigger)
4. Resolve/trigger crises; apply crisis daily impacts
5. Election handling:
   - trigger when scheduled (`nextElectionDay`) or low-sentiment streak (>=5 below 25), or injection
   - if `negotiation`: one AI round/day; after max rounds, AI synthesis with algorithmic fallback; form cabinet; allocate seats
   - if `voting`: calculate election results and transition to negotiation
   - otherwise advance phase (`announced` → `campaign` → `voting`)
6. Bill pipeline progression (`proposed → first_reading → committee → second_reading → third_reading`; government bills can skip first reading)
7. Run party agents, parse/validate actions, process proposals/amendments/votes/statements/motions/interpellations/confidence actions/challenges
8. Presidential veto check on passed bills (probability from bill impact magnitude)
9. Constitutional court handling for challenge actions (possible strike-down with economic reversal)
10. Process MdB actions, speeches, internal proposals, seat applications, discipline review
11. Answer citizen questions (max 3/day) and interpellations (max 2/day), expire overdue
12. Apply approval drift + membership bonus + sentiment mean reversion
13. Resolve expired polls/referendums
14. Poll-day cycle (`isPollDay`): opinion recalc + weekly poll generation
15. Monthly cycle (`isMonthlyDay`): economic report; referendum generation tied to economy interval (30 days)
16. Budget cycle (`isBudgetDay` annual or injection): vote budget; possible provisional budget + retry day; retry may dissolve government + force election
17. Save updated parties/history/state/meta; persist events
18. Generate media; apply media sentiment impact
19. Generate daily narrative summary (`{ narrative, mood }`) and store in `simulation_meta.daily_summary`

## Timing & Elections

- Term length: 1461 sim days (4 years incl. leap year)
- Campaign start: +7 days after announcement
- Election day: +21 days after announcement (snapped to Sunday when calendar-aware)
- Poll interval: every 15 sim days (calendar-aware workday snap)
- Economy report/referendum interval: every 30 sim days
- Budget interval: every 365 sim days

Election lifecycle:

```
announced → campaign → voting → negotiation (max rounds) → completed
```

Negotiation fallback: algorithmic coalition formation (mainstream-first, pariah last resort) if synthesis fails.

## Timing Presets & Participation

Presets (`simulation_meta.timing_preset`): `ultra-fast`, `fast`, `normal`, `slow`.

- `ultra-fast`: AI-bound, watch-only
- `fast`: 7 min/day, watch-only
- `normal`: participatory, day/night delays, light night-mode queueing
- `slow`: participatory, full night pause

Feature gates are preset-specific (poll voting, questions, referendums, proposals, bill signals, MdB actions).

### Timing Rationale

- Simulation modes (`ultra-fast`, `fast`) optimize throughput and observation (watch-only).
- Participatory modes (`normal`, `slow`) prioritize meaningful user interaction windows and night handling.
- Real-world mapping remains fixed: 1 sim day corresponds to 1 political day; only wall-clock pacing varies by preset.

## API Surface (current)

`packages/api/src/index.ts` currently defines 88 REST routes (including health), grouped as:

- Health: `/api/health`
- Parties: `/api/parties`, `/api/parties/alignment`, `/api/parties/:id`, `/api/parties/:id/history`, `/api/parties/:id/bills`, `/api/parties/:id/votes`, `/api/parties/:id/statements`, `/api/parties/:id/proposals`, `POST /api/parties/:id/proposals`
- Bills: `/api/bills`, `/api/bills/:id`, `/api/bills/:id/signal`, `POST /api/bills/:id/signal`, `POST /api/bills/:id/amendment`, `POST /api/bills/:id/speech`, `/api/bills/:id/speeches`, `POST /api/bills/:id/mdb-vote`, `/api/bills/:id/mdb-votes`
- State/Simulation: `/api/state`, `/api/simulation/status`, `/api/simulation/preset` (GET/POST), `/api/simulation/days`, `/api/simulation/days/:dayNumber`, `/api/simulation/events`, `/api/simulation/queue`
- Calendar: `/api/calendar`, `/api/calendar/upcoming`
- Elections: `/api/elections`, `/api/elections/active`, `/api/elections/:id`
- Crises: `/api/crises`, `/api/crises/:id`, `/api/crisis-templates`
- Parliamentary: `/api/fraktionen`, `/api/fraktionen/:id`, `/api/motions`, `/api/motions/:id`, `POST /api/motions/submit`, `/api/interpellations`, `/api/interpellations/:id`, `POST /api/interpellations/submit`, `/api/confidence-votes`, `/api/confidence-votes/:id`, `/api/constitutional-court`, `/api/constitutional-court/:id`
- Polls/Media/Questions/Referendums: `/api/polls`, `/api/polls/:id`, `POST /api/polls/:id/vote`, `/api/media`, `/api/media/:id`, `/api/questions`, `/api/questions/:id`, `POST /api/questions`, `POST /api/questions/:id/vote`, `DELETE /api/questions/:id/vote`, `/api/referendums`, `/api/referendums/:id`, `POST /api/referendums/:id/vote`
- Government/Budget: `/api/government`, `/api/government/history`, `/api/budgets`, `/api/budgets/:id`
- Injections/Admin runtime: `POST /api/simulate/inject`, `/api/simulate/injections`
- Proposals voting: `/api/proposals/:id`, `POST /api/proposals/:id/vote`, `DELETE /api/proposals/:id/vote`
- Auth/User: `POST /api/users/login`, `POST /api/users/register`, `/api/users/me`, `POST /api/users/me/join/:partyId`, `POST /api/users/me/leave`
- User activity: `/api/users/me/activity`, `/api/users/me/impact`, `/api/users/me/catchup`
- MdB seats: `POST /api/seats/apply`, `/api/seats/my-seat`, `/api/seats/party/:partyId`, `/api/seats/available`
- Notifications: `/api/notifications`, `/api/notifications/unread-count`, `POST /api/notifications/:id/read`, `POST /api/notifications/read-all`
- Admin: `/api/admin/analytics`
- Simulation events (extras): `/api/simulation/events/latest`

## Web Routes

`packages/web/src/main.tsx` currently wires 24 routes:

- `/` (Dashboard)
- `/parties`, `/parties/:id`
- `/bills`, `/bills/:id`
- `/elections`
- `/news`
- `/polls`
- `/media`
- `/questions`
- `/motions`
- `/interpellations`
- `/confidence-votes`
- `/constitutional-court`
- `/budget`
- `/admin`, `/admin/costs`, `/admin/analytics`
- `/referendums`
- `/log`
- `/notifications`
- `/my-activity`
- `/login`
- `/about`

## Key Constants (verified)

- Bundestag seats: 735; majority threshold: 368
- Election threshold: 5%
- Sentiment bounds: 5–75; baseline: 45; mean reversion: 3%/day
- Crisis trigger chance: 8% daily / 25% on monthly cycle; max 2 concurrent crises
- Questions: max 3 answered/day; expiry 14 days; API pending cap enforced
- Interpellations: max 2 answered/day; deadline 14 days
- Polls: generated on poll day (15-day interval), expiry 14 days
- Referendums: generated every 30 days; close after 14 days; 10-vote quorum for resolution
- Budget: annual cycle (365 days), total 300B EUR, revision attempt with coalition bonus; retry failure can dissolve government
- Presidential veto: base 3% + impact-based increments

## Source Anchors

- Core simulation loop: [packages/engine/src/simulation/loop.ts](packages/engine/src/simulation/loop.ts#L63-L2084)
- Election trigger + phase constants: [packages/engine/src/simulation/elections.ts](packages/engine/src/simulation/elections.ts#L22-L77)
- Timing constants/presets/feature gates: [packages/engine/src/simulation/timing.ts](packages/engine/src/simulation/timing.ts#L30-L287)
- Calendar-aware cycle checks: [packages/engine/src/simulation/cycles.ts](packages/engine/src/simulation/cycles.ts#L1-L93)
- Sentiment/approval constants: [packages/engine/src/simulation/opinion.ts](packages/engine/src/simulation/opinion.ts#L3-L34)
- Budget constants/vote logic/veto logic: [packages/engine/src/simulation/budget.ts](packages/engine/src/simulation/budget.ts#L3-L211)
- Confidence vote threshold/logic: [packages/engine/src/simulation/confidence-votes.ts](packages/engine/src/simulation/confidence-votes.ts#L11-L120)
- Questions/interpellations daily limits: [packages/engine/src/simulation/questions.ts](packages/engine/src/simulation/questions.ts#L7-L88), [packages/engine/src/simulation/interpellations.ts](packages/engine/src/simulation/interpellations.ts#L6-L122)
- Seat split ratio + seat allocation: [packages/engine/src/simulation/timing.ts](packages/engine/src/simulation/timing.ts#L251-L260), [packages/engine/src/simulation/seats.ts](packages/engine/src/simulation/seats.ts#L20-L67)
- AI routing + circuit breaker + retry: [packages/engine/src/agent/client.ts](packages/engine/src/agent/client.ts#L17-L223)
- Shared JSON parser + observability: [packages/engine/src/agent/ai-json.ts](packages/engine/src/agent/ai-json.ts#L1-L207)
- Model config defaults/overrides: [packages/engine/src/agent/model-config.ts](packages/engine/src/agent/model-config.ts#L23-L93)
- Token-budgeted prompt builder: [packages/engine/src/agent/prompt.ts](packages/engine/src/agent/prompt.ts#L116-L320)
- Event queue + notifications: [packages/engine/src/simulation/event-queue.ts](packages/engine/src/simulation/event-queue.ts#L1-L296)
- Committee assignment + recommendation: [packages/engine/src/simulation/committees.ts](packages/engine/src/simulation/committees.ts#L1-L55)
- DB schema (all tables): [packages/engine/src/db/schema.ts](packages/engine/src/db/schema.ts#L3-L398)
- API route surface: [packages/api/src/index.ts](packages/api/src/index.ts#L109-L2771)
- Web route map: [packages/web/src/main.tsx](packages/web/src/main.tsx#L525-L548)

## Related Docs

- `docs/Functional_Overview.md`
- `docs/Engagement.md`
- `docs/operations/runbook.md`