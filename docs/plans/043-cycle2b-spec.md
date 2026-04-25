# 043 Cycle 2b — Spec + Implementation Plan (P1, wave 2)

**Scope**: Weekly Regierungsbefragung + Fragestunde with AI minister answers, crisis-hooked Aktuelle Stunde with AI party positions, Schriftliche Einzelfragen counter+template (no AI), Petitions with signature quorum (new table).
**Source**: [`043-cycle2-brainstorm.md`](./043-cycle2-brainstorm.md) (locked decisions Q1–Q6), [`043-cycle2a-spec.md`](./043-cycle2a-spec.md) (cycle immediately preceding this one — the AI-batch + migration patterns this spec reuses), [`../todo/043-sim-timing-fidelity.md`](../todo/043-sim-timing-fidelity.md) §Cycle 2.
**Delete this file** once Cycle 2b has shipped.

## Decisions (locked)

Restated from Cycle 2 brainstorm, plus sub-decisions surfaced while designing.

| # | Question | Decision |
|---|----------|----------|
| Q1 | Cycle 2b pieces | **Four pieces — 3, 4, 5, 6 from the brainstorm.** Regierungsbefragung + Fragestunde (weekly, AI), Aktuelle Stunde (crisis-hooked, AI), Schriftliche Einzelfragen (counter + template, no AI), Petitions (new table). |
| Q4 | Schriftliche Einzelfragen depth | **Counter + template hybrid, no AI.** Pure AI at 33/day = 50k/term is cost-prohibitive; pure counter is invisible. Template pool sampled 1–3×/day surfaces representative question text without any AI spend. |
| Q5 | New event types | **Accept.** Cycle 2b adds 7 new types: `regierungsbefragung`, `fragestunde`, `aktuelle_stunde`, `schriftliche_einzelfragen`, `petition_created`, `petition_quorum_reached`, `petition_debated`. |
| Q6 | Cost budget | **Mid-level.** AI content on pieces 3 + 4 only. Total added spend: +$0.002–$0.004/sim-day (one weekly Parliamentary-QA batch ≈ 35/term-year ≈ 150/term, plus 100–200 Aktuelle-Stunde batches/term — all collected via existing `submitBatch()`). Well inside the $0.025/sim-day ceiling. |
| S1 | Parliamentary-QA module shape | **One module `parliamentary-qa.ts`** for both Regierungsbefragung and Fragestunde. Shared minister mapping, shared question pool, shared batch request builder. Two event types (distinct viewer surfaces) but one code path. |
| S2 | Minister → sim-party mapping | **Derive from `government.cabinet` at session time.** If `cabinet` JSON has ministers assigned, use the ministry owner's `partyId`. Fallback: ministry routed to chancellor's party. No new schema — reuse existing `government.cabinet` payload. |
| S3 | Regierungsbefragung cadence | **Every Sitzungs-Mittwoch.** Guard: `getWeekdaySemantic(day) === "regierungsbefragung"` AND `isSitzungsTag(day)`. Produces ~22 sessions/year ≈ 88/term, matching real cadence. |
| S4 | Fragestunde cadence | **Once per Sitzungswoche**, Thursday afternoon slot. Guard: first `isSitzungsTag` of a week with weekday = Thursday. Produces ~22/year ≈ 88/term. Fires in the same weekly AI batch as Regierungsbefragung so net batches/week stays at 1. |
| S5 | MdB question selection | **Pool-sampled by `BillCategory` + active crises.** Builder draws 2–3 questions from a static German-language pool weighted by (active bill categories, active crises). No AI for the question side; AI only answers. Keeps cost bounded. |
| S6 | Aktuelle Stunde trigger model | **Crisis-hooked primary + baseline random.** Each `crisis_start` with `severity ≥ "high"` schedules one Aktuelle Stunde on `nextSitzungsTag(day+1)` with weekday preference Thursday. Additionally, 1–2 per month drawn from a Poisson tick irrespective of crisis, using a rolling recent-bill/recent-crisis topic. Dedup guard: at most one Aktuelle Stunde per Sitzungswoche. |
| S7 | Aktuelle-Stunde content | **Two party positions per session**: one government-side (coalition) + one opposition-side, both AI-generated as 2–3 sentence statements. Single batch request per session; parsed into two quoted positions. |
| S8 | Schriftliche Einzelfragen volume | **Poisson draw per day.** Filed ~ Poisson(λ=33) capped at [15, 60]; Answered ~ Poisson(λ=15) capped at [5, 40]. Cumulative counters persisted on `simulation_meta`. Emits one daily event `schriftliche_einzelfragen` with `{ filedCount, answeredCount, cumulativeFiled, cumulativeAnswered, sampleQuestions: Array<{text, category}> }` where `sampleQuestions` is 1–3 template draws from the pool. |
| S9 | Petitions schema | **New `petitions` table** (option B from brainstorm). Distinct semantics from `citizen_questions`. Öffentliche Petitionen only; Petitionsausschuss modeling abstracted to a stochastic accept/reject roll at quorum. |
| S10 | Petition signature growth | **Daily logistic tick**: growth rate depends on `topicSalience` (derived from active crises + active bills in that category) and days since `startedOnDay`. Cap at signatureQuorum. ~30% of petitions reach quorum within their 28-day public window; others expire. Deterministic under a seeded RNG for regression tests. |
| S11 | Petitions spawn cadence | **One new petition every 3–10 sim days** (uniform draw within range). Title + description + category drawn from a template pool (same shape as Schriftliche-Einzelfragen pool). No AI. |
| S12 | Interregnum behaviour | **Skip Regierungsbefragung + Fragestunde during interregnum**, but allow Aktuelle Stunde to fire (geschäftsführende Bundesregierung position held by outgoing chancellor's party). Matches Cycle 2a R4 — the acting government still speaks publicly even if it doesn't answer structured parliamentary questions. Schriftliche Einzelfragen counter continues (they're filed to the Bundestag administration, not the cabinet). Petitions are citizen-side and unaffected. |

## Non-goals

- No minister-level actor modeling (ministers remain a ministry label + party derivation; no per-minister personas, no Minister-agent).
- No Petitionsausschuss member modelling — quorum-review outcome is a stochastic roll.
- No petition signature per-user attribution (we persist only the aggregate count).
- No changes to the Regierungsbefragung/Fragestunde prompt schema after this cycle — downstream tuning of phrasing is P2+.
- No AI on Schriftliche Einzelfragen (ever — structurally prohibitive per Q4).
- No Unterhandlungen/Ausschussanhörungen this cycle (P3).
- No change to Cycle 2a Bundesrat/Kanzlerwahl code paths except where noted in R-items below.
- No change to existing `citizen_questions` semantics or routes.

## Design — Piece 3: Regierungsbefragung + Fragestunde (weekly, AI)

Shared module: `packages/engine/src/simulation/parliamentary-qa.ts`. Two event types, one batch path, one schema family.

### Config: `packages/engine/src/config/parliamentary-qa.ts`

```ts
export const REGIERUNGSBEFRAGUNG_QUESTIONS_PER_SESSION = { min: 2, max: 3 } as const;
export const FRAGESTUNDE_QUESTIONS_PER_SESSION = { min: 2, max: 3 } as const;

/** Static German-language MdB-question pool by BillCategory. Each entry:
 *  a question template + a preferred ministry (for minister selection). */
export const MDB_QUESTION_POOL: Array<{
  id: string;                   // stable ID for tests
  category: BillCategory;
  ministry: string;             // "Finanzen", "Bildung", "Wirtschaft", …
  text: string;                 // German, 1 sentence
}> = [ /* ~60 entries, ~7–8 per category */ ];

/** Ministry → owning party id, derived from government.cabinet.
 *  Fallback map used only when government.cabinet is empty. */
export const MINISTRY_FALLBACK_PARTY: Record<string, string> = {
  Kanzleramt: "cdu", Finanzen: "spd", /* … */
};
```

### New schema: `parliamentary_qa_sessions` table

```ts
export const parliamentaryQaSessions = sqliteTable("parliamentary_qa_sessions", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),                      // "regierungsbefragung" | "fragestunde"
  day: integer("day").notNull(),
  questions: text("questions", { mode: "json" }).notNull(),
  // Array<{ questionId, askingPartyId, askingPartyName, text, ministry, ministerPartyId, answer?: string | null }>
  batchRequestId: text("batch_request_id"),          // links to the weekly batch
  answeredOnDay: integer("answered_on_day"),
});
```

One row per session. `questions` is a JSON array; each question element has its answer filled in after the batch result lands. `answeredOnDay` is set when the batch response is processed.

### Module API: `parliamentary-qa.ts`

```ts
export function buildParliamentaryQABatchRequests(
  sessionsDueThisWeek: ParliamentaryQaSessionRow[],
  activeGovernment: Government | null,
  parties: Party[],
): { req: BatchRequest; sessionId: string; questionIds: string[] }[];

export function processParliamentaryQABatchResult(
  results: BatchResult[],
  pendingSessions: ParliamentaryQaSessionRow[],
  day: number,
): { sessionsAnswered: number };

export function scheduleWeeklyParliamentaryQA(day: number, startDate: Date): void;
// Inserts pending session rows for this Sitzungswoche if none exist yet.
```

Request shape per session: one batch request whose prompt lists all 2–3 questions for that session; the model returns a JSON array of `{ questionId, answer }`. Parsing reuses `parseAIJson()`. On failure, answers fall back to a short template string `"Die Bundesregierung wird diese Frage schriftlich beantworten."` so the event always has content.

### Event types

- `regierungsbefragung` — `data: { sessionId, day, ministry, ministerPartyId, questions: Array<{askingPartyId, text, answer}> }`
- `fragestunde` — same shape but `data.kind = "fragestunde"`; typically more questions spanning multiple ministries.

Both classified as `IMPORTANT_EVENTS`.

### Loop integration

New step around `loop.ts` Step 10e (interpellations batch area, ≈ line 2113). Schedule at the **start of each Sitzungswoche** (first Sitzungstag where no row exists for this week):

1. `scheduleWeeklyParliamentaryQA(day, startDate)` inserts one Regierungsbefragung row (Mittwoch) + one Fragestunde row (Donnerstag) into `parliamentary_qa_sessions` with questions drawn from the pool, `answeredOnDay=null`.
2. `buildParliamentaryQABatchRequests()` collects all pending sessions whose `day ≤ currentDay` and whose `answeredOnDay IS NULL`. Returns requests to be included in the weekly batch window.
3. After `submitBatch()` resolves, `processParliamentaryQABatchResult()` persists the answers back onto the session row (`questions` JSON updated in place) and emits `regierungsbefragung` / `fragestunde` events on the session's actual `day`.

During interregnum (`getActiveGovernment() === null`): step 1 is skipped — no sessions scheduled, nothing to batch. Persisted rows from before the interregnum are left alone and will be answered when a new government forms (their `day` is in the past, so the event fires on the first available post-Amtseid day with a timestamp note — acceptable cosmetic lag).

## Design — Piece 4: Aktuelle Stunde (crisis-hooked, AI)

Fresh AI content per event. Reuses the weekly batch pipeline for cost efficiency.

### Config additions: `packages/engine/src/config/parliamentary-qa.ts`

```ts
export const AKTUELLE_STUNDE_CRISIS_SEVERITY_MIN = "high" as const;
export const AKTUELLE_STUNDE_BASELINE_MONTHLY_RATE = 1.5;  // expected per month
export const AKTUELLE_STUNDE_PER_WEEK_MAX = 1;
export const AKTUELLE_STUNDE_TARGET_WEEKDAY = 4;           // Thursday (Mon=1)
```

### New schema: `aktuelle_stunde_sessions` table

```ts
export const aktuelleStundeSessions = sqliteTable("aktuelle_stunde_sessions", {
  id: text("id").primaryKey(),
  day: integer("day").notNull(),
  topic: text("topic").notNull(),                         // crisis name or "Aktuelle Lage: {bill title}"
  triggerKind: text("trigger_kind").notNull(),            // "crisis" | "baseline"
  crisisId: text("crisis_id"),                            // nullable — set for crisis-triggered
  governmentPartyId: text("government_party_id").notNull(),
  oppositionPartyId: text("opposition_party_id").notNull(),
  positions: text("positions", { mode: "json" }),        // { government: string, opposition: string } | null until batch returns
  batchRequestId: text("batch_request_id"),
  scheduledDay: integer("scheduled_day").notNull(),
});
```

### Module: `packages/engine/src/simulation/aktuelle-stunde.ts`

```ts
export function scheduleAktuelleStundeForCrisis(
  crisis: Crisis,
  startDate: Date,
  day: number,
): string | null;    // returns sessionId or null if dedup'd / too-low severity

export function maybeScheduleBaselineAktuelleStunde(
  day: number,
  startDate: Date,
  activeCrises: Crisis[],
  recentBills: Bill[],
): string | null;

export function buildAktuelleStundeBatchRequests(
  sessionsDueThisWeek: AktuelleStundeSessionRow[],
  activeGovernment: Government | null,
  parties: Party[],
): { req: BatchRequest; sessionId: string }[];

export function processAktuelleStundeBatchResult(
  results: BatchResult[],
  pendingSessions: AktuelleStundeSessionRow[],
  day: number,
): { emitted: number };
```

Government party: `government.chancellorPartyId` (or outgoing during interregnum). Opposition party: drawn from parties in opposition, weighted by approval rating (the party making the most noise is the most likely to call an Aktuelle Stunde).

### Event type

- `aktuelle_stunde` — `data: { sessionId, day, topic, crisisId, positions: { government, opposition } }`. Classified as `IMPORTANT_EVENTS` and surfaced as a crisis-response marker in the news feed.

### Loop integration

- **On crisis_start** (`loop.ts` ≈ line 490): after the existing `crisis_start` emission, call `scheduleAktuelleStundeForCrisis()`. Dedup: skip if an Aktuelle Stunde already exists for this Sitzungswoche; skip if severity < `AKTUELLE_STUNDE_CRISIS_SEVERITY_MIN`.
- **Weekly tick** (same Sitzungswoche start where Parliamentary-QA sessions are scheduled): call `maybeScheduleBaselineAktuelleStunde()`. Deterministic Poisson tick against `AKTUELLE_STUNDE_BASELINE_MONTHLY_RATE / 4`.
- **Daily**: pending `aktuelle_stunde_sessions` rows whose `scheduledDay ≤ currentDay` + `positions IS NULL` get included in `buildAktuelleStundeBatchRequests()`; results processed in the same batch window as Parliamentary-QA to keep the batch count at ≤2/week when an Aktuelle Stunde fires, ≤1/week otherwise.

## Design — Piece 5: Schriftliche Einzelfragen (counter + template, no AI)

Zero AI cost. One daily event; cumulative counters on `simulation_meta`.

### Schema additions: `simulation_meta` table

Two new columns (guarded `ALTER TABLE ADD COLUMN`):

```ts
schriftlicheEinzelfragenFiledTotal: integer("schriftliche_einzelfragen_filed_total").notNull().default(0),
schriftlicheEinzelfragenAnsweredTotal: integer("schriftliche_einzelfragen_answered_total").notNull().default(0),
```

No dedicated table — per-day rows live only as `simulation_events` of type `schriftliche_einzelfragen`.

### Config: `packages/engine/src/config/parliamentary-qa.ts` (same file)

```ts
export const SCHRIFTLICHE_EINZELFRAGEN = {
  filedPerDay: { mean: 33, min: 15, max: 60 },      // Poisson, clipped
  answeredPerDay: { mean: 15, min: 5, max: 40 },
  sampleCount: { min: 1, max: 3 },                  // sample questions surfaced per day
} as const;

/** Template pool for surfaced sample questions. Same shape as MDB_QUESTION_POOL
 *  but pre-filled: one concrete phrasing + owning-category. */
export const SCHRIFTLICHE_EINZELFRAGE_TEMPLATES: Array<{ text: string; category: BillCategory }>
  = [ /* ~80 entries */ ];
```

### Module: `packages/engine/src/simulation/schriftliche-einzelfragen.ts`

```ts
export function runSchriftlicheEinzelfragenTick(day: number, rng: RNG): {
  filedCount: number;
  answeredCount: number;
  sampleQuestions: Array<{ text: string; category: BillCategory }>;
};
```

Fires **every sim day** (not just Sitzungstage — schriftliche Einzelfragen are filed to the Bundestag administration and answered within 7 days per GO-BT, independent of plenary sessions).

### Event type

- `schriftliche_einzelfragen` — `data: { filedCount, answeredCount, cumulativeFiled, cumulativeAnswered, sampleQuestions }`. **Not** in `IMPORTANT_EVENTS`. Surfaces in a new "Tages-Statistik" widget in the news feed (separate from the main event stream) — see R6 mitigation.

### Loop integration

One call in `loop.ts` Step 10b area (≈ line 2080, after citizen-question answering). Emits one event/day, updates `simulation_meta` cumulative counters in the same transaction.

## Design — Piece 6: Petitions (new table, no AI)

Citizen-side volume + drama. Öffentliche Petitionen only (non-public petitions deferred to Cycle 3+).

### New schema: `petitions` table

```ts
export const petitions = sqliteTable("petitions", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),                   // BillCategory
  authorDisplayName: text("author_display_name").notNull(),
  startedOnDay: integer("started_on_day").notNull(),
  publicWindowEndDay: integer("public_window_end_day").notNull(),   // started + 28
  signatureCount: integer("signature_count").notNull().default(0),
  signatureQuorum: integer("signature_quorum").notNull().default(30_000),
  status: text("status").notNull(),                       // "collecting" | "quorum_reached" | "debated" | "rejected" | "expired"
  quorumReachedOnDay: integer("quorum_reached_on_day"),
  debatedOnDay: integer("debated_on_day"),
  outcome: text("outcome"),                               // "accepted" | "rejected" | null (only set after debate)
});
```

### Config: `packages/engine/src/config/petitions.ts`

```ts
export const PETITION_QUORUM = 30_000;                // Bundestag GO-EPet §4
export const PETITION_PUBLIC_WINDOW_DAYS = 28;        // official quorum window
export const PETITION_SPAWN_INTERVAL_DAYS = { min: 3, max: 10 } as const;

/** Logistic growth: daily signatures ≈ r * current * (1 - current/cap) * salienceFactor,
 *  with r tuned so ~30% of petitions cross quorum within 28 days under baseline salience. */
export const PETITION_GROWTH_RATE = 0.38;
export const PETITION_INITIAL_SIGNATURES = { min: 50, max: 500 } as const;

/** Petitionsausschuss accept/reject after quorum reached. */
export const PETITION_COMMITTEE_OUTCOMES = {
  accepted: 0.35,     // Bundestag debates + responds in substance
  rejected: 0.65,     // acknowledged but not debated on plenary floor
} as const;

/** Title/description templates (no AI). Same shape as SCHRIFTLICHE_EINZELFRAGE_TEMPLATES. */
export const PETITION_TEMPLATES: Array<{
  title: string;
  description: string;
  category: BillCategory;
}> = [ /* ~40 entries */ ];
```

### Module: `packages/engine/src/simulation/petitions.ts`

```ts
export function maybeSpawnPetition(day: number, rng: RNG): Petition | null;
export function tickPetitionSignatures(day: number, activeCrises: Crisis[], recentBills: Bill[]): {
  advanced: number;            // petitions that incremented signatureCount
  quorumReached: Petition[];   // newly crossed threshold
  expired: Petition[];         // publicWindowEndDay hit without quorum
};
export function resolveQuorumReachedPetitions(day: number, rng: RNG): {
  debated: Petition[];
  rejected: Petition[];
};
```

State transitions:

```
collecting → quorum_reached        (signatureCount >= signatureQuorum, before publicWindowEndDay)
collecting → expired               (day > publicWindowEndDay, signatureCount < quorum)
quorum_reached → debated           (PETITION_COMMITTEE_OUTCOMES.accepted roll, with outcome="accepted")
quorum_reached → rejected          (PETITION_COMMITTEE_OUTCOMES.rejected roll, with outcome="rejected")
```

Quorum-reached → debated/rejected fires on next Sitzungstag after a 7-day Petitionsausschuss dwell.

### Event types

- `petition_created` — `data: { petitionId, title, category, authorDisplayName, signatureQuorum, publicWindowEndDay }`
- `petition_quorum_reached` — `data: { petitionId, title, signatureCount, day, publicWindowEndDay }`. Classified `IMPORTANT_EVENTS`.
- `petition_debated` — `data: { petitionId, title, outcome }`. Classified `IMPORTANT_EVENTS`.

Expired petitions deliberately do **not** emit an event — the lack of a `quorum_reached` signal is itself the outcome, and emitting `petition_expired` on every non-quorum petition would flood the feed (~70% of petitions).

### Loop integration

Step 10d2 area (≈ line 2104, discipline 7-day tick). Single daily block:

1. `maybeSpawnPetition()` — Poisson-ish spawn driven by `PETITION_SPAWN_INTERVAL_DAYS`.
2. `tickPetitionSignatures()` — increment all `collecting` rows; roll into `quorum_reached` or `expired`.
3. `resolveQuorumReachedPetitions()` — Petitionsausschuss resolution for rows ≥7 days past `quorumReachedOnDay`.

Emits `petition_created`, `petition_quorum_reached`, `petition_debated` at the appropriate points.

### API routes (new)

`packages/api/src/routes/petitions.ts`:

- `GET /api/petitions` — list, paginated, filterable by `status` + `category`.
- `GET /api/petitions/:id` — detail with signature timeline.

Route registered alongside existing 11 routers in `packages/api/src/routes/index.ts`.

## Interaction risks + mitigations

| # | Risk | Mitigation |
|---|------|-----------|
| R1 | Weekly Parliamentary-QA batch adds a new batch to the `submitBatch()` window. If a Cycle-1 mid-cycle batch is already running that day, we get two AI round-trips instead of one. | Piggyback: Parliamentary-QA + Aktuelle Stunde requests are collected with the existing C/mid-cycle batch group (media + summary). `loop.ts` batch collection already iterates per-module `buildXxxBatchRequest()` — just add Parliamentary-QA + Aktuelle Stunde to the same collection pass. One batch/week unless the window is genuinely full. |
| R2 | Regierungsbefragung fires during interregnum → minister mapping falls back to outgoing cabinet → events look wrong dated post-Amtseid when the backlog finally answers. | Skip scheduling during interregnum entirely (S12). Backlog from pre-interregnum sessions: if `answeredOnDay IS NULL` AND session `day` is ≥14 days stale, mark the row `answeredOnDay = currentDay` with a `"(nachträglich schriftlich beantwortet)"` sentinel instead of firing the event. Avoids dated cabinet quotes. |
| R3 | `government.cabinet` JSON may be empty on pre-Cycle-2b DBs or fresh seeds. Minister-party derivation then has no input. | Fallback: `MINISTRY_FALLBACK_PARTY` map routes each ministry to a default party (CDU for Kanzleramt, SPD for Finanzen, etc. based on current government). Used only when `government.cabinet === null || []`. Same fallback used by Fragestunde + Aktuelle Stunde government-side selection. |
| R4 | Aktuelle Stunde and Regierungsbefragung may both schedule on the same day (Wednesday crisis → Aktuelle Stunde on Thursday; Regierungsbefragung already on Wednesday). News feed reads as a cluster. | Intentional — real Bundestag Sitzungswochen are dense. Cluster is a viewer feature. If batch throughput is strained, Aktuelle Stunde can slip to the next Sitzungs-Thursday via `nextSitzungsTag(day, weekday=4)`. |
| R5 | Schriftliche Einzelfragen counter at ~33/day + sample questions will produce 1–3 events/day. Over a term that's ~1500 day-events + ~4500 sample entries in the news feed. Floods. | Not classified `IMPORTANT_EVENTS`. Frontend renders these in a dedicated "Tages-Statistik" widget/card at the bottom of the news feed, collapsed by default. Main event stream filters `type === "schriftliche_einzelfragen"` out of the primary feed. Add to the feed-filter enum in `packages/api/src/routes/events.ts`. |
| R6 | Petition spawn rate 1/(3–10 days) × 30% quorum-rate ≈ 20–30 quorum-reached petitions per term. Petitionsausschuss resolution 35% accepted ≈ 7–10 debated petitions/term. Plausible but thin. | Realistic: real Bundestag sees 20–40 öffentliche Petitionen reach quorum/term. Calibration is in the right zone. If under-fires in sim, raise `PETITION_GROWTH_RATE`. Add a calibration measurement to the success criteria. |
| R7 | `petitions` table grows unbounded over a 16-year sim. At 1/5 days that's ~1150 rows/term × 4 terms ≈ 4600 rows. Bearable. | No pruning planned for this cycle. If row count becomes a query-performance issue (unlikely under SQLite for < 50k rows), add index on `(status, started_on_day)`. |
| R8 | Aktuelle-Stunde crisis-hook dedup: two crises firing in the same week both try to schedule. Per-week cap of 1 (S6) drops the second silently — observable-losing. | Emit a lightweight `simulation_events` row of type `day_start` data sub-key `"aktuelle_stunde_skipped": crisisId` when a dedup drop happens, so the frontend can surface "weitere Aktuelle Stunde zurückgestellt". No new event type required. |
| R9 | New event types (`regierungsbefragung`, `fragestunde`, `aktuelle_stunde`, `schriftliche_einzelfragen`, `petition_created`, `petition_quorum_reached`, `petition_debated`) must be added to `SimulationEventType` union (types package), `IMPORTANT_EVENTS` classification in `timing.ts`, AND the frontend event-icon map. | Matches Cycle 2a PR 1 pattern — single commit touches the types union + IMPORTANT_EVENTS + any event-icon/color maps in the web package. Listed explicitly in PR 5 checklist to avoid missing a site. |
| R10 | Parliamentary-QA batch failures (AI returns malformed JSON or 429s exhaust retries) leave `answeredOnDay IS NULL` on the session row. Next day's batch re-submits the same request, potentially doubling cost. | `buildParliamentaryQABatchRequests()` includes all `answeredOnDay IS NULL` pending rows — that's correct retry behaviour. Add a per-row `batchAttempts` counter (column on `parliamentary_qa_sessions`); after 3 failed attempts, set `answeredOnDay = day` with fallback answer text and emit the event anyway. Bounds the failure mode. |
| R11 | `scheduleAktuelleStundeForCrisis()` called from inside the crisis-start block holds a write lock on `aktuelle_stunde_sessions` at a tight spot in the loop. | Single insert + dedup check. Low contention. If contention shows up, move the schedule call into a post-crisis-tick sub-step in Step 3b. |
| R12 | Cost regression: if the Parliamentary-QA prompt is verbose, the expected +$0.002–$0.004/day cap slips. | Prompt budget: per-session prompt ≤ 800 input tokens + 300 output tokens. Measured via `logAICall` after PR 5 ships. If over, compress the prompt (drop question context, keep question text only) before merging PR 6. |
| R13 | Petition signature tick is deterministic under a seeded RNG — regression tests must be re-baselined when `PETITION_GROWTH_RATE` tunes in a follow-up. | Store the RNG seed alongside fixture petitions. Don't hard-code signature counts in tests; assert bounds (`>= 0 && <= PETITION_QUORUM`) and state-transition invariants. |
| R14 | `getActiveGovernment()` returning the outgoing cabinet during interregnum (Cycle 2a S7 behaviour) means Aktuelle Stunde during interregnum quotes an outgoing-government position. Cosmetically odd in the news feed. | Accept. Real Bundestag Aktuelle Stunden during interregna (geschäftsführende Regierung) do in fact quote the outgoing cabinet. Add a sentinel to the event payload: `data.governmentStatus: "amtierend" | "geschaeftsfuehrend"` so the frontend can render the distinction. |
| R15 | Schriftliche Einzelfragen template pool at 80 entries will feel repetitive over a term (1500 days × 2 samples ≈ 3000 surfaced samples). | Acceptable for Cycle 2b — real Einzelfragen are also highly repetitive in phrasing. Pool can grow in follow-up PRs without touching the wiring. Templates are data, not code. |

## Migration strategy

All migration SQL inlined in `packages/engine/src/db/seed.ts::migrateDatabase()`, following the Cycle 1/2a pattern. No new `migrations/` file. Idempotent throughout — each guard is `IF NOT EXISTS` / `WHERE col IS NULL` / `CREATE TABLE IF NOT EXISTS`.

### Piece 3 (Parliamentary-QA) migration

1. `CREATE TABLE IF NOT EXISTS parliamentary_qa_sessions (...)` — DDL added to `SIM_TABLE_DDL` in `packages/engine/src/db/ddl.ts`. Drizzle schema added to `packages/engine/src/db/schema-sim.ts`.
2. No backfill — historical terms don't retroactively get Regierungsbefragung/Fragestunde sessions. First post-migration Sitzungswoche schedules the first sessions normally.
3. Optional `batchAttempts` column on the same table (R10 mitigation) added to `SIM_COLUMN_MIGRATIONS` to allow in-place schema extension if it's added in a later PR.

### Piece 4 (Aktuelle Stunde) migration

1. `CREATE TABLE IF NOT EXISTS aktuelle_stunde_sessions (...)` — same pattern as Piece 3.
2. No backfill for past crises — on-going (unresolved) crises at migration time do **not** retroactively trigger Aktuelle Stunde. Only crises that fire `crisis_start` after migration go through the new code path.

### Piece 5 (Schriftliche Einzelfragen) migration

1. Add columns to `simulation_meta`:
   - `schriftliche_einzelfragen_filed_total INTEGER NOT NULL DEFAULT 0`
   - `schriftliche_einzelfragen_answered_total INTEGER NOT NULL DEFAULT 0`
2. No backfill — counters start at 0 on migration day. Historical daily events are not retroactively generated.

### Piece 6 (Petitions) migration

1. `CREATE TABLE IF NOT EXISTS petitions (...)`.
2. `CREATE INDEX IF NOT EXISTS petitions_status_started_idx ON petitions (status, started_on_day)` — added to `SIM_INDEX_MIGRATIONS`.
3. No backfill — petition system starts empty on the first post-migration day. First petition spawns within 3–10 days.

### Event-types migration (cross-piece)

The `SimulationEventType` union is a TypeScript type, not a DB column — no SQL migration needed. However `simulation_events.type` is TEXT, so old rows with the new event type names are impossible (nothing wrote them before) and new rows under the old type catalogue are unaffected. **Load-bearing**: any switch/match on event type in `packages/api/src/routes/events.ts` or `packages/web/**/NewsFeed*.tsx` must have a fallback case so a future-dated DB imported into old code doesn't crash. Pattern reused from Cycle 1 PR 2's approach to the `konstituierende_sitzung` type.

## Implementation plan — 4 PRs

Each PR runs `npm run typecheck && npm test && npm run build` before pushing the next. Single commit per PR (same pattern as Cycle 2a). Dependency order:

- **PR 5 is independent.** Foundation for the two AI-backed pieces: Parliamentary-QA scaffold, types, schema, config, unit tests. No loop wiring yet — module importable standalone.
- **PR 6 depends on PR 5.** Wires PR 5 into the loop + adds Aktuelle Stunde (reuses PR 5's batch-request collection pattern and `MINISTRY_FALLBACK_PARTY` map).
- **PR 7 is independent** of PR 5 and PR 6 — Schriftliche Einzelfragen is a counter + template pool with no AI and no dependency on the other pieces. Can land in parallel.
- **PR 8 depends on nothing in 2b** but sequenced last because the petitions route + web surface expands the most. Independent of PR 5/6/7 code paths.
- **Shared file coupling**: PR 5, PR 6, PR 7, PR 8 all extend `SimulationEventType` in `packages/types/src/types/meta.ts`. PR 5/6/7 all extend `IMPORTANT_EVENTS` in `simulation/timing.ts`. PR 5/6/7/8 all add to `SIM_TABLE_DDL` or `SIM_COLUMN_MIGRATIONS` in `packages/engine/src/db/ddl.ts`. Expect minor conflict resolution if PRs land out of order — keep the merge-order 5 → 6 → 7 → 8.

### PR 5: Parliamentary-QA scaffold (types + schema + pure module + unit tests)

- Add `config/parliamentary-qa.ts` with `MDB_QUESTION_POOL` (~60 entries), per-session caps, `MINISTRY_FALLBACK_PARTY`, `SCHRIFTLICHE_EINZELFRAGEN` + `SCHRIFTLICHE_EINZELFRAGE_TEMPLATES` (pre-seeded for PR 7 to consume without a second config file).
- Add `simulation/parliamentary-qa.ts` with `scheduleWeeklyParliamentaryQA`, `buildParliamentaryQABatchRequests`, `processParliamentaryQABatchResult`.
- Schema additions: `parliamentary_qa_sessions` table (DDL + Drizzle + `SIM_TABLE_DDL`).
- Extend `SimulationEventType` with `regierungsbefragung`, `fragestunde`. Extend `IMPORTANT_EVENTS` with both.
- Migration (Piece 3).
- Unit tests: `parliamentary-qa.test.ts` — pool sampling by category, minister-party derivation (cabinet vs fallback), session-scheduling dedup, batch-request shape, parse happy path + parse-fail fallback text.
- **No** loop wiring. Tests run the pure functions directly.

### PR 6: Parliamentary-QA loop wire + Aktuelle Stunde

- Wire PR 5's scheduling + batch collection into `loop.ts` around Step 10e / weekly batch window. Events emitted on session `day`.
- Add `simulation/aktuelle-stunde.ts` + `aktuelle_stunde_sessions` table.
- Extend `SimulationEventType` with `aktuelle_stunde`. Extend `IMPORTANT_EVENTS`.
- Hook `scheduleAktuelleStundeForCrisis()` into the crisis-start block. Hook weekly baseline tick into the same Sitzungswoche-start pass as Parliamentary-QA.
- Migration (Piece 4).
- Tests:
  - Regierungsbefragung fires only on Sitzungs-Mittwoch.
  - Fragestunde fires on Sitzungs-Donnerstag, once per Sitzungswoche.
  - Interregnum skip (S12): no session rows created when `getActiveGovernment() === null`.
  - Aktuelle Stunde crisis-trigger: `crisis_start` with `severity="high"` creates exactly one row scheduled on next Thursday.
  - Aktuelle Stunde dedup: second crisis in same week doesn't double-schedule.
  - Aktuelle Stunde baseline tick: over 1000 sim days, mean 1–2 per month.
  - End-to-end: seed → simulate one full Sitzungswoche → exactly 1 Regierungsbefragung + 1 Fragestunde event with non-empty answers.

### PR 7: Schriftliche Einzelfragen (counter + template, no AI)

- Add `simulation/schriftliche-einzelfragen.ts` with `runSchriftlicheEinzelfragenTick`.
- Extend `simulation_meta` with cumulative counter columns (via `SIM_COLUMN_MIGRATIONS`).
- Extend `SimulationEventType` with `schriftliche_einzelfragen`. **Do not** add to `IMPORTANT_EVENTS`.
- Wire into `loop.ts` Step 10b (daily, every day). Update cumulative counters in same transaction as event insert.
- Extend `packages/api/src/routes/events.ts` feed-filter to exclude `schriftliche_einzelfragen` from the primary news feed; add a `/api/events/tagesstatistik` endpoint (or query param) to retrieve these separately.
- Tests:
  - Poisson draw stays in `[15, 60]` filed and `[5, 40]` answered bounds across 10_000 iterations.
  - Cumulative counter monotonic over 100 sim days.
  - Sample question count in `[1, 3]` per event.
  - Events persist through seed+simulate cycle.

### PR 8: Petitions (new table, citizen-side, no AI)

- Add `config/petitions.ts` with `PETITION_QUORUM`, `PETITION_PUBLIC_WINDOW_DAYS`, `PETITION_SPAWN_INTERVAL_DAYS`, growth rate, outcome distribution, ~40 template entries.
- Add `simulation/petitions.ts` with `maybeSpawnPetition`, `tickPetitionSignatures`, `resolveQuorumReachedPetitions`.
- Schema: `petitions` table (DDL + Drizzle + `SIM_TABLE_DDL` + `SIM_INDEX_MIGRATIONS`).
- Extend `SimulationEventType` with `petition_created`, `petition_quorum_reached`, `petition_debated`. Extend `IMPORTANT_EVENTS` with the latter two.
- Add `packages/api/src/routes/petitions.ts` (list + detail).
- Register router in `packages/api/src/routes/index.ts`.
- Wire into `loop.ts` Step 10d2 area — one daily pass: spawn → tick → resolve.
- Migration (Piece 6).
- Tests:
  - Signature growth stays in `[0, PETITION_QUORUM]` bounds.
  - Over 1000 sim days, ~30% of spawned petitions reach quorum.
  - Expired petitions transition to `status='expired'` at `publicWindowEndDay` without event emission (R-item behaviour).
  - Quorum-reached petitions resolve to `debated` or `rejected` after ≥7-day dwell.
  - Events emit in the correct order: `petition_created` → `petition_quorum_reached` → `petition_debated`.

## Success criteria

- `npm run typecheck && npm test && npm run build` green on each PR.
- Seed + `simulate 1461` completes without error after all 4 PRs.
- Event stream in a fully-populated Sitzungswoche includes, in order:
  - `regierungsbefragung` (Mittwoch, with 2–3 Q+A pairs in data.questions[*].answer)
  - `fragestunde` (Donnerstag, same shape)
  - `aktuelle_stunde` (Donnerstag if a high-severity crisis fired Mon–Wed)
  - `schriftliche_einzelfragen` × 7 (one per day)
  - `petition_created` / `petition_quorum_reached` / `petition_debated` at their cadence
- `sqlite3 data/simulation.db "SELECT COUNT(*) FROM parliamentary_qa_sessions WHERE answered_on_day IS NOT NULL"` returns a row count consistent with ≥95% of scheduled sessions getting an answer (fallback text counts as answered).
- `sqlite3 data/simulation.db "SELECT SUM(schriftliche_einzelfragen_filed_total) FROM simulation_meta"` after 1461 days returns a value between 22_000 and 87_000 (matches the Poisson-expected range for λ=33 over 1461 days, ±2σ).
- `sqlite3 data/simulation.db "SELECT status, COUNT(*) FROM petitions GROUP BY 1"` after 1461 days returns a distribution where `quorum_reached + debated + rejected ≈ 30% ± 10%` of total.
- Unit tests in `petitions.test.ts` and `schriftliche-einzelfragen.test.ts` pass a seeded RNG directly to module functions and assert deterministic spawn / counter sequences. End-to-end determinism through `runDay()` is **not** in scope this cycle — production runs default to `Math.random` and are non-deterministic by design. Plumbing a sim-meta seed through the daily loop is deferred (tracked under "Open items surfaced for later cycles" below).
- Added AI spend measured via `logAICall` output stays below +$0.004/sim-day (averaged over a week).
- `sqlite3 data/simulation.db "SELECT type, COUNT(*) FROM simulation_events WHERE type IN ('regierungsbefragung','fragestunde','aktuelle_stunde') GROUP BY 1"` after a year (≈365 sim days) returns counts roughly `(22, 22, 18–24)` — matches real Bundestag cadence.

## Open items surfaced for later cycles

- **Minister-level actor modelling** — today ministers are a ministry label + derived party. A real Minister-agent with a prompt persona would sharpen Regierungsbefragung answers. Cycle 3+ (blocked on coalition-cabinet modeling depth).
- **Petitionsausschuss member modeling** — 25% MdB composition mirrors what's planned for Untersuchungsausschuss in Cycle 4 P3. Tackle together.
- **Non-öffentliche Petitionen** — the ~80% of real petitions that never go public. Bulk-counter treatment similar to Schriftliche Einzelfragen (`simulation_meta` counters, no per-petition rows). Cycle 3+.
- **Fragestunde themengebunden** — real Fragestunden cluster around ministry-of-the-week. Would require a per-Sitzungswoche ministry-rotation calendar. Nice-to-have.
- **Dringliche Fragen** — urgent-question format, short-fuse. Interacts with crisis-hook infrastructure (same code path as Aktuelle Stunde but different event type). Cycle 3.
- **Petition signature-momentum modeling** — real petitions often spike on media coverage. Hooking petition growth to `media_articles` sentiment would add drama but introduces cross-module coupling this cycle didn't budget for. Cycle 3+.
- **Minister response latency on Schriftliche Einzelfragen** — real answers are due within 7 days. Sim currently treats filed + answered as independent counters; a queueing model would be more realistic. P3 polish.
- **End-to-end seeded RNG through `runDay()`** — petitions / Einzelfragen / Aktuelle-Stunde-baseline modules accept an `rng` argument and are deterministic in unit tests, but `loop.ts` calls them without one (defaulting to `Math.random`). Plumbing a sim-meta `randomSeed` column through the daily loop would unlock end-to-end snapshot regression tests. Cycle 3+.





