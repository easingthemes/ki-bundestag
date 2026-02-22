# KI Bundestag - Project Memory

## Architecture
- Monorepo: npm workspaces + Turborepo
- 4 packages: `types`, `engine`, `api`, `web`
- TypeScript throughout, SQLite via better-sqlite3 + Drizzle ORM
- All packages use `"type": "module"` for ESM output

## Key Commands
- `npm run seed` — seeds DB with 6 parties + initial state (always backs up first)
- `npm run migrate` — applies schema changes without clearing data
- `npm run simulate` — runs simulation days (arg: number of days)
- `npm run dev:api` — starts Express API on port 3001 (via turbo)
- `npm run dev:web` — starts Vite dev server on port 5173 (via turbo)
- `npm run build` — turbo build all packages
- **All commands must be run from monorepo root**

## Package Exports (Critical)
- Engine and types: both `"import"` and `"default"` point to `./src/index.ts`
- This ensures tsx always loads source files, not stale compiled dist/
- Types package uses `emitDeclarationOnly: true` (pure type declarations)

## Database (Split DB Architecture)
- **Two SQLite databases** in `data/` directory (WAL mode, foreign keys ON):
  - `simulation.db` — simulation tables (parties, bills, elections, etc.) — accessed via `getDb()`/`getSqlite()`
  - `users.db` — user-owned tables — accessed via `getUserDb()`/`getUserSqlite()`
- **User DB tables**: `users`, `internal_proposals`, `internal_votes`, `member_signals`, `question_votes`, `notifications`, `mdbApplications`, `mdbVotes`, `mdbSpeeches`
- **Sim DB tables**: parties, bills, national_state, simulation_events, simulation_meta, crises, elections, party_history, polls, media_articles, citizen_questions, referendums, pending_injections, fraktionen, motions, government, interpellations, confidence_votes, constitutional_challenges, budgets, event_queue, bundestagSeats
- Path resolves via `import.meta.url` + `findMonorepoRoot()` in connection.ts
- Env vars: `DATABASE_PATH` (sim), `USER_DATABASE_PATH` (users)
- Schema defined with Drizzle ORM in `packages/engine/src/db/schema.ts` (unified, both DBs use same schema object)
- DDL split in `seed.ts`: `SIM_TABLE_DDL` + `USER_TABLE_DDL`; `SIM_COLUMN_MIGRATIONS` + `USER_COLUMN_MIGRATIONS`
- `npm run seed` backs up both DBs before wiping; `npm run migrate` creates/updates both
- `closeDb()` automatically closes both DB connections
- Migration script: `npx tsx scripts/migrate-users-db.ts` (one-time, moves data from sim→user DB)
- Notable extra columns: `national_state.provisional_budget`, `simulation_meta.budget_retry_day`, `simulation_meta.timing_preset`, `budgets.revision_attempt`, `bills.member_initiative`, `bills.proposer_display_name`

## Model Configuration
- `MODELS` map in `client.ts`: `daily`, `negotiation`, `synthesis`
- Env var overrides: `MODEL_DAILY`, `MODEL_NEGOTIATION`, `MODEL_SYNTHESIS`
- `runPartyAgent()` accepts optional `modelKey` param
- **`callAI()` returns** `AICallResult {text, model, provider}` (not a plain string) — all 13 callers destructure `.text`
- **Circuit breaker**: Hard API limit errors → stored with TTL-based `resetAt` timestamp (auto-expire). Transient errors (429, network) → retry up to 2× with [2s, 5s] delays. `allProvidersLimited()` checks TTL before returning true. Runner-auto pauses when all blocked. All 13 callers handle `AIProviderLimitError`.
- **Shared JSON parser**: `ai-json.ts` provides `parseAIJson(raw, validator, label)` — code-fence strip + sanitize + typed validation. Used by all 11 JSON-returning sites.
- **Observability**: `logAICall()` in `ai-json.ts` — every callAI emits `[AI] <task> | <provider>/<model> | <ms>ms | OK|PARSE_FAIL|VALIDATION_FAIL`

## Election + Negotiation Flow
- Phases: announced → campaign → voting → negotiation (3 rounds) → completed
- During negotiation: normal party agents skipped
- After 3 rounds: Sonnet synthesis → coalition agreement or fallback to algorithmic
- After coalition formed: `formCabinet()` creates Chancellor + 8 Ministers

## Sentiment Model
- Range: 5–75, baseline: 45, mean-reversion 3%/day (opinion.ts matches loop.ts hardcoded 75)
- Per-bill impact capped ±2, daily noise ±0.4

## Polls System
- Generated weekly: party preference + AI context poll
- Expire after 7 days, POST /api/polls/:id/vote (first write endpoint)

## Critical Gotchas
- **Stale dist/ causes bugs**: If `"default"` export points to dist/, tsx may load old compiled code
- **Shell cwd drift**: npm run commands must run from monorepo root
- **turbo changes cwd**: DB path must resolve independently of cwd

## Drizzle Notes
- Use `getSqlite()` for raw sqlite3 client, never access drizzle internals

## Media System
- 2–3 AI articles/day from 3 outlets: Berliner Tagesspiegel (center), Volksstimme (left), Wirtschaftswoche (right)
- Generated at end of runDay(), only on days with newsworthy events
- Single Haiku call per day, JSON array response
- Engine: `packages/engine/src/simulation/media.ts`

## Phase 3 Features (All Complete)
- **Media Feedback Loop**: Recent headlines injected into agent context; media affects sentiment ±0.5/day
- **Bürgerfragen**: Users submit questions to parties; AI answers max 3/day; 14-day expiry; community upvote/downvote (top-voted answered first)
- **Referendums**: AI-generated every 30 days; users vote Yes/No; needs 10 votes for quorum; impacts economy
- **Event Injection**: Dashboard panel to inject crises (from templates), snap elections, economic shocks
  - `pending_injections` table consumed at start of `runDay()`

## Phase 4 Features (Bundestag Upgrade)
- **4.1 Fraktionen**: Parliamentary groups gating participation; 5% threshold; auto-create/dissolve after elections
- **4.1 Multi-stage bills**: proposed → 1st reading → committee → 2nd reading (amendments) → 3rd reading (vote)
- **4.1 Motions & Resolutions**: Non-legislative actions; same-day vote; `submit_motion` agent action; sentiment +0.3/+0.2
- **4.2.1 Chancellor + Ministers**: 8 ministries mapping to BillCategory; proportional allocation to coalition; govt bills skip 1st reading
  - `MINISTER_CANDIDATES` in `government.ts`: 3-4 real politicians per party
  - Chancellor = FRAKTION_LEADERS[coalition leader]
  - `government` table: chancellorName, ministers (JSON), active, formedOnDay
  - Dashboard shows Chancellor card + 8 minister cards
  - Bills tagged `isGovernmentBill` get "Govt. Bill" badge + fast-track pipeline
- **4.2.2 Interpellations**: Opposition questions government ministers; `file_interpellation` agent action
  - Two types: Kleine Anfrage (written, +0.1) and Große Anfrage (debate, +0.3)
  - AI answers as minister (max 2/day, Haiku); 14-day deadline; expired = -0.3 for target party
  - `interpellations` table; recent 5 days in agent context
  - Anfragen page with type/status filters, expandable question+response cards

## Phase 2.3 Features (Complete)
- **Vertrauensfrage**: Coalition leader calls confidence vote; 10% coalition defection risk; failure triggers snap election
- **Konstruktives Misstrauensvotum**: Opposition proposes replacement Chancellor; 85% other opposition join; success = immediate power transfer
- Both require Fraktion, blocked during elections; max 1 each per day globally
- `confidence_votes` table; `packages/engine/src/simulation/confidence-votes.ts`
- `formCabinet` signature updated to accept `electionId: string | null`
- Threshold: 368 seats (absolute majority of 735)

## Phase 2.4 Features (Complete)
- **Constitutional Court (Bundesverfassungsgericht)**: Any Fraktion can challenge a passed bill (last 14 days); 30% strike-down probability; same-day ruling; max 1/day
  - Struck down: bill → `struck_down` status, economic impacts reversed, sentiment −0.5, filing party +0.8, proposing party −0.5
  - Upheld: filing party −0.3 (wasted political capital)
  - Pre-canned German-flavored reasoning strings (no AI call)
  - `constitutional_challenges` table; `packages/engine/src/simulation/constitutional-court.ts`
  - `reverseBillImpact()` helper in `economy.ts`
  - Agent action: `file_constitutional_challenge` (billId, title, arguments)
  - `constitutional_challenge_filed` + `constitutional_court_ruled` event types
  - `"struck_down"` added to `BillStatus`
  - Agent context: `recentConstitutionalChallenges` (7d) + `passedBillsForChallenge` (14d)
  - API: `GET /api/constitutional-court` + `GET /api/constitutional-court/:id`
  - Web page: `/constitutional-court` ("Verfassungsgericht" nav link)

## Phase 3.1+3.2 Features (Complete)
- **Annual Budget (3.1)**: Every 60 sim days (or admin injection); coalition-weighted 300B EUR across 8 ministries; sentiment-adjusted vote (97/90/82/72% coalition yes by tier); provisional budget + renegotiation chain on rejection (Art. 111 GG)
  - `packages/engine/src/simulation/budget.ts`: `generateBudgetAllocations`, `generateRevisedAllocations`, `tallyBudgetVote(parties, coalitionIds, sentiment, isRevision?)`, `applyBudgetEconomicEffect`, `shouldPresidentVeto`
  - Rejection: `provisionalBudget=true`, `budgetRetryDay=N+7`, GDP drag −0.01/day; retry with +5pp boost; double rejection → dissolve govt + snap election
  - `budgets` table (`revision_attempt` 0/1); `national_state.provisional_budget`; `simulation_meta.budget_retry_day`
  - `isBudgetDay(day)` in cycles.ts; `PARTY_MINISTRY_WEIGHTS` map keyed by party ID (spd/cdu/gruene/fdp/afd/linke)
  - New event types: `provisional_budget_started`, `budget_revision_rejected`
  - API: `/api/budgets`, `/api/state` (provisionalBudget), `/api/simulation/status` (budgetRetryDay + provisionalBudget)
  - Web: Budget page "Revised" badge + "Retry Day X"; Dashboard amber provisional banner; Admin "Trigger Budget Cycle" button
- **Bundespräsident Veto (3.2)**: 3–16% veto chance on passed bills based on impact magnitudes; veto → bill stays `rejected` with `vetoedByPresident: true`, proposer -0.5; pre-canned reasons; amber "Vetoed by President" badge on Bills page
  - `presidential_veto` event type; `vetoed_by_president` column on bills table
  - Bundesrat (3.3) skipped per user decision

## Phase E Features (User Engagement — Complete)
- **E.1 User Identity + Membership**: `users` table (UUID token = auth, unique displayName); `POST /api/users/register` (409 on duplicate), `POST /api/users/login` (lookup by nickname, 404 if not found), `GET /api/users/me`, join/leave party; 7-day switch cooldown; `UserContext` in web; cookie + localStorage token persistence; `/login` page (nickname → login → register if not found); `UserMenu` avatar dropdown in nav; Join buttons redirect to `/login` if unauthenticated; member count on party cards
- **E.2 Internal Proposals**: `internal_proposals` table; members + AI propose bills to party caucus; 5-day review window; max 5 open/party; `POST/GET /api/parties/:id/proposals`; proposals section in PartyDetail; AI mirrors `propose_bill` actions to caucus
- **E.3 Member Voting**: `internal_votes` table (upsert); `POST/DELETE /api/proposals/:id/vote`; ▲▼ buttons in PartyDetail; `userVote` returned in list/detail responses
- **E.4 Party Decision Engine**: `packages/engine/src/simulation/internal-proposals.ts`; daily review step (age≥5d, votes≥3); Haiku accept/decline call; accepted → bill with `memberInitiative=true`; purple "Member Initiative" badge on Bills/BillDetail; `proposerDisplayName` attribution
- **E.5 Membership Influence**: `membershipBonus(activeMembers)` in opinion.ts; logarithmic curve (log10 × 2.5 × 0.01); applied in loop.ts approval drift; shown as "+X.XXX/day" on Parties page
- **E.6 Member Bill Signals**: `member_signals` table; `POST/GET /api/bills/:id/signal`; YES/NO bar + vote buttons on BillDetail (2nd/3rd reading only); signal counts injected into agent vote context via `AgentContext.memberSignals`

## MdB System (Member of Bundestag — Complete)
- **Seats**: `bundestagSeats` table (SIM DB); per-party allocation after elections; human seat ratio configurable per preset (0%/0%/30%/70%)
- **Applications**: `mdbApplications` table (USER DB); AI-reviewed (max 3/party/day); priority+lottery fair allocation; 14-day rejection cooldown; `mdb_apply` feature key (normal+slow)
- **Voting**: `mdbVotes` table (USER DB); `tallyVotes()` splits human-voted/proxy/AI seats; whipped at discipline level 3; POST/GET `/api/bills/:id/mdb-vote`
- **Speeches**: `mdbSpeeches` table (USER DB); 1 per reading per user; POST/GET `/api/bills/:id/speech`; +0.1 sentiment per speech
- **Actions**: Motions/interpellations/amendments via `pending_injections` queue; POST endpoints with strict validation (±0.3 impact bounds)
- **Discipline**: `discipline.ts`; 7-day review cycle; 4 levels (warn→restrict→whip→expel); deterministic scoring from votes vs party line; AI reasoning
- **UI**: MdbBadge/DisciplineBadge components; PartyDetail roster+apply; Dashboard seat card+CTA; BillDetail vote+speech
- **Color maps**: `MDB_BADGE`, `DISCIPLINE_BADGE`, `DISCIPLINE_LABEL` in `colors.ts`
- **API endpoints**: POST `/api/seats/apply`, GET `/api/seats/my-seat`, GET `/api/seats/party/:partyId`, GET `/api/seats/available`, POST/GET mdb-vote, POST/GET speech, POST motions/interpellations/amendments submit
- **Deferred**: Committees, speech slot lottery, citizen lane expansion

## Phase D Features (Engagement — Complete)
- **Mood Badge (D.1)**: `summary.ts` returns `{narrative, mood} | null`; stored as JSON string in `simulation_meta.daily_summary`; Dashboard parses JSON + shows colored pill badge (7 mood labels); backward-compatible with old plain-text rows
- **Vote Alignment Matrix (D.2)**: `GET /api/parties/alignment` (must be registered BEFORE `GET /api/parties/:id` in Express); pairwise vote agreement %; requires ≥3 shared votes; `AlignmentData` type in `web/src/api.ts`; color-coded table on Parties page
- **Ask a Party Widget (D.3)**: `AskPartyWidget` component in Dashboard.tsx; uses existing `POST /api/questions`; 5–140 char limit (Questions page allows up to 500)
- **Coalition Calculator (D.4)**: `CoalitionCalculator` + `ideologicalSpread()` in Elections.tsx; pure frontend; 368-seat threshold; L1 distance on 5 policyPriorities keys (economy, social, environment, immigration, spending)

## Timing Presets (Complete)
- **Config**: `packages/engine/src/simulation/timing.ts` — `TIME_CONFIG` with all cycle intervals, 4 preset configs, event classification, feature availability matrix
- **Presets**: ultra-fast (0 delay, watch-only), fast (7min, watch-only), normal (30/15min day/night, participatory), slow (1.5h/pause, participatory)
- **Cycle intervals**: `TERM_DAYS=1461`, `POLL_INTERVAL=15`, `ECONOMY_INTERVAL=30`, `BUDGET_INTERVAL=365`, `SESSION_INTERVAL=5`
- **Runner**: `runner-auto.ts` reads `timing_preset` from DB, applies preset-specific delays, slow-mode night pause (Europe/Berlin timezone)
- **Event queue**: `event-queue.ts` — queueEvent/drainQueue (sim DB), notification CRUD (user DB), morning summary generator
- **Feature gating**: `requireParticipatory()` in API with 10s TTL preset cache; 9 POST/DELETE endpoints return 403 in watch-only modes
- **API endpoints**: GET/POST `/api/simulation/preset`, GET `/api/notifications`, GET `/api/notifications/unread-count`, POST `/api/notifications/:id/read`, POST `/api/notifications/read-all`, GET `/api/simulation/queue`
- **UI**: Admin preset selector card, Dashboard watch-only banner, NotificationBell in nav (30s poll), Notifications page
- **Migration**: `npm run migrate:timing` — idempotent, rescales nextElectionDay 120→1461
- **Feature matrix**: 10 feature keys per preset; includes future MdB features as `false`

## Web Pages (21 total)
- Dashboard, Parties, PartyDetail, Bills, BillDetail, Elections, Budget, NewsFeed, Polls, Media, Questions, Motions, Interpellations, ConfidenceVotes, ConstitutionalCourt, Referendums, Notifications, SimulationLog, Login, About, Admin, AdminCosts
- Routes in `main.tsx`, API client in `api.ts`
- `usePolling` hook: `(callback, intervalMs?)` — no return value, no loading state
- Admin page (`/admin`): simulation speed preset selector, inject events, AI model config table, simulation actions reference (27 actions)
- Notifications page (`/notifications`): type filter pills, read/unread indicators, mark-read actions

## UI Stack (shadcn/ui + Tailwind CSS v4)
- **Tailwind v4**: `@import "tailwindcss"` + `@theme inline` in `src/styles.css`; NOT v3 directives
- **shadcn/ui**: 15 components in `src/components/ui/` (card, badge, button, sheet, skeleton, etc.)
- **`@` path alias**: `@/components/ui/card` — configured in `vite.config.ts` + `tsconfig.json`
- **`cn()` utility**: `clsx` + `tailwind-merge` from `src/lib/utils.ts`
- **`shared.tsx`**: App wrappers — Button (variant mapping), SkeletonCard, SkeletonTitle, ShowMoreButton
- **Inter font**: Loaded via Google Fonts in `index.html`
- **Global headings**: h1/h2/h3 in styles.css (foreground color, semibold, tight tracking — no uppercase)
- **`src/lib/colors.ts`**: 19 shared semantic color maps — all pages import from here, no per-page color constants
  - Badges: `STATUS_BADGE`, `ROLE_BADGE`, `FRAKTION_BADGE`, `PHASE_BADGE`, `SEVERITY_BADGE`, `MOOD_BADGE`
  - Special: `GOVT_BILL_BADGE`, `MEMBER_INITIATIVE_BADGE`, `PRESIDENTIAL_VETO_BADGE`, `REVISED_BADGE`
  - Types: `CONFIDENCE_TYPE_BADGE`, `INTERPELLATION_TYPE_BADGE`, `MOTION_TYPE_BADGE`, `BIAS_BADGE`, `MODEL_TYPE_BADGE`
  - Inline colors: `SEMANTIC_HEX` (positive/negative/neutral/warning/info), `VOTE_HEX` (yes/no/abstain)
  - Bars: `VOTE_COLORS` (className-based), `ALERT_STYLES` (info/warning/success/error)
- **Party colors**: Always inline `style={{ }}` — dynamic values can't be Tailwind classes
- **Common patterns**: Card+CardContent wrappers, `<Badge variant="outline" className={STATUS_BADGE[status]}>`, cn() pill filter buttons, SELECT_CLS for filter selects, vote bars with VOTE_COLORS
- **Navigation**: 4 dropdown groups + `UserMenu` (gold avatar, dropdown: My Party / My Questions / Logout) + MobileNav (shadcn Sheet) + footer; all Tailwind
- **Login page**: `/login?redirect=<path>`; nickname input → try login → offer register if not found; `api.loginUser()` uses raw fetch (404 → null, no error toast)
- **Dashboard**: 2-column grid; hero+seat bar+economy+events+media; sidebar; featured section
- **ShowMoreButton**: in shared.tsx; used on Bills, ConfidenceVotes, Polls, Referendums, SimulationLog, Budget, etc.
- **Nudge banners**: `ALERT_STYLES.info` (blue) + `ALERT_STYLES.warning` (amber)
