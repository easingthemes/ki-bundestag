# 043 Cycle 3 — Spec + Implementation Plan (P2 frequency/timing refinement)

**Scope**: Tune existing mechanics — veto rate cap + impact gate, confidence-vote structural gates, government-bill committee multiplier flip, 735→630 seat reform, 60-day campaigns, 4–12-week negotiations, 65% Überweisung-ohne-Aussprache skip.
**Source**: [`043-cycle3-brainstorm.md`](./043-cycle3-brainstorm.md) (locked Q1–Q9), [`../todo/043-sim-timing-fidelity.md`](../todo/043-sim-timing-fidelity.md) §Cycle 3.
**Delete this file** once Cycle 3 has shipped.

## Decisions (locked)

Restated from the brainstorm + sub-decisions surfaced while designing.

| # | Question | Decision |
|---|----------|----------|
| Q1 | Sub-cycles? | **No.** One cycle, four PR-commits. |
| Q2 | Veto rate | **Hybrid**: cap probability at 0.05% AND gate on `bill.impact` magnitude (gate threshold = 0.6 summed absolute impact). Below threshold → veto cannot fire. Above → roll a 0.05% chance. |
| Q3 | Confidence votes | **Hybrid structural gate**. Vertrauensfrage gate: `approval < 25 for ≥30 days` AND `coalition seats < MAJORITY_SEATS + 5`. Misstrauensvotum gate: `opposition seats >= MAJORITY_SEATS - current_coalition_seats + 1` AND `current government has been in office ≥ 180 sim days`. Within an open gate, daily probability `0.005` per chamber direction (≈ 1.8/year if always gated). |
| Q4 | Government-bill committee multiplier | **Flip-only**: `stage_min_duration *= 1.3` for `isGovernmentBill === true`. No category layer. |
| Q5 | 735→630 seats | **Constants-only + proportional shrink**. `BUNDESTAG_SIZE = 630`, `MAJORITY_SEATS = 316`. Migration: rescale all `parties.seat_count` and `bundestag_seats` rows by `630 / sum(party.seat_count)`. Largest-remainder rounding, leftover seats to the largest party. |
| Q6 | Campaign duration | **Fixed 60 sim days** (announce → vote). Replaces today's ~21-day window. |
| Q7 | Negotiation duration | **Raise cap + slow pacing**. `MAX_NEGOTIATION_DAYS = 90`, new `MIN_NEGOTIATION_ROUND_DWELL_DAYS = 7`. Round dispatch in `loop.ts` skips a round if `currentDay - lastRoundDay < MIN_DWELL`. |
| Q8 | Überweisung ohne Aussprache | **Probability flag**, 65%. Stage 2 entry rolls `rng() < 0.65`; if true, emit `bill_ueberweisung_ohne_aussprache` and advance straight to committee, skipping `bill_first_reading`. |
| Q9 | Migration | **In-place, idempotent**, inline in `seed.ts::migrateDatabase()`. Same pattern as Cycles 1/2a/2b. |
| S1 | Veto-impact gate threshold | **0.6**, computed as `Object.values(bill.impact).reduce((s, v) => s + Math.abs(v), 0)`. Most bills land 0.2–1.0 in this metric; threshold of 0.6 keeps roughly the top tercile eligible. Tunable per real-data fit; revisit after a 4-year sim. |
| S2 | Confidence-vote gate "≥30-day low approval" tracking | **Reuse** existing `simulation_meta.low_sentiment_streak`. Already incremented in `loop.ts` when sentiment < 25. Mirror the same pattern for an `low_government_approval_streak` column added in this cycle's migration. |
| S3 | Konstruktives Misstrauensvotum candidate selection | **Largest opposition party with `seatCount >= FRAKTION_THRESHOLD`**. Must be Fraktion-bearing. Tie-break by approval rating, then party id. |
| S4 | Seat-reform migration ordering | **Run BEFORE Cycle 1's stage-entry-day backfill**, because stage-duration multipliers (Cycle 1) are seat-independent — but AFTER `parties` table exists. Migration block sits between current "stage_entry_day" backfill and the Cycle 2a kanzlerwahl backfill in `migrateDatabase()`. |
| S5 | Campaign-duration migration | **No retroactive adjustment.** Active elections at migration time keep their existing `electionDay`. New elections (announced after the migration) use the 60-day window. |
| S6 | Negotiation pacing migration | **No retroactive adjustment.** Active negotiations finish under old timing. New ones use the new MAX + dwell. |
| S7 | Überweisung event classification | **Not** in `IMPORTANT_EVENTS`. Frontend renders these as a one-line "Überwiesen" entry, not a full event card. |

## Non-goals

- No empirical fit of veto-impact threshold to historical data — tunable constant.
- No per-Land-government Misstrauensvotum modelling — single-chamber federal Bundestag only.
- No full BWahlG seat reapportionment — proportional shrink only. Exact reform mechanics (Zweitstimmendeckung) deferred to P3.
- No stochastic campaign duration — fixed 60 days. Revisit as P3 polish.
- No category-aware Überweisung skip — flat 65% probability.
- No change to Cycle 2a Bundesrat / Kanzlerwahl code paths.
- No change to Cycle 2b Parliamentary-QA / Aktuelle Stunde / Petitions code paths.

## Design — Piece 1: Veto rate cap + impact gate

`packages/engine/src/simulation/veto.ts` currently returns a probability scaled 1–6% by impact magnitude. New design — two-stage filter:

1. **Impact gate**: compute `summedImpact = Σ |bill.impact[k]|`. If `< 0.6`, return `false` (no veto possible).
2. **Capped probability**: above gate, roll a single `0.0005` (0.05%) chance.

Net effect: real-data-matched veto frequency. Most bills (`summedImpact < 0.6`) are immune; only constitutional-stakes bills are eligible, and even then only ~1-in-2000 fires. Over a full term (~80 passed bills/year * 4 years = 320), expected vetoes ≈ 0.05 — matching the historical ~0.04% rate.

Constants live in `packages/engine/src/config/voting.ts` (or `veto.ts` directly):

```ts
export const PRESIDENTIAL_VETO_PROBABILITY = 0.0005;
export const PRESIDENTIAL_VETO_IMPACT_THRESHOLD = 0.6;
```

`checkPresidentialVeto()` rewritten:

```ts
const summedImpact = Object.values(bill.impact).reduce((s, v) => s + Math.abs(v), 0);
if (summedImpact < PRESIDENTIAL_VETO_IMPACT_THRESHOLD) return false;
return rng() < PRESIDENTIAL_VETO_PROBABILITY;
```

No schema change. No new event type. Existing `presidential_veto` event still fires when a veto succeeds.

## Design — Piece 2: Vertrauensfrage / Misstrauensvotum structural gates

`packages/engine/src/simulation/confidence-votes.ts` is where these get filed. Today the loop fires them with too-high probability per day.

### Vertrauensfrage gate

```ts
function vertrauensfrageGateOpen(state: NationalState, gov: Government, day: number, lowApprovalStreak: number): boolean {
  if (lowApprovalStreak < 30) return false;                   // ≥30 days low approval
  const coalitionSeats = sumCoalitionSeats(state);
  if (coalitionSeats >= MAJORITY_SEATS + 5) return false;     // not fragile enough
  if (gov.formedOnDay > day - 90) return false;               // honeymoon cushion
  return true;
}
```

Inside the gate: roll `rng() < 0.005` per sim day → expected ~1.8 fires/year if always gated. In practice gates open intermittently → ~0.05/year actual.

### Misstrauensvotum gate

```ts
function misstrauensvotumGateOpen(parties: Party[], gov: Government, day: number): boolean {
  if (gov.formedOnDay > day - 180) return false;              // not in honeymoon
  const coalitionSeats = sumCoalitionSeats(parties, gov);
  const oppositionSeats = TOTAL_SEATS - coalitionSeats;
  if (oppositionSeats < (MAJORITY_SEATS - coalitionSeats + 1)) return false; // no path to majority
  // Konstruktiv: must have a Fraktion-bearing opposition leader
  const candidate = pickKonstruktivCandidate(parties, gov);
  return candidate !== null;
}
```

Inside the gate: roll `rng() < 0.005` per sim day. `pickKonstruktivCandidate` per S3.

### Tracking `low_government_approval_streak`

New column on `simulation_meta`:

```ts
lowGovernmentApprovalStreak: integer("low_government_approval_streak").notNull().default(0)
```

`loop.ts` increments it once per day (before the confidence-vote dispatch) when **government parties' weighted average approval < 25**, resets otherwise. Pure helper exposed from `confidence-votes.ts`.

### Constants

```ts
export const VERTRAUENSFRAGE_GATE_LOW_APPROVAL_DAYS = 30;
export const VERTRAUENSFRAGE_GATE_FRAGILE_MARGIN = 5;
export const MISSTRAUENSVOTUM_GATE_HONEYMOON_DAYS = 180;
export const CONFIDENCE_VOTE_DAILY_PROBABILITY = 0.005;
export const VERTRAUENSFRAGE_HONEYMOON_DAYS = 90;
```

## Design — Piece 3: Government-bill committee multiplier flip

`packages/engine/src/simulation/bill-pipeline.ts` calls `isGovernmentBill(bill)` to set stage durations. Today government bills get a *shorter* committee window. Real Bundestag is the opposite — government bills tend to be more complex.

One-line change at the stage-entry-day computation site:

```ts
let stageMin = BILL_STAGE_DURATIONS[stage].min;
let stageMax = BILL_STAGE_DURATIONS[stage].max;
if (stage === "committee" && isGovernmentBill(bill)) {
  stageMin = Math.round(stageMin * 1.3);
  stageMax = Math.round(stageMax * 1.3);
}
```

Constant in `config/parliament.ts`:

```ts
export const GOVERNMENT_BILL_COMMITTEE_MULTIPLIER = 1.3;
```

No event-type change, no schema change. Bills mid-flight at migration time keep their already-stored `stage_min_duration` — the multiplier only applies on new committee entries.


