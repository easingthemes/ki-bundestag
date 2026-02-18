# KI Bundestag — Project Progress

> Last updated: 2026-02-18

## Current Status: Phase 4 + Engagement Features — COMPLETE

All phases complete. Latest additions: mood badge on daily summary, cross-party vote alignment matrix, "Ask a Party" widget on Dashboard, and interactive Coalition Calculator on Elections page. (These correspond to D.1–D.4 in `docs/Future_Improvements.md`.)

---

## Phase 1 — Prototype

### Engine / Simulation
| Feature | Status | Notes |
|---------|--------|-------|
| 6 parties with ideology & priorities | Done | SPD, CDU/CSU, Grüne, FDP, AfD, Die Linke |
| Daily simulation loop | Done | `runDay()` in `simulation/loop.ts` |
| AI agent per party per day | Done | Claude Haiku, structured JSON |
| Bill lifecycle (propose → debate → vote → pass/reject) | Done | Transitions in loop.ts |
| Seat-weighted voting | Done | `voting.ts` — abstentions excluded from total |
| Economy model (budget, unemployment, inflation, GDP) | Done | Random drift + bill impacts |
| Public sentiment tracking | Done | Mean-reversion toward baseline 45, capped 5–75 |
| Approval rating per party | Done | Drift + bill outcome bonuses + weekly recalc |
| Agent error fallback (auto-abstain) | Done | In `party-agent.ts` |
| Auto-simulate mode | Done | `runner-auto.ts`, configurable interval |
| Crisis / random events | Done | 8 German crisis templates, 8% daily / 25% monthly trigger, max 2 concurrent |
| Structured time cycles | Done | Weekly opinion recalc (day % 7), monthly economic report (day % 30) |
| Crisis-aware agents | Done | Active crises injected into agent context + prompt |
| Election system | Done | Scheduled (120-day cycle) + snap elections (5-day low sentiment streak) |
| Campaign periods | Done | 3-day campaign with `campaign_statement` agent actions |
| Election results calculation | Done | Approval-based + Gaussian noise, 5% threshold, proportional seats (735 total) |
| Coalition formation | Done | Ideological proximity, Brandmauer for AfD, seat redistribution |
| Election-aware agents | Done | Active election injected into agent context |
| Database migrations | Done | `npm run migrate` applies schema changes without data loss |
| Election trigger command | Done | `npm run trigger:election` forces next election (testing) |

### API
| Feature | Status | Notes |
|---------|--------|-------|
| GET /api/parties (list + by id) | Done | |
| GET /api/parties/alignment | Done | Pairwise vote agreement % matrix; requires ≥3 shared votes per pair |
| GET /api/parties/:id/history | Done | Approval + seat history per day |
| GET /api/parties/:id/bills | Done | Bills proposed by party |
| GET /api/parties/:id/votes | Done | Voting record with bill context |
| GET /api/parties/:id/statements | Done | Statements + campaign events |
| GET /api/bills (list + by id, status filter) | Done | |
| GET /api/state (national state) | Done | |
| GET /api/simulation/status | Done | |
| GET /api/simulation/days + day events | Done | |
| GET /api/simulation/events (paginated, type/actor filters) | Done | `?type=`, `?actor=` query params |
| GET /api/crises (list, ?active=true filter) | Done | |
| GET /api/crises/:id | Done | |
| GET /api/elections (list, ?status filter) | Done | Includes negotiation rounds + agreement |
| GET /api/elections/active | Done | Returns current non-completed election or null |
| GET /api/elections/:id | Done | |
| GET /api/polls (list, ?active=true filter) | Done | |
| GET /api/polls/:id | Done | |
| POST /api/polls/:id/vote | Done | First write endpoint; increments vote count |
| GET /api/media (list, ?day=N filter) | Done | |
| GET /api/media/:id | Done | |
| GET /api/questions (list, ?partyId, ?status filters) | Done | |
| GET /api/questions/:id | Done | |
| POST /api/questions | Done | Rate limit: max 5 pending, min 5 chars, max 500 |
| GET /api/referendums (list, ?status filter) | Done | |
| GET /api/referendums/:id | Done | |
| POST /api/referendums/:id/vote | Done | Same pattern as polls |
| GET /api/fraktionen (list, ?status filter) | Done | Returns all Fraktionen (active/dissolved) |
| GET /api/fraktionen/:id | Done | Single Fraktion by id |
| GET /api/motions (list, ?status, ?type filters) | Done | Returns all motions/resolutions |
| GET /api/motions/:id | Done | Single motion by id |
| GET /api/interpellations (list, ?status, ?partyId, ?targetMinistry) | Done | |
| GET /api/interpellations/:id | Done | |
| GET /api/confidence-votes (list, ?status, ?type) | Done | |
| GET /api/confidence-votes/:id | Done | |
| GET /api/constitutional-court (list, ?status, ?billId) | Done | |
| GET /api/constitutional-court/:id | Done | |
| GET /api/budgets (list, ?status filter) | Done | |
| GET /api/budgets/:id | Done | |
| GET /api/government | Done | Active government (Chancellor + Ministers) or null |
| GET /api/government/history | Done | All governments sorted by formation day desc |
| GET /api/crisis-templates | Done | List available crisis templates for injection |
| POST /api/simulate/inject | Done | Inject crisis, election, economic shock, or budget cycle |
| GET /api/simulate/injections | Done | List pending/consumed injections |
| Health check | Done | |
| CORS | Done | |

### Web Dashboard
| Feature | Status | Notes |
|---------|--------|-------|
| Navigation (Dashboard, Parties, Bills, Elections, Budget, News, Polls, Media, Questions, Motions, Anfragen, Vertrauensvoten, Verfassungsgericht, Votes, Log, About, Admin) | Done | React Router, 17 nav items |
| Dashboard: coalition bar, economy, sentiment | Done | |
| Dashboard: Federal Government section | Done | Chancellor card + 8 minister cards in grid |
| Dashboard: active crisis cards | Done | Severity-colored borders (red/yellow/blue) |
| Dashboard: "Today in Berlin" mood badge | Done | Colored pill badge beside day summary header; 7 mood labels; backward-compatible JSON parsing |
| Dashboard: "Ask a Party" widget | Done | Party dropdown + text input (5–140 chars) + submit; success toast; link to Questions page |
| Parties page: clickable cards with stats & priorities | Done | Links to party detail pages; Fraktion badge + leader name |
| Parties page: Vote Alignment Matrix | Done | Color-coded table below party grid; green = high agreement, red = low; "—" when <3 shared votes |
| Party detail page: header, approval chart, bills, votes, statements | Done | SVG sparkline chart; Fraktion section (leader, formed day, status) |
| Bills page: grouped by status, vote bars | Done | Government bills tagged with "Govt. Bill" badge; vetoed bills show amber "Vetoed by President" badge |
| Simulation Log: expandable days | Done | |
| Elections page: hemicycle, bar chart, result table | Done | SVG hemicycle, comparison with previous election |
| Elections page: coalition/opposition display | Done | Color-coded government formation |
| Elections page: negotiation rounds display | Done | Round-by-round positions, concessions, partners |
| Elections page: coalition agreement display | Done | Key policies, concessions, summary |
| Elections page: negotiation-in-progress status | Done | Round counter + hemicycle preview |
| Elections page: election selector | Done | Dropdown for multiple elections |
| Elections page: in-progress election display | Done | Countdown, status badge |
| Elections page: Coalition Calculator | Done | Interactive checkboxes per party; running seat total; majority indicator (368 threshold); ideological spread score (Compatible/Manageable/Fragmented); pre-selects current coalition |
| News feed: filterable event timeline | Done | Category/type toggles, day separators, breaking news styling |
| News feed: pagination | Done | "Load more" button, 50 per page |
| Polls page: active polls with voting | Done | Option buttons, localStorage double-vote prevention |
| Polls page: results bar chart | Done | Percentage bars after voting |
| Polls page: closed polls section | Done | Collapsible past polls |
| Media page: newspaper-style article display | Done | Day groupings, expandable cards, outlet/bias/category badges |
| Questions page: party/status filters, question/answer cards | Done | Q&A from citizen questions feature |
| Party detail: question submission form + recent Q&A | Done | Inline form with validation |
| Referendums page: active voting + past results | Done | Yes/No voting, quorum display, impact summary |
| Motions page: grouped by status with vote bars | Done | Type badges (Antrag/Entschließung), vote breakdown, proposer info |
| Anfragen page: interpellation list with filters | Done | Type badges (Kleine/Große Anfrage), status badges, expandable cards with question + minister response |
| Admin page: inject event panel | Done | Crisis (template select), snap election, economic shock, invalidate election, trigger budget cycle |
| Admin page: AI model config table | Done | Model key, model name, tokens, env var, expandable prompt/context detail |
| Admin page: simulation actions reference | Done | All 27 actions listed; AI (Haiku/Sonnet) vs Algorithmic; category filter; expandable mechanics detail |
| Auto-polling (5s) | Done | `usePolling` hook |
| Error toast | Done | Red banner, 6s auto-dismiss |

### Infrastructure
| Feature | Status | Notes |
|---------|--------|-------|
| Monorepo (npm workspaces + Turborepo) | Done | |
| TypeScript throughout | Done | |
| SQLite + Drizzle ORM | Done | WAL mode |
| ESM throughout | Done | |
| DB path resolution (import.meta.url) | Done | Independent of cwd |
| Automatic DB backup on seed | Done | Timestamped |
| .env support | Done | ANTHROPIC_API_KEY required |

---

## Crisis System Details

8 crisis templates, all German-flavored:

| Template | Category | Severity | Duration |
|----------|----------|----------|----------|
| Energiekrise | economy | high | 5–12 days |
| Flüchtlingswelle | immigration | high | 7–14 days |
| Industrieskandal | economy | medium | 3–8 days |
| Hochwasserkatastrophe | infrastructure | high | 4–10 days |
| Krankenhausnotstand | healthcare | medium | 5–12 days |
| Cyberangriff auf Bundesbehörden | defense | medium | 3–7 days |
| Handelsstreit mit den USA | economy | medium | 6–14 days |
| Protestwelle | social | low | 3–7 days |

Mechanics:
- **Trigger probability**: 8% daily, 25% on monthly days (day % 30)
- **Max concurrent crises**: 2
- **Effects**: Daily economic drain + sentiment loss; immediate sentiment hit on start (high: -3, medium: -2, low: -1)
- **Resolution**: Automatic when `endDay` reached
- **Agent awareness**: Crises included in party agent context — parties propose crisis-related bills and issue statements

## Time Cycle Details

- **Weekly (day % 7)**: Opinion recalculation — proposers of recently passed bills get +1.0 approval; opposition gets +0.5 if sentiment < 40; coalition gets -0.5 if sentiment < 30. New polls generated (party preference + context-driven).
- **Monthly (day % 30)**: Economic report event + higher crisis trigger probability (25%)
- **Daily**: Sentiment mean-reversion toward baseline (45), expired poll resolution, approval drift

---

## Phase 2 — Public Beta (COMPLETE)

| Feature | Status | Priority | Notes |
|---------|--------|----------|-------|
| **Elections** | Done | HIGH | Full election cycle: trigger, campaign, voting, negotiation, results, coalition formation |
| **Different models per task** | Done | HIGH | `MODELS` map with `daily`, `negotiation`, `synthesis` keys; env var overrides |
| **Coalition negotiations** | Done | HIGH | 3-round AI negotiation post-election; Sonnet synthesis of agreement; fallback to algorithmic |
| **Party profile pages** | Done | MEDIUM | Per-party page with approval chart, bills, voting record, statements |
| **News feed / timeline** | Done | MEDIUM | Filterable event stream with category toggles, breaking news, day separators, pagination |
| **Public opinion polls** | Done | MEDIUM | Weekly auto-generated polls; user voting via POST endpoint; approval effects on expiry |
| **Realistic sentiment model** | Done | — | Mean-reversion to baseline 45, capped 5–75, per-bill impact capped ±3 |

## Phase 3 — Full Platform (COMPLETE)

See `docs/Phase3_Plan.md` for original implementation plan.

| Feature                  | Status      | Priority | Notes                                                                    |
|--------------------------|-------------|----------|--------------------------------------------------------------------------|
| **3A. Media simulation** | Done        | HIGH     | 2–3 AI-generated articles per day from 3 biased outlets                  |
| **3B. Media feedback loop** | Done     | HIGH     | Headlines injected into agent context; media affects sentiment ±0.5/day  |
| **3C. Bürgerfragen**     | Done        | HIGH     | Users submit questions to parties; AI responds in character (max 3/day)  |
| **3D. Referendums**      | Done        | MEDIUM   | AI-generated every 30 days; users vote; impacts economy/sentiment       |
| **3E. Event injection**  | Done        | MEDIUM   | Dashboard panel: inject crises, snap elections, economic shocks          |

## Phase 4 — Bundestag Upgrade (IN PROGRESS)

Implementation notes: `docs/Phase4_Implementation.md`

### Phase 4.1 — Parliamentary Foundation (COMPLETE)

| Feature | Status | Notes |
|---------|--------|-------|
| Fraktionen | **Done** | Parliamentary groups; 5% threshold (37/735 seats); Fraktion leaders; gates participation |
| Multi-stage bill lifecycle | **Done** | proposed → 1st reading → committee → 2nd reading (amendments) → 3rd reading (vote) |
| Motions & Resolutions | **Done** | Non-legislative Fraktion actions; same-day algorithmic vote; Motions web page |

### Phase 4.2 — Government & Oversight (COMPLETE)

| Feature | Status | Priority | Notes |
|---------|--------|----------|-------|
| Chancellor + Ministers | **Done** | HIGH | Named Chancellor + 8 ministers with real portfolios; government bills skip first reading; proportional ministry allocation |
| Interpellations | **Done** | HIGH | Opposition files Kleine/Große Anfragen targeting ministers; AI-generated responses (max 2/day); 14-day deadline; sentiment impacts |
| Confidence votes | **Done** | HIGH | Vertrauensfrage (coalition leader, snap election if failed) + Konstruktives Misstrauensvotum (opposition, instant power transfer if passed); 368-seat threshold |
| Constitutional Court | **Done** | MEDIUM | Any Fraktion challenges a passed bill (last 14 days); 30% strike-down; reverses economic effects; pre-canned reasoning; no AI call |

### Phase 4.3 — Budget & Institutions (COMPLETE)

| Feature | Status | Priority | Notes |
|---------|--------|----------|-------|
| Budget process | **Done** | MEDIUM | Every 60 sim days; coalition-weighted 300B EUR across 8 ministries; sentiment-adjusted vote rates (97/90/82/72% coalition yes by tier); provisional budget + renegotiation chain on rejection; admin injection for testing |
| Bundespräsident | **Done** | LOW | 3–16% veto probability based on bill impact magnitude; veto → bill `rejected` + `vetoedByPresident: true`, proposer −0.5; amber badge on Bills page |
| Bundesrat | Skipped | LOW | Marked optional; skipped by design |

### Budget Process Details

**Sentiment-adjusted vote rates:**
| Sentiment | Coalition yes | Opposition yes |
|---|---|---|
| >55 (stable) | 97% | 5% |
| 40–55 (normal) | 90% | 10% |
| 25–40 (stressed) | 82% | 15% |
| <25 (crisis) | 72% | 20% |

Revision boost: +5pp coalition yes when `isRevision=true`.

**Rejection flow (Art. 111 GG):**
- First rejection → `provisionalBudget=true`, `budgetRetryDay=N+7`, asymmetric penalties (coalition leader −0.5, junior partners −1.0 each, opposition +0.3 each), daily GDP drag −0.01/day
- Retry at day N+7 → revised allocations (3% centrist shift), retry vote with +5pp coalition boost
- Retry passed → `provisionalBudget=false`, economy effects, sentiment +0.3
- Retry rejected → sentiment −2.0, coalition −1.5 each, dissolve government + snap election

**New DB columns:** `national_state.provisional_budget`, `simulation_meta.budget_retry_day`, `budgets.revision_attempt`
**New event types:** `provisional_budget_started`, `budget_revision_rejected`
**Admin injection:** "Trigger Budget Cycle" button forces a budget vote on the next sim day

---

## Election System Details

- **Trigger**: Scheduled every 120 simulation days, or snap election after 5+ consecutive days of low sentiment
- **Manual trigger**: `npm run trigger:election` sets nextElectionDay to current day
- **Phases**: announced → campaign (day+2) → voting (day+5) → negotiation (3 rounds) → completed
- **Campaign**: Agents receive `activeElection` context and can issue `campaign_statement` actions
- **Results**: Approval ratings + Gaussian noise → normalize to 100% → 5% threshold → proportional seat allocation (735 total)
- **Negotiation**: 3 rounds over 3 simulation days. Each party with seats provides position, concession, and acceptable partners via Haiku calls. After 3 rounds, Sonnet synthesizes a coalition agreement. Falls back to algorithmic coalition if synthesis fails.
- **Coalition formation**: Largest party tries to build majority (368+ seats) with ideologically closest partners; Brandmauer excludes AfD from mainstream coalitions unless no other majority is possible
- **Post-election**: Seat counts updated, coalition roles reassigned, next election scheduled 120 days out

## Coalition Negotiation Details

- **Duration**: 3 simulation days (1 round per day) during `"negotiation"` election status
- **Normal agents skipped**: During negotiation days, the regular party agent loop is skipped
- **Per-round**: Each party with seats makes 1 Haiku call with negotiation-specific prompt; responds with position, concession, and list of acceptable coalition partners
- **Synthesis**: After 3 rounds, a single Sonnet call analyzes all rounds and proposes a coalition with key policies and concessions
- **Validation**: Synthesized coalition must have 368+ seats and 2+ parties; otherwise falls back to algorithmic `formGovernment()`
- **Storage**: `negotiation_rounds` (JSON array of arrays) and `coalition_agreement` (JSON object) stored on the election record

## Public Opinion Polls Details

- **Generation**: Weekly (day % 7) — always creates a "party preference" poll + attempts an AI-generated context poll based on active crises and recent bills
- **Expiry**: Polls expire after 7 days and are automatically closed
- **Effects**: When a party preference poll expires, the top-voted party gets +0.3 approval
- **User voting**: `POST /api/polls/:id/vote` increments vote count; frontend uses localStorage to prevent double-voting per browser
- **Categories**: `party_preference`, `policy`, `crisis`, `general`

## Sentiment Model Details

- **Range**: 5–75
- **Baseline**: 45
- **Mean reversion**: 3% pull toward baseline per day (`SENTIMENT_REVERSION_RATE = 0.03` in `opinion.ts`)
- **Per-bill cap**: AI-proposed bill sentiment impacts clamped to ±2
- **Crisis impact**: Immediate hit on crisis start (high: -3, medium: -2, low: -1) + daily drain
- **Daily noise**: Small random drift ±0.2

## Economy Model Details

Mean-reversion toward realistic German baselines (EU Commission, OECD, Bundesbank 2025-2026 data):

| Indicator | Baseline | Reversion | Daily Drift | Caps |
|-----------|----------|-----------|-------------|------|
| Budget | 45B EUR | 1%/day | ±0.15 | [-20, 100] |
| Unemployment | 5.0% | 2%/day | ±0.02 | [2.5, 20] |
| Inflation | 2.0% | 2%/day | ±0.015 | [0, 10] |
| GDP Growth | 0.8% | 3%/day | ±0.008 | [-3, 4] |

Bill impact caps (per bill): budget ±3, unemployment ±0.3, inflation ±0.2, gdpGrowth ±0.2.
AI prompt guidance: budget ±1, unemployment ±0.1, inflation ±0.05, gdpGrowth ±0.1, sentiment ±2.

## Model Configuration Details

| Task Key | Default Model | Max Tokens | Env Override |
|----------|---------------|------------|--------------|
| `daily` | claude-haiku-4-5-20251001 | 2048 | `MODEL_DAILY` |
| `negotiation` | claude-haiku-4-5-20251001 | 1024 | `MODEL_NEGOTIATION` |
| `synthesis` | claude-sonnet-4-5-20250929 | 4096 | `MODEL_SYNTHESIS` |

---

## Media Simulation Details

- **Generation**: Called at end of each `runDay()`, after all events are collected but before persistence
- **Filtering**: Only generates articles when newsworthy events occur (bill_passed, bill_rejected, crisis_start, crisis_end, election_*, government_formed, negotiation_complete, statement)
- **AI call**: Single Haiku call per day requesting 2–3 articles as JSON array
- **Outlets**: Three simulated newspapers with distinct biases:
  - "Berliner Tagesspiegel" (center) — balanced, factual reporting
  - "Volksstimme" (left) — social justice, workers' rights focus
  - "Wirtschaftswoche" (right) — business impact, fiscal responsibility focus
- **Article structure**: headline, 1–2 sentence summary, 2–3 paragraph body
- **Categories**: policy, crisis, election, opinion, economy
- **Error handling**: Failures are logged but don't block simulation
- **Storage**: `media_articles` table with id, headline, summary, content, outlet, bias, category, day_number

---

## Quick Resume Guide

```bash
# Start fresh
npm run seed && npm run simulate

# Run multiple days
npm run simulate -- 30

# Auto-run (1 day every 30s)
npm run simulate:auto

# Force an election on next simulate run
npm run trigger:election

# Apply schema changes without losing data
npm run migrate

# Start dev servers (run in separate terminals)
npm run dev:api    # http://localhost:3001
npm run dev:web    # http://localhost:5173

# All commands from monorepo root!
```

## Key Files
| Purpose | Path |
|---------|------|
| Simulation loop | `packages/engine/src/simulation/loop.ts` |
| Crisis system | `packages/engine/src/simulation/crises.ts` |
| Time cycles | `packages/engine/src/simulation/cycles.ts` |
| Economy model | `packages/engine/src/simulation/economy.ts` |
| Opinion model | `packages/engine/src/simulation/opinion.ts` |
| Negotiations | `packages/engine/src/simulation/negotiations.ts` |
| Poll generation | `packages/engine/src/simulation/polls.ts` |
| Election logic | `packages/engine/src/simulation/elections.ts` |
| Agent prompts | `packages/engine/src/agent/prompt.ts` |
| Agent caller | `packages/engine/src/agent/party-agent.ts` |
| Agent client / models | `packages/engine/src/agent/client.ts` |
| DB schema | `packages/engine/src/db/schema.ts` |
| Seed data + migrations | `packages/engine/src/db/seed.ts` |
| API routes | `packages/api/src/index.ts` |
| Dashboard | `packages/web/src/pages/Dashboard.tsx` |
| Party detail page | `packages/web/src/pages/PartyDetail.tsx` |
| News feed page | `packages/web/src/pages/NewsFeed.tsx` |
| Polls page | `packages/web/src/pages/Polls.tsx` |
| Elections page | `packages/web/src/pages/Elections.tsx` |
| API client | `packages/web/src/api.ts` |
| Types | `packages/types/src/index.ts` |
| DB migrations | `packages/engine/src/migrate.ts` |
| Media generation | `packages/engine/src/simulation/media.ts` |
| Media page | `packages/web/src/pages/Media.tsx` |
| Citizen questions | `packages/engine/src/simulation/questions.ts` |
| Questions page | `packages/web/src/pages/Questions.tsx` |
| Referendums | `packages/engine/src/simulation/referendums.ts` |
| Referendums page | `packages/web/src/pages/Referendums.tsx` |
| Event injections | `packages/engine/src/simulation/injections.ts` |
| Motions logic | `packages/engine/src/simulation/motions.ts` |
| Motions page | `packages/web/src/pages/Motions.tsx` |
| Fraktionen logic | `packages/engine/src/simulation/fraktionen.ts` |
| Government / Cabinet | `packages/engine/src/simulation/government.ts` |
| Interpellations | `packages/engine/src/simulation/interpellations.ts` |
| Interpellations page | `packages/web/src/pages/Interpellations.tsx` |
| Confidence votes logic | `packages/engine/src/simulation/confidence-votes.ts` |
| Confidence votes page | `packages/web/src/pages/ConfidenceVotes.tsx` |
| Constitutional Court logic | `packages/engine/src/simulation/constitutional-court.ts` |
| Constitutional Court page | `packages/web/src/pages/ConstitutionalCourt.tsx` |
| Budget logic | `packages/engine/src/simulation/budget.ts` |
| Budget page | `packages/web/src/pages/Budget.tsx` |
| Admin page | `packages/web/src/pages/Admin.tsx` |
| Election trigger | `packages/engine/src/trigger-election.ts` |
