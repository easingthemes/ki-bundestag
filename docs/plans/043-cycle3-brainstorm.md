# 043 Cycle 3 (P2) — Brainstorm + Locked Decisions

**Status**: Brainstorm. Decisions locked at bottom. Next step: spec + implement.
**Source**: [`../todo/043-sim-timing-fidelity.md`](../todo/043-sim-timing-fidelity.md) §Cycle 3.
**Preceding cycles shipped on this branch**: Cycle 1 (calendar + bill timing + KS), Cycle 2a (Bundesrat + Kanzlerwahl), Cycle 2b (Parliamentary-QA + Aktuelle Stunde + Einzelfragen + Petitions).

## Piece-by-piece survey

All seven pieces are **tuning existing mechanics**, not adding new ones. Blast radius per piece varies — some are one-line constants, some touch load-bearing code paths.

### 1. Presidential veto rate (1–6% → ~0.02%)

- Today: `checkPresidentialVeto` in `veto.ts` fires 1–6% based on impact magnitude. Bundespräsident has vetoed ~6 times in German history out of ~15_000 passed bills → real rate ≈ 0.04%.
- **A. Drop ceilings**: lower 6% max to 0.05%. One-constant change.
- **B. Impact-gate**: only run the probability roll when `bill.impact` summed exceeds a threshold.
- **C. Hybrid**: lower the max + gate on impact. Matches real pattern (only constitutional-doubt cases get vetoed).

*Recommendation: C.*

### 2. Vertrauensfrage / Misstrauensvotum rarity (0.05/yr each)

- Today: rolled in `loop.ts`'s confidence-vote branch with probabilities calibrated for the old 15-day sim-year. Fires too often. Real: Vertrauensfrage ~4 times/75 years, konstruktives Misstrauensvotum ~2/75 years → ~0.05/yr each.
- **A. Lower the raw probability**: multiply today's per-day rate by ~20×.
- **B. Structural gate**: only allow Vertrauensfrage when approval < 25% for ≥30 days *and* coalition is fragile (seat majority < 5 over threshold); only allow Misstrauensvotum when a viable alternative coalition exists (opposition ≥ MAJORITY_SEATS - current coalition seats).
- **C. Hybrid**: structural gates + low probability *within* gated windows.

*Recommendation: C.*

### 3. Reverse government-bill fast-track (bug)

- Today: `bill-pipeline.ts` + the `isGovernmentBill` check give government bills shorter committee durations. **Real Bundestag is the opposite**: government bills tend to be broader, harder, and spend MORE weeks in committee (not fewer) because ministries bundle multiple items.
- **A. Flip the multiplier**: government bills → `stage_min_duration * 1.3`, non-government → unchanged.
- **B. Category-aware**: also lengthen complex categories (`defense`, `infrastructure`, `economy`).

*Recommendation: A. B is polish for a later cycle.*

### 4. 735 → 630 seats (2023 Wahlrecht reform)

- Today: `MAJORITY_SEATS = 368` (of 735). Real 2023 reform caps seats at 630 (no Überhang/Ausgleichsmandate). Majority = 316.
- **A. Constants-only**: drop `MAJORITY_SEATS` + `BUNDESTAG_SIZE` constants. Migration: proportionally shrink existing `party.seatCount` values.
- **B. Full seat redistribution**: rerun apportionment from vote-share. Heavier.
- **C. Constants-only + mid-flight migration for active term**: a proportional shrink feels correct for sim continuity; exact post-reform apportionment is a P3 topic once Wahlrecht voting modeling matures.

*Recommendation: C.*

### 5. Campaign duration (21 → 42–84 days)

- Today: `ELECTION_COOLDOWN_DAYS` and announcement → vote gap is ~21 sim days. Real: Bundestag election announcement → election is 42–84 days by law (Art. 39 GG + BWahlG).
- **A. Fix at 60 sim days** (roughly median of 42–84).
- **B. Stochastic draw from 42–84**.
- **C. Tied to scheduling context**: snap-election → min 42, regular-term → max 60+.

*Recommendation: A.*

### 6. Coalition negotiation duration (3 → 4–12 sim weeks)

- Today: negotiations resolve in ~3 days (`MAX_NEGOTIATION_DAYS ≈ 10`, `getMaxNegotiationRounds()` = 3). Real: 2021 Ampel took 72 days, 2017 Jamaica-then-GroKo took 171 days. Target: 28–84 sim days (4–12 weeks) with a drawn duration per election.
- **A. Extend `MAX_NEGOTIATION_DAYS` to 90**. Interacts with Cycle 2a R13 safety-net branch (`loop.ts:555–647`) — that branch force-completes after the max. Raising the cap = fewer emergency bailouts, which is good.
- **B. Per-round pacing change**: longer dwell between negotiation rounds so rounds spread naturally over 28–84 days.

*Recommendation: A + B.* Raise the cap AND slow the pacing so negotiations organically stretch rather than clustering on sequential days.

### 7. Überweisung ohne Aussprache (skip 1st-reading debate)

- Today: every bill goes through `bill_first_reading` plenary event in Stage 2. Real: ~60–70% of bills are silently referred to committee without debate — "Überweisung ohne Aussprache".
- **A. Probability flag**: at Stage 2 entry, roll `shouldSkip = rng() < 0.65`. If true, bypass `bill_first_reading` event and go straight to committee. Emit a lightweight `bill_ueberweisung_ohne_aussprache` event so the frontend can show a compact "Überwiesen" entry.
- **B. Category-gated skip**: high-impact or first-of-category bills always debate; repeat-style bills skip.

*Recommendation: A.* B is P3 polish.

## Cost/speed impact

- Cost: neutral. No new AI calls. Fewer `bill_first_reading` events reduces speech load slightly; longer negotiations add 1–2 extra negotiation-round batches per election (rare event). Net: −$0.0005/sim-day.
- Speed: +5–10% wall-clock per term. Longer campaigns + negotiations compress less; fewer 1st-reading event-generation cycles cancel most of that out.
- Event volume: down ~10% (1st-reading skips dominate). Vertrauensfrage/Misstrauensvotum drops from multi-per-term to sub-per-term — big realism win.

## Open brainstorming questions

- **Q1.** Ship as one cycle, or split 3a (piece #4 seat-reform + #6 negotiation) and 3b (rest)?
- **Q2.** Veto rate — pure drop (A), impact-gate (B), or hybrid (C)?
- **Q3.** Confidence votes — raw-probability drop (A), structural gate (B), or hybrid (C)?
- **Q4.** Government bills — flip-only (A) or category-aware (B)?
- **Q5.** 735→630 seats — constants-only with proportional migration (A), full reapportionment (B), or hybrid (C)?
- **Q6.** Campaign duration — fixed 60 days (A), stochastic 42–84 (B), or context-aware (C)?
- **Q7.** Negotiation duration — raise cap only (A), raise cap + slow pacing (B)?
- **Q8.** Überweisung — probability flag (A) or category-gated (B)?
- **Q9.** Migration strategy for in-flight seats / in-flight negotiations when this cycle lands — migrate, or let them run out on old rules?

---

## Decisions (locked)

Applying Cycle-2 principles — viewer value ↑, cost small, prefer structural correctness over knob-tuning where blast radius is low.

| # | Question | Decision |
|---|----------|----------|
| Q1 | Split into sub-cycles? | **No.** Seven pieces, mostly one-file knob tuning. Ship as Cycle 3 in 4 PR-commits — unlike 2a/2b, no piece needs more than ~100 LOC + tests. |
| Q2 | Veto rate | **C (Hybrid)**: impact-gate + cap at 0.05% max. Matches real Bundespräsident behaviour — vetoes are reserved for constitutional-doubt cases. |
| Q3 | Confidence votes | **C (Hybrid)**: structural gates (approval floor + coalition fragility; opposition-majority precondition for Misstrauensvotum) + residual probability within the gate. Gate primary, probability secondary. |
| Q4 | Government bills | **A (Flip-only)**: `stage_min_duration *= 1.3` for government-flagged bills, no category layer. One-line code change. |
| Q5 | 735→630 seats | **C (Constants-only + proportional shrink migration)**. `BUNDESTAG_SIZE = 630`, `MAJORITY_SEATS = 316`. Migration rescales in-flight `party.seatCount` proportionally. Full BWahlG reapportionment is P3+. |
| Q6 | Campaign duration | **A (Fixed 60 days)**. Median of the real-world 42–84 range; deterministic for tests. Stochastic (B) is a later refinement. |
| Q7 | Negotiation duration | **B (Raise cap + slow pacing)**. `MAX_NEGOTIATION_DAYS = 90`, inter-round dwell ≥ 7 sim days. Together these stretch negotiations to 28–84 days organically. The Cycle 2a R13 safety-net branch continues to act as a backstop but should fire rarely now. |
| Q8 | Überweisung | **A (Probability flag)**. Skip `bill_first_reading` on 65% of bills, emit `bill_ueberweisung_ohne_aussprache` instead. Frontend renders these compactly. |
| Q9 | Migration | **In-place**: proportional seat shrink for seed and mid-flight; in-flight elections keep their current campaign/negotiation window but any election started after this cycle ships uses the new constants. Follows Cycle 1/2a/2b migration pattern (inline in `seed.ts::migrateDatabase()`). |

### Additional locked details

- **Pieces #1–#3 live in existing files** (`veto.ts`, `confidence-votes.ts`, `bill-pipeline.ts`). No new modules.
- **Piece #4** touches `config/parliament.ts` (`BUNDESTAG_SIZE`, `MAJORITY_SEATS`) + `seats.ts` (allocation). One migration block for existing `party.seatCount` + `bundestag_seats` rows.
- **Pieces #5 + #6** touch `config/elections.ts` (`ELECTION_COOLDOWN_DAYS`, `MAX_NEGOTIATION_DAYS`, `MIN_NEGOTIATION_ROUND_DWELL_DAYS`).
- **Piece #7** adds one event type `bill_ueberweisung_ohne_aussprache` (not IMPORTANT_EVENTS — compact feed surface).
- **Event types net delta**: +1 (`bill_ueberweisung_ohne_aussprache`).

## Cost estimate

- Per sim-day: ≈ flat (−$0.0005).
- Term total: similar. Fewer 1st-reading speeches cancel with slightly-longer negotiations.

## Next action

Write `docs/plans/043-cycle3-spec.md` in the same shape as the 2a/2b specs (Decisions — Non-goals — Design per piece — Risks — Migration — 3–4 PR breakdown — Success criteria). Then implement piece-by-piece as commits on this same branch. No pull requests until you say otherwise.
