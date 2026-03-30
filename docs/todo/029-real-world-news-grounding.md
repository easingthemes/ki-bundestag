# 029 — Real-World News Grounding for Simulation Context

**Status**: open
**Area**: Engine / Agent
**Priority**: Medium

## Problem

The simulation is entirely self-referential. Parties invent generic-sounding bills with no connection to real German politics, actual party platforms, or current events. Adding real-world news as context would dramatically improve realism and quality of AI-generated content.

## Challenge: Sim Time vs Real Time

Simulation days run much faster than real days. A single real day might run 5-20 sim days. This creates a core design problem:

- On sim day 1 and sim day 21, the real-world news is identical
- If multiple sim days consume the same news, parties may re-react to the same events
- The simulation may have already made decisions (bills, votes, statements) based on news from sim day 1 — replaying the same news on day 21 creates inconsistency
- Real-world news should be "seed inspiration" not a repeating input

## Design Considerations

### Option A: Fetch-once-per-seed, digest into party knowledge
- Fetch real news once at seed time (or on first sim day)
- Synthesize into a static "political landscape" document per party
- Becomes part of party profile, not a daily input
- Pros: No stale repetition, consistent across sim days
- Cons: News becomes outdated if sim runs for weeks of real time

### Option B: Real-time-gated fetch with deduplication
- Track `lastRealFetchTimestamp` in DB
- Only fetch new news if real wall-clock time has advanced (e.g., 6+ hours since last fetch)
- Deduplicate: mark fetched news items as "consumed" so they're only injected once
- Pros: Fresh news trickles in naturally as real time passes
- Cons: Adds complexity, sim behavior depends on wall-clock speed

### Option C: Curated knowledge base (manual or scheduled)
- Maintain a `docs/political-context/` folder with curated German political context
- Updated periodically (manually or via scheduled agent)
- Injected as background knowledge into party profiles
- Pros: High quality, no API dependencies, controllable
- Cons: Manual effort, stale if not maintained

### Option D: Hybrid — fetch + digest + cooldown
- Fetch real news on first sim day after a real-time cooldown (e.g., 12h)
- Run a "digest" AI call that converts raw news into simulation-relevant context
- Store digest in DB with `realFetchDay` and `simDayConsumed`
- Inject digest into party agents only on the sim day it was fetched
- Subsequent sim days see it only in "background knowledge" (lower priority)
- Pros: Best of both worlds
- Cons: Most complex implementation

## Key Principle

Real-world news should act as **inspiration and grounding**, not as a repeating stimulus. It should:
1. Influence the *types* of bills parties propose (e.g., energy policy if energy crisis in real news)
2. Give parties authentic positions on real topics
3. NOT be re-injected verbatim every sim day
4. NOT override decisions the simulation already made

## Affected Files

- `packages/engine/src/agent/prompt.ts` — Inject real-world context into party prompts
- `packages/engine/src/simulation/loop.ts` — Trigger fetch/digest at appropriate points
- `packages/engine/src/agent/model-config.ts` — Possible new role for news digest call
- New: `packages/engine/src/simulation/news-fetch.ts` — Fetch + digest logic
- New: DB table for cached news digests with timestamps

## Dependencies

- Web search or RSS API access for fetching news
- Possibly a higher-quality model for news digestion (synthesis role)
- Wall-clock vs sim-clock tracking in DB
