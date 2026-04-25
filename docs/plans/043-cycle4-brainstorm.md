# 043 Cycle 4 (P3) — Brainstorm + Locked Decisions

**Status**: Brainstorm. Decisions locked at bottom. Next step: spec + implement.
**Source**: [`../todo/043-sim-timing-fidelity.md`](../todo/043-sim-timing-fidelity.md) §Cycle 4.
**Preceding cycles shipped on `main`**: Cycle 1 (calendar + bill timing + Konstituierende Sitzung), Cycle 2a (Bundesrat + Kanzlerwahl), Cycle 2b (Parliamentary-QA + Aktuelle Stunde + Einzelfragen + Petitions), Cycle 3 (P2 frequency/timing tuning, 735→630 seats, fiscal-emergency-adjacent calibration).

## Scope shape

Cycle 4 is the first **structurally additive** cycle in the 043 roadmap — earlier cycles tuned existing mechanics; this one introduces new entities, event types, and agent actions. Six pieces are listed in the umbrella todo. Two are deferred to a later cycle (per Q2):

- **Shipped this cycle**: Untersuchungsausschuss · debate sub-formats · Nachtragshaushalt · Schuldenbremse-Aussetzung
- **Deferred to Cycle 5+**: Enquete-Kommission · Ausschussanhörungen — both depend on an external-expert-witness actor model the sim doesn't yet have. Bundling them into Cycle 4 would force that infrastructure prematurely.

The locked four pieces cluster naturally:

1. **Untersuchungsausschuss** — heaviest piece; new table, multi-month state machine, AI hearing summaries.
2. **Schuldenbremse-Aussetzung + Nachtragshaushalt** — paired fiscal-emergency mechanic; reuses existing budget-vote machinery.
3. **Debate sub-formats** — micro-event flavor + one data-hooked discipline event.

## Piece-by-piece survey

### 1. Untersuchungsausschuss (parliamentary inquiry committee)

- Real Bundestag: 25% of MdBs (≥158 of 630 in current Wahlperiode) can demand an Untersuchungsausschuss; runs 1–4 years (most 2–3); produces hearings + final report; primarily a Kontrollinstrument used by opposition against the executive.
- **A. Minimum viable**: lifecycle table + 3 events, no AI, deterministic flavor only.
- **B. Mid fidelity**: lifecycle + AI hearing summaries + AI final report. ~1 batch call/active-inquiry/30 days. Negligible cost (~+$0.0002/sim-day).
- **C. High fidelity**: above + court-like minister summons + scandal-severity axis + multiple inquiry types. ~600–800 LOC.

*Recommendation: B.* The "lifecycle exists" baseline (A) produces a feed of identical-looking events — no story. Court powers (C) duplicate the existing media + crisis scandal narrative. Hearing summaries are the difference between "an entity exists" and "viewers can read what's happening."

**Trigger**: opposition Fraktionen with combined seats ≥ 25% of `BUNDESTAG_SIZE`. Agent action `file_inquiry_committee`. Crisis-spawned auto-filing rejected (takes decisions out of agent hands and breaks the project's six-AI-parties thesis). Crises *amplify* via `AgentContext` (a "crisis is politically explosive for govt party X" flag raised in opposition agents' prompts), but agents always make the call.

**Runtime**: 180–540 sim days per inquiry (uniform draw); hearings every 30 sim days while active; max 2 active simultaneously; party-level entity (no per-seat membership tracked — that's a Cycle 5+ enrichment when seat-roster front-end becomes relevant).

**Conclusion outcome**: deterministic roll weighted by govt approval at conclusion day. Approval `< 30%`: 70% wrongdoing-found; `30–50%`: 40%; `> 50%`: 20%. Wrongdoing-found → target `-1.5` approval / filer `+0.8`. Cleared → target `+0.5` / filer `-0.3`.

**During-active pressure**: filing party `+0.3` one-time on file. Target party `-0.05/day` while inquiry runs (cumulative `-9 to -27` over full duration; small per-day so other dynamics aren't drowned).

### 2. Debate sub-formats

- Real Bundestag: Kurzintervention (short rebuttal interrupting a speech), Zwischenfrage (interjection during a speech), Erklärung zur Abstimmung (post-vote justification of why an MdB voted contrary), Ordnungsruf (Präsident calls a member to order for misbehavior).
- **A. All four, deterministic only**: pure RNG flavor at each plenary reading. Adds noise without signal.
- **B. AI text on debate sub-formats**: Kurzintervention + Zwischenfrage get 1–2 sentence German via AI. ~+$0.001/sim-day. Decoration cost for marginal value.
- **C. Three sub-formats, all data-hooked**: skip Ordnungsruf (no MdB-misbehavior signal exists; defer). Erklärung zur Abstimmung fires post-third-reading for each MdB seat where `disciplineLevel >= 1` AND vote ≠ party line — surfaces *real* discipline-break data as named events. Kurzintervention + Zwischenfrage are deterministic flavor during readings (template-based party-vs-party).
- **D. All four with rich detection logic**: Ordnungsruf via profanity flag on `statement` actions, etc. ~+150 LOC of detection code.

*Recommendation: C.* Random flavor (A) is exactly the noise Cycle 6 housekeeping was created to clean up. AI text (B) burns budget on decoration. Erklärung zur Abstimmung *has a real hook* via existing discipline data — that's the high-value piece. Ordnungsruf without misbehavior is artificial — defer cleanly.

**Frequency**: during `bill_first_reading` / `bill_second_reading`, 30% chance of 1 Kurzintervention + 30% chance of 1 Zwischenfrage. Templated description picks two random parties. Routine-tier classification.

### 3. Nachtragshaushalt + Schuldenbremse-Aussetzung (fiscal-emergency pair)

These are sequential mechanics in real life: the Bundestag declares an außergewöhnliche Notsituation (Art. 115 GG), suspending the structural debt brake; only then can it pass a Nachtragshaushalt that exceeds the deficit cap. They've fired together 4–5 times since 2009 (COVID 2020/21/22, Ukraine 2022, Bundeswehr Sondervermögen 2024).

- **A. Pure agent action, no Schuldenbremse vote**: coalition leader files; both pass instantly. Real-world simplification too far.
- **B. Crisis-spawned, no agent action**: bypasses agents; breaks thesis.
- **C. Hybrid trigger + Schuldenbremse-Aussetzung as separate vote, Nachtragshaushalt reuses budget machinery**: agent action `propose_fiscal_emergency` exists; high-severity crises feed `AgentContext` flag for coalition leader. On filing, formal Bundestag vote on Schuldenbremse-Aussetzung (simple majority — pragmatic simplification of the real qualified-majority requirement; flagged as a Cycle 5+ refinement). On pass, an injection enters the queue triggering an immediate supplementary budget cycle that flows through existing `tallyBudgetVote()` + `applyBudgetEconomicEffect()`.
- **D. Auto-spawn AND agent action**: dual paths, biggest blast radius.

*Recommendation: C.* Symmetric with Untersuchungsausschuss trigger model (Q4). Schuldenbremse-Aussetzung is a dramatic moment worth surfacing in the feed — a separate vote captures that. Nachtragshaushalt is *just another budget* mechanically; reusing the existing tally + economic-effect helpers means ~80 LOC instead of duplicating ~300.

**Suspension duration**: 365 sim days. Matches real-world annual emergency declarations (Bundestag re-declares every year). After expiry, must re-file.

**Nachtragshaushalt allocation**: auto-generated, crisis-weighted. Defense crisis → defence ministry weight `+30%`; pandemic/health → health `+30%`; etc. Supplementary total: 50–150B EUR (vs 300B annual). Coalition agent does not customize — Schuldenbremse-Aussetzung *is* the agent decision; allocation is formulaic given the active crisis.

**Economic effect**: same `applyBudgetEconomicEffect()` machinery, scaled to supplementary amount. Plus: while `schuldenbremseSuspended === true`, GDP drag from `provisionalBudget` (if active) is suppressed — debt brake suspended ⇒ no fiscal pressure penalty.

## Cost / speed impact

- **AI cost** (50% batch discount applied):
  - Inquiry hearing summaries: 1 batch item per inquiry × 1 hearing/30 days × max 2 active ≈ 0.067 calls/sim-day average
  - Inquiry final reports: ~6 inquiries per 4-year (1461-day) term × 1 report ≈ 1 call per ~244 sim-days
  - Net: ~+0.07 batched calls/sim-day average, ~+$0.0005–0.001/sim-day
- **Speed**: neutral. New events generate from existing daily-tick paths; no new blocking AI roundtrips beyond the batch.
- **Event volume**: up ~5–10%/sim-day (3 debate sub-format events fire on ~50–60% of bill readings; inquiry events fire ~once per 30 days while active; fiscal-emergency events fire ~0–2x per term).
- **Database growth**: 1 new table (`inquiry_committees`); ~6–10 rows per 4-year term — negligible.

## Cross-cutting design

### New event types (12 total)

| Event | Tier | Description |
|---|---|---|
| `inquiry_filed` | important | Opposition Fraktion files inquiry against govt or party |
| `inquiry_hearing_held` | standard | Monthly hearing event with AI-generated 2–4 sentence summary |
| `inquiry_concluded` | important | Final report + outcome (wrongdoing-found / cleared) |
| `schuldenbremse_aussetzung_proposed` | important | Coalition files Art. 115 GG emergency declaration |
| `schuldenbremse_aussetzung_passed` | critical | Bundestag passes; debt brake suspended for 365 days |
| `schuldenbremse_aussetzung_rejected` | important | Vote fails; no Nachtragshaushalt this round |
| `nachtragshaushalt_proposed` | important | Supplementary budget with crisis-weighted allocation |
| `nachtragshaushalt_passed` | important | Supplementary budget enacted |
| `nachtragshaushalt_rejected` | important | Supplementary budget rejected |
| `kurzintervention` | routine | 30% per plenary reading; party-vs-party flavor |
| `zwischenfrage` | routine | 30% per plenary reading; question during speech |
| `erklaerung_zur_abstimmung` | routine | Per discipline-breaking MdB vote post-3rd-reading |

### New tables / schema

**New table** `inquiry_committees` (sim DB):
- `id`, `subject` (text), `filingPartyId` (FK to parties), `targetPartyId` (FK, nullable — when the target is a ministry rather than a party), `targetMinistry` (text, nullable — one of the 8 ministry portfolios), `filedOnDay` (int), `scheduledEndDay` (int), `concludedOnDay` (int, nullable), `status` ("active" | "concluded"), `outcome` ("wrongdoing_found" | "cleared", nullable), `finalReport` (text, nullable), `hearingCount` (int default 0), `lastHearingDay` (int, nullable)
- **Invariant**: at least one of `targetPartyId` or `targetMinistry` MUST be non-null. Enforced at filing time in `inquiry-committees.ts::fileInquiry()` and asserted in tests.

**New columns**:
- `national_state.schuldenbremse_suspended` (boolean, default false) — mirrors `provisional_budget` pattern
- `simulation_meta.schuldenbremse_suspended_until_day` (int, nullable) — auto-expiry tracking
- `simulation_meta.last_inquiry_filed_day` (int, nullable) — soft rate-limit (one per 60 days minimum)

### New agent actions (2)

- `file_inquiry_committee` (opposition Fraktionen only; gated on combined opposition seats ≥ 25% of `BUNDESTAG_SIZE`; max 1 active per filing party; max 2 globally)
- `propose_fiscal_emergency` (coalition leader only; gated on at least one active high-severity crisis OR `provisionalBudget === true` for ≥30 days; cooldown of 365 days after a successful Schuldenbremse-Aussetzung)

Both validated in `action-parser.ts` mirroring the existing `file_misstrauensvotum` / `call_vertrauensfrage` patterns.

### Migration strategy

Inline in `seed.ts::migrateDatabase()`, idempotent, guarded by a single `cycle4Migrated` meta flag (mirrors Cycle 3's `bundestagSizeMigrated` pattern). New table CREATE wrapped in transaction; new columns added with defaults; no data backfill — no in-flight Untersuchungsausschuss exists pre-migration.

Ordering inside `migrateDatabase()`:

1. (existing) Cycle 1 stage-entry-day backfill
2. (existing) Cycle 1 stage-min/max bill backfill
3. (existing) Cycle 3 piece 4 — 735→630 seat reapportionment
4. (existing) Cycle 2a synthetic kanzlerwahl-row backfill
5. (existing) Cycle 2a bundesrat_mode backfill
6. (existing) Cycle 2b counter-column inits
7. (existing) Cycle 3 piece 6 — `last_negotiation_round_day` column add
8. **NEW: Cycle 4 — `inquiry_committees` table + 3 column adds + meta flag**

No order dependency between Cycle 4 and prior cycles.

## Open brainstorming questions

- **Q1.** Cycle 4 split — single cycle, or sub-split (4a/4b) like Cycle 2 was?
- **Q2.** Which pieces deferred — none, Enquete only, both expert-driven pieces, or the heavy multi-year ones?
- **Q3.** Untersuchungsausschuss fidelity — minimum / mid (AI summaries) / high (court powers)?
- **Q4.** Untersuchungsausschuss trigger — agent only / crisis only / hybrid w/ context injection / dual auto+agent?
- **Q5.** Fiscal-emergency trigger — symmetric with Q4, or different model?
- **Q5b.** Schuldenbremse-Aussetzung mechanics — separate vote / coalition declaration / vote + reuse-budget-machinery?
- **Q6.** Debate sub-formats — all four / AI text / three data-hooked / rich detection?
- **Q7.** Untersuchungsausschuss runtime physics — real-aligned party-level / compressed / real with seat membership / stochastic mixed scopes?
- **Q8.** Migration — inline meta-flag (matches prior cycles) or out-of-band script?
- **Q9.** Failure modes — what's the safety net if an inquiry runs past `scheduledEndDay` without a hearing for 60+ days, or if Schuldenbremse expires while a Nachtragshaushalt is mid-flight?

---

## Decisions (locked)

Applying Cycle-2/3 principles — viewer value ↑, AI cost small, prefer agent-driven over auto-spawned, reuse existing machinery wherever possible.

| # | Question | Decision |
|---|----------|----------|
| Q1 | Sub-cycles? | **No.** Ship as Cycle 4 in 4 PR-commits, mirroring Cycle 3's cadence. Volume per commit fits one PR cleanly when Enquete + Anhörungen are deferred. |
| Q2 | Which deferred | **Enquete-Kommission + Ausschussanhörungen.** Both depend on a missing external-expert-witness actor model. Defer to Cycle 5+ as a paired feature with proper expert plumbing. |
| Q3 | Inquiry fidelity | **B (Mid)**: lifecycle + AI hearing summaries (1 batch item per active hearing) + AI final report at conclusion. Court powers deferred. |
| Q4 | Inquiry trigger | **C (Agent action with crisis amplification via `AgentContext`)**. No auto-spawning; agents always make the call. Crisis context surfaced as a flag in opposition agent prompts. |
| Q5 | Fiscal-emergency trigger | **C (Hybrid agent-driven + crisis context injection)**, symmetric with Q4. Coalition leader sees fiscal-pressure flags in `AgentContext` (provisional-budget streak, high-severity crisis). |
| Q5b | Schuldenbremse mechanics | **C (Bundestag vote + Nachtragshaushalt via existing budget machinery)**. Schuldenbremse-Aussetzung is a separate dramatic vote event; once passed, the supplementary budget flows through `tallyBudgetVote()` + `applyBudgetEconomicEffect()` via injection-queue path. Simple-majority threshold for the vote itself (real Bundestag uses qualified majority — flagged as Cycle 5+ refinement). |
| Q6 | Debate sub-formats | **C (Three sub-formats, all data-hooked)**. Kurzintervention + Zwischenfrage as deterministic flavor during `bill_first_reading` / `bill_second_reading` (30% each per reading). Erklärung zur Abstimmung fires post-`bill_third_reading` for each MdB seat with `disciplineLevel >= 1` AND vote ≠ party line. Ordnungsruf deferred (no misbehavior signal exists in current sim). |
| Q7 | Inquiry runtime | **A (Real-aligned, party-level)**. 180–540 sim days uniform draw; hearings every 30 sim days; max 2 active simultaneously; no per-seat `committee_memberships` rows. |
| Q8 | Migration | **In-place, idempotent, inline in `seed.ts::migrateDatabase()`**, guarded by single `cycle4Migrated` boolean. Same pattern as Cycles 1/2a/2b/3. |
| Q9 | Failure modes | **Soft-watchdog**: inquiries auto-conclude as "cleared" if `currentDay > scheduledEndDay + 30` without a hearing in the prior 60 days (prevents stuck inquiries from clogging the active-cap). Schuldenbremse expiry mid-Nachtragshaushalt: the Nachtragshaushalt completes on the day it enters the loop (within the same daily tick), so timing collision is impossible by construction — but the spec asserts this invariant explicitly. |

### Additional locked sub-decisions

- **S1. Inquiry conclusion outcome roll**: deterministic, weighted by govt approval at conclusion. `< 30%` govt approval → 70% wrongdoing-found; `30–50%` → 40%; `> 50%` → 20%. Per-RNG seeded helper extracted (project pattern).
- **S2. Inquiry approval impacts**: filing party `+0.3` on file (one-time); target party `-0.05/day` while active. Conclusion: wrongdoing-found → target `-1.5`, filer `+0.8`; cleared → target `+0.5`, filer `-0.3`.
- **S3. Schuldenbremse-Aussetzung duration**: 365 sim days. Coalition must re-file to extend.
- **S4. Nachtragshaushalt allocation**: auto-generated, crisis-weighted. Total amount: uniform draw 50–150B EUR. Allocation seed = base coalition allocation + `+30%` boost to the crisis category's mapped ministry.
- **S5. Erklärung zur Abstimmung mechanics**: fires once per `bill_third_reading` per discipline-breaking MdB. Templated description names MdB + bill + which-way-broke. Routine-tier classification.
- **S6. Kurzintervention + Zwischenfrage frequency**: 30% probability per `bill_first_reading` / `bill_second_reading` event for each sub-format (independent rolls). Two random parties chosen; speaker = bill-proposing party, interjector = random opposition party (Kurzintervention) or random non-bill-proposer (Zwischenfrage).
- **S7. Migration**: single `cycle4Migrated` meta flag. Migration block inserted at end of existing `migrateDatabase()` ordering. Wrapped in `sqlite.transaction()` per `tool-safety.md` discipline.
- **S8. Inquiry rate-limit**: minimum 60 sim days between inquiry filings globally (across all parties) to prevent agent-spam. Tracked via `simulation_meta.last_inquiry_filed_day`.
- **S9. Active-inquiry cap**: max 2 globally. Filing attempt while at cap returns a fixable error per the existing `action-parser.ts` validation pattern.
- **S10. RNG model**: same as Cycle 3 — `Math.random` in production, seeded RNG accepted as optional param in pure helpers for tests. End-to-end seeded RNG plumbing through `runDay()` remains deferred.
- **S11. Untersuchungsausschuss does NOT use the existing `committees` table.** That table is for standing bill-routing committees. New `inquiry_committees` table is dedicated to special-purpose inquiry committees — different lifecycle, different role, no member-roster (party-level only). Naming kept distinct to avoid confusion at consumer-code sites.
- **S12. Schuldenbremse vote tally**: reuses `tallyBudgetVote`-style helper but with no "revision" concept (one-shot vote). New pure helper `tallySchuldenbremseVote(parties, coalitionIds, sentiment)` — coalition typically yes, opposition mixed by sentiment + crisis severity.
- **S13. Nachtragshaushalt allocator** lives in `budget.ts` next to `generateBudgetAllocations`, named `generateNachtragsAllocations(coalition, crisisCategory, total)`. No new module.
- **S14. Inquiry-context injection**: opposition agent's `AgentContext` gains `inquiryOpportunity?: { triggerCrisisId; targetPartyId; severity }` flag, populated in `loop.ts` when a high-severity crisis fires that politically embarrasses the government. Coalition leader's context gains `fiscalEmergencyJustified?: { activeCrisisId; provisionalBudgetDays }` similarly. Both context fields are optional; absence means agents shouldn't file in a normal day. The agent prompt (`agent/prompt.ts`) gets a small section explaining when the flag means "this is a moment to act."
- **S15. Event-type tier classifications**: `inquiry_filed` → important; `inquiry_hearing_held` → standard (default — *not* in IMPORTANT_EVENTS or ROUTINE_EVENTS); `inquiry_concluded` → important; `schuldenbremse_aussetzung_*` → important (passed → critical); `nachtragshaushalt_*` → important; debate sub-formats (3) → routine. Cycle 3's review caught a default-tier mistake on `bill_ueberweisung_ohne_aussprache`; this cycle pre-classifies all 12 explicitly.
- **S16. Cycle 3 spec files cleanup**: PR 4 (final commit) deletes `docs/plans/043-cycle3-brainstorm.md` + `docs/plans/043-cycle3-spec.md`, mirroring the Cycle 2/3 housekeeping pattern. Done in the same commit as the debate-sub-format work; not a separate chore PR.

## Risks surfaced for the spec

These belong in the Cycle 4 spec, not the brainstorm — listed here so the spec author doesn't miss them.

- **R1**. Inquiry → target party `-0.05/day` for up to 540 days = up to `-27` cumulative approval. If applied alongside other approval drains (failed bills, Vertrauensfrage), party can sink into negative territory. Need clamp + cap on cumulative effect.
- **R2**. Schuldenbremse simple-majority deviation from real qualified-majority. Document explicitly; add to "Open items" for Cycle 5+.
- **R3**. Inquiry conclusion outcome `wrongdoing_found` against a party that has since left the coalition (or merged) needs a graceful "target party no longer exists" branch. Default: still apply impact to the recorded `targetPartyId` if party still exists; skip otherwise.
- **R4**. Nachtragshaushalt fires *outside* the regular 365-day budget cycle. Existing `isBudgetDay()` guard must NOT trigger Nachtragshaushalt processing — they share machinery but enter via different paths. Use `pending_injections` for the Nachtragshaushalt path (mirrors `triggerBudget` injection precedent).
- **R5**. Crisis-context injection (S14) requires identifying the "politically embarrassing for govt" subset of crises. Heuristic: `severity === "high"` AND crisis category maps to a coalition-held ministry. Document the heuristic; tunable.
- **R6**. Debate sub-format events fire 30% × 30% × N readings/day = potentially 0–6 sub-format events per active sitting day. With 1–2 readings/day average, expected ~0.6 sub-format events/day. Manageable; doesn't dominate the feed.
- **R7**. Erklärung zur Abstimmung depends on MdB seat data. Post-Cycle-3 the sim has 30% / 70% human-seat ratios depending on preset. In ultra-fast / fast presets with 0% humans, Erklärung still fires — discipline data exists for AI-controlled seats too (per `mdb-actions.ts` integration).
- **R8**. Active-inquiry cap = 2. If both slots are filled and a viable third filing opportunity arises, the agent will keep trying — wasting agent-action budget. Mitigation: agent prompt explicitly states "max 2 active globally" so agents self-throttle.
- **R9**. AI cost variance. With 0–2 active inquiries, cost ranges from $0/sim-day (0 active) to $0.001/sim-day (2 active during a hearing month). Expected average $0.0005/sim-day. Verify post-implementation with `logAICall` averages.
- **R10**. New event types added to `SimulationEventType` union (12 of them). The Cycle 6 housekeeping pass will need to verify none accidentally emit raw strings (escaping type safety as `member_proposal_*` did).
- **R11**. Cycle 3 review specifically praised R-item back-references in code comments. Cycle 4 must continue this — every non-obvious decision in implementation cites its R-number.
- **R12**. The `committees.ts` module exists for *standing* committees and shares infrastructure (table layout, member assignment) with what could naively be reused for Untersuchungsausschuss. Reuse rejected per S11 — different lifecycle, different role, different cleanup. Documented inline in both modules.

## Cost estimate

- **Per sim-day**: ~+$0.0005 (50% batch discount applied). Most days fire zero inquiry hearings; on hearing days, 1 batch item adds.
- **Term total** (4 years ≈ 1461 sim days): ~+$0.7. Rounding error in the project's existing per-term budget.
- **No new sequential AI calls** — all new AI usage flows through the existing `submitBatch()` path.

## Speed estimate

- Wall-clock per term: neutral. New event generation runs at daily-tick speed; AI summaries piggy-back on existing batch dispatch. No new blocking I/O.
- Per-day variance: minimal. Inquiry hearing days have 1 extra batch item; other days are unchanged.

## Implementation plan — 4 PRs (commits, no PRs until user says otherwise)

PR-style commits on `claude/sim-fidelity-cycle4` branch, mirroring Cycle 3's cadence. Each commit fully tested + typechecked + built. No GitHub PR until user explicitly says.

### PR 1 — Untersuchungsausschuss (heaviest)

`feat(sim-fidelity): Untersuchungsausschuss lifecycle + AI hearing summaries (Cycle 4 PR 1)`

- New table `inquiry_committees` in `db/schema-sim.ts` + DDL in `db/ddl.ts`
- 3 new event types in `types/meta.ts`: `inquiry_filed`, `inquiry_hearing_held`, `inquiry_concluded`
- Tier classification in `simulation/timing.ts` (per S15)
- New module `simulation/inquiry-committees.ts`: lifecycle helpers (`fileInquiry`, `tickActiveInquiries`, `concludeInquiry`), pure helpers (`shouldFireHearing`, `pickInquiryOutcome`, `applyInquiryImpact`)
- AI batch builder + result processor: `buildInquiryHearingBatchRequest()` + `processInquiryHearingBatchResult()` (mirrors media/summary patterns)
- Agent action `file_inquiry_committee` in `agent/action-parser.ts` with full validation (Fraktion + opposition + cap + rate-limit)
- `AgentContext.inquiryOpportunity` field populated in `loop.ts` from active high-severity crises (per S14)
- Loop integration: lifecycle tick after step 5 in `runDay()`; hearing batch dispatched in batch group A (party agents) or new batch group D
- `seed.ts::migrateDatabase()` block creates table + sets `cycle4Migrated` flag
- New constants in `config/parliament.ts`: `INQUIRY_DURATION_MIN = 180`, `INQUIRY_DURATION_MAX = 540`, `INQUIRY_HEARING_INTERVAL = 30`, `INQUIRY_MAX_ACTIVE = 2`, `INQUIRY_MIN_DAYS_BETWEEN_FILINGS = 60`, `INQUIRY_THRESHOLD_PERCENT = 0.25`, daily-pressure constants per S2
- Tests (+15): `inquiry-committees.test.ts` covering lifecycle, gate logic, conclusion outcome (50,000-trial LCG convergence), watchdog auto-conclude, rate-limit enforcement; `action-parser.test.ts` cases for new action validation

### PR 2 — Schuldenbremse-Aussetzung

`feat(sim-fidelity): Art. 115 GG fiscal emergency vote (Cycle 4 PR 2)`

- 3 new event types in `types/meta.ts`: `schuldenbremse_aussetzung_proposed`, `schuldenbremse_aussetzung_passed`, `schuldenbremse_aussetzung_rejected`
- Tier classification (S15): proposed → important, passed → critical, rejected → important
- `national_state.schuldenbremse_suspended` boolean column + `simulation_meta.schuldenbremse_suspended_until_day` integer column
- `seed.ts::migrateDatabase()` adds columns idempotently
- Pure helper `tallySchuldenbremseVote(parties, coalitionIds, sentiment, crisisSeverity)` in `simulation/budget.ts` next to `tallyBudgetVote`
- Lifecycle helper `applySchuldenbremseAussetzung()` + `checkSchuldenbremseExpiry()` (auto-clears flag at `currentDay >= suspendedUntilDay`)
- Agent action `propose_fiscal_emergency` in `agent/action-parser.ts` (coalition leader only, gated on active high-severity crisis OR `provisionalBudget` ≥ 30 days)
- `AgentContext.fiscalEmergencyJustified` populated in `loop.ts` (mirrors S14)
- Loop integration: vote tally + flag set at step 11d of `runDay()` (just before existing budget block)
- New constants in `config/budget.ts`: `SCHULDENBREMSE_SUSPENSION_DURATION = 365`, `FISCAL_EMERGENCY_COOLDOWN = 365`
- Tests (+8): vote tally convergence, expiry behavior, gate-open/closed conditions, action-parser validation

### PR 3 — Nachtragshaushalt

`feat(sim-fidelity): Nachtragshaushalt supplementary budget via emergency suspension (Cycle 4 PR 3)`

- 3 new event types in `types/meta.ts`: `nachtragshaushalt_proposed`, `nachtragshaushalt_passed`, `nachtragshaushalt_rejected`
- Tier classification (S15): all three → important
- New pure helper `generateNachtragsAllocations(coalition, crisisCategory, total)` in `simulation/budget.ts` (per S13)
- New constants in `config/budget.ts`: `NACHTRAGSHAUSHALT_TOTAL_MIN = 50`, `NACHTRAGSHAUSHALT_TOTAL_MAX = 150`, category→ministry boost map
- Loop integration: when `schuldenbremse_aussetzung_passed` event fires, queue a `pending_injections` row of type `nachtragshaushalt`. Existing budget-injection consumer handles it on next tick — flows through `tallyBudgetVote()` + `applyBudgetEconomicEffect()` (per Q5b/C)
- Optional `provisionalBudget` GDP-drag suppression while `schuldenbremseSuspended` (per economic-effect spec)
- Tests (+8): allocation generation per crisis category, integration with Schuldenbremse flag, GDP-drag suppression, budget-machinery reuse asserts

### PR 4 — Debate sub-formats + spec-file cleanup

`feat(sim-fidelity): Kurzintervention + Zwischenfrage + Erklärung zur Abstimmung (Cycle 4 PR 4)`

- 3 new event types in `types/meta.ts`: `kurzintervention`, `zwischenfrage`, `erklaerung_zur_abstimmung`
- All three → routine-tier in `simulation/timing.ts`
- New pure helpers in `simulation/bill-pipeline.ts` (or new `simulation/debate-formats.ts` if too crowded): `rollKurzintervention(rng?)`, `rollZwischenfrage(rng?)`, `pickRandomParties(parties, exclude, rng?)`
- Bill-pipeline integration: in the `bill_first_reading` and `bill_second_reading` event-emit branches, also fire 0–1 Kurzintervention + 0–1 Zwischenfrage events per S6
- Erklärung zur Abstimmung: in `bill_third_reading` post-vote block, iterate MdB votes; for each seat where `disciplineLevel >= 1` AND `vote !== party_line`, emit one event with templated description naming MdB + bill + direction-broke
- New constants in `config/parliament.ts`: `KURZINTERVENTION_PROBABILITY = 0.30`, `ZWISCHENFRAGE_PROBABILITY = 0.30`
- Tests (+10): seeded-RNG threshold-boundary tests (50,000-trial LCG), discipline-break detection, party-pick determinism
- **Final commit deletes `docs/plans/043-cycle3-brainstorm.md` + `docs/plans/043-cycle3-spec.md`** per S16

### Post-merge cleanup

Cycle 4 brainstorm + spec stay until cycle 4 itself ships; deleted in Cycle 5's final PR per the established pattern.

## Success criteria

- `npm run typecheck && npm test && npm run build` green on each of the 4 PR-commits.
- Seed + `simulate 1461` completes without error after all 4 commits.
- After a fresh `simulate 1461` (one full term ≈ 4 years):
  - Inquiry-filed events: 4–8 (per term), max 2 active simultaneously verified.
  - Inquiry-concluded events: equal to filed count - any active at term end.
  - Hearing-held events: ~6–18 per concluded inquiry.
  - Schuldenbremse-Aussetzung events: 0–2 per term (matches real-world frequency).
  - Nachtragshaushalt events: equal to passed Schuldenbremse-Aussetzung count.
  - Kurzintervention + Zwischenfrage event count ≈ 0.6 × bill-reading-event count (30% × 2 sub-formats).
  - Erklärung zur Abstimmung events: nonzero — sanity check that discipline-break detection fires.
- AI cost: `logAICall` averages stay flat ±$0.001/sim-day vs. pre-Cycle-4 baseline.
- Wall-clock per term: similar ±5% to Cycle 3 baseline.
- `cycle4Migrated` flag set on `simulation_meta`; idempotency verified by running migrate twice.

## Open items surfaced for later cycles

- **Schuldenbremse qualified-majority threshold** — real Bundestag uses qualified majority for Art. 115 GG suspension; spec uses simple majority for pragmatic simplification. Refine when a "qualified-majority vote" primitive is added (also unblocks Bundesrat Zustimmungsgesetz refinement). Cycle 5+.
- **Untersuchungsausschuss seat-level membership** — populating `committee_memberships`-style rows for inquiry committees (158 MdBs each). Required when seat-roster front-end becomes relevant. Cycle 5+.
- **Enquete-Kommission + Ausschussanhörungen** — both deferred this cycle pending external-expert-witness actor model. Plan a "Cycle 5: expert-witness infrastructure" cycle to unblock both at once.
- **Ordnungsruf** — requires MdB-misbehavior signal. Could hook into discipline-level escalations or profanity-flagged statements. Cycle 5+ polish.
- **Inquiry court powers** — minister summons, scandal-severity axis, multiple inquiry types. Cycle 5+ if narrative analysis shows current model is too thin.
- **Nachtragshaushalt agent customization** — currently formulaic; coalition agent could amend allocations within bounds. Cycle 5+ polish.
- **End-to-end seeded RNG plumbing** — same open item carried from Cycle 3.

## Next action

Write `docs/plans/043-cycle4-spec.md` in the same shape as the Cycle 3 spec (Decisions — Non-goals — Design per piece — Risks — Migration — 4 PR breakdown — Success criteria). Then implement piece-by-piece as commits on `claude/sim-fidelity-cycle4` branch. No pull requests until user says otherwise.
