# KI Bundestag — Current Architecture Reference

Last updated: 2026-02-18 (Phase D complete — mood badge, alignment matrix, ask-party widget, coalition calculator)

## Entities & DB Tables

| Table | Purpose | Key Fields |
|---|---|---|
| `parties` | 6 political parties | id, name, color, ideology, seat_count (of 735), approval_rating, policy_priorities (JSON), coalition_role (leader/junior/opposition) |
| `bills` | Legislation | id, title, description, category, proposed_by, status (proposed→first_reading→committee→second_reading→third_reading→passed/rejected/struck_down), impact (JSON), votes (JSON array), proposed_on_day, is_government_bill, vetoed_by_president |
| `national_state` | Single row global state | coalition_parties[], opposition_parties[], budget, unemployment, inflation, gdp_growth, public_sentiment, provisional_budget (boolean) |
| `simulation_events` | Event log | day_number, type, actor, title, description, data (JSON) |
| `simulation_meta` | Single row sim state | current_day, last_run_at, next_election_day, low_sentiment_streak, budget_retry_day |
| `crises` | Crisis instances | template_id, name, severity, start_day, end_day, daily_impact, resolved |
| `elections` | Election instances | status (announced→campaign→voting→negotiation→completed/invalidated), results, new_coalition, negotiation_rounds, coalition_agreement |
| `party_history` | Daily snapshot per party | party_id, day_number, approval_rating, seat_count |
| `polls` | Weekly AI+preference polls | question, options, votes, active, expires_on_day |
| `media_articles` | AI-generated news | headline, summary, content, outlet, bias, category, day_number |
| `citizen_questions` | User → party Q&A | question, target_party_id, response, status (pending/answered) |
| `referendums` | AI-generated every 30d | title, options, votes, status (active/passed/rejected/expired), impact |
| `pending_injections` | User-triggered events | type (crisis/election/economic_shock/invalidate_election/budget), data, consumed |
| `fraktionen` | Parliamentary groups | party_id, leader_name, status (active/dissolved), formed_on_day |
| `motions` | Motions & resolutions | type, title, proposed_by, status, votes, sentiment_impact |
| `government` | Federal government | chancellor_name, chancellor_party_id, ministers (JSON), election_id, formed_on_day, active |
| `interpellations` | Parliamentary questions | type (kleine/große), title, question, filed_by_party_id, target_ministry, target_minister_name, target_party_id, response, status (pending/answered/expired), day_number, responded_on_day, sentiment_impact |
| `confidence_votes` | Confidence vote records | type (vertrauensfrage/misstrauensvotum), government_id, initiated_by_party_id, chancellor_name, proposed_chancellor, proposed_chancellor_party_id, title, description, status (passed/failed), votes (JSON), day_number, sentiment_impact |
| `constitutional_challenges` | Court challenges to passed laws | bill_id, bill_title, filed_by_party_id, arguments, decision (struck_down/upheld), reasoning, status (pending/ruled), day_number, ruled_on_day, sentiment_impact |
| `budgets` | Annual budget cycles | cycle_number, status (passed/rejected), allocations (JSON — 8 ministries in B EUR), total_amount, proposed_on_day, voted_on_day, votes (JSON), yes_seats, no_seats, economic_effect (JSON), revision_attempt (0=first vote, 1=revision) |

## Agent Actions (per party per day)

| Action | Type | Who | Limit |
|---|---|---|---|
| `vote` | Parliamentary | Parties with Fraktion | Must vote on ALL third_reading bills |
| `propose_bill` | Parliamentary | Parties with Fraktion | Max 1/turn; tagged isGovernmentBill if minister matches category |
| `propose_amendment` | Parliamentary | Parties with Fraktion | Max 1/turn; targets second_reading bills |
| `submit_motion` | Parliamentary | Parties with Fraktion | Max 1/turn; motion or resolution |
| `file_interpellation` | Parliamentary | Opposition with Fraktion | Max 1/turn; targets a ministry portfolio |
| `call_vertrauensfrage` | Parliamentary | Coalition leader with Fraktion | Max 1/turn; triggers confidence vote; failed = snap election |
| `file_misstrauensvotum` | Parliamentary | Opposition with Fraktion | Max 1/turn; names replacement Chancellor; passed = instant power transfer |
| `file_constitutional_challenge` | Parliamentary | Any party with Fraktion | Max 1/turn globally; targets passed bills ≤14 days old; 30% strike-down chance |
| `statement` | Public | Any party | Max 1/turn |
| `campaign_statement` | Public | Any party (campaign phase only) | Max 1/turn |
| `negotiation_position` | Special | Parties with election seats | During negotiation only |
| `nothing` | — | Any | — |

Bill categories: economy, social, environment, immigration, defense, education, healthcare, infrastructure.
Bill impact fields: budget (±1B), unemployment (±0.1pp), inflation (±0.05pp), gdpGrowth (±0.1pp), publicSentiment (±2).

## Simulation Day Flow (loop.ts)

1. Increment day, load state (parties, national_state, bills, last 20 events)
2. Economic drift (mean-reversion + noise on all 4 indicators); provisional budget GDP drag (−0.01/day while active)
3. Process pending injections (crisis, election, economic shock, invalidate election, budget trigger)
4. Crisis system: resolve expired, maybe trigger new (8%/day, 25%/month, max 2), apply daily impacts
5. Election check: if `currentDay >= nextElectionDay` or low-sentiment streak ≥ 5 → announce
6. **If negotiation phase**: run 1 negotiation round/day (Haiku per party). After 3 rounds: Sonnet synthesis → coalition → completed → form cabinet (Chancellor + 8 Ministers)
7. **If voting phase**: `calculateResults()` (approval-weighted + noise, 5% threshold, 735 seats proportional) → enter negotiation
8. **If announced/campaign**: advance phase (announced → campaign at day+2, campaign → voting at electionDay)
9. Bill pipeline: proposed → first_reading → committee → second_reading → third_reading (govt bills skip first_reading)
10. Run party agents (Haiku): build AgentContext (incl. government), get actions, validate
11. Process proposals (insert new bills; tag isGovernmentBill if minister matches category)
12. Process amendments (on second_reading bills)
13. Process votes: seat-weighted tally (yesSeats > noSeats = passed); if passed → presidential veto check (3–16% based on impact magnitude; veto → bill `rejected` + `vetoedByPresident: true`, proposer −0.5, `presidential_veto` event); otherwise apply bill impact + sentiment
14. Process statements/campaign statements/motions/interpellations (file new)
14e. Process confidence votes: Vertrauensfrage (10% coalition defection risk; failed → dissolve + snap election) and Misstrauensvotum (85% other-opposition support; passed → swap roles + form new cabinet immediately)
14f. Process constitutional challenges: first valid `file_constitutional_challenge` action → 30% strike-down → if struck down: bill status → `"struck_down"`, reverse economic impact, adjust sentiment; approval impacts on filing/proposing party
15. Answer citizen questions (max 3/day, Haiku, 14-day expiry)
15b. Answer pending interpellations (max 2/day, Haiku as minister, 14-day deadline) + expire overdue + apply sentiment
16. Approval drift (±0.2 noise/party/day) + sentiment drift (mean-revert to 38 at 5%/day)
17. Resolve expired polls & referendums
18. Weekly (7d): opinion recalc + generate polls (Haiku)
19. Monthly/30d: maybe generate referendum (Haiku), economic report
19b. Budget cycle (60d, or admin injection): generate coalition-weighted 300B EUR allocations, tally sentiment-adjusted vote (97/90/82/72% coalition yes by tier); passed → economy effects + sentiment +0.5, clear provisional; rejected → `provisionalBudget=true`, `budgetRetryDay=N+7`, asymmetric approval penalties
19c. Budget retry (day == budgetRetryDay): generate revised allocations (3% centrist shift), retry vote with +5pp coalition boost; passed → clear provisional + sentiment +0.3; rejected again → sentiment −2.0, coalition −1.5 each, dissolve government + snap election
20. Save parties, record history snapshot, save national state (incl. provisionalBudget)
21. Generate media (2-3 articles/day, Haiku, 3 outlets: left/center/right)
22. Apply media sentiment impact (±0.5/day max)
23. Generate daily narrative summary (Haiku): returns `{narrative, mood}` JSON; mood is one of 7 labels (Stable Majority, Coalition Friction, Political Pressure, Crisis Response, Electoral Campaign, Budget Dispute, Government Transition); stored as JSON string in `simulation_meta.daily_summary`
24. Persist all day events, update meta

## Election Lifecycle

```
announce (day 0) → campaign (day +2) → voting (day +5) → negotiation (3 rounds) → completed
```

- Triggers: scheduled (120 days), low sentiment (5+ days below 25), user injection, invalidation
- Results: approval-weighted + Gaussian noise, 5% threshold, proportional 735 seats
- Government: try mainstream parties first (exclude AfD "Brandmauer"), add closest ideological partners until 368+ seats
- Negotiation: 3 Haiku rounds per party, then Sonnet synthesis → coalition agreement
- Fallback: algorithmic formGovernment() if synthesis fails

## API Endpoints (48 total)

**Parties**: GET /parties, /parties/alignment, /parties/:id, /parties/:id/history, /parties/:id/bills, /parties/:id/votes, /parties/:id/statements
**Bills**: GET /bills(?status=), /bills/:id
**State**: GET /state, /simulation/status, /simulation/days, /simulation/days/:dayNumber, /simulation/events(?limit&offset&type&actor)
**Elections**: GET /elections(?status=), /elections/active, /elections/:id
**Crises**: GET /crises(?active=true), /crises/:id, /crisis-templates
**Polls**: GET /polls(?active=true), /polls/:id — POST /polls/:id/vote
**Media**: GET /media(?day=), /media/:id
**Questions**: GET /questions(?partyId&status), /questions/:id — POST /questions
**Referendums**: GET /referendums(?status=), /referendums/:id — POST /referendums/:id/vote
**Fraktionen**: GET /fraktionen(?status=), /fraktionen/:id
**Motions**: GET /motions(?status&type), /motions/:id
**Interpellations**: GET /interpellations(?status&partyId&targetMinistry), /interpellations/:id
**Confidence Votes**: GET /confidence-votes(?status&type), /confidence-votes/:id
**Constitutional Court**: GET /constitutional-court(?status&billId), /constitutional-court/:id
**Budget**: GET /budgets(?status=), /budgets/:id
**Government**: GET /government, /government/history
**Injections**: GET /simulate/injections — POST /simulate/inject

## Web Pages (18)

Dashboard, Parties, PartyDetail, Bills, Elections, Budget, NewsFeed, Polls, Media, Questions, Motions, Interpellations, ConfidenceVotes, ConstitutionalCourt, Referendums, SimulationLog, About, Admin

**Phase D additions within existing pages:**
- Dashboard: mood badge on daily summary card (colored pill, 7 labels); "Ask a Party" widget at bottom (party dropdown + question input, uses `POST /api/questions`)
- Parties: Vote Alignment Matrix table below party grid (pairwise vote-agreement %, color-coded, from `/parties/alignment`)
- Elections: Coalition Calculator at bottom (party checkboxes, seat counter, majority indicator, ideological spread score)

## Key Constants

- 6 parties, 735 seats, 368 majority
- Election threshold: 5%
- Sentiment range: 5–75, baseline: 45, reversion rate: 3%/day
- Crisis: 8 templates, max 2 concurrent
- Negotiation: 3 rounds (Haiku) + synthesis (Sonnet)
- Questions: max 3/day, 14-day expiry, max 5 pending
- Polls: weekly, 7-day expiry
- Referendums: every 30 days, 14-day close, 10-vote quorum
- Media: 3 outlets (Berliner Tagesspiegel/center, Volksstimme/left, Wirtschaftswoche/right)
- Interpellations: max 2 answered/day, 14-day deadline, sentiment +0.3/+0.1 (filed party), -0.3 (expired, target party)
- Confidence votes: 368-seat absolute threshold; Vertrauensfrage failed → coalition -2.0/opposition +1.0; Misstrauensvotum passed → proposer +2.0/old coalition -2.0
- Constitutional court: 30% strike-down probability; struck down → filing party +0.8, proposing party −0.5, sentiment −0.5; upheld → filing party −0.3; challengeable window: 14 days after passing
- Budget cycle: every 60 days (or admin injection); 300B EUR total across 8 ministries (finance, labour, environment, interior, defence, education, health, infrastructure); sentiment-adjusted coalition yes rate: >55→97%, 40–55→90%, 25–40→82%, <25→72%; opposition yes: 5/10/15/20%; revision +5pp coalition boost; passed → sentiment +0.5 + economy effects; rejected → provisional budget (Art. 111 GG), retry +7 days; retry rejected → sentiment −2.0 + dissolve govt + snap election
- Presidential veto: base 3% + up to 13% based on bill impact (publicSentiment >1.5: +5%, budget >2B: +5%, gdpGrowth >0.15%: +3%); veto → proposer −0.5 approval
- Daily summary: stored as JSON `{narrative: string, mood: string}` in `simulation_meta.daily_summary`; 7 mood labels; frontend falls back gracefully to plain-text for old rows
- Vote alignment matrix: pairwise agreement % requires ≥3 shared votes; null otherwise; computed live from bills table
- Coalition Calculator: majority threshold 368/735; ideological spread = mean L1 pairwise distance across 5 policyPriorities keys (economy, social, environment, immigration, spending)

## Package Structure

```
packages/
  types/     — Pure TS types (emitDeclarationOnly)
  engine/    — Simulation core: agents, DB, simulation loop
  api/       — Express REST server
  web/       — React 19 SPA (Vite + React Router v7)
```

Dependency: types ← engine ← api. Web is standalone.
All ESM (`"type": "module"`), exports point to `./src/index.ts` (not dist/).

## Related Docs

- `docs/Phase4_Implementation.md` — design decisions and implementation notes for Phases 4.1–4.3 (Fraktionen, Government, Budget)
- `docs/PROGRESS.md` — full feature checklist across all phases
