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

Constants live in `packages/engine/src/config/budget.ts` (next to existing veto-related config like `VETO_REASONS` and `VETO_PROPOSER_APPROVAL_PENALTY`):

```ts
export const PRESIDENTIAL_VETO_PROBABILITY = 0.0005;
export const PRESIDENTIAL_VETO_IMPACT_THRESHOLD = 0.6;
```

The 7 old veto-tuning constants (`VETO_BASE_PROBABILITY`, `VETO_SENTIMENT_THRESHOLD/_BONUS`, `VETO_BUDGET_THRESHOLD/_BONUS`, `VETO_GDP_THRESHOLD/_BONUS`) are removed in the same commit — only `shouldPresidentVeto` consumed them.

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
export const VERTRAUENSFRAGE_HONEYMOON_DAYS = 90;
```

`CONFIDENCE_VOTE_DAILY_PROBABILITY = 0.005` (residual roll inside open gates) is **deferred** in PR 2. Rationale: the gate filter applied to existing agent actions empirically rate-limits to the target ~0.05/yr — agents already fire `call_vertrauensfrage` / `file_misstrauensvotum` actions; gating those is sufficient. Re-introduce as a forced trigger only if a 4-year sim shows agents systematically failing to fire during open windows.

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

Constant in `config/parliament.ts` (next to `BILL_STAGE_DURATIONS`, where bill-pipeline timing constants already live):

```ts
export const GOVERNMENT_BILL_COMMITTEE_MULTIPLIER = 1.3;
```

Applied at the single edit point `committeeRange()` in `bill-pipeline.ts:47-51`, which is the choke-point for both the proposed→committee (gov bill direct path) and first_reading→committee (non-gov path) flows.

No event-type change, no schema change. Bills mid-flight at migration time keep their already-stored `stage_min_duration` — the multiplier only applies on new committee entries.

## Design — Piece 4: 735 → 630 seats (2023 Wahlrecht reform)

Today `config/elections.ts` exports `TOTAL_SEATS = 735` and `MAJORITY_SEATS = 368`. The 2023 Wahlrechtsreform caps the Bundestag at 630 seats (no Überhang/Ausgleichsmandate). Majority becomes 316.

### Constant changes (`config/elections.ts`)

```ts
// Rename + revalue. Both names continue to work via re-export to avoid
// touching every callsite in one PR — see migration ordering below.
export const BUNDESTAG_SIZE = 630;
export const MAJORITY_SEATS = 316;

/** @deprecated Use BUNDESTAG_SIZE. Kept as alias for one cycle. */
export const TOTAL_SEATS = BUNDESTAG_SIZE;
```

`MAJORITY_SEATS` is consumed by 9+ sites — `voting.ts`, `loop.ts` (kanzlerwahl description), `elections.ts` (coalition formation), `confidence-votes.ts`, `kanzlerwahl.ts`, `bundesrat.ts`, plus tests. All read the constant; none hardcode the number, so a single edit propagates.

`TOTAL_SEATS` has fewer consumers but is referenced in the hardcoded German prompt at `negotiations.ts:38` (`"Eine Koalition braucht 368+ Sitze (Mehrheit von 735)"`). That string must be updated to `"316+ Sitze (Mehrheit von 630)"` — the prompt-side change is a separate concern from the constant rename and is grouped with this piece.

### Seat reapportionment

Algorithm in `seats.ts::allocateBundestagSeats()` reapportions seats from vote share for new elections — its output dimension is parameterised on a constant. Switching that constant from `TOTAL_SEATS=735` to `BUNDESTAG_SIZE=630` is sufficient for all post-migration elections.

For mid-flight `parties.seat_count` rows (i.e. the currently-sitting Bundestag at migration time), proportional shrink:

```ts
function rescaleSeatsToBundestag(parties: Party[], target: number): Party[] {
  const total = parties.reduce((s, p) => s + p.seatCount, 0);
  if (total === target) return parties;                       // already aligned
  const scaled = parties.map(p => ({
    ...p,
    rawSeats: (p.seatCount / total) * target,
  }));
  // Largest-remainder rounding
  const floors = scaled.map(p => ({ ...p, intSeats: Math.floor(p.rawSeats), remainder: p.rawSeats - Math.floor(p.rawSeats) }));
  const sumFloors = floors.reduce((s, p) => s + p.intSeats, 0);
  let leftover = target - sumFloors;
  const sortedByRemainder = [...floors].sort((a, b) => b.remainder - a.remainder);
  for (let i = 0; i < sortedByRemainder.length && leftover > 0; i++) {
    sortedByRemainder[i].intSeats += 1;
    leftover -= 1;
  }
  // Tie-break: any remaining leftover goes to the party with the highest seat
  // count after the round (deterministic; only relevant when remainders are
  // exactly equal — vanishingly rare with 16-decimal-bit floats).
  if (leftover > 0) {
    sortedByRemainder.sort((a, b) => b.intSeats - a.intSeats);
    sortedByRemainder[0].intSeats += leftover;
  }
  return parties.map(p => ({ ...p, seatCount: floors.find(f => f.id === p.id)!.intSeats }));
}
```

Identical helper applied to `bundestagSeats` (MdB-seat) rows for the same proportional rescale. Sum-invariant: ∑seats == 630 after the rescale.

### Migration block (in `seed.ts::migrateDatabase()`)

Order matters per S4: **runs AFTER the `parties` table exists, BEFORE Cycle 1's stage-entry-day backfill, BEFORE Cycle 2a's kanzlerwahl synthetic-row backfill.** Idempotency: guarded by `meta.bundestagSizeMigrated === true`.

```ts
// Cycle 3 — proportional shrink to 630 seats
if (!meta.bundestagSizeMigrated) {
  const partyRows = db.select().from(schema.parties).all();
  const total = partyRows.reduce((s, r) => s + r.seatCount, 0);
  if (total > 0 && total !== BUNDESTAG_SIZE) {
    const rescaled = rescaleSeatsToBundestag(partyRows, BUNDESTAG_SIZE);
    for (const p of rescaled) {
      db.update(schema.parties).set({ seatCount: p.seatCount }).where(eq(schema.parties.id, p.id)).run();
    }
    // Same operation for bundestag_seats (MdB seats)
    const seatRows = db.select().from(schema.bundestagSeats).all();
    if (seatRows.length > 0) {
      const seatTotal = seatRows.reduce((s, r) => s + r.totalSeats, 0);
      if (seatTotal !== BUNDESTAG_SIZE) {
        // Per-party proportional cut on bundestagSeats.totalSeats (party-level grouping)
        // ...same largest-remainder algorithm
      }
    }
  }
  setMetaFlag("bundestagSizeMigrated", true);
}
```

No schema change; all operations are UPDATE-in-place on existing rows. Tests that hardcode `368` (kanzlerwahl.test.ts, chancellor-vote.test.ts, voting.ts internal docstrings) get updated to `316` in this PR. No tests should reference `MAJORITY_SEATS` literally — they all import the constant.

## Design — Piece 5: Campaign duration 21 → 60 days

Today `TIME_CONFIG.ELECTION_CAMPAIGN_DAYS = 21` (timing.ts:40). Real Bundestag campaign window is 42–84 days by law (Art. 39 GG + BWahlG). Q6 locked at fixed 60.

### Constant change (`timing.ts`)

```ts
ELECTION_CAMPAIGN_DAYS: 60,   // total days from announcement to election (was 21)
ELECTION_CAMPAIGN_START: 7,   // unchanged — rally start still ~7d after announce
```

That's the only edit. `announceElection()` (`elections.ts:69-86`) reads `TIME_CONFIG.ELECTION_CAMPAIGN_DAYS` to compute `electionDay = currentDay + 60`, then snaps to next Sunday via `snapToNextSunday()`. The downstream snap behaviour is unchanged.

### Migration (per S5)

**No retroactive adjustment.** Active elections (status `announced` or `campaign`) at migration time keep their existing `electionDay`. Only elections announced after this constant change use the 60-day window.

This is a one-line guard in the migration block:

```ts
// Cycle 3 — campaign-duration constant change is automatic on new elections
// only. No DB action needed; just document that the constant flipped.
```

### Test impact

`elections.test.ts:94-103` tests `snapToNextSunday()` over a 365-day range — unaffected. Any test that asserts a specific `electionDay` arithmetic (currently none search the codebase for `+ 21` or `+ 60` over `electionDay`) would need updating. Re-running tests should reveal any drift; the brainstorm scoped this as a one-constant change.

## Design — Piece 6: Negotiation duration cap + dwell

Today `MAX_NEGOTIATION_ROUNDS = 3` (negotiations.ts:14) and `MAX_NEGOTIATION_DAYS = getMaxNegotiationRounds() + 5 = 8` (loop.ts:621). Real coalition negotiations: 2017 Jamaica/GroKo took 171 days, 2021 Ampel took 72 days. Q7 locked at: raise cap to 90, add 7-day inter-round dwell.

### Constant changes (`negotiations.ts` + `config/elections.ts`)

```ts
// negotiations.ts
const MAX_NEGOTIATION_ROUNDS = 3;          // unchanged
export const MAX_NEGOTIATION_DAYS = 90;    // was implicitly 8 in loop.ts
export const MIN_NEGOTIATION_ROUND_DWELL_DAYS = 7;   // new — inter-round pacing
```

`MAX_NEGOTIATION_DAYS` moves from a derived value (`getMaxNegotiationRounds() + 5`) to an explicit constant. `loop.ts:621` switches from the derived expression to the import.

### Round-dispatch dwell guard (`loop.ts:610–650`)

Today: each call to `runDay()` during negotiation dispatches the next round. Result: 3 rounds finish in 3 sim days.

Change: dispatch a round only if `currentDay - lastRoundDay >= MIN_NEGOTIATION_ROUND_DWELL_DAYS`. The first round runs immediately on the negotiation-start day (no prior `lastRoundDay` to compare against), then rounds 2 and 3 spread over 14+ days. With cap=90 and dwell=7, 3 rounds organically span 14–21 sim days minimum, with the safety-net branch firing only on stuck negotiations beyond that.

```ts
// In the negotiation-dispatch block (loop.ts:~620)
const previousRounds = (activeElection.negotiationRounds || []) as NegotiationRound[][];
const roundNumber = previousRounds.length + 1;
const lastRoundDay = previousRounds.length > 0
  ? Math.max(...previousRounds[previousRounds.length - 1].map(r => r.day ?? activeElection.electionDay))
  : activeElection.electionDay;
const dwell = currentDay - lastRoundDay;
if (roundNumber > 1 && dwell < MIN_NEGOTIATION_ROUND_DWELL_DAYS) {
  // Skip dispatch this day — let the world breathe
  return;
}
// (existing dispatch logic continues)
```

Note: `NegotiationRound.day` does not currently exist on the type. Either:
- **(a)** Add `day: number` to `NegotiationRound` in `types/elections.ts` and persist it from `loop.ts` when constructing a round. Schema change.
- **(b)** Track `lastNegotiationRoundDay` on `simulation_meta` (single integer, updated each dispatch). No schema change to types.

**(b) is simpler and avoids an array-shape migration.** Spec locks (b).

### Constant: pacing dwell

Add to `config/elections.ts`:

```ts
export const MIN_NEGOTIATION_ROUND_DWELL_DAYS = 7;
```

### Schema change

Add column to `simulation_meta`:

```ts
lastNegotiationRoundDay: integer("last_negotiation_round_day").default(null)
```

Migration: `ALTER TABLE simulation_meta ADD COLUMN last_negotiation_round_day INTEGER` (idempotent via duplicate-column catch).

### Cycle 2a R13 interaction

The stuck-negotiation safety-net branch at `loop.ts:621-647` triggers when `daysSinceElection > MAX_NEGOTIATION_DAYS && roundNumber <= MAX_NEGOTIATION_ROUNDS`. With `MAX_NEGOTIATION_DAYS = 90` (was ≈ 8), the branch should fire **rarely** — only on genuinely unresolvable negotiations. Its synthetic-kanzlerwahl-row fallback continues to function. Test the new threshold by feeding a 90+ day stuck negotiation in a unit test.

### Migration (per S6)

**No retroactive adjustment.** Active negotiations (round in flight when this cycle ships) finish under the old timing. The new dwell + cap apply only to negotiations that begin after migration.

### Test impact

`negotiations` doesn't have its own test file today; `elections.test.ts` and `chancellor-vote.test.ts` cover adjacent ground. Add `negotiations.test.ts` covering: (1) round-dwell skip behaviour, (2) cap-at-90 guard, (3) safety-net branch firing path.

## Design — Piece 7: Überweisung ohne Aussprache (65% skip)

Today every bill flows `proposed → first_reading (plenary event) → committee → 2nd → 3rd`. Real Bundestag: ~60–70% of bills are silently referred to committee (Überweisung ohne Aussprache) without any 1st-reading floor debate. Q8 locked at flat 65% probability.

### Logic change (`bill-pipeline.ts:152–225`)

The non-government branch at `bill-pipeline.ts:194-222` currently always advances `proposed → first_reading` and emits `bill_first_reading`. Replace with a gated coin-flip:

```ts
} else {
  const skipDebate = rng() < UEBERWEISUNG_OHNE_AUSSPRACHE_PROBABILITY;
  if (skipDebate) {
    const minDur = BILL_STAGE_DURATIONS.committee.min;
    bill.status = "committee";
    bill.stageEntryDay = day;
    bill.stageMinDuration = minDur;
    bill.stageMaxDuration = BILL_STAGE_DURATIONS.committee.max;
    db.update(schema.bills)
      .set({ status: "committee", stageEntryDay: day, stageMinDuration: minDur, stageMaxDuration: BILL_STAGE_DURATIONS.committee.max })
      .where(eq(schema.bills.id, bill.id)).run();
    addEvent(events, {
      dayNumber: day,
      type: "bill_ueberweisung_ohne_aussprache",
      actor: "bundestag",
      title: `Überwiesen: ${bill.title}`,
      description: "Direkt an den Ausschuss überwiesen — keine 1. Lesung im Plenum.",
      data: { billId: bill.id, isGovernmentBill: false, stageMinDuration: minDur },
    });
    console.log(`  [Pipeline] "${bill.title}" → committee (Überweisung ohne Aussprache)`);
  } else {
    // existing first_reading branch (unchanged)
  }
}
```

`rng()` defaults to `Math.random` consistent with project pattern (and the I2 spec wording from Cycle 2b: deterministic in tests, non-deterministic in production).

### Constant (`config/parliament.ts`)

Lives next to `BILL_STAGE_DURATIONS` and `GOVERNMENT_BILL_COMMITTEE_MULTIPLIER` — the canonical home for bill-pipeline tuning:

```ts
export const UEBERWEISUNG_OHNE_AUSSPRACHE_PROBABILITY = 0.65;
```

### New event type

Add to `SimulationEventType` union (`types/meta.ts`):

```ts
| "bill_ueberweisung_ohne_aussprache"
```

Per S7: **NOT** in `IMPORTANT_EVENTS`. Frontend treats this as a one-line compact entry, not a full event card.

### Migration (no migration needed)

Bills mid-flight at status `proposed` continue under the new probability gate next time the pipeline ticks. No data migration. No schema change.

### Test impact

Add cases to `bill-pipeline.test.ts`:
- Bill at `proposed`, RNG returning 0.4 → goes straight to `committee`, emits `bill_ueberweisung_ohne_aussprache`.
- Bill at `proposed`, RNG returning 0.8 → goes to `first_reading`, emits `bill_first_reading` (existing behaviour).
- Government bills unaffected — always skip 1st reading via the existing fast-track.

## Interaction risks

| # | Risk | Mitigation |
|---|------|------------|
| R1 | Piece 4 seat shrink corrupts `bundestag_seats` MdB rows mid-term — humans + AI seats already allocated against 735, now recalibrated to 630. | Largest-remainder shrink applied to `bundestag_seats.totalSeats` (party-level), then per-party human/AI/proxy splits recomputed proportionally. Existing applications stay valid; pending applications rejected if quota dropped below current allocations. Document in migration block. |
| R2 | `MAJORITY_SEATS = 316` change breaks confidence-vote gates added in Piece 2 (which use `MAJORITY_SEATS + 5` for fragile-margin). | Both pieces ship in the same cycle. `MAJORITY_SEATS + 5` becomes `321` automatically. Verify the gate-test in `confidence-votes.test.ts` doesn't hardcode 373. |
| R3 | Piece 5 60-day campaign + Piece 6 90-day negotiations cap stretch the post-election interregnum to potentially 60+90+30 = 180 sim days. Geschäftsführende Bundesregierung holds for ~6 sim months. | Acceptable per Cycle 2a R4 model — outgoing cabinet stays active throughout. No new gating needed. Interregnum-skip behaviours (RB+FS skip per 2b S12) work identically. Long interregnum is realistic, not a bug. |
| R4 | Piece 6 dwell guard interacts with Cycle 2a R13 stuck-negotiation safety net. If `MIN_NEGOTIATION_ROUND_DWELL_DAYS = 7` and `MAX_NEGOTIATION_ROUNDS = 3`, the earliest 3-round completion is day 14. The 90-day cap fires only after that. | Safety net at `loop.ts:621-647` continues to work — its trigger condition is `daysSinceElection > MAX_NEGOTIATION_DAYS && roundNumber <= MAX_NEGOTIATION_ROUNDS`. Dwell guard delays dispatch but doesn't change the trigger. Add a unit test exercising both gates simultaneously. |
| R5 | Piece 7 Überweisung skip emits a new event type that any analytics queries grouping by `bill_first_reading` will silently miss. | None of the existing queries / dashboard tiles grep `bill_first_reading` by name (they read `bills.status`). Frontend changes (compact "Überwiesen" rendering) are out of scope for this cycle — backend change is safe. Add a follow-up task for the frontend. |
| R6 | Piece 1 veto rate cap (0.05% × impact gate) may go to ~zero vetoes per term. Loss of viewer drama. | Real-data target is ≈0.05/term. Acceptable per the brainstorm — the goal is fidelity. If after a 4-year sim the count is exactly zero across many runs, raise probability to 0.001 in a follow-up. |
| R7 | Piece 2 confidence-vote gates depend on a new `low_government_approval_streak` counter. If the counter logic has a reset bug, gates either never open or never close. | Single integer, written in `loop.ts` once per day, mirrors the proven pattern of `low_sentiment_streak`. Add a unit test for both reset paths. |
| R8 | Piece 3 government-bill committee multiplier raises stage durations only for new committee entries. Bills mid-committee at migration time don't get retroactively extended. | Acceptable — applies new physics going forward. Document in migration block. The same migration was used for Cycle 1 stage-entry-day backfill. |
| R9 | The hardcoded German prompt at `negotiations.ts:38` ("368+ Sitze (Mehrheit von 735)") drifts from the new constants. AI agents will continue saying "735 Sitze" if not updated. | Sweep `negotiations.ts` for hardcoded numerics in the prompt and replace with template literals using the constants. Verify by grepping for `735\|368` after the change. |
| R10 | Piece 6's switch from derived `MAX_NEGOTIATION_DAYS` to explicit constant breaks any caller that imported `getMaxNegotiationRounds()` expecting the old +5 derivation. | One caller (`loop.ts:621`). One-line update. Any test mocking the function continues to work. |
| R11 | Piece 7 RNG is non-deterministic in production (per Cycle 2b precedent). Two consecutive `npm run simulate 30` runs produce different Überweisung sequences. | Documented as the project's RNG model. Unit tests pass a seeded RNG; that's the contract. |
| R12 | Piece 4 migration order — if seat shrink runs AFTER kanzlerwahl synthetic-row backfill, the kanzlerwahl row still contains old vote tallies (368). Internal vote rounds are historical; this is fine. | No retroactive update of historical kanzlerwahl rows. New kanzlerwahls (post-migration) compute against `MAJORITY_SEATS = 316`. |
| R13 | If a snap election happens to be `announced` at migration moment, S5 says it keeps its 21-day window — the next election uses 60. A user observing two consecutive elections will see different campaign lengths. | Acceptable, single-shot transition. Document in release notes. |
| R14 | `TOTAL_SEATS` alias-export means downstream code touching the alias still compiles, but the constant is wrong if anyone treats it as the literal number 735. | Search the codebase for `TOTAL_SEATS` callsites — only `negotiations.ts:38` (the prompt string) appears, and that's already on the fix list. Add a deprecation comment. |
| R15 | Piece 4 reapportionment uses largest-remainder rounding. With 6 parties, total of 630 always reachable but in degenerate cases (all parties identical share) the tie-break (largest-after-rounding wins leftover) produces an arbitrary winner. | Happens only when all parties have integer-equal vote shares. Probability ~0 in practice. Tie-break is deterministic on party id, so test runs are reproducible. |

## Migration strategy

All Cycle 3 migrations are **inline** in `seed.ts::migrateDatabase()`, idempotent per their own meta-flag. Per S4, ordering inside `migrateDatabase()`:

1. (existing) Cycle 1 stage-entry-day backfill
2. (existing) Cycle 1 stage-min/max bill backfill
3. **NEW: Cycle 3 piece 4 — seat reapportionment (proportional shrink to 630)**
4. (existing) Cycle 2a synthetic kanzlerwahl-row backfill
5. (existing) Cycle 2a bundesrat_mode backfill
6. (existing) Cycle 2b counter-column inits
7. **NEW: Cycle 3 piece 6 — `last_negotiation_round_day` column add (no data backfill)**

No order dependency between pieces 1, 2, 3, 5, 7 (constant-only / probability-only changes).

`meta` flags added: `bundestagSizeMigrated: boolean`. Existing meta-flag plumbing in `simulation_meta` accommodates a new boolean column.

## Implementation plan — 4 PRs (commits, no PRs until user says otherwise)

PR-style commits on `claude/sim-fidelity-cycle3` branch, mirroring the Cycle 2a/2b pattern.

### PR 1 — Pieces 1+3 (single-file knob tunes) — **shipped in `d60a8b5`**

`feat(sim-fidelity): veto cap + gov-bill committee multiplier (Cycle 3 PR 1)`

- `config/budget.ts`: add `PRESIDENTIAL_VETO_PROBABILITY = 0.0005`, `PRESIDENTIAL_VETO_IMPACT_THRESHOLD = 0.6`; remove 7 dead `VETO_*` constants
- `config/parliament.ts`: add `GOVERNMENT_BILL_COMMITTEE_MULTIPLIER = 1.3`
- `simulation/budget.ts`: rewrite `shouldPresidentVeto()` with two-stage filter, optional `rng` param
- `simulation/bill-pipeline.ts`: scale `committeeRange()` by 1.3× when `bill.isGovernmentBill`
- `simulation/veto.ts`: update docstring (probability comment was stale)
- Unit tests (+11): `budget.test.ts` (new — 8 cases incl. 50_000-trial convergence under seeded LCG); `bill-pipeline.test.ts` (3 new committeeRange cases)

### PR 2 — Piece 2 (confidence-vote gates + tracker column)

`feat(sim-fidelity): structural gates for Vertrauensfrage + Misstrauensvotum (Cycle 3 PR 2)`

- `db/schema.ts` + `db/ddl.ts`: add `simulation_meta.low_government_approval_streak INTEGER NOT NULL DEFAULT 0`
- `seed.ts::migrateDatabase()`: idempotent column-add
- `simulation/confidence-votes.ts`: add `vertrauensfrageGateOpen()` + `misstrauensvotumGateOpen()` + `pickKonstruktivCandidate()` per S3
- `simulation/loop.ts`: increment streak when gov-weighted approval < 25, reset otherwise; gate confidence-vote dispatch on the new helpers; roll `0.005` daily probability inside the gate
- `config/elections.ts`: add `VERTRAUENSFRAGE_GATE_LOW_APPROVAL_DAYS = 30`, `VERTRAUENSFRAGE_GATE_FRAGILE_MARGIN = 5`, `MISSTRAUENSVOTUM_GATE_HONEYMOON_DAYS = 180`, `CONFIDENCE_VOTE_DAILY_PROBABILITY = 0.005`, `VERTRAUENSFRAGE_HONEYMOON_DAYS = 90`
- Unit tests: gate-open/closed under all 4 conditions; streak reset; konstruktiv candidate selection deterministic

### PR 3 — Piece 4 (seat reform) — **shipped**

`feat(sim-fidelity): 735→630 Bundestag seat reform (Cycle 3 PR 3)`

- `config/elections.ts`: `BUNDESTAG_SIZE = 630`, `MAJORITY_SEATS = 316`; `TOTAL_SEATS` becomes deprecated alias for `BUNDESTAG_SIZE`
- `config/parties.ts`: `FRAKTION_THRESHOLD = 32` (was 37 — 5% of 630 vs 5% of 735)
- `simulation/seats.ts`: pure helper `rescaleSeatsToBundestag()` exported; uses largest-remainder rounding with deterministic tie-break (descending remainder → descending input → lex id)
- `seed.ts::migrateDatabase()`: idempotent shrink of `parties.seat_count` only (NOT `bundestag_seats`), guarded by `simulation_meta.bundestag_size_migrated`. **Ordering** runs after `parties` table creation, before Cycle 1's stage-entry-day backfill (S4)
- `db/schema-sim.ts` + `db/ddl.ts`: new `bundestag_size_migrated INTEGER NOT NULL DEFAULT 0` column on `simulation_meta`
- `simulation/negotiations.ts`: replace hardcoded `368`/`735` at lines 38, 189, 268 with template literals using constants
- `simulation/chancellor-vote.test.ts`: rewrite the 3 absolute-mode tests using the constant + 630-aligned seat counts
- `simulation/elections.test.ts`: `BUNDESTAG_SIZE`/`MAJORITY_SEATS` imports replace hardcoded `735`/`368` in two assertions
- `simulation/seats.test.ts` (new — 8 cases): `rescaleSeatsToBundestag` invariants — sum-preserving, never grows a party, tie-break determinism, edge cases (empty, all-zero, exact-target no-op)

**Deviation from earlier spec draft**: `bundestag_seats` rows are NOT shrunk in the migration. The table is per-MdB-row (one row per seat); shrinking would require deactivating active rows, potentially displacing users mid-term. Vote tallying reads `parties.seatCount` (not `bundestag_seats` row counts), so the engine is mathematically consistent post-migration. The `bundestag_seats` table converges to BUNDESTAG_SIZE-aligned state at the next election when `resetAllSeats` + `allocateSeats` run. Documented inline at the migration block in `seed.ts`.

### PR 4 — Pieces 5+6+7 (election timing + Überweisung)

`feat(sim-fidelity): 60-day campaigns + 4-12wk negotiations + 65% Überweisung skip (Cycle 3 PR 4)`

- `simulation/timing.ts`: `ELECTION_CAMPAIGN_DAYS: 60`
- `config/elections.ts`: `MAX_NEGOTIATION_DAYS = 90`, `MIN_NEGOTIATION_ROUND_DWELL_DAYS = 7`
- `db/schema.ts` + `seed.ts::migrateDatabase()`: `simulation_meta.last_negotiation_round_day INTEGER`
- `simulation/loop.ts`: switch from derived `MAX_NEGOTIATION_DAYS` to imported constant; insert dwell-guard on negotiation-round dispatch (skip if `currentDay - lastRoundDay < MIN_DWELL`); update `lastNegotiationRoundDay` after each dispatch
- `simulation/bill-pipeline.ts`: 65%-probability Überweisung-ohne-Aussprache branch in Stage 1 non-government path; emit `bill_ueberweisung_ohne_aussprache` event
- `types/meta.ts`: add `bill_ueberweisung_ohne_aussprache` to `SimulationEventType` union
- `simulation/timing.ts`: confirm new event type is **NOT** in `IMPORTANT_EVENTS` (per S7)
- Tests:
  - `negotiations.test.ts` (new): dwell guard, 90-day cap, R13-safety-net interaction
  - `bill-pipeline.test.ts`: deterministic skip-vs-debate branch under seeded RNG
  - `elections.test.ts`: 60-day announce→vote arithmetic

### Post-merge cleanup (separate concern)

Per the prior PR's housekeeping plan, this PR-set will also delete the four stale Cycle 1/2a/2b spec files:

- `docs/plans/043-cycle1-spec.md`
- `docs/plans/043-cycle2-brainstorm.md`
- `docs/plans/043-cycle2a-spec.md`
- `docs/plans/043-cycle2b-spec.md`

Cycle 3 spec + brainstorm stay until cycle 3 itself ships.

## Success criteria

- `npm run typecheck && npm test && npm run build` green on each of the 4 PR-commits.
- Seed + `simulate 1461` completes without error after all 4 commits.
- After migrate of an existing 735-seat DB:
  - `sqlite3 data/simulation.db "SELECT SUM(seat_count) FROM parties"` returns `630`.
  - `sqlite3 data/simulation.db "SELECT SUM(total_seats) FROM bundestag_seats"` returns `630`.
- After a fresh `simulate 1461` (one full term, ~4 years):
  - Presidential veto count is 0–1 (down from typical 5–15 today). Probability gate working.
  - Vertrauensfrage events: 0–2 (down from typical 6–12 today). Structural gate working.
  - Misstrauensvotum events: 0–1 (down from typical 3–6 today).
  - Bills with status flow `proposed → committee → 2nd → 3rd` (skipped 1st reading) ≈ 60–70% of total bills.
  - `bill_ueberweisung_ohne_aussprache` event count ≈ 60–70% of `bill_proposed` count.
  - Average post-election interregnum length 60–120 sim days (was ~30 today).
- `negotiations.test.ts` passes: dwell guard skips dispatch when `currentDay - lastRoundDay < 7`.
- `confidence-votes.test.ts` passes: gates open and close per spec; gates closed during honeymoon.
- Hardcoded seat numbers (`735`, `368`) removed from `negotiations.ts:38` German prompt — `grep -E '735|368' packages/engine/src/simulation/negotiations.ts` returns no matches.
- AI cost: `logAICall` averages stay flat ±$0.0005/sim-day vs. pre-Cycle-3 baseline. No new AI calls added.
- Wall-clock per term: similar ±10% to Cycle 2b baseline (longer interregnums offset by fewer 1st-reading speech batches).

## Open items surfaced for later cycles

- **End-to-end seeded RNG plumbing through `runDay()`** — petitions / Einzelfragen / Aktuelle-Stunde-baseline / Überweisung / veto / confidence-vote-roll all default to `Math.random` in production. A single sim-meta `randomSeed` column threaded through `runDay()` would unlock end-to-end snapshot regression tests. Cycle 4+.
- **Stochastic campaign duration draw** (Q6 option B) — sample uniform [42, 84] per election rather than fixed 60. Trivial change, deferred per Q6 brainstorm decision. Cycle 3 polish.
- **Category-aware Überweisung skip** (Q8 option B) — high-impact bills always debate; routine bills skip. Requires impact-magnitude classification. Cycle 4+.
- **Full BWahlG seat reapportionment** (Q5 option B) — Zweitstimmendeckung, exact 2023-reform mechanics. Requires Wahlrecht voting model maturity. Cycle 4+ structural work, blocked on a P3 voting cycle.
- **Per-Land Misstrauensvotum** — single-chamber federal Bundestag only this cycle. Modeling Land-level government dissolution requires a Landtag actor system. Cycle 5+.
- **Frontend `bill_ueberweisung_ohne_aussprache` rendering** — compact "Überwiesen" entry on bill page + bills feed. Backend ships this cycle; frontend in a follow-up.
- **Empirical tuning of veto-impact threshold (0.6)** — calibration against historical Bundespräsident vetoes after a 4-year sim run. P3 polish.

