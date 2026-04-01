# Abgeordnetenwatch.de — API & Website Reference

> Comprehensive reference for integrating abgeordnetenwatch.de data into KI Bundestag.
> Last updated: 2026-04-01

## About

Abgeordnetenwatch.de ("MP Watch") is a nonpartisan German platform run by Parlamentwatch e.V.
Founded 2004, it covers the Bundestag, European Parliament, 11 state parliaments, and 54 communal parliaments.
~6,800 daily visitors, ~3M monthly page impressions. Media partners include Spiegel, SZ, Stern, Die Welt.
Data licensed under **CC0 1.0** (public domain).

---

## API v2 Overview

**Base URL**: `https://www.abgeordnetenwatch.de/api/v2/`

### Pagination & Filtering

| Parameter | Description |
|-----------|-------------|
| `range_start` | Offset (default 0) |
| `range_end` | Number of results (default 100, max 1000) |
| `sort_by` | Field to sort by |
| `sort_order` / `sort_direction` | `asc` or `desc` |
| `related_data=show_information` | Reveals available supplementary inline data |
| Nested filters | e.g. `?politician[entity.party.entity.short_name]=SPD` |

### Rate Limits

No official documentation on rate limits. Our current implementation uses a 15s fetch timeout and 7-day cooldown between fetches. Be conservative.

### Authentication

No API key required. Public access.

---

## All 18 Entity Endpoints

### 1. Parliament (`/api/v2/parliaments`)

Parliament bodies. Bundestag = **ID 5**.

| Field | Type | Description |
|-------|------|-------------|
| `id` | int | Unique identifier |
| `label` | string | Name (e.g., "Bundestag") |
| `api_url` | string | Self-link |

### 2. ParliamentPeriod (`/api/v2/parliament-periods`)

Legislative terms and elections.

| Field | Type | Description |
|-------|------|-------------|
| `id` | int | Unique identifier |
| `label` | string | e.g., "Bundestag 2021 - 2025" |
| `type` | string | `"legislature"` or `"election"` |
| `parliament` | ref | → Parliament entity |
| `start_date_period` | date | Start of the period |
| `end_date_period` | date | End of the period |

**Known IDs**: 132 = 20th Bundestag (2021–2025), 165 = 21st Bundestag (2025–)

**Filter examples**:
- `?parliament=5` → Bundestag only
- `?type=legislature` → Legislative terms only

**Integration idea**: Query to auto-discover current period instead of hardcoding 132/165.

### 3. Politician (`/api/v2/politicians`)

Master data for all tracked politicians.

| Field | Type | Description |
|-------|------|-------------|
| `id` | int | Unique identifier |
| `label` | string | Full name |
| `first_name` | string | First name |
| `last_name` | string | Last name |
| `sex` | string | `"m"` or `"f"` |
| `year_of_birth` | int | Birth year |
| `party` | ref | → Party entity |
| `education` | string | Educational background |
| `occupation` | string | Profession |
| `abgeordnetenwatch_url` | string | Profile URL |

**Filter examples**:
- `?politician[entity.party.entity.short_name]=SPD`

### 4. CandidacyMandate (`/api/v2/candidacies-mandates`)

Links politicians to specific mandates/candidacies per period. This is the **core entity** for per-period data.

| Field | Type | Description |
|-------|------|-------------|
| `id` | int | Unique identifier |
| `politician` | ref | → Politician |
| `parliament_period` | ref | → ParliamentPeriod |
| `type` | string | `"candidacy"` or `"mandate"` |
| `electoral_data` | nested | Constituency, electoral list, results |
| `fraction_membership` | nested | Fraktion membership (can change mid-term) |

**Filter examples**:
- `?parliament_period=165` → Current Bundestag mandates
- `?type=mandate` → Only active mandate holders

**Sub-entities**:
- **ElectoralData**: constituency, electoral list, constituency results
- **FractionMembership**: Fraktion membership, can change during a term

### 5. Party (`/api/v2/parties`)

Political parties.

| Field | Type | Description |
|-------|------|-------------|
| `id` | int | Unique identifier |
| `label` | string | Full name |
| `short_name` | string | Abbreviation (SPD, CDU, etc.) |

### 6. Fraction (`/api/v2/fractions`)

Parliamentary factions (Fraktionen) — separate from parties.

| Field | Type | Description |
|-------|------|-------------|
| `id` | int | Unique identifier |
| `label` | string | Fraktion name |
| `short_name` | string | Abbreviation |
| `parliament_period` | ref | → ParliamentPeriod |

### 7. Poll (`/api/v2/polls`) — **Currently used**

Parliamentary votes (namentliche Abstimmungen).

| Field | Type | Description |
|-------|------|-------------|
| `id` | int | Unique identifier |
| `label` | string | Vote title/topic |
| `field_intro` | string | Description/intro text |
| `field_poll_date` | date | Date of the vote |
| `parliament_period` | ref | → ParliamentPeriod |
| `field_topics` | ref[] | → Topic entities |
| `yes` | int | Aggregate yes votes |
| `no` | int | Aggregate no votes |
| `abstain` | int | Aggregate abstentions |
| `no_show` | int | Aggregate absent |

**Current usage**: `?sort_by=field_poll_date&sort_order=desc&range_end=10&parliament_period=165`

### 8. Vote (`/api/v2/votes`)

Individual MdB votes on specific polls.

| Field | Type | Description |
|-------|------|-------------|
| `id` | int | Unique identifier |
| `vote` | string | `"yes"`, `"no"`, `"abstain"`, `"no_show"` |
| `mandate` | ref | → CandidacyMandate (NOT directly to politician) |
| `poll` | ref | → Poll |

**Filter examples**:
- `?poll=4926` → All votes on a specific poll
- `?mandate=12345` → All votes by a specific MdB

**Integration idea**: Fetch per-party voting breakdown on recent polls to calibrate party alignment scores.

### 9. Committee (`/api/v2/committees`)

Parliamentary committees (Ausschüsse).

| Field | Type | Description |
|-------|------|-------------|
| `id` | int | Unique identifier |
| `label` | string | Committee name |
| `parliament_period` | ref | → ParliamentPeriod |

**Integration idea**: Replace our hardcoded committee names with real Bundestag committee names.

### 10. CommitteeMembership (`/api/v2/committee-memberships`)

MdB-to-committee assignments.

| Field | Type | Description |
|-------|------|-------------|
| `id` | int | Unique identifier |
| `committee` | ref | → Committee |
| `candidacy_mandate` | ref | → CandidacyMandate |

### 11. Topic (`/api/v2/topics`)

Policy topic tags used across polls, sidejobs, and questions.

| Field | Type | Description |
|-------|------|-------------|
| `id` | int | Unique identifier |
| `label` | string | Topic name (e.g., "Klimaschutz", "Migration") |

### 12. Question (no official endpoint path documented)

Citizen questions to politicians — the core "Bürger fragen — Politiker antworten" feature.

| Field | Type | Description |
|-------|------|-------------|
| `id` | int | Unique identifier |
| `text` | string | Question text |
| `topic` | ref | → Topic |
| `politician` | ref | → Politician |
| `answer_text` | string | Politician's answer (if any) |
| `answer_date` | date | When answered |
| `status` | string | answered/unanswered |

**Integration idea**: Model for our citizen questions feature — real questions inspire realistic user Q&A.

### 13. Sidejob (`/api/v2/sidejobs`)

Secondary employment of MdBs (Bundestag only).

| Field | Type | Description |
|-------|------|-------------|
| `id` | int | Unique identifier |
| `label` | string | Job description |
| `income_level` | string | Income category |
| `sidejob_organization` | ref | → SidejobOrganization |
| `field_topics` | ref[] | → Topic |
| `field_city` | ref | → City |
| `field_country` | ref | → Country |
| `created` | date | Publication date |

**Integration idea**: Feed into media article generation — scandals about side jobs are realistic content.

### 14. SidejobOrganization (`/api/v2/sidejob-organizations`)

Organizations linked to side jobs.

| Field | Type | Description |
|-------|------|-------------|
| `id` | int | Unique identifier |
| `label` | string | Organization name |

### 15. ElectoralList (`/api/v2/electoral-lists`)

Party candidate lists (Landeslisten).

### 16. Constituency (`/api/v2/constituencies`)

Electoral districts (Wahlkreise) — each period creates new entity instances.

### 17. ElectionProgram (`/api/v2/election-programs`)

Party manifestos/platforms.

### 18. City / Country (`/api/v2/cities`, `/api/v2/countries`)

Geographic reference data (used in sidejob context).

---

## Website Features Relevant to KI Bundestag

### Citizen Questions ("Bürgerfragen")

The flagship feature. Citizens submit questions to any MdB:
- No registration required, free of charge
- Moderation team reviews against a code (no insults, hate speech, private life questions)
- Published publicly; politicians answer on their profile
- Over 80% of Bundestag MdBs respond
- 178,825+ questions and 143,556+ answers archived (as of 2015, much more now)
- Answers cross-referenced against voting records for promise-keeping checks

**Relevance**: Directly mirrors our citizen questions feature. Real questions could inspire simulation content.

### Voting Records ("Abstimmungen")

- Records all named/roll-call votes from the Bundestag
- Added after plenary protocol publication (slight delay)
- Each poll shows aggregate results + per-party breakdown + individual MdB votes
- "OpenData" button on each poll page shows API ID

**Relevance**: Ground truth for party discipline modeling and coalition dynamics.

### Side Jobs ("Nebentätigkeiten")

- Published by Bundestag administration, processed by abgeordnetenwatch
- Listed on each MdB's profile
- Frequently generates media scandals (e.g., Peer Steinbrück criticism in 2010)

**Relevance**: Could feed media article generation with realistic scandal topics.

### Committee Information ("Ausschüsse")

- Lists all Bundestag committees per legislative period
- Shows committee membership per MdB
- Available at `/bundestag/{period}/ausschuesse`

**Relevance**: Replace our hardcoded committee names with real ones.

### Politician Profiles

Each profile contains:
- **Steckbrief**: Party, constituency, profession, education
- **Fragen & Antworten**: All citizen Q&A
- **Abstimmungen**: Personal voting record
- **Nebentätigkeiten**: Side jobs
- **Ausschüsse**: Committee memberships

### Kandidierendencheck (Candidate Check)

- Interactive voting advice tool for direct candidates (Erststimme)
- 18 editorially selected theses; users agree/disagree/neutral
- Enter postal code → matched to constituency candidates
- 64% of 2,500+ candidates participated for 2025 Bundestagswahl
- Unlike Wahl-O-Mat (parties), this compares individual candidates

**Relevance**: Could inspire a voter-matching feature in our simulation.

### Election Portal

- Before each election, all candidates get profiles
- Citizens can ask questions up to 1 day before election
- All data persists after election

---

## Existing Client Libraries

| Library | Language | Link |
|---------|----------|------|
| `@malereg/aowatch-client` | TypeScript | npm |
| `abgeoRdnetenwatchr` | R | github.com/untergeekDE/abgeoRdnetenwatchr |

---

## Integration Plan for KI Bundestag

### Phase 1: Dynamic Parliament Period (Low effort, high value)
Query `/api/v2/parliament-periods?parliament=5&type=legislature&sort_by=id&sort_order=desc&range_end=1` to auto-discover the current period ID. Eliminates hardcoded 132/165 fallback.

### Phase 2: Voting Records (Medium effort, high value)
Fetch `/api/v2/polls` (already done) + `/api/v2/votes?poll={id}` for recent polls.
Parse per-party voting breakdowns. Feed into digest prompt as structured parliamentary voting data.
Use to calibrate party alignment and coalition dynamics.

### Phase 3: Real Committee Names (Low effort, medium value)
Fetch `/api/v2/committees?parliament_period={current}` once.
Cache committee names. Use for bill pipeline committee assignment instead of hardcoded list.

### Phase 4: Citizen Q&A Inspiration (Medium effort, medium value)
Fetch recent questions from `/api/v2/questions?parliament_period={current}&range_end=10`.
Feed question topics into the simulation as citizen question inspiration.

### Phase 5: Side Job Scandals (Low effort, low value)
Fetch `/api/v2/sidejobs?range_end=10&sort_by=created&sort_order=desc`.
Feed notable side jobs into media article generation for realistic scandal content.

---

## Real Bundestag Committees (21st Bundestag, 2025–)

To be populated dynamically from API. Historical reference (20th Bundestag):

1. Ausschuss für Arbeit und Soziales
2. Auswärtiger Ausschuss
3. Ausschuss für Bildung, Forschung und Technikfolgenabschätzung
4. Ausschuss für Bau, Wohnen, Stadtentwicklung und Kommunen
5. Ausschuss für Digitales
6. Ausschuss für die Angelegenheiten der Europäischen Union
7. Ausschuss für Ernährung und Landwirtschaft
8. Finanzausschuss
9. Ausschuss für Familie, Senioren, Frauen und Jugend
10. Ausschuss für Gesundheit
11. Haushaltsausschuss
12. Ausschuss für Inneres und Heimat
13. Ausschuss für Klimaschutz und Energie
14. Ausschuss für Kultur und Medien
15. Ausschuss für Menschenrechte und humanitäre Hilfe
16. Ausschuss für Umwelt, Naturschutz, nukleare Sicherheit und Verbraucherschutz
17. Petitionsausschuss
18. Rechtsausschuss
19. Sportausschuss
20. Ausschuss für Tourismus
21. Ausschuss für Verkehr
22. Verteidigungsausschuss
23. Ausschuss für Wahlprüfung, Immunität und Geschäftsordnung
24. Ausschuss für wirtschaftliche Zusammenarbeit und Entwicklung
25. Wirtschaftsausschuss

---

## URL Patterns

| What | URL |
|------|-----|
| API root | `https://www.abgeordnetenwatch.de/api/v2/` |
| Entity docs | `https://www.abgeordnetenwatch.de/api/entitaeten/{entity-name}` |
| Bundestag overview | `https://www.abgeordnetenwatch.de/bundestag` |
| Abstimmungen | `https://www.abgeordnetenwatch.de/bundestag/abstimmungen` |
| Ausschüsse | `https://www.abgeordnetenwatch.de/bundestag/{period}/ausschuesse` |
| Kandidierendencheck | `https://www.kandidierendencheck.de/` |
