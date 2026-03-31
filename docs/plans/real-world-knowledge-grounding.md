# Plan: Real-World Knowledge Grounding

> **Status**: Pending
> **Issue**: #029

## Goal

Ground the simulation in real German politics by fetching real-world news (RSS) and official party positions (websites), digesting them via AI into structured knowledge, storing in DB, and injecting into agent prompts with a **decay mechanism** that prevents stale info from dominating fast-moving sim days.

## Design Principles

1. **Fetch once, use many** — fetch on seed (or first run) + once per real week
2. **AI digest** — raw HTML/RSS is never stored; an AI call summarizes it into simulation-relevant knowledge
3. **Decay over sim days** — fresh knowledge is prominent on first sim day, fades to background, then disappears after N sim days
4. **Two tiers** — shared news landscape + per-party identity from official sources
5. **Graceful degradation** — if fetch fails (network, site down), simulation runs as before

## The Decay Model

```
Sim days since knowledge was first used:
  Day 0 (first use):  FULL injection (~600 tokens) — "AKTUELLE POLITISCHE LAGE"
  Days 1-4:           BRIEF reminder (~100 tokens) — one-liner summary
  Days 5+:            NOT injected — absorbed into simulation's own history
```

This prevents:
- Re-reacting to the same news across many sim days
- Stale real-world info overriding decisions the sim already made
- Token waste on old context

## Data Sources

### Tier 1: News Landscape (shared across all parties)
- **Source**: tagesschau.de RSS feed (`https://www.tagesschau.de/xml/rss2`)
- **Content**: Top German political headlines + summaries
- **Digest output**: ~400-600 tokens, structured as political topics relevant to parliament

### Tier 2: Party Identity (per-party)
- **Sources**: Official party press/news pages
  - SPD: `https://www.spd.de/aktuelles/`
  - CDU: `https://www.cdu.de/aktuelles`
  - Grüne: `https://www.gruene.de/artikel`
  - FDP: `https://www.fdp.de/aktuelles`
  - AfD: `https://www.afd.de/news/`
  - Die Linke: `https://www.die-linke.de/start/nachrichten/`
- **Content**: Current policy positions, press releases, key statements
- **Digest output**: ~300-400 tokens per party, structured as policy priorities + recent positions

## DB Schema

New table in `simulation.db`:

```sql
CREATE TABLE IF NOT EXISTS real_world_knowledge (
  id TEXT PRIMARY KEY,
  generation INTEGER NOT NULL,
  source_type TEXT NOT NULL,        -- 'news' | 'party_identity'
  party_id TEXT,                    -- NULL for news, party ID for identity
  digest TEXT NOT NULL,             -- AI-generated summary
  brief TEXT NOT NULL,              -- One-liner for decay phase (days 1-4)
  fetched_at TEXT NOT NULL,         -- Real wall-clock ISO timestamp
  sim_day_first_used INTEGER,      -- Set on first injection
  raw_urls TEXT                     -- JSON array of source URLs (for dedup)
);
```

## Implementation Steps

### Step 1: DB table + migration (`packages/engine/src/db/ddl.ts`)
- Add `real_world_knowledge` table to `SIM_TABLE_DDL`
- No column migrations needed (new table)

### Step 2: Knowledge fetch module (`packages/engine/src/simulation/knowledge-fetch.ts`)
- **New file** with:
  - `fetchNewsRSS()`: Fetch tagesschau RSS, parse XML, extract top 10 headlines + summaries
  - `fetchPartyPage(partyId, url)`: Fetch party webpage, extract text content
  - `shouldFetchKnowledge()`: Check `real_world_knowledge.fetched_at` — return true if no rows OR latest `fetched_at` is >7 real days ago
  - `storeKnowledge(generation, sourceType, partyId, digest, brief, urls)`: Insert into DB
- Uses native `fetch()` for HTTP + simple text extraction (strip HTML tags)
- RSS parsing: lightweight XML extraction (no heavy dependency — regex or DOMParser-like approach)

### Step 3: Knowledge digest batch requests (`packages/engine/src/simulation/knowledge-fetch.ts`)
- `buildNewsDigestBatchRequest(rawHeadlines)`: Creates a BatchRequest with `roleKey: "daily"` that summarizes raw headlines into a political landscape digest + brief one-liner
- `buildPartyDigestBatchRequest(partyId, rawText)`: Creates a BatchRequest per party to extract current policy priorities from their website content
- `processDigestResults(results)`: Parse AI responses, store digests in DB

### Step 4: Knowledge query + decay (`packages/engine/src/simulation/knowledge-fetch.ts`)
- `getActiveKnowledge(currentDay, partyId)`: Query DB for latest generation
  - If `sim_day_first_used` is NULL → set it to `currentDay`, return full digest
  - If `currentDay - sim_day_first_used <= 4` → return brief one-liner
  - If `currentDay - sim_day_first_used > 4` → return null (decayed)
- Returns `{ newsDigest?: string; partyDigest?: string; isFresh: boolean }`

### Step 5: Wire into AgentContext (`packages/types/src/types/agent.ts`)
- Add `realWorldContext?: string` field to `AgentContext`

### Step 6: Inject into prompts (`packages/engine/src/agent/prompt.ts`)
- In `buildUserPrompt()`, add after briefing section (Priority 1.5):
  ```
  if (ctx.realWorldContext) {
    briefingSection += `\nREAL-WORLD POLITICAL CONTEXT:\n${ctx.realWorldContext}\n`;
  }
  ```
- Fresh knowledge gets full injection; decayed knowledge gets brief reminder — this is handled by `getActiveKnowledge()` returning different content

### Step 7: Wire into simulation loop (`packages/engine/src/simulation/loop.ts`)
- At the start of `runDay()`, before briefing:
  1. Call `shouldFetchKnowledge()` — if true, fetch + digest + store (adds batch requests)
  2. Call `getActiveKnowledge(currentDay, partyId)` for each party when building agent contexts
  3. Set `ctx.realWorldContext` = combined news + party digest (if available)

### Step 8: Enrich party profiles with real positions (`packages/engine/src/agent/party-profiles.ts`)
- Modify `getPartyProfile(partyId)` to accept optional `realPositions?: string`
- If provided, append to the static profile: `\nCURRENT REAL-WORLD POSITIONS:\n${realPositions}`
- The static profile remains the base; real positions overlay factual context

### Step 9: Add depth config controls (`packages/engine/src/agent/context-depth.ts`)
- Add to `DepthConfig`:
  - `enableKnowledgeGrounding: boolean`
  - `knowledgeDecayDays: number` (how many sim days until full decay)
- Low depth: disabled. Normal: enabled, 5-day decay. High: enabled, 7-day decay.

### Step 10: Update exports + types
- Export new functions from `packages/engine/src/agent/index.ts` (if needed)
- Add Drizzle schema for `real_world_knowledge` in `packages/engine/src/db/schema-sim.ts`

### Step 11: Handle seed scenario (`packages/engine/src/db/seed.ts`)
- On `npm run seed`: trigger initial knowledge fetch + digest
- Store as generation 1, `sim_day_first_used = null` (will be set on first sim day)

---

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `engine/src/db/ddl.ts` | Modify | Add `real_world_knowledge` table DDL |
| `engine/src/db/schema-sim.ts` | Modify | Add Drizzle schema for new table |
| `engine/src/db/schema.ts` | Modify | Re-export new schema |
| `engine/src/simulation/knowledge-fetch.ts` | **New** | Fetch, digest, store, query with decay |
| `engine/src/agent/prompt.ts` | Modify | Inject `realWorldContext` into user prompt |
| `engine/src/agent/party-profiles.ts` | Modify | Accept optional real positions overlay |
| `engine/src/agent/context-depth.ts` | Modify | Add knowledge grounding depth controls |
| `engine/src/simulation/loop.ts` | Modify | Wire knowledge fetch + query into runDay() |
| `types/src/types/agent.ts` | Modify | Add `realWorldContext?: string` to AgentContext |
| `engine/src/agent/index.ts` | Modify | Export new functions if needed |

## Cost Impact

| Item | Frequency | Cost |
|------|-----------|------|
| News digest (1 Haiku call) | ~1x/real week | ~$0.002 |
| Party digests (6 Haiku calls) | ~1x/real week | ~$0.012 |
| Extra prompt tokens (knowledge in context) | Each sim day (decaying) | ~$0.002/day avg |
| **Total** | | **~$0.016/week + ~$0.002/sim day** |

Negligible vs current ~$0.055/sim day.

## Risks

- **RSS/website changes**: URLs or formats may change. Mitigation: graceful fallback (skip if fetch fails)
- **Content quality**: Party websites may have noise (navigation, ads). Mitigation: AI digest filters noise
- **Rate limiting**: Fetching only weekly, very unlikely to hit rate limits
- **Blocked by websites**: Some sites may block server-side fetches. Mitigation: proper User-Agent header, fallback to skip

## Not In Scope

- Multiple news sources (start with tagesschau only, expand later)
- Real-time news (weekly fetch is sufficient for grounding)
- User-facing UI for knowledge sources
- Wahlprogramm PDF ingestion (possible future enhancement)
