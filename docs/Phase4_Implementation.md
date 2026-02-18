# KI Bundestag — Phase 4 Implementation Notes

Reference: `docs/bundestag-details.md` (requirements), `docs/Current_Architecture.md` (current state)

---

## Gap Analysis

### What exists (Phase 1 + Phase 2.1 complete)
- Fraktionen as first-class parliamentary groups (5% threshold, leaders, gates participation)
- Multi-stage bill pipeline: proposed → 1st reading → committee → 2nd reading (amendments) → 3rd reading (vote)
- Motions & resolutions: non-legislative Fraktion actions with same-day voting
- Elections: announce → campaign → vote → negotiate → form government
- Chancellor + 8 Ministers with real portfolios, government bills (fast-tracked)
- Crisis system, media simulation, citizen questions, referendums, polls

### What's still missing
- Nothing — all phases complete.

---

## Phase 1 — Parliamentary Groups (Fraktionen) & Enhanced Legislative Process

**Goal**: Formalize Fraktionen as the parliamentary actor (replacing raw party), enrich the bill lifecycle with amendments and multi-stage readings.

### 1.1 Fraktionen as First-Class Entity — DONE

Implemented 2026-02-18. Fraktionen are now first-class entities gating parliamentary participation.

**What was built:**
- `fraktionen` table: `id, party_id, leader_name, status (active/dissolved), formed_on_day, dissolved_on_day`
- `FRAKTION_THRESHOLD = 37` (5% of 735 seats)
- `FRAKTION_LEADERS` map with real German politicians per party
- Auto-create/dissolve Fraktionen after elections and election invalidation
- Parties without Fraktion restricted to statements only (no bills, no votes)
- Agent prompt shows Fraktion leader name and three-way messaging (has Fraktion / has seats but no Fraktion / no seats)
- `runDay()` calls `migrateDatabase()` at start to ensure schema is up-to-date
- API: `GET /api/fraktionen` (?status=active), `GET /api/fraktionen/:id`
- Web: Parties page shows Fraktion badge (green/gray) + leader name; PartyDetail shows Fraktion section

**Design decision**: `seatCount` and `coalitionRole` stay on the `parties` table (source of truth for votes, prompts, UI). Fraktion is an overlay that gates parliamentary participation. This avoided a complex sync problem across 30+ touchpoints.

### 1.2 Multi-Stage Bill Lifecycle — DONE

Implemented 2026-02-18. Bills now follow a 4-day pipeline through the Bundestag.

**What was built:**
- Bill statuses: `proposed` → `first_reading` → `committee` → `second_reading` → `third_reading` → `passed` / `rejected`
- `bills` table: added `reading`, `committee_name`, `committee_recommendation`, `amendments` (JSON array), `original_impact`, `status_changed_on_day`
- Amendments stored inline on bills (not separate table — simpler for JSON storage pattern)
- Committee assignment automatic based on bill category; recommendation algorithmically generated (pass/amend/reject based on coalition alignment)
- Agent action: `propose_amendment` — max 1/turn, Fraktion only, targets second_reading bills only
- `tallyAmendmentVotes()`: algorithmic voting (same-party always yes, coalition 90% yes, opposition 90% no)
- `applyAmendmentToBill()`: merges accepted amendment impact deltas; preserves original impact
- Events: `bill_first_reading`, `bill_committee`, `bill_second_reading`, `bill_third_reading`, `amendment_proposed`, `amendment_voted`
- Migration converts old "debate" bills to "third_reading"

### 1.3 Motions & Resolutions — DONE

Implemented 2026-02-18. Non-legislative parliamentary actions for strategic depth.

**What was built:**
- `motions` table: `id, type (motion/resolution), title, description, proposed_by, status, votes, day_number, sentiment_impact`
- Agent action: `submit_motion` — max 1/turn, Fraktion only, validates motionType/title/description
- Same-day processing: proposed → algorithmic vote → passed/rejected (no multi-day pipeline)
- `tallyMotionVotes()`: same-party always yes, coalition-on-coalition 80% yes, opposition-on-opposition 70% yes, cross-alignment 80% no
- Sentiment impact: +0.3 for passed motions, +0.2 for passed resolutions
- Recent motions (last 3 days) injected into agent context
- Events: `motion_submitted`, `motion_passed`, `motion_rejected`
- API: `GET /api/motions` (?status, ?type filters), `GET /api/motions/:id`
- Web: Motions page with type badges (Antrag/Entschließung), status badges, vote breakdown bars

---

## Phase 2 — Government & Oversight

**Goal**: Add Chancellor, Ministers, interpellations, and confidence votes — the features visitors will actually see and follow.

### 2.1 Chancellor & Ministers — DONE

Implemented 2026-02-18. Federal government with Chancellor and 8 Ministers formed after coalition agreement.

**What was built:**
- `government` table: `chancellorName, chancellorPartyId, ministers (JSON), active, formedOnDay, dissolvedOnDay, electionId`
- `FRAKTION_LEADERS` map provides Chancellor (coalition leader's Fraktion leader)
- `MINISTER_CANDIDATES` map: 3–4 real German politicians per party for 8 ministries
- 8 ministries: Finance, Labour, Environment, Interior, Defence, Education, Health, Infrastructure
- Proportional ministry allocation to coalition partners (largest remainder method)
- `formCabinet()` called automatically after coalition synthesis in `runDay()`
- Government bills (`isGovernmentBill`): bills from parties with relevant minister skip 1st reading → fast-track to committee
- Agent prompts include government context (Chancellor, all ministers with portfolios)
- API: `GET /api/government` (active), `GET /api/government/history` (all)
- Web: Dashboard shows Chancellor card + 8 minister cards in 4-column grid, color-coded by party
- Bills page shows "Govt. Bill" badge on government bills

### 2.2 Interpellations (Anfragen) — DONE

Implemented 2026-02-18. Opposition parties formally question the government.

**What was built:**
- `interpellations` table: `id, type (kleine/große), title, question, filed_by_party_id, target_ministry, target_minister_name, target_party_id, response, status (pending/answered/expired), day_number, responded_on_day, sentiment_impact`
- Agent action: `file_interpellation` — opposition+Fraktion only, max 1/turn, targets a ministry portfolio
- AI-generated minister responses: max 2/day via Haiku (as the targeted minister in character), oldest first
- 14-day deadline: unanswered Kleine Anfragen auto-expire (embarrassing for government)
- Sentiment: Große Anfrage answered +0.3 (filing party), Kleine Anfrage answered +0.1 (filing party), expired -0.3 (target minister's party)
- Recent interpellations (last 5 days) injected into agent context
- Events: `interpellation_filed`, `interpellation_answered`, `interpellation_expired`
- API: `GET /api/interpellations` (?status, ?partyId, ?targetMinistry), `GET /api/interpellations/:id`
- Web: Anfragen page with type badges (Kleine/Große Anfrage), status badges (pending/answered/expired), expandable cards with question + minister response, filters by status/type

### 2.3 Confidence Votes — DONE

Implemented 2026-02-18. Two mechanisms that create high-stakes political moments.

**What was built:**
- `confidence_votes` table: `id, type (vertrauensfrage/misstrauensvotum), government_id, initiated_by_party_id, chancellor_name, proposed_chancellor, proposed_chancellor_party_id, title, description, status (passed/failed), votes (JSON), day_number, sentiment_impact`
- **Vertrauensfrage**: coalition leader calls confidence vote; 10% defection risk from coalition; failed → dissolve government + trigger snap election next day
- **Konstruktives Misstrauensvotum**: opposition proposes replacement Chancellor; 85% other-opposition join automatically; passed → instant power transfer (new coalition formed, cabinet formed, no election)
- 368-seat absolute majority threshold for both mechanisms
- Max 1 Vertrauensfrage + 1 Misstrauensvotum per day globally
- Both require Fraktion; blocked during active elections
- Sentiment: Vertrauensfrage failed → coalition -2.0/opposition +1.0; Misstrauensvotum passed → proposer +2.0/old coalition -2.0
- Events: `confidence_vote_filed`, `confidence_vote_passed`, `confidence_vote_failed`, `government_dissolved`
- Agent actions: `call_vertrauensfrage` (coalition leader only), `file_misstrauensvotum` (opposition only, names replacement Chancellor)
- API: `GET /api/confidence-votes` (?status, ?type), `GET /api/confidence-votes/:id`
- Web: Vertrauensvoten page with type/status filters, seat vote bars, outcome text, expandable party breakdown

### 2.4 Constitutional Court (Minimal) — DONE

Implemented 2026-02-18. Any Fraktion can challenge a recently passed law at the Bundesverfassungsgericht.

**What was built:**
- `constitutional_challenges` table: `id, bill_id, bill_title, filed_by_party_id, arguments, decision (struck_down/upheld), reasoning, status (pending/ruled), day_number, ruled_on_day, sentiment_impact`
- Agent action: `file_constitutional_challenge` — any party with Fraktion, max 1/day globally, targets `passed` bills from the last 14 days
- 30% flat strike-down probability; same-day ruling; pre-canned German-flavored reasoning strings (no AI call)
- Struck down: bill status → `"struck_down"`, economic impacts reversed via `reverseBillImpact()`, sentiment −0.5, filing party +0.8, proposing party −0.5
- Upheld: filing party −0.3 (wasted political capital)
- Agent context includes recent challenges (7d window) + challengeable bills (14d window)
- Events: `constitutional_challenge_filed`, `constitutional_court_ruled`
- `"struck_down"` added as new terminal `BillStatus`
- `reverseBillImpact()` helper added to `economy.ts`
- API: `GET /api/constitutional-court` (?status, ?billId), `GET /api/constitutional-court/:id`
- Web: Verfassungsgericht page (`/constitutional-court`) with status/decision filters, collapsible cards showing arguments + court reasoning + impact note

---

## Phase 3 — Budget & Institutional Polish

### 3.1 Annual Budget — DONE

Implemented 2026-02-18. Budget cycle every 60 sim days with spending allocations across 8 ministries.

**What was built:**
- `budgets` table: `id, cycle_number, status (passed/rejected), allocations (JSON), total_amount, proposed_on_day, voted_on_day, votes (JSON), yes_seats, no_seats, economic_effect (JSON)`
- `PARTY_MINISTRY_WEIGHTS` map in `budget.ts`: per-party ideology-based spending priorities across 8 ministries (finance, labour, environment, interior, defence, education, health, infrastructure)
- `generateBudgetAllocations()`: coalition-seat-weighted average of party ministry preferences → absolute amounts in B EUR (300B total)
- `tallyBudgetVote()`: algorithmic vote — coalition 90% yes / 10% defection; opposition 10% yes / 90% no
- Economic effects on passage: labour+health >30% → unemployment −0.03; finance+infrastructure >25% → gdpGrowth +0.03; environment >12% → inflation −0.02; defence >18% → gdpGrowth +0.02
- Passed: sentiment +0.5. Rejected: sentiment −1.5, coalition parties −0.8 each
- `isBudgetDay(day)` in `cycles.ts`; cycle block runs in `loop.ts` after monthly report
- Events: `budget_passed`, `budget_rejected`
- API: `GET /api/budgets(?status=)`, `GET /api/budgets/:id`
- Web: Budget page (`/budget`) with cycle cards, ministry allocation bars, seat vote bar, economic effects, expandable party vote breakdown

### 3.2 Bundespräsident (Minimal) — DONE

Implemented 2026-02-18. Algorithmic presidential veto on passing bills.

**What was built:**
- `shouldPresidentVeto(bill)` in `budget.ts`: base 3% + up to +13% based on bill impact (publicSentiment >1.5: +5%; budget >2B: +5%; gdpGrowth >0.15%: +3%)
- Veto → bill stays `rejected`, `vetoedByPresident: true` (column on `bills` table), proposer −0.5 approval, `presidential_veto` event
- 5 pre-canned German-flavored refusal strings; no AI call
- Bills page shows amber "Vetoed by President" badge on vetoed bills

### 3.3 Bundesrat (Optional) — Skipped

Not implemented by design — marked optional, complexity not worth the benefit.

---

## Implementation Priority

| Phase | Impact | Effort | Status |
|---|---|---|---|
| Phase 1 (Fraktionen + Bills + Motions) | **High** | **High** | **DONE** |
| Phase 2.1 (Chancellor + Ministers) | **High** | **High** | **DONE** |
| Phase 2.2 (Interpellations) | **High** | **Medium** | **DONE** |
| Phase 2.3 (Confidence Votes) | **High** | **Medium** | **DONE** |
| Phase 2.4 (Constitutional Court) | **Medium** | **Medium** | **DONE** |
| Phase 3.1 (Budget) | **Medium** | **Medium** | **DONE** |
| Phase 3.2 (Bundespräsident) | **Low** | **Low** | **DONE** |
| Phase 3.3 (Bundesrat) | **Low** | **Low** | Skipped |
