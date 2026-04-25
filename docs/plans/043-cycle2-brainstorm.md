# 043 Cycle 2 (P1) — Brainstorm + Locked Decisions

**Status**: Brainstorm complete, decisions locked. Ready for Cycle 2a spec.
**Source**: [`../todo/043-sim-timing-fidelity.md`](../todo/043-sim-timing-fidelity.md) §Cycle 2, branch `claude/sim-timing-brainstorm-GwtKT`.
**Next step**: Write `docs/plans/043-cycle2a-spec.md` (Bundesrat Länder model + Kanzlerwahl 3-phase), then implement, verify, then spec 2b.

## Piece-by-piece survey

### 1. Bundesrat voting + Vermittlungsausschuss

Extends Cycle 1 PR 3's auto-cleared dwell timer with real decision logic.

- **A. Probabilistic** — categorize bill → 30% Zustimmungsgesetz, 70% Einspruchsgesetz. Zustimmung: 80% pass / 20% Vermittlungsausschuss. Einspruch: 5% Einspruch filed, Bundestag overrides in 80% of those. Vermittlungsausschuss takes 14–56 sim days, 60% success rate.
- **B. Full Bundesrat model** — track 16 Länder, Land governments, weighted votes. Needs a Land-government update hook after Landtagswahlen (not simulated either).
- **C. Category-driven** — hard-code Zustimmung requirement per `BillCategory` (e.g. economy + infrastructure = Zustimmung; rest = Einspruch). Simpler than A, sharper than random.

*Preliminary recommendation:* C + A-probabilities hybrid.

### 2. Kanzlerwahl (Art. 63 GG, 3-phase)

Today: `formCabinet()` fires at coalition completion, Chancellor = Fraktion leader of coalition leader. No actual vote.

- **A. Always Phase 1** — single vote, pass/fail based on coalition seats ≥ MAJORITY_SEATS. Since 1949 this is what actually happens 100% of the time.
- **B. Phase 1 + conditional Phase 2** — if coalition < majority, roll Phase 2 (relative majority). Matches historical frequency without modeling a phase we never hit.
- **C. Full 3-phase** — Phase 2 has 14-day window, Phase 3 → Bundespräsident decision (dissolve or appoint with relative majority). Never happened in Bundestag history.

*Critical constraint:* split coalition-completion from cabinet formation. Currently they fire the same day (loop.ts at completion). New sequence: coalition agreement → konstituierende Sitzung → Kanzlerwahl → Amtseid → cabinet formation. This touches PR 4's KS timing (which already defers Fraktionsbildung).

### 3. Regierungsbefragung + Fragestunde (weekly)

Pure parliament-calendar events. No new AI calls strictly required — both are procedural.

- **A. Emit-only** — `getWeekdaySemantic` already tags Wed as `regierungsbefragung`. On every Wed Sitzungstag emit a `regierungsbefragung` event with a crisis/bill-derived topic. Fragestunde: emit once per Sitzungswoche. No narrative content.
- **B. Mini-AI** — Minister-agent generates a 2-sentence answer to a single question. One extra batch call per week.

### 4. Aktuelle Stunde (crisis-hooked)

Today: `crisis_start` fires, no parliamentary response. Real: 2–4/month.

- Hook on `crisis_start` AND a baseline random trigger (to maintain cadence). Schedule Aktuelle Stunde for next Thursday Sitzungstag. Content: AI-generated opposition/government 2-liner pair, or reuse existing crisis-narrative data (cheaper).

### 5. Schriftliche Einzelfragen (volume miss — ~33/day)

Single biggest volume gap. Cost trap if done naively (50k AI calls/term).

- **A. Counter-only** — daily event `schriftliche_einzelfragen` with `{ filedCount, answeredCount }`. Zero AI cost. News feed shows "Heute: 38 schriftliche Einzelfragen eingereicht, 22 beantwortet".
- **B. Template pool** — pre-generated question templates × ministry categories, deterministic substitution. Still zero AI cost. Surfaces actual question text occasionally.
- **C. Fully AI** — prohibitive at scale.

### 6. Petitions (citizen-side)

Today: `citizen_questions` (sim-only). Real: ~50k/term, 20–40 öffentliche Petitionen reach 30k quorum.

- **A. Extend `citizen_questions`** with `isPetition`, `signatureCount`, `signatureQuorum`. Reuses moderation/notification flow. Minor schema change.
- **B. New `petitions` table** — cleaner separation, but doubles the surface area.

## Proposed scope cut

Six pieces is too much for one cycle. Two natural sub-cycles:

**Cycle 2a (legislative/government formation)** — tightly coupled, both touch Cycle 1 plumbing:
1. Bundesrat voting + Vermittlungsausschuss (extends PR 3)
2. Kanzlerwahl 3-phase (splits government formation across KS → Kanzlerwahl → cabinet)

**Cycle 2b (weekly/volume/citizen)** — independent of 2a, additive:
3. Regierungsbefragung + Fragestunde (weekly)
4. Aktuelle Stunde (crisis-hooked)
5. Schriftliche Einzelfragen (counter + template)
6. Petitions (citizen-side)

2a ships first because it closes out Cycle 1's open ends. 2b ships in a second wave without blocking 2a.

## Open brainstorming questions

- **Q1.** Split Cycle 2 into 2a + 2b, or ship all six in one cycle?
- **Q2.** Bundesrat: hybrid C+A, pure probabilistic A, or full Länder model B?
- **Q3.** Kanzlerwahl phases: B (1 + conditional 2) or C (full 3-phase)?
- **Q4.** Schriftliche Einzelfragen: counter-only A, template B, or hybrid A+B?
- **Q5.** New event types this cycle (non-goal was "no new types" in Cycle 1)? Unavoidable — ballpark 8–12 new types across 2a+2b: `bundesrat_vote`, `vermittlungsausschuss_*`, `kanzlerwahl_*`, `amtseid`, `regierungsbefragung`, `fragestunde`, `aktuelle_stunde`, `schriftliche_einzelfrage`, `petition_*`.
- **Q6.** Cost budget: conservative (all template/counter, net AI cost ≈ 0) or include minister answers to Regierungsbefragung + Aktuelle Stunde AI content (+~$0.003/sim day)?

## Expected cost/speed impact (preliminary)

- **2a alone**: negligible. Pipeline changes + one new Kanzlerwahl batch every ~4 years.
- **2b alone**: +10% event volume (Schriftliche Einzelfragen counters dominate). Cost neutral if Q6=conservative.
- **Combined 2a+2b**: sim days with budget/crisis cluster become event-dense. Frontend news feed pagination becomes more important.

---

## Decisions (locked)

Applying the three principles — viewer value ↑, cost small ↑ coverage, cost plummet → middle ground.

| # | Question | Decision |
|---|----------|----------|
| Q1 | Split into 2a + 2b? | **Yes, split.** 2a first (closes Cycle 1 open ends), then 2b (additive). Same branch, staged cycles. |
| Q2 | Bundesrat model | **Full 16-Länder model, static compositions seeded from current real distribution.** No AI cost; seeing "Bayern dagegen, NRW enthält sich" is major viewer drama. Landtagswahlen simulation deferred to Cycle 3+. |
| Q3 | Kanzlerwahl phases | **Full 3-phase (Art. 63 GG)**, Phase 3 simplified to "Bundespräsident appoints relative-majority winner" (no dissolution path until Bundespräsident modeling lands). Negligible cost, rare event, dramatic when it fires. |
| Q4 | Schriftliche Einzelfragen | **Counter + template hybrid, no AI.** Pure AI would plummet cost — take the middle ground: headline volume preserved, template-driven highlights, zero AI cost. |
| Q5 | New event types | **Accept all (~8–12).** Don't contort existing types. |
| Q6 | Cost budget | **Mid-level**: Regierungsbefragung + Fragestunde as AI-generated content — Minister answers 2–3 MdB questions per session, batched weekly (~176 batch calls/term). Aktuelle Stunde: fresh AI content with real party positions on the triggering crisis (~100–200/term). Viewer value high, cost small. |

### Additional locked details

- **Piece 3 (Regierungsbefragung + Fragestunde)**: AI-generated — Minister answers 2–3 MdB questions per session, batched weekly. ~176 batch calls/term.
- **Piece 4 (Aktuelle Stunde)**: Fresh AI content with real party positions on the triggering crisis. ~100–200/term. This IS the crisis-response drama.
- **Piece 6 (Petitions)**: New `petitions` table (option B, not A). Distinct semantics from `citizen_questions` (signature quorum, Petitionsausschuss, öffentliche path). Watching a counter climb to 30k quorum is direct viewer drama.

## Cost estimate (total across 2a + 2b)

- **2a**: ~1 batch/term (Kanzlerwahl). Negligible.
- **2b**: ~280 batches/term (Regierungsbefragung, Fragestunde, Aktuelle Stunde). Rough estimate: +$0.002–$0.004 per sim day vs Cycle 1. Still well under the $0.025/day ceiling.

## Next action

Write the Cycle 2a spec (`docs/plans/043-cycle2a-spec.md`): Bundesrat Länder model + Kanzlerwahl 3-phase. PR breakdown, interaction risks, migration strategy — same template as Cycle 1 spec. Then implement 2a, verify, then spec 2b.
