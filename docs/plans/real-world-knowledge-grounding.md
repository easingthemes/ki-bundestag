# Plan: Real-World Knowledge Grounding

> **Status**: Pending
> **Issue**: #029

## Goal

Ground the simulation in real German politics by fetching real-world news and party positions from structured APIs, digesting them via AI into category-based knowledge, storing in DB, and injecting into agent prompts with a model that respects the fundamental mismatch between sim time and real time.

## Core Problem: Sim Time vs Real Time

```
Real time:  Week 1 ──── Week 2 ──── Week 3 ──── ... Week 6
Fetches:    F1          F2          F3               F6
Sim time:   Day 1 ──────────────────────────────── Day 840+ (2+ Wahlperioden)
```

At ~20 sim days/real day, 6 real weeks = ~840 sim days. The simulation holds elections, forms governments, passes hundreds of bills — while the real world barely changes. Real-world info cannot pretend to be "current news" on sim day 500.

## Design: Category-Based Injection (not time-decay)

Real-world data is digested into **four categories**, each with different injection behavior:

| Category | What it is | Example | Where injected | Lifespan |
|----------|-----------|---------|----------------|----------|
| **Political Landscape** | Timeless themes distilled from news | "Germany faces energy transition, migration debate, fiscal discipline tension" | Briefing system prompt (background) | Until next fetch overwrites |
| **Party Positions** | Authentic real-world policy stances | "CDU opposes wealth tax, pushes Schuldenbremse" | Merged into party profile (system prompt) | Until next fetch overwrites |
| **Structural Shocks** | Major global/national disruptions | War, pandemic, trade war, financial crisis | Permanent context section | Persists until a subsequent fetch says crisis resolved |
| **Headline Inspiration** | Specific dated news items | "Scholz meets Biden on Tuesday" | User prompt, first sim day only | 1 sim day, then gone forever |

### Why This Works

- **Landscape + Party Positions**: Timeless. "Germany debates Schuldenbremse reform" is valid whether the sim is on day 1 or day 500. These shape what parties fight about.
- **Structural Shocks**: Wars, pandemics, trade disruptions reshape politics for years. Even on sim day 840, "international trade disruptions" is a valid theme. These are stored as dateless context.
- **Headlines**: The only category that "ages." Injected once as creative inspiration, then discarded. Parties react on that sim day; subsequent days see only the sim's own events.

## Critical: Sim Government ≠ Real Government

The simulation forms its own governments through elections. By sim day 100, the sim could have a CDU-FDP coalition while the real Bundestag has SPD-Grüne-FDP. The AI digest prompt must:

- **NEVER** frame anything as "the government does X" or "the coalition agreed on Y"
- **ALWAYS** attribute positions to parties by name (e.g., "SPD fordert..." not "Die Regierung plant...")
- Present each party's stance **independently** of whether they're in government or opposition
- Strip all references to who is currently governing — the simulation decides that
- Frame shocks as **external pressures on Germany**, not as government responses

This is enforced in the digest system prompt with explicit instructions and examples.

## Data Sources

### News (two perspectives for balance)

| Source | URL | Lean | Format | Auth |
|--------|-----|------|--------|------|
| **Tagesschau API** | `https://www.tagesschau.de/api2u/news/?ressort=inland` | Center/government | JSON | None (60 req/hr) |
| **WELT RSS** | `https://www.welt.de/feeds/section/politik.rss` | Center-right/opposition | RSS/XML | None |

Tagesschau provides the establishment/factual perspective; WELT provides the critical/opposition angle. The AI digest synthesizes both into a balanced view.

### Party Positions (structured APIs, not website scraping)

| Source | URL | Data | Auth | License |
|--------|-----|------|------|---------|
| **abgeordnetenwatch.de API** | `https://www.abgeordnetenwatch.de/api/v2/` | Voting records, party stances, politician profiles | None | CC0 1.0 |
| **Bundestag DIP API** | `https://search.dip.bundestag.de/api/v1/` | Bills, motions, legislative procedures | API key (public) | Open |
| **Wahl-O-Mat data** | GitHub `qual-o-mat-data` repo | 38 key position statements per party | None | Community |

**Why this is better than scraping party websites:**
- Structured JSON, not noisy HTML
- Voting records show actual behavior, not PR spin
- DIP API shows what bills each party actually filed
- abgeordnetenwatch is CC0 licensed, designed for reuse
- No scraping fragility (URL changes, layout changes, bot blocking)

### Supplementary (lower priority, future enhancement)

| Source | URL | Data |
|--------|-----|------|
| Bundestag RSS | `bundestag.de/services/rss/` | New bills, press releases, committee agendas |
| bundeshaushalt-api | via bund.dev | Federal budget data |
| dashboard-deutschland | via bund.dev | Economic/social indicators |

## DB Schema

New table in `simulation.db`:

```sql
CREATE TABLE IF NOT EXISTS real_world_knowledge (
  id TEXT PRIMARY KEY,
  generation INTEGER NOT NULL,
  category TEXT NOT NULL,           -- 'landscape' | 'party_position' | 'shock' | 'headline'
  party_id TEXT,                    -- NULL for shared categories, party ID for positions
  digest TEXT NOT NULL,             -- AI-generated summary (injected into prompts)
  source_urls TEXT,                 -- JSON array of source URLs
  fetched_at TEXT NOT NULL,         -- Real wall-clock ISO timestamp
  sim_day_first_used INTEGER,      -- Set on first injection (only matters for 'headline')
  active INTEGER NOT NULL DEFAULT 1 -- 0 = superseded by newer generation or resolved
);
```

**Generation model:**
- Each weekly fetch increments `generation`
- New fetch marks previous generation's `landscape` and `party_position` rows as `active = 0`
- `shock` rows stay `active = 1` until a fetch's digest explicitly resolves them
- `headline` rows: `active` set to `0` after first sim day use

## AI Digest Pipeline

One AI call per fetch that classifies + summarizes all raw data:

**Input to digest call:**
```
NEWS SOURCES (tagesschau + WELT):
[raw headlines + summaries from both]

PARLIAMENTARY DATA (DIP + abgeordnetenwatch):
[recent bills filed, voting patterns by party]

EXISTING SHOCKS (still active):
[list of active shock rows from DB]
```

**Output (structured JSON):**
```json
{
  "landscape": "Germany faces... (3-4 sentences, timeless themes)",
  "party_positions": {
    "spd": "Pushes Bürgergeld reform, minimum wage €15...",
    "cdu": "Opposes wealth tax, defends Schuldenbremse...",
    ...
  },
  "shocks": [
    { "theme": "International trade disruptions", "status": "ongoing" },
    { "theme": "European defense spending pressure", "status": "new" }
  ],
  "shocks_resolved": ["previous-shock-id-if-resolved"],
  "headlines": [
    "Bundestag debates new immigration law",
    "Coalition tensions over climate spending"
  ]
}
```

Single Haiku call, ~$0.003. Replaces 7 separate calls (1 news + 6 party) from v1 design.

## Implementation Steps

### Step 1: DB table + Drizzle schema
- **`packages/engine/src/db/ddl.ts`**: Add `real_world_knowledge` to `SIM_TABLE_DDL`
- **`packages/engine/src/db/schema-sim.ts`**: Add Drizzle table definition
- **`packages/engine/src/db/schema.ts`**: Re-export

### Step 2: Knowledge fetch module (`packages/engine/src/simulation/knowledge-fetch.ts`)
- **New file** with:
  - `shouldFetchKnowledge()`: Check DB — return true if no rows OR latest `fetched_at` > 7 real days ago
  - `fetchTagesschauNews()`: GET `/api2u/news/?ressort=inland`, extract top 15 title + teaser
  - `fetchWeltRSS()`: GET WELT politics RSS, parse XML, extract top 15 headlines
  - `fetchPartyVotingData()`: GET abgeordnetenwatch `/polls` for recent votes + party positions
  - `fetchRecentBills()`: GET DIP API `/vorgang` for recent legislative procedures
  - `fetchWahlomatPositions()`: One-time load of structured party positions from GitHub JSON (cached)
  - All fetches wrapped in try/catch — individual source failure doesn't block others

### Step 3: Digest batch request (`packages/engine/src/simulation/knowledge-fetch.ts`)
- `buildKnowledgeDigestRequest(rawData, activeShocks)`: Single BatchRequest with `roleKey: "daily"`
  - System prompt: "You are a German political analyst. Classify and summarize..."
  - Outputs the structured JSON above
  - Max 1024 tokens
- `processKnowledgeDigestResult(result, generation)`: Parse JSON, store rows in DB by category

### Step 4: Knowledge query functions (`packages/engine/src/simulation/knowledge-fetch.ts`)
- `getActiveLandscape()`: Latest active `landscape` row → string or null
- `getPartyPositions(partyId)`: Latest active `party_position` for this party → string or null
- `getActiveShocks()`: All active `shock` rows → string[] or empty
- `getHeadlineInspiration(currentDay)`: Active `headline` rows where `sim_day_first_used` is NULL → set `sim_day_first_used = currentDay`, return headlines. If already used → return null.

### Step 5: Wire into AgentContext (`packages/types/src/types/agent.ts`)
- Add `realWorldContext?: string` field to `AgentContext`

### Step 6: Inject into prompts (`packages/engine/src/agent/prompt.ts`)
- **System prompt** (via party profiles): Append real party positions
- **Briefing system prompt**: Append political landscape + structural shocks
- **User prompt** (Priority 1.5): Headlines (first sim day only) + landscape summary

```
REAL-WORLD POLITICAL CONTEXT:
[Political landscape — always present if available]

MAJOR GLOBAL FACTORS:
[Structural shocks — always present if active]

TODAY'S POLITICAL INSPIRATION:
[Headlines — first sim day after fetch only]
```

### Step 7: Enrich party profiles (`packages/engine/src/agent/party-profiles.ts`)
- `getPartyProfile(partyId, realPositions?)`: If `realPositions` provided, append:
  ```
  CURRENT REAL-WORLD POLICY PRIORITIES:
  ${realPositions}
  ```
- Static profile = base ideology. Real positions = factual overlay from voting records + bills.

### Step 8: Depth config controls (`packages/engine/src/agent/context-depth.ts`)
- Add `enableKnowledgeGrounding: boolean` to `DepthConfig`
- Low: disabled. Normal: enabled. High: enabled.

### Step 9: Wire into simulation loop (`packages/engine/src/simulation/loop.ts`)
- Early in `runDay()`, before party agents:
  1. `shouldFetchKnowledge()` → if true, run fetch + digest (adds to batch)
  2. `getActiveLandscape()` + `getActiveShocks()` → shared context
  3. Per party: `getPartyPositions(partyId)` → enrich profile
  4. `getHeadlineInspiration(currentDay)` → one-time injection
  5. Combine into `ctx.realWorldContext`

### Step 10: Handle seed scenario (`packages/engine/src/db/seed.ts`)
- On `npm run seed`: trigger initial knowledge fetch + digest
- Store as generation 1

### Step 11: Update exports
- **`packages/engine/src/agent/index.ts`**: Export knowledge functions
- **`packages/engine/src/simulation/index.ts`**: Export if needed

---

## Prompt Injection Examples

### In system prompt (party profile for SPD):
```
PARTY CHARACTER — SPD (Sozialdemokratische Partei Deutschlands):
You speak with the voice of social democracy...
[existing static profile]

CURRENT REAL-WORLD POLICY PRIORITIES:
SPD pushes Bürgergeld reform and €15 minimum wage. In recent Bundestag votes,
SPD supported renewable energy expansion (Drucksache 20/1234) and opposed
CDU's motion to relax debt brake rules. Key focus: social housing investment.
```

### In briefing context:
```
POLITICAL LANDSCAPE:
German politics is shaped by tensions between fiscal discipline and green
investment, rising migration debate, and transatlantic security commitments.
The coalition faces internal friction over Schuldenbremse reform.

MAJOR GLOBAL FACTORS:
- International trade disruptions creating economic uncertainty for German exporters
- European defense spending pressure following security developments in Eastern Europe
```

### In user prompt (first sim day after fetch only):
```
TODAY'S POLITICAL INSPIRATION (use as creative context, not literal events):
- Bundestag debates new immigration law framework
- Coalition tensions over €50B climate investment package
- Opposition demands committee hearing on defense procurement
```

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `engine/src/db/ddl.ts` | Modify | Add `real_world_knowledge` table DDL |
| `engine/src/db/schema-sim.ts` | Modify | Add Drizzle schema for new table |
| `engine/src/db/schema.ts` | Modify | Re-export new table |
| `engine/src/simulation/knowledge-fetch.ts` | **New** | Fetch, digest, store, query — all knowledge logic |
| `engine/src/agent/prompt.ts` | Modify | Inject landscape + shocks + headlines into prompts |
| `engine/src/agent/party-profiles.ts` | Modify | Accept optional real positions overlay |
| `engine/src/agent/context-depth.ts` | Modify | Add `enableKnowledgeGrounding` flag |
| `engine/src/simulation/loop.ts` | Modify | Wire knowledge into runDay() |
| `types/src/types/agent.ts` | Modify | Add `realWorldContext?: string` to AgentContext |
| `engine/src/agent/index.ts` | Modify | Export knowledge functions |

## Cost Impact

| Item | Frequency | Cost |
|------|-----------|------|
| Knowledge digest (1 Haiku call) | ~1x/real week | ~$0.003 |
| Extra prompt tokens (context) | Each sim day | ~$0.002/day |
| HTTP fetches (4 sources) | ~1x/real week | Free |
| **Total** | | **~$0.003/week + ~$0.002/sim day** |

Cheaper than v1 design (single digest call vs 7 separate calls).

## Risks

- **API changes**: DIP key expires May 2026 (renewable). abgeordnetenwatch is stable CC0. Tagesschau is unofficial.
- **Tagesschau rate limit**: 60 req/hr — not a concern with weekly fetches
- **Source downtime**: Each source fetched independently with try/catch. Partial data is fine.
- **Digest quality**: Single call must classify correctly. Mitigation: structured JSON schema + validation.
- **Shock persistence**: AI must correctly identify when a shock is resolved. Mitigation: explicit prompt + manual override via admin API (future).

## Not In Scope

- User-facing UI for knowledge sources (future)
- Wahlprogramm PDF ingestion (future)
- Real-time news feed (weekly is sufficient)
- Bundestag RSS for bill triggers (future enhancement)
- bundeshaushalt/economic indicator APIs (future)
