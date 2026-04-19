# 043 Cycle 1 — Spec + Implementation Plan (P0)

**Scope**: Parliamentary calendar structure + bill pipeline timing + konstituierende Sitzung.
**Source**: [`../todo/043-sim-timing-fidelity.md`](../todo/043-sim-timing-fidelity.md), brainstorm on branch `claude/sim-timing-brainstorm-GwtKT`.
**Delete this file** once Cycle 1 has shipped.

## Decisions (locked)

| # | Question | Decision |
|---|----------|----------|
| Q1 | Real 2026 Sitzungskalender vs. abstract rule | **Abstract rule**. Derive Sitzungswochen from week-of-year + recess calendar. Sim runs across many simulated years; a fixed real-year calendar would expire. Real-year overrides are deferred to a later cycle. |
| Q2 | Fixed per-category stage durations vs. empirical distribution | **Fixed per-category ranges**, uniform draw at stage entry. Stored on the bill row so re-runs are deterministic under a seeded RNG. Empirical fitting is P2/P3 polish. |
| Q3 | Migration for in-flight bills | **Backfill + force-advance.** `stageEntryDay = statusChangedOnDay ?? proposedOnDay`. Bills already past the new stage minimum on the next Sitzungstag are allowed to progress normally — no retroactive stalls. |
| Q4 | Opt-in preset vs. retrofit all presets | **Retrofit all presets.** Thesis is "1:1, just compressed". `CALENDAR_ENFORCED=false` env escape hatch for tests/CI determinism. |

## Non-goals (unchanged from todo)

- No new event types, **except** `konstituierende_sitzung` (scope relaxation — surfacing it as `day_start` payload would make it invisible in the news feed, defeating the point).
- No Bundesrat vote logic (timing phase only — auto-clear after 21–42 days).
- No committee membership, Berichterstatter, Anhörungen.
- No frequency cuts (veto rate, Vertrauensfrage rate, 735→630 seats) — those are P2.
- No government-bill semantic reversal — P2.
- No party-agent prompt changes.

## Design — three pieces

### 1. Parliamentary calendar

**New file**: `packages/engine/src/simulation/parliament-calendar.ts` (keeps `calendar.ts` as pure date math).

```ts
export function isSitzungsWoche(day: number, startDate: Date): boolean
export function isSitzungsTag(day: number, startDate: Date): boolean
export function nextSitzungsTag(day: number, startDate: Date): number
export function isHaushaltsWoche(day: number, startDate: Date): boolean
export function getWeekdaySemantic(day: number, startDate: Date): "fraktion" | "regierungsbefragung" | "plenum" | "none"
```

**Rules**:

- `isSitzungsWoche`: alternating weeks from start of year, with overrides:
  - Block: whole Sommerpause (Jul + Aug + Sep 1–10 — reuse `isRecessDay`).
  - Block: Weihnachtspause (Dec 20 – Jan 10).
  - Block: ±7 days around Easter, ±3 days around Whit Monday.
  - Force-sit: one Haushaltswoche in Nov (second full week by default).
  - Target density: ~22 Sitzungswochen/yr.
- `isSitzungsTag`: `isSitzungsWoche` ∧ weekday ∈ {Tue, Wed, Thu, Fri} ∧ `isWorkday`. Mon is Fraktionstag (no plenum), weekend and holidays excluded. (Note: brainstorm initially said Wed/Thu/Fri per existing `isRealisticSessionDay`; spec widens to include Tue to match real Fragestunde/Regierungsbefragung cadence — Tue/Wed/Thu/Fri is the plenum window.)
- `getWeekdaySemantic`: Mon→"none", Tue→"fraktion", Wed→"regierungsbefragung", Thu/Fri→"plenum", Sat/Sun→"none". Wired up here but **not consumed** in Cycle 1 — it's infrastructure for Cycle 2 Regierungsbefragung work.
- `CALENDAR_ENFORCED=false` env var short-circuits `isSitzungsTag` to always-true — keeps existing tests green.

**Loop integration** (`loop.ts` step 5):

- `advanceBillPipeline` call gated: only run reading-stage transitions on a Sitzungstag; committee→second_reading gated on Sitzungstag; committee-dwell timer keeps counting in recess.
- Motions, interpellations, confidence votes, constitutional challenges: only fire on Sitzungstag; party agents may still **propose** daily (propose ≠ plenary event; the proposal enters the queue, is read on the next Sitzungstag).
- Crisis-triggered motions: queue to `nextSitzungsTag`, don't fire immediately.
- Polls, referendums, economic report, media, summary: unchanged (sim-meta, not plenary).

**New constants** (`config/parliament.ts`):

```ts
export const CALENDAR = {
  SITZUNGS_WEEKS_PER_YEAR_TARGET: 22,
  HAUSHALTS_WEEK_MONTH: 10, // November (0-indexed)
  HAUSHALTS_WEEK_OF_MONTH: 2, // 2nd full week
} as const;
```

### 2. Bill pipeline timing

**Schema additions** (`schema-sim.ts` + DDL + `SIM_COLUMN_MIGRATIONS`):

```ts
// bills table — new columns
stageEntryDay: integer("stage_entry_day"),
stageMinDuration: integer("stage_min_duration"),
stageMaxDuration: integer("stage_max_duration"),
isComplexBill: integer("is_complex_bill", { mode: "boolean" }).default(false),
bundesratState: text("bundesrat_state"),           // null | "pending" | "cleared"
bundesratEntryDay: integer("bundesrat_entry_day"),
ausfertigungDay: integer("ausfertigung_day"),
inkrafttretenDay: integer("inkrafttreten_day"),
```

**New constants** (`config/parliament.ts`):

```ts
export const BILL_STAGE_DURATIONS = {
  proposed:       { min: 0,  max: 0  },     // snap to next Sitzungstag, then advance
  first_reading:  { min: 1,  max: 1  },     // 1 Sitzungstag
  committee:      { ordinary: { min: 42, max: 84 }, complex: { min: 90, max: 180 } },
  second_reading: { min: 1,  max: 1  },     // 1 Sitzungstag
  third_reading:  { min: 0,  max: 0  },     // same sitting as 2nd (GO-BT §81)
} as const;

export const BUNDESRAT_DURATION = { min: 21, max: 42 } as const;   // days
export const AUSFERTIGUNG_DURATION = { min: 14, max: 42 } as const; // days (Ausfertigung + Verkündung)
export const INKRAFTTRETEN_OFFSET = 14;                             // days default after BGBl
```

**Pipeline changes** (`bill-pipeline.ts`):

- Replace all `statusChangedOnDay < day` gates with:
  - `day - (stageEntryDay ?? statusChangedOnDay ?? proposedOnDay) >= stageMinDuration`
  - AND `isSitzungsTag(day, startDate)` for `first_reading`, `second_reading`, `third_reading`.
  - Committee stage has no Sitzungstag gate — committee work happens between sittings.
- On every transition: set `stageEntryDay = day`; for `committee` entry, pick `stageMinDuration` / `stageMaxDuration` from the category range (uniform draw) and persist.
- 2nd → 3rd reading: allow same-day transition when both gates pass. Loop over stages per bill per day, not once per bill per day.
- `bill_committee_rejected`: keep existing 40% roll; evaluated only once, at the end of the drawn committee minimum (not every day during committee dwell).

**Post-Bundestag phase** (new, extending `bill-pipeline.ts`):

- After 3rd reading passes final vote: set `bundesratState='pending'`, `bundesratEntryDay=day`. Tally vote already happens in `voting.ts` on third_reading day; keep that unchanged.
- After `bundesratEntryDay + rand(BUNDESRAT_DURATION)` days: `bundesratState='cleared'`, run `checkPresidentialVeto` (existing `veto.ts`), set `ausfertigungDay=day + rand(AUSFERTIGUNG_DURATION)`.
- After `ausfertigungDay`: set `inkrafttretenDay = ausfertigungDay + INKRAFTTRETEN_OFFSET`. Apply economic impact **here**, not on 3rd reading passage.
- Emit `bill_passed` at `inkrafttretenDay` (not third_reading). This is the semantic shift. Description can note "Das Gesetz tritt heute in Kraft".

**New event wording** (all existing types, no new types):

- `bill_third_reading` title/description: keep, but clarify that the vote outcome is known while the bill is still in Bundesrat phase.
- Between 3rd reading and Inkrafttreten: bill status stays on a new intermediate status `"awaiting_promulgation"`. Use existing `status` column value `"third_reading"` for Cycle 1 to avoid a status-enum migration; gate advancement on `bundesratState`. (Cleaner enum refactor deferred — flag for Cycle 2.)

### 3. Konstituierende Sitzung

**Schema additions** (`elections` table):

```ts
konstituierendeSitzungDay: integer("konstituierende_sitzung_day"),
```

**Election flow changes** (`elections.ts`, `loop.ts` step 4):

- On `calculateResults` (voting → complete): compute `konstituierendeSitzungDay = clamp(electionDay + 21, electionDay + 14, electionDay + 30)`; snap to `nextSitzungsTag(startDate)` within that window.
- New interim status: **reuse** `election.status = "negotiating"` (already exists) to block plenum; add a fast-path check in `isSitzungsTag`:
  - If an election is in `status ∈ {"voting","negotiating"}` AND `day < konstituierendeSitzungDay`: return false regardless of calendar. Plenum is blocked for the entire interregnum (matches Art. 39 Abs. 2 GG — old Bundestag ends at first sitting of new one).
- On `day === konstituierendeSitzungDay`: emit **new event type** `konstituierende_sitzung` (add to `SimulationEventType` union; exception from non-goal). Move `fraktion_formed` emission and `updateFraktionen` call from post-election to here.
- Coalition negotiations can run during the interregnum — government isn't formed until coalition agreement anyway. No change to negotiation cadence.

### Migration strategy (Q3 detail)

New file: `packages/engine/src/db/migrations/0043-cycle1-calendar-timing.ts` — single exported `run(db, sqlite)` function called from `migrateDatabase()` after column migrations.

Steps:

1. Backfill `bills.stageEntryDay = COALESCE(status_changed_on_day, proposed_on_day)` for all rows where NULL.
2. Backfill `bills.isComplexBill = 0` (default ordinary).
3. Backfill committee-stage `stageMinDuration/stageMaxDuration` for bills currently in `status='committee'`: pick `BILL_STAGE_DURATIONS.committee.ordinary` range uniformly per row.
4. For bills currently in `status='passed'`: backfill `bundesratState='cleared'`, `inkrafttretenDay = statusChangedOnDay` (treat as already in force).
5. For in-flight bills where `day - stageEntryDay >= stageMinDuration`: no-op (loop will advance them on next Sitzungstag).
6. Backfill `elections.konstituierendeSitzungDay` for past completed elections: `NULL` (historical; don't retro-emit).

Idempotent: each step guarded by `WHERE col IS NULL` or equivalent.

## Interaction risks + mitigations

| # | Risk | Mitigation |
|---|------|-----------|
| R1 | Ultra-fast demo runs show drastically fewer passed bills (expected: 30–50/term vs. hundreds today). | Add before/after bill-count headline to PR description. This is correct behaviour — document it. |
| R2 | `bill_passed` event now fires ~6–8 sim weeks after 3rd-reading vote. Frontend news feed + party impact timing shifts. | Keep `bill_third_reading` as the "decision" event; treat `bill_passed` semantically as promulgation. Update NewsFeed copy. |
| R3 | MdB 3rd-reading vote notification lead time halves (3rd on same day as 2nd). | Add early "vote upcoming" notification at 2nd-reading entry for MdB seats. Scope: one `createNotification` call in `bill-pipeline.ts`. |
| R4 | Economic impact application moves from 3rd-reading day to Inkrafttreten. Touches `economy.ts` `applyBillImpact` call-sites. | Audit all call-sites of `applyBillImpact` / `reverseBillImpact`; one toggle-point in pipeline. Add test. |
| R5 | Crisis-triggered motions firing during recess. | Queue to `nextSitzungsTag` in `crises.ts` / `motions.ts`. |
| R6 | Budget cycle currently on 60-day modulus (not 365 despite config). Haushaltswoche is more cadence-sensitive. | Cycle 1 keeps budget on modulus but snaps `budget_proposed` to `nextSitzungsTag`. Full alignment to Haushaltswoche is Cycle 2. Flag in code comment. |
| R7 | Existing `calendar.test.ts` + `elections.test.ts` + `voting.test.ts` assume immediate progression. | Tests updated to use seeded start date where calendar matters; `CALENDAR_ENFORCED=false` in test setup keeps unrelated suites stable. |
| R8 | `presidential_veto` frequency (1–6%) now compounds with added Bundesrat phase. Still too frequent, but P2 problem — not fixed here. | Leave rate as-is. Call-site moves from day of 3rd-reading pass to `bundesratState='cleared'` transition. |

## Implementation plan — 4 PRs

Each PR runs `npm run typecheck && npm test && npm run build` before merge.

### PR 1: Calendar infrastructure (no behaviour change)

- Add `parliament-calendar.ts` with all exports.
- Add `CALENDAR` constants to `config/parliament.ts`.
- Add unit tests: `parliament-calendar.test.ts` — verify Sitzungswoche density ≈22/yr, Sommerpause blocks, Haushaltswoche presence, Easter/Pentecost blocking.
- **No** loop changes yet. Pure addition — easy to revert.
- Env var `CALENDAR_ENFORCED` added to `.env.example`.

### PR 2: Bill pipeline schema + stage-duration gating

- Schema: `bills.stageEntryDay`, `stageMinDuration`, `stageMaxDuration`, `isComplexBill`. DDL + `SIM_COLUMN_MIGRATIONS`.
- `BILL_STAGE_DURATIONS` config.
- `bill-pipeline.ts`: replace `statusChangedOnDay < day` with new gate; add Sitzungstag gating for reading transitions; persist `stageEntryDay` on every transition; draw committee duration at stage entry.
- Committee-rejection roll moves from every-day to committee-min-reached.
- Migration 0043 step (1)–(3).
- Tests: pipeline advances only when dwell minimum passed; committee dwell unaffected by recess days; 2nd→3rd same-day transition works.
- Expected effect: bills take 6–12 weeks instead of 4 days. All other events unchanged.

### PR 3: Bundesrat + Ausfertigung + Inkrafttreten phase

- Schema: `bundesratState`, `bundesratEntryDay`, `ausfertigungDay`, `inkrafttretenDay`.
- `BUNDESRAT_DURATION`, `AUSFERTIGUNG_DURATION`, `INKRAFTTRETEN_OFFSET` config.
- Extend `bill-pipeline.ts`: post-third-reading phase.
- Move `applyBillImpact` to Inkrafttreten day.
- Move `checkPresidentialVeto` call to `bundesratState='cleared'` transition.
- `bill_passed` event now emitted at Inkrafttreten. Description updated.
- Migration 0043 step (4).
- Tests: passed-bill timeline extends ~6–8 weeks post-3rd; impact applied at Inkrafttreten; veto still works.

### PR 4: Konstituierende Sitzung + Fraktionsbildung re-timing

- Schema: `elections.konstituierendeSitzungDay`.
- Add `konstituierende_sitzung` to `SimulationEventType` union + IMPORTANT_EVENTS classification.
- `elections.ts`: compute `konstituierendeSitzungDay` on voting completion.
- `isSitzungsTag` (parliament-calendar.ts): return false during election interregnum.
- Move `updateFraktionen` + `fraktion_formed` emission to konstituierende Sitzung day.
- Emit `konstituierende_sitzung` event with Fraktionsbildung + Präsidentenwahl placeholders in description.
- Migration 0043 step (6).
- Tests: post-election plenum gap ≤30 days; no `bill_*` events fire in interregnum; Fraktionsbildung at konstituierende_sitzung, not electionDay.

## Success criteria

- `npm run typecheck && npm test && npm run build` green.
- Seed + `simulate 1461` runs without error; produces 30–80 passed bills (down from thousands).
- Event stream during Jul 15 – Sep 1 shows zero plenary events (Sommerpause).
- Event stream during electionDay+1 … konstituierendeSitzungDay-1 shows zero plenary events, followed by a `konstituierende_sitzung` event.
- Any single bill timeline: proposed → 1st (+0–4 days snap to Sitzungstag) → committee (42–84 days) → 2nd+3rd (+0–4 days) → Bundesrat (21–42 days) → Ausfertigung (14–42 days) → Inkrafttreten (+14 days).
- Re-seed + `simulate 100` produces identical event sequence under fixed RNG seed (regression guard for stage-duration draw).

## Open items surfaced for later cycles

- Haushaltswoche full alignment (Cycle 2, with Regierungsbefragung work).
- Enum refactor for `bills.status` (add `awaiting_promulgation`, `in_bundesrat`) — cleaner than `bundesratState` parallel column. Cycle 6 housekeeping.
- Real-year Sitzungskalender override (later cycle if provenance needed).
- Empirical distribution fit for stage durations (P2/P3).
- Widen Sitzungstag weekday window discussion: Cycle 2 when Regierungsbefragung lands.
