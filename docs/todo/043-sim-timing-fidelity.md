# 043 — Sim Events 1:1 Fidelity to Real Bundestag

**Status**: Ready for brainstorm (P0 cycle) · Subsequent cycles queued (P1–P4)
**Area**: Engine / DB / Simulation
**Priority**: Critical
**Blocks**: [041 Phase 2 (AI party debates)](./041-debate-visibility.md)

## Why this exists

Project thesis: the simulation must be a **1:1 interpretation of the real Bundestag, just at compressed speed of time**. If the sim diverges structurally — missing events, wrong frequencies, impossible timing — it becomes a stylised toy, not a research tool or faithful civic-tech simulation.

A full sim-vs-reality audit has been completed. See:

- [`../research/sim-events.md`](../research/sim-events.md) — every event the sim currently emits (42 types + 5 dead types + 12 agent actions)
- [`../research/real-events.md`](../research/real-events.md) — every procedural event in the real Bundestag (~90 types, cited to GO-BT / Grundgesetz / BWahlG / BVerfGG)
- [`../research/sim-vs-real-gaps.md`](../research/sim-vs-real-gaps.md) — **side-by-side comparison with priority classes P0–P4**

**Current coverage: ~35–40% of the real event repertoire.** Most of what IS modelled is compressed beyond recognition (e.g. bill committee phase: 6–12 real weeks → 1 sim day).

## How to resume in a fresh session

Read in this order:

1. This file (overview, scope, cycle plan)
2. [`../research/sim-vs-real-gaps.md`](../research/sim-vs-real-gaps.md) — the prioritised action list (start at §13 "Prioritised remediation plan")
3. Dive into [`../research/real-events.md`](../research/real-events.md) and [`../research/sim-events.md`](../research/sim-events.md) only when you need detail on a specific event during brainstorming

Then invoke the `superpowers:brainstorming` skill with Cycle 1 (P0) as the scope. Do NOT try to brainstorm P0+P1+P2 in one session — they are independent cycles and conflating them will produce a vague plan that pleases no one.

## Cycle plan

Each cycle = one brainstorm + one spec + one implementation plan + one execution sweep. Do not start Cycle N+1 until Cycle N has shipped.

### Cycle 1 — P0 Foundational (next)

**Three tightly coupled pieces that must land together:**

1. **Parliamentary calendar structure**
   - Sitzungswochen vs. sitzungsfreie Wochen (~20–22 sitting weeks/year)
   - Sommerpause (~7–8 weeks, mid-July to early-September)
   - Weihnachtspause (~3–4 weeks)
   - Haushaltswoche (concentrated budget weeks)
   - Weekday semantics (Tue Fraktion, Wed Regierungsbefragung, Thu/Fri plenum)
   - Route every existing plenary event through `isSitzungsTag(day)` before firing
2. **Bill pipeline timing**
   - Committee phase: 6–12 weeks for ordinary bills, 3–6 months for complex
   - Bundesrat phase: 3–6 weeks (Zustimmungsgesetz vs. Einspruchsgesetz split)
   - Vermittlungsausschuss: 2–8 weeks if invoked
   - Ausfertigung + Verkündung: 2–6 weeks
   - Default Inkrafttreten: +14 days after BGBl publication
   - Data model: add `bill.stageEntryDay`, per-stage minimum duration, bundesrat state
3. **Konstituierende Sitzung**
   - ≤30 days post-election (Art. 39 Abs. 2 GG)
   - Blocks all plenary events between election day and konstituierende Sitzung
   - Formal Präsidentenwahl + Fraktionsbildung happen here, not instantly

**Open brainstorming questions** (answer during Cycle 1 brainstorm):

- Use the real 2026 Bundestag Sitzungskalender, or an abstract 1-on-2-off pattern?
- Bill stage durations: fixed ranges per category, or stochastic draw from empirical distribution?
- Migration strategy: bills in flight when new rules ship — migrate to new stage-entry-day, or wipe?
- Calendar rules: opt-in via new preset, or retrofit all existing presets?

**Expected cost/speed impact** (from preliminary modelling):

- Cost: roughly flat to −20% per sim day (fewer daily events but denser when they do fire)
- Speed: −40 to −50% wall-clock per full 4-year term (from ~30 days to ~15–20)
- Per-day variance much higher (recess days nearly free, sitting days similar to today)

### Cycle 2 — P1 Major missing events

After P0 stabilises:

- Bundesrat phase + Vermittlungsausschuss (bill finalisation)
- Kanzlerwahl 3-phase (Art. 63 GG) + Amtseid + erste Regierungserklärung
- Regierungsbefragung (weekly, Sitzungsmittwoch) + Fragestunde (weekly Sitzungswoche)
- Aktuelle Stunde (2–4/month, crisis-hooked)
- Schriftliche Einzelfragen (~50,000/term — #1 volume event missing)
- Petitions system (including Öffentliche E-Petition with 30,000 quorum)

### Cycle 3 — P2 Refine existing

- Presidential veto rate: 1–6% → ~0.02%
- Vertrauensfrage/Misstrauensvotum rarity (0.05/yr each, structural gates)
- **Reverse** government-bill fast-track (real: MORE time, not less)
- 735 → 630 seats (2023 Wahlrecht reform); remove Überhang/Ausgleichsmandate
- Campaign duration: 21 → 42–84 days
- Coalition negotiation: ~3 sim days → 4–12 sim weeks
- Erste Lesung "Überweisung ohne Aussprache" — skip debate for 60–70% of bills

### Cycle 4 — P3 Structural additions

- Untersuchungsausschuss (25% MdB, 1–4 year duration, court-like powers)
- Enquete-Kommission (25% MdB, 2–4 years)
- Ausschussanhörungen (committee public hearings)
- Debate sub-formats: Kurzintervention, Zwischenfrage, Erklärung zur Abstimmung, Ordnungsruf
- Nachtragshaushalt, Schuldenbremse-Aussetzung (Art. 115 GG)

### Cycle 5 — P4 Ceremonial + completeness

- Bundesversammlung (Bundespräsident election, 5-year cycle)
- Gedenkstunden (Holocaust-Gedenken 27.1., Tag der Einheit 3.10., 17. Juni)
- Wehrbeauftragter Jahresbericht, PKGr
- Immunität/Indemnität, Sitzungsausschluss, Ordnungsruf

### Cycle 6 — Housekeeping

- Remove or emit: `bill_debate`, `election_voting`, `referendum`, `poll`, `media` (declared-but-dead types)
- Add to `SimulationEventType` union: `member_proposal_accepted`, `member_proposal_declined` (currently escape type-safety via raw string inserts)
- Classify "sim-only" events (economy_update, crisis_start, sidejob_scandal, statement, weekly/monthly_report, discipline) as sim-meta, not Bundestag events — possibly move to a distinct event stream

## Affected areas (Cycle 1 scope only)

- `packages/engine/src/simulation/calendar.ts` — extend with Sitzungswochen, recess detection
- `packages/engine/src/simulation/timing.ts` — calendar-aware event gating constants
- `packages/engine/src/simulation/loop.ts` — route plenary events through `isSitzungsTag()`
- `packages/engine/src/simulation/bill-pipeline.ts` — per-stage minimum duration, committee phase extension
- `packages/engine/src/simulation/elections.ts` — konstituierende Sitzung scheduling
- `packages/engine/src/db/schema.ts` — `bill.stageEntryDay`, bundesrat state, konstituierende_sitzung_day on elections
- `packages/engine/src/config/parliament.ts` — stage duration distributions
- DB migration script for in-flight bills

## Explicit non-goals for Cycle 1

- Do **not** add any new event types
- Do **not** touch party-agent prompts
- Do **not** reduce event frequencies yet (P2)
- Do **not** model Bundesrat composition/voting logic yet — just the timing phase
- Do **not** model committee membership, Berichterstatter roles, or Anhörungen yet — that's P3

## Notes

- The 50% batch-API discount means the realistic cost ceiling is ~$0.025/sim day (down from $0.028) if batching discipline is maintained. Naive implementation of new events (Schriftliche Einzelfragen especially) could push cost up 30–50% — so batching strategy is part of the brainstorm, not an afterthought.
- Sim-only systems (economy, crisis, sidejobs) have no Bundestag-event equivalent but drive narrative. Keep them; re-label as "sim-meta" to preserve the 1:1 claim for genuine Bundestag events.
- [`../research/bundestag-reference.md`](../research/bundestag-reference.md) covers bodies and abstract action categories — complements this fidelity work rather than duplicating it.
