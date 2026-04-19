# 041 — Make Debates Visible and Prominent

**Status**: Phase 1 done · Phase 2 blocked on sim timing fidelity · Phase 3 future
**Area**: Web / API / Engine
**Priority**: High

## Why users care

First question from users when the live link was shared: "Where can I see debates — parties fighting each other or supporting each other?" The Debates page must show **party-vs-party drama**, not just positions listed in isolation.

## Problem

Debates are a core selling point ("AI parties debate bills") but they have been nearly invisible to users:

1. No dedicated Debates page — speeches previously only appeared on individual Bill Detail pages
2. News Feed gap — `mdb_speech` events are created but not mapped to any filter category
3. **No AI-generated party debate content** — AI parties only emit generic daily `statement` events, not bill- or reading-specific arguments. MdB speeches (bot/human) are the only floor content
4. `bill_debate` event type defined in UI filter but never created by the engine
5. No debate aggregation concept — individual disconnected speeches

## Current state (after Phase 1)

- `/debatten` page exists with two tabs: "Reden" (mdb_speech events) and "Stellungnahmen" (statement events)
- `mdbSpeeches` table + `processDaySpeeches()` evaluates sentiment, creates `mdb_speech` events
- `BillDetail.tsx` shows `SpeechDisplay` + `SpeechSubmitForm` components
- `scripts/run-bot-activity.ts` has bot MdBs submit speeches during reading stages
- `scripts/runner-bot.ts` is the persistent PM2 loop (`ki-bot`)
- News Feed still has `bill_debate` as a ghost category — no events of this type are created

## Phase 1 — Surface existing content (DONE)

Shipped in `859c84c` (release 1.8.0):

- `/debatten` page with two tabs: Reden + Stellungnahmen
- Bot MdBs submit speeches via `run-bot-activity.ts` — requires `ki-bot` PM2 process to be running
- `scripts/post-deploy.sh` now self-heals the `ki-bot` process on every deploy (see `fb239bf`+)

## Phase 2 — AI party debate system (PLANNED, BLOCKED)

### Brainstorming conclusions (2026-04-19)

**Goal**: party-vs-party drama on specific bills, not isolated monologues.

**Real Bundestag process summary:**
- 1st reading: mostly procedural referral to committee; often no debate
- Committee phase (weeks to months): closed-door, no floor speeches
- **2nd reading: the main debate** — Berliner Stunde (~1h debate time allocated proportionally to Fraktion size), alternating supporting/opposing speakers, Kurzinterventionen (≤3-min rebuttals) create direct confrontation
- 3rd reading: usually brief or waived; final vote
- Frequency: **3–6 substantive debates per month**, plus 2–4 Aktuelle Stunden (current-affairs debates, separate format)

### Design fork picked for v1

**Option C — parallel openings + one rebuttal round** (for cost reasons)

When a contested bill enters 2nd reading:
1. All participating parties produce a ~100–300 character position speech in parallel (one batch AI call, 6 parties). They don't see each other's drafts.
2. One additional AI call generates a short "rebuttal round" where 2–3 selected parties respond to the most contentious opening.

Cost: ~7 AI calls per debate. At 3–6 debates per month (real-world rate, after sim timing fidelity is fixed), that's ~30 calls/month — negligible.

Scope:
- **Only 2nd reading** (matches real-world concentration of debate there)
- **Only "contentious" bills** — heuristic filter: proposer + certain allies < 60% of seats, OR category is politically polarized (migration, climate, defense, budget)
- ~2–4 debates per sim month (matches real-world frequency)

### Future enhancement — v2 / Phase 3

**Option B — Sequential Berliner-Stunde exchange** (parked)

Faithful reproduction of real debate:
- Speakers in alternating supporting/opposing order, proportional speaking time by Fraktion size
- Each subsequent speaker sees previous speeches and can quote/rebut ("Kollege Müller hat gerade behauptet…")
- Kurzinterventionen as a separate event type interleaved with main speeches

Cost: ~3× v1, sequential (not batch) AI calls, more prompt complexity. Only worth the investment once v1 ships and we have signal that users want more depth.

### Aktuelle Stunde — v1.1 (separate feature)

Reactive 60-min debate on a hot topic, requested by a Fraktion. Cheaper than bill debates (single topic, no pipeline dependency), 2–4 times per sim month. Driven by crises or media events that already exist. Worth a separate mini-spec after Phase 2 ships.

## Blocker — sim timing fidelity

Phase 2 cannot land until the sim's legislative pipeline matches real Bundestag timing. Today bills move `proposed` → `third_reading` in 1–2 sim days. Real bills take 30–180 days (mainly committee phase). Without that fix:
- 2nd readings happen hourly instead of weekly
- Debate frequency explodes from ~4/month to ~60+/month
- Cost and UX both break

Timing fidelity gets its own brainstorm / spec cycle first. See [`043-sim-timing-fidelity.md`](./043-sim-timing-fidelity.md) — Cycle 1 (P0) covers the parliamentary calendar and bill pipeline timing work that unblocks Phase 2 here.

## Phase 3 — Interactive debate experience (LATER)

- Show debates as threaded conversations (party A → party B → party A)
- Allow users (MdBs) to respond to AI party arguments inline
- Real-time debate feed during active readings

## Affected files (Phase 2)

- `packages/engine/src/simulation/bill-pipeline.ts` — trigger debate generation on 2nd-reading entry for contested bills
- `packages/engine/src/simulation/debates.ts` — new module: `buildDebateBatchRequest()` + rebuttal logic
- `packages/engine/src/agent/group-prompts.ts` — debate opening + rebuttal prompt builders
- `packages/engine/src/db/schema.ts` — new `bill_debates` table (debateId, billId, reading, day, createdAt) + `bill_debate_contributions` (debateId, partyId, content, kind: opening|rebuttal, order)
- `packages/api/src/routes/bills.ts` — `GET /api/bills/:id/debates` + include debates in bill detail response
- `packages/web/src/pages/BillDetail.tsx` — debate timeline component under the reading section
- `packages/web/src/pages/Debates.tsx` — new "Parlamentsdebatten" tab ahead of "Reden"
- `packages/web/src/pages/NewsFeed.tsx` — wire up `bill_debate` category to new event type

## Notes

- Reuse batch pattern: `submitBatch(...)` for the 6 parallel openings, single AI call for rebuttal
- Contentious-bill heuristic lives in `bill-pipeline.ts` at the moment of reading transition
- Keep speeches short (100–300 chars) — matches MdB speech format, keeps the UI scannable
- Party voice consistency matters: prompt must include party platform + recent stances so debates stay on-brand
