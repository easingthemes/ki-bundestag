# Abgeordnetenwatch Feature Implementation

> Implementation record for features inspired by [abgeordnetenwatch.de](https://abgeordnetenwatch.de).
> API reference: [abgeordnetenwatch-api.md](./abgeordnetenwatch-api.md)

## Design Constraints

### Simulation Time vs Real Time

Simulation days run much faster than real days. A simulation started today could be in its second year within one real-world month. This creates a fundamental temporal mismatch:

1. **Real-world data is inspiration, not ground truth.** Never present real-world data as current simulation facts.
2. **Ruling parties differ.** The simulation's coalition may differ from the real German government.
3. **Use real data for structural grounding only:** committee names (stable), party ideological positions (slow-evolving), voting patterns (behavioral tendency), news headlines (topic inspiration), side jobs/Q&A topics (creative templates).
4. **Never inject dated real-world events.** Frame everything as timeless themes or structural tendencies.
5. **Label clearly.** When showing real-world data alongside simulation data, distinguish "Realwelt" from "Simulation."
6. **Graceful degradation.** All features work without real-world data.

### Existing Safeguards (in `knowledge-fetch.ts`)

- Digest prompt strips government references and dates
- Headlines consumed once per sim day then deactivated
- Party positions stored as ideological stances, not government actions
- 7-day fetch cooldown prevents over-fetching

---

## Implemented Features

### MdB Profiles & Listing (Group 1, PR #88)

Individual politician transparency — browsing and profiling all 735 Bundestag members.

**Pages:** `/mdb` (listing with party/controller filter + search), `/mdb/:seatId` (profile with votes, speeches, committees, side jobs)

**DB:** Uses existing `bundestag_seats`, `mdb_votes`, `mdb_speeches`, `mdb_applications` tables.

**API:** `GET /api/seats/roster` (filterable listing), `GET /api/seats/:seatId/profile` (full profile with votes, speeches, committee memberships)

**Key decisions:**
- Profile aggregates data from 4+ tables (seats, votes, speeches, applications, committees, sidejobs)
- BillDetail page shows per-MdB vote breakdown (not just party aggregates)

### Committee System (Group 2, PR #90)

Real Bundestag committee infrastructure linking MdBs to committees proportionally.

**Pages:** `/committees` (listing with bill counts), `/committees/:id` (detail with bills, members, recommendation stats)

**DB tables:**
- `committees` — id, name, short_name, bill_category, active
- `committee_memberships` — committee_id, seat_id, role (chair/deputy_chair/member)

**API:** `GET /api/committees`, `GET /api/committees/:id`

**Key decisions:**
- Committee membership allocated proportionally by party seat count
- Real committee names fetched from abgeordnetenwatch API (25 Bundestag committees 2025–)
- Committees linked to bills via `bill_category` matching

### Side Jobs & Scandals (Group 3, PR #91)

AI-generated side jobs (Nebentätigkeiten) for MdBs that can trigger media scandals.

**DB table:** `sidejobs` — seat_id, party_id, politician_name, organization, role, income_level, category, is_controversial

**API:** `GET /api/sidejobs` (filterable by party), `GET /api/sidejobs/seat/:seatId`

**Key decisions:**
- Income levels: "1000-3500", "3500-7000", "7000-15000", "15000-30000", "30000+"
- Categories: beratung, vortrag, aufsichtsrat, verband, medien, sonstiges
- ~20% controversy rate; controversial side jobs trigger media articles and approval impact (-0.2 to -0.5)
- Batch AI generation every 30 sim days via `buildSidejobBatchRequest()` / `processSidejobResult()`

### Citizen Q&A Enhancement (Group 5, PR #95)

Topic categorization, trending suggestions, and AI-generated question prompts.

**DB table:** `question_suggestions` — question, topic, target_party_id, created_on_day, used_by_user_id

**API:** `GET /api/questions/topics`, `GET /api/questions/trending-topics`, `GET /api/questions/suggestions`, `POST /api/questions/suggestions/:id/use`

**Key decisions:**
- 17 question topics (Klimaschutz, Migration, Bildung, Gesundheit, Wirtschaft, etc.)
- Topic filtering on questions page, topic distribution visualization
- AI generates question suggestions every 3 sim days via batch
- Trending topics derived from real citizen questions (inspiration only)

### Transparency & Matching Tools (Group 6, PR #96)

Policy quiz, lobbying register, and party donation tracking.

**Pages:** `/quiz` (interactive policy quiz), `/lobbyismus` (lobbying event register), `/parteifinanzen` (donation dashboard)

**DB tables:**
- `quiz_theses` — 15 policy theses across 8 bill categories
- `quiz_party_positions` — per-party position (agree/disagree/neutral) with reasoning
- `lobbying_events` — organization, sector, target party/bill, influence, intensity
- `party_donations` — donor name/type, amount, party, public disclosure flag

**API (quiz router):**
- `GET /api/quiz/theses` — active theses
- `POST /api/quiz/results` — match calculation (body: `{ answers: Record<thesisId, position> }`)
- `GET /api/quiz/party-positions` — all positions with reasoning
- `GET /api/quiz/lobbying` — lobbying events (filterable by party/sector)
- `GET /api/quiz/donations`, `GET /api/quiz/donations/summary` — donations + aggregated totals

**Quiz scoring:** agree-agree = +2, disagree-disagree = +2, neutral-neutral = +1, agree/disagree-neutral = +1, agree-disagree = 0. `matchPercent = (totalScore / maxScore) * 100`. Category breakdown computed per bill category.

**Key decisions:**
- Seed positions based on real-world party stances (Option A: static seed for MVP)
- Future Option B: derive positions dynamically from simulation voting history after 50+ bills
- Donations over 10,000 EUR automatically become public (mirrors real Bundestag rule)
- Lobbying and donations populate as simulation runs (empty state shown initially)

---

## Other Implemented Plans

### i18n (String Centralization)

Centralized all UI strings into `react-i18next` with single German locale (`de`). 11 namespace JSON files in `packages/web/src/locales/de/`. Eliminated scattered inline English strings across 40+ components.

### AI Context Quality

Enhanced party AI agents with: daily briefing (synthesizes 30 days of events + economic trends, ~800-1200 tokens), party profiles (distinct voice/strategy/red lines for each party), expanded token budget (3K→8K). Cost increase: ~$0.047→$0.055/day.

### Context Memory Management (PR #81)

Prevents AI degradation in long-running simulations via: event query windowing, era summaries (AI-generated political history every 60 sim days stored in `era_summaries` table), prompt hardening (negative instructions, JSON schema reinforcement), structured output for Anthropic models. Net ~$0.009/day savings via 40% reduction in input tokens.

### Scalability Quick Wins

Four changes for 1K→10K users: index `user_actions(created_at, user_id+sim_day)`, session pruning every 30 min, lastActive write buffering (5-min flush), cursor pagination on `/api/users/me/activity`.

---

## Pending Work

### Group 4: Voting Intelligence

**Status:** Not started. Design complete in concept.

Adds three capabilities using existing abgeordnetenwatch voting data (already fetched and stored in `real_world_knowledge`):

1. **Voting alignment matrix** — 6x6 party-to-party agreement heatmap based on simulation bill votes. Calculation: `calculateVotingAlignment()` iterates all pairs, counts matching votes. Already partially exists at `GET /api/parties/alignment`.

2. **Real vs simulated comparison** — "Ausgangslage" (frozen baseline snapshot of real Bundestag voting patterns at sim start) vs current simulation patterns. Shows drift over time, not correctness. Fades after ~50 bills (the sim has enough of its own history).

3. **Voting calibration in prompts** — Early-sim only (< 50 bills): inject pairwise agreement data from real Bundestag into agent prompts as behavioral orientation. Silently removed after threshold.

### Real-World Knowledge Grounding (#029)

**Status:** Pending. Design complete. The `real_world_knowledge` table and `knowledge-fetch.ts` infrastructure already exist.

Planned expansion: dynamic parliament period discovery, per-party voting record enrichment, citizen Q&A topic fetching, and side job content from abgeordnetenwatch API. Five-phase approach documented in [abgeordnetenwatch-api.md](./abgeordnetenwatch-api.md).

---

## Navigation Structure

Features are organized in the nav bar as:
- **Parlament:** Abgeordnete, Ausschüsse, Gesetze, Anträge, Anfragen, Vertrauensvoten, Verfassungsgericht, Haushalt
- **Mitmachen:** Bürgerfragen, Volksabstimmungen, Partei-Check (quiz)
- **Transparenz:** Lobbyismus, Parteifinanzen
