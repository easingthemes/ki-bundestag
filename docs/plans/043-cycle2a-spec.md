# 043 Cycle 2a — Spec + Implementation Plan (P1, wave 1)

**Scope**: Bundesrat voting with full 16-Länder model + Kanzlerwahl (Art. 63 GG, 3 phases).
**Source**: [`043-cycle2-brainstorm.md`](./043-cycle2-brainstorm.md) (locked decisions Q1–Q6), [`043-cycle1-spec.md`](./043-cycle1-spec.md) (template + plumbing this builds on), [`../todo/043-sim-timing-fidelity.md`](../todo/043-sim-timing-fidelity.md) §Cycle 2.
**Delete this file** once Cycle 2a has shipped.

## Decisions (locked)

Restated from Cycle 2 brainstorm, plus sub-decisions surfaced while designing.

| # | Question | Decision |
|---|----------|----------|
| Q1 | Split Cycle 2 into 2a + 2b | **Yes.** 2a covers Bundesrat + Kanzlerwahl (closes Cycle 1 open ends). 2b covers weekly + volume + citizen pieces. Same branch, staged cycles. |
| Q2 | Bundesrat modelling depth | **Full 16-Länder static model.** Compositions seeded from current real Land governments, weighted votes per Art. 51 Abs. 2 GG. No Landtagswahlen simulation (deferred to Cycle 3+). |
| Q3 | Kanzlerwahl phases | **Full 3-phase (Art. 63 GG).** Phase 3 simplified: Bundespräsident appoints relative-majority winner. No dissolution-of-Bundestag path (no Bundespräsident modelling yet). |
| Q5 | New event types | **Accept.** Ballpark 6 new types in 2a: `bundesrat_vote`, `vermittlungsausschuss_invoked`, `vermittlungsausschuss_resolved`, `kanzlerwahl_phase1`, `kanzlerwahl_phase2`, `kanzlerwahl_phase3`, `amtseid`. |
| S1 | Zustimmungsgesetz vs Einspruchsgesetz — how to classify | **Category-driven deterministic map on `BillCategory`.** `education`, `healthcare`, `social`, `infrastructure` → Zustimmung (Länder-Verwaltung hook). `economy`, `environment`, `immigration`, `defense` → Einspruch. Exposed as `getBundesratMode(category)`. ~50/50 split mirrors the real 38–45% Zustimmungsgesetz share within the sim's category mix. |
| S2 | Land-government → sim-party mapping | **Nearest-ideological-sim-party mapping for Landesregierungs-Parteien not in the sim's six-party set.** BSW/Linke-splitter → `linke`. Freie Wähler → `cdu`. SSW → excluded from government weight (minority-status in SH). Mapping table lives in `config/bundesrat.ts` with a comment citing real-world party. |
| S3 | Bundesrat vote mechanics | **Per-Land bloc vote, unanimous within Land (Art. 51 Abs. 3 GG).** Coalitions inside a Land resolve to a single position via weighted ideological average vs. bill impact vector. If coalition disagreement exceeds threshold, Land abstains (`Enthaltung`, which counts as No — standard practice). |
| S4 | Vermittlungsausschuss composition | **Abstracted — no MdB-level modelling.** Outcome drawn stochastically: 60% compromise accepted (bill keeps amended impact), 25% Bundestag rejects compromise (bill dies), 15% Bundesrat rejects compromise (bill dies if Zustimmungsgesetz, goes back to Bundesrat Einspruch otherwise). Duration: 14–56 sim days. |
| S5 | Kanzlerwahl candidate selection | **Coalition agreement nominates the Chancellor-Kandidat (`agreement.chancellorCandidate`).** If `synthesizeAgreement()` doesn't surface one, fall back to `FRAKTION_LEADERS[coalition[0]]` (current behaviour, lifted out of `formCabinet`). Phase 2 candidates: up to 2 per party-Fraktion, drawn AI-side if a round is actually needed; Phase 1 failure is already rare. |
| S6 | Kanzlerwahl timing | **Phase 1 fires on Konstituierende-Sitzung day or the next Sitzungstag after coalition agreement, whichever is later.** Phase 2 window: 14 sim days. Phase 3: immediately after Phase 2 window closes. Amtseid: next Sitzungstag after successful Kanzlerwahl. `formCabinet()` runs on Amtseid day, not earlier. |
| S7 | Failure modes during interregnum | **Keep acting-government model.** Outgoing cabinet stays `active=true` until Amtseid (`geschäftsführende Bundesregierung`, Art. 69 Abs. 3 GG). No extra schema — just skip `dissolveGovernment()` until the new Amtseid fires. |

## Non-goals

- No Landtagswahlen simulation or dynamic Land-government changes (static compositions for now — Cycle 3+).
- No Vermittlungsausschuss member-level modelling (MdB-level work is Cycle 4 P3).
- No Bundespräsident as a modelled actor — Phase 3 appointment uses a system actor.
- No modelling of erste Regierungserklärung (that is P3/Cycle 4).
- No change to coalition negotiation cadence or `synthesizeAgreement()` logic itself.
- No change to Cycle 1 calendar, stage durations, or Konstituierende Sitzung plumbing.
- No Kanzlerwahl for mid-term Misstrauensvotum-replacement (existing `confidence-votes.ts` flow keeps its single-vote behaviour — Art. 67 GG is a distinct procedure).
- No change to presidential veto rate or call-site (still fires in Stage 5 of the pipeline).

## Design — Piece 1: Bundesrat voting + Vermittlungsausschuss

Extends Cycle 1 PR 3's Stage 5 (`bill-pipeline.ts:341–374`) which currently auto-clears every bill after `stageMinDuration` days. Cycle 2a replaces the auto-clear with an actual Land-weighted vote; on Zustimmungsgesetze that fail, convenes a Vermittlungsausschuss.

### New module: `packages/engine/src/simulation/bundesrat.ts`

Pure voting logic — no AI. Exports:

```ts
export type BundesratMode = "zustimmung" | "einspruch";
export type LandVote = "ja" | "nein" | "enthaltung";

export interface LandVoteResult {
  landId: string;           // "by", "nw", "bw", …
  landName: string;         // "Bayern"
  votes: number;            // weight (3–6)
  vote: LandVote;
  coalitionPosition: {      // for UI/event data
    parties: string[];      // sim-party IDs in Land coalition
    majoritySupport: number; // 0..1 ideological alignment
  };
}

export interface BundesratResult {
  mode: BundesratMode;
  tally: { ja: number; nein: number; enthaltung: number };
  total: 69;
  threshold: 35;            // absolute majority for Zustimmung
  passed: boolean;          // Zustimmung: ja >= 35; Einspruch: nein < 35
  landResults: LandVoteResult[];
}

export function getBundesratMode(category: BillCategory): BundesratMode;
export function voteBundesrat(bill: Bill, parties: Party[]): BundesratResult;
```

### New config: `packages/engine/src/config/bundesrat.ts`

```ts
/** Art. 51 Abs. 2 GG Stimmengewicht (total = 69, majority = 35, 2/3 = 46). */
export const BUNDESRAT_TOTAL_VOTES = 69;
export const BUNDESRAT_MAJORITY = 35;

/** Vermittlungsausschuss dwell range (sim days). */
export const VERMITTLUNG_DURATION = { min: 14, max: 56 } as const;

/** Vermittlungsausschuss outcome distribution. */
export const VERMITTLUNG_OUTCOMES = {
  compromise: 0.60,          // bill re-enters with amended impact
  bundestagRejects: 0.25,    // bill dies
  bundesratRejects: 0.15,    // Zustimmungsgesetz dies; Einspruchsgesetz → Einspruch path
} as const;

/** BillCategory → Zustimmung/Einspruch classification (sub-decision S1). */
export const BUNDESRAT_MODE_BY_CATEGORY: Record<BillCategory, BundesratMode> = {
  education: "zustimmung",
  healthcare: "zustimmung",
  social: "zustimmung",
  infrastructure: "zustimmung",
  economy: "einspruch",
  environment: "einspruch",
  immigration: "einspruch",
  defense: "einspruch",
};

/** Land-government intra-coalition disagreement threshold above which Land abstains. */
export const LAND_ABSTENTION_THRESHOLD = 0.35;

/** 16 Länder, static 2026-baseline governing coalitions mapped to sim-party IDs.
 *  Votes per Art. 51 Abs. 2 GG (≤2m → 3 / ≤6m → 4 / ≤7m → 5 / >7m → 6).
 *  `realParties` retains the real-world party names for audit; `simParties` is
 *  what the weighted-ideology vote actually uses (sub-decision S2). */
export const BUNDESRAT_LAENDER: Array<{
  id: string;
  name: string;
  votes: 3 | 4 | 5 | 6;
  simParties: string[];
  realParties: string[];
}> = [
  { id: "bw", name: "Baden-Württemberg",        votes: 6, simParties: ["gruene","cdu"],       realParties: ["Grüne","CDU"] },
  { id: "by", name: "Bayern",                   votes: 6, simParties: ["cdu"],                 realParties: ["CSU","Freie Wähler"] },
  { id: "be", name: "Berlin",                   votes: 4, simParties: ["cdu","spd"],           realParties: ["CDU","SPD"] },
  { id: "bb", name: "Brandenburg",              votes: 4, simParties: ["spd","linke"],         realParties: ["SPD","BSW"] },
  { id: "hb", name: "Bremen",                   votes: 3, simParties: ["spd","gruene","linke"],realParties: ["SPD","Grüne","Linke"] },
  { id: "hh", name: "Hamburg",                  votes: 3, simParties: ["spd","gruene"],       realParties: ["SPD","Grüne"] },
  { id: "he", name: "Hessen",                   votes: 5, simParties: ["cdu","spd"],           realParties: ["CDU","SPD"] },
  { id: "mv", name: "Mecklenburg-Vorpommern",   votes: 3, simParties: ["spd","linke"],         realParties: ["SPD","Linke"] },
  { id: "ni", name: "Niedersachsen",            votes: 6, simParties: ["spd","gruene"],       realParties: ["SPD","Grüne"] },
  { id: "nw", name: "Nordrhein-Westfalen",      votes: 6, simParties: ["cdu","gruene"],       realParties: ["CDU","Grüne"] },
  { id: "rp", name: "Rheinland-Pfalz",          votes: 4, simParties: ["spd","gruene","fdp"], realParties: ["SPD","Grüne","FDP"] },
  { id: "sl", name: "Saarland",                 votes: 3, simParties: ["spd"],                 realParties: ["SPD"] },
  { id: "sn", name: "Sachsen",                  votes: 4, simParties: ["cdu","spd"],           realParties: ["CDU","SPD","Grüne"] },
  { id: "st", name: "Sachsen-Anhalt",           votes: 4, simParties: ["cdu","spd","fdp"],     realParties: ["CDU","SPD","FDP"] },
  { id: "sh", name: "Schleswig-Holstein",       votes: 4, simParties: ["cdu","gruene"],       realParties: ["CDU","Grüne"] },
  { id: "th", name: "Thüringen",                votes: 4, simParties: ["cdu","spd","linke"],   realParties: ["CDU","SPD","BSW"] },
];
```

Sum of `votes`: 6+6+4+4+3+3+5+3+6+6+4+3+4+4+4+4 = **69** (sanity-checked against Art. 51).

### Vote algorithm (per Land)

1. Compute each Land coalition's aggregate ideological position vector (average of `party.policyPriorities` weighted by seat-share placeholder — for static seed, equal weighting within the Land coalition).
2. Compare against the bill's impact vector (`impact.*` fields).
3. Score in `[-1, 1]`: positive = alignment, negative = opposition.
4. Intra-coalition variance: max-min of individual party scores within the Land coalition.
5. If variance > `LAND_ABSTENTION_THRESHOLD` → `enthaltung`. Else if mean score > 0.1 → `ja`; if < -0.1 → `nein`; otherwise → `enthaltung`.
6. Federal-coalition alignment bonus: Länder governed by at least one federal-coalition party get a +0.15 `ja`-bias on government bills (`bill.isGovernmentBill`). Mirrors real Bundesrat dynamics where CDU/SPD-led Länder vote with a CDU/SPD federal government.

### Pipeline integration (`bill-pipeline.ts`)

Rewrite of Stage 5 (current `bill-pipeline.ts:341–374` auto-clear). New state machine on `bundesratState`:

```
pending → voted → cleared        (Zustimmung: ja >= 35)
pending → voted → vermittlung    (Zustimmung: ja < 35, Einspruch: nein >= 35)
vermittlung → cleared            (compromise accepted)
vermittlung → rejected           (compromise rejected by one chamber)
```

Concrete changes:

- When `dwellDays(b, day) >= stageMinDuration` on `bundesratState='pending'`: call `voteBundesrat(bill, parties)`. Emit `bundesrat_vote` event with full `landResults`. Set `bundesratVoteResult` column (new JSON). Determine next state by `(mode, passed)`:
  - Zustimmung + passed → `cleared`, set `ausfertigungDay`, run `checkPresidentialVeto` (unchanged).
  - Zustimmung + failed → `vermittlung`, set `vermittlungEntryDay`, draw `vermittlungMinDuration` from `VERMITTLUNG_DURATION`.
  - Einspruch + passed (no Einspruch filed) → `cleared` (same as Zustimmung-passed).
  - Einspruch + failed (Bundesrat filed Einspruch) → `vermittlung` (same dwell path). On compromise failure, Bundestag overrides in ~80% of cases → treat as `cleared`; else `rejected`.
- New Stage 5b: `vermittlungEntryDay` + `vermittlungMinDuration` satisfied → roll outcome from `VERMITTLUNG_OUTCOMES`. Emit `vermittlungsausschuss_resolved` with outcome. On `compromise`: optionally apply a small randomised impact haircut to `bill.impact` (scale factor 0.7–0.9 per non-zero field) before transitioning to `cleared`.
- On Einspruch-path `vermittlung → cleared` override: tally a virtual Bundestag override vote using existing coalition majority (same as `voting.ts` `tallyBillVotes`); if override fails, bill dies.

### Schema additions (`bills` table)

DDL + `SIM_COLUMN_MIGRATIONS`:

```ts
bundesratMode: text("bundesrat_mode"),                   // "zustimmung" | "einspruch"
bundesratVoteResult: text("bundesrat_vote_result", { mode: "json" }),  // BundesratResult
vermittlungEntryDay: integer("vermittlung_entry_day"),
vermittlungMinDuration: integer("vermittlung_min_duration"),
vermittlungOutcome: text("vermittlung_outcome"),         // "compromise" | "bundestag_rejects" | "bundesrat_rejects"
```

`bundesratState` gains two new values: `"voted"` (transient, replaced within same day) and `"vermittlung"`.

### Event types (additions to `SimulationEventType`)

```ts
| "bundesrat_vote"
| "vermittlungsausschuss_invoked"
| "vermittlungsausschuss_resolved"
```

`bundesrat_vote` classified as `IMPORTANT_EVENTS`. Vermittlungsausschuss events are `IMPORTANT_EVENTS`.

### Loop integration

None — Stage 5 is already dispatched from `advanceBillPipeline()` which `loop.ts:892` calls in Step 5 of the 13-step flow. No new call-sites.

## Design — Piece 2: Kanzlerwahl (Art. 63 GG, 3 phases) + Amtseid

Splits coalition completion (AI/algorithmic) from cabinet formation (post-Amtseid). Today `loop.ts:776` calls `formCabinet()` on the same day as `negotiation_complete`; Cycle 1 already deferred Fraktionsbildung to the Konstituierende Sitzung (`loop.ts:760` comment). Cycle 2a completes the decoupling: the coalition agreement names a Chancellor-Kandidat, Kanzlerwahl happens on (or after) KS day, and only then does the cabinet form.

### New module: `packages/engine/src/simulation/kanzlerwahl.ts`

```ts
export type KanzlerwahlPhase = 1 | 2 | 3;
export type KanzlerwahlOutcome = "elected" | "failed" | "pending";

export interface KanzlerwahlRound {
  phase: KanzlerwahlPhase;
  day: number;
  candidatePartyId: string;
  candidateName: string;
  votesYes: number;
  votesNo: number;
  votesAbstain: number;
  required: number;          // Kanzlermehrheit for Phase 1/2, relative majority for Phase 3
  outcome: KanzlerwahlOutcome;
}

export interface KanzlerwahlState {
  id: string;
  electionId: string;
  startedOnDay: number;
  phase1: KanzlerwahlRound | null;
  phase2Rounds: KanzlerwahlRound[];       // 0..N within 14-day window
  phase2WindowEndDay: number | null;
  phase3: KanzlerwahlRound | null;
  status: "phase1" | "phase2" | "phase3" | "elected" | "failed";
  electedCandidatePartyId: string | null;
  electedCandidateName: string | null;
  amtseidDay: number | null;
}

export function startKanzlerwahl(electionId: string, agreement: CoalitionAgreement | null,
  coalition: string[], allParties: Party[], day: number): KanzlerwahlState;

export function runPhase1(state: KanzlerwahlState, allParties: Party[],
  coalitionParties: string[], day: number): KanzlerwahlState;

export function runPhase2Round(state: KanzlerwahlState, allParties: Party[],
  coalitionParties: string[], day: number): KanzlerwahlState;

export function runPhase3(state: KanzlerwahlState, allParties: Party[],
  coalitionParties: string[], day: number): KanzlerwahlState;
```

### New module: `packages/engine/src/simulation/chancellor-tally.ts` (or reuse `voting.ts`)

Keep tally logic co-located with bill voting. Extend `voting.ts` with:

```ts
export function tallyChancellorVote(
  candidatePartyId: string,
  parties: Party[],
  coalitionParties: string[],
  mode: "absolute" | "relative",
): { yes: number; no: number; abstain: number; passed: boolean };
```

Mode `"absolute"` requires `yes >= MAJORITY_SEATS` (Kanzlermehrheit, Art. 63 Abs. 1/3 GG). Mode `"relative"` requires `yes > no` (Art. 63 Abs. 4 Satz 2 GG). Abstain behaviour is standard Fraktionsdisziplin: coalition parties vote yes on their own candidate, opposition parties vote no on the candidate party's leader, third-party candidates produce split votes.

### New schema: `kanzlerwahl` table

```ts
export const kanzlerwahl = sqliteTable("kanzlerwahl", {
  id: text("id").primaryKey(),
  electionId: text("election_id").notNull().references(() => elections.id),
  startedOnDay: integer("started_on_day").notNull(),
  phase1: text("phase1", { mode: "json" }),                   // KanzlerwahlRound | null
  phase2Rounds: text("phase2_rounds", { mode: "json" }).notNull().default("[]"),
  phase2WindowEndDay: integer("phase2_window_end_day"),
  phase3: text("phase3", { mode: "json" }),
  status: text("status").notNull(),
  electedCandidatePartyId: text("elected_candidate_party_id"),
  electedCandidateName: text("elected_candidate_name"),
  amtseidDay: integer("amtseid_day"),
});
```

`CoalitionAgreement` gains a `chancellorCandidate?: { partyId: string; name: string }` optional field (types package — pure additive). `synthesizeAgreement()` prompt gets one new JSON field; when the AI omits it, fall back to `FRAKTION_LEADERS[coalition[0]]`.

### Event types (additions to `SimulationEventType`)

```ts
| "kanzlerwahl_phase1"
| "kanzlerwahl_phase2"
| "kanzlerwahl_phase3"
| "amtseid"
```

All four classified as `IMPORTANT_EVENTS`. `amtseid` additionally flagged CRITICAL (end of interregnum).

### Constants (`config/elections.ts`)

```ts
export const KANZLERWAHL_PHASE2_WINDOW_DAYS = 14;   // Art. 63 Abs. 3 GG
export const KANZLERWAHL_PHASE2_MAX_ROUNDS = 3;     // sim cap — prevents AI-driven infinite rounds
```

### Loop integration (replacing `loop.ts:760–808`)

The block that runs when negotiations max out (`loop.ts:672` branch, `roundNumber >= getMaxNegotiationRounds()`) is split into three new call-sites:

1. **Coalition finalisation** (same place, `loop.ts:~672`): persist `newCoalition`/`newOpposition`/`coalitionAgreement`, emit `negotiation_complete` and `government_formed`. **Remove** the inline `formCabinet()` call at `loop.ts:776`. Seat allocation (`resetAllSeats` + `allocateSeats`, `loop.ts:789–793`) and MdB-application expiry stay here — those are administrative and independent of Kanzlerwahl.
2. **Kanzlerwahl trigger** (new block inside the Konstituierende-Sitzung gate in `loop.ts:~905`): when `currentDay === ksDay` AND the latest election has `newCoalition` set but no `kanzlerwahl` row yet, call `startKanzlerwahl()` + `runPhase1()` synchronously. Emit `kanzlerwahl_phase1` with full vote breakdown. If Phase 1 passes: set `amtseidDay = nextSitzungsTag(day+1)`. If not: set `phase2WindowEndDay = day + KANZLERWAHL_PHASE2_WINDOW_DAYS`.
3. **Kanzlerwahl progression + Amtseid** (new block right after KS gate): daily check for active `kanzlerwahl` row where `status in ("phase2","phase3")`:
   - Phase 2: if `isSitzungsTag(day)` and `phase2Rounds.length < PHASE2_MAX_ROUNDS`, run a round. On pass → set `amtseidDay`. On `day >= phase2WindowEndDay` without a pass → transition to Phase 3.
   - Phase 3: run `runPhase3()` once. Relative-majority winner always wins (per sub-decision Q3). Set `amtseidDay = nextSitzungsTag(day+1)`.
   - On `currentDay === amtseidDay`: emit `amtseid` event, call `formCabinet(coalition, allParties, electionId, currentDay)` (moved from `loop.ts:776`), emit `government_cabinet_formed` (existing event, same data), run `shouldSeedCommittees()` + `assignCommitteeMemberships()` (moved from `loop.ts:801–806`).

### Acting-government window (sub-decision S7)

`formCabinet()` at `government.ts:24` currently calls `dissolveGovernment(currentDay)` at the top. Change: only dissolve when an Amtseid actually lands. Between Wahltag and Amtseid of the new Chancellor, the old government stays `active=true` — matches Art. 69 Abs. 3 GG (geschäftsführende Bundesregierung). In practice, just moving `formCabinet()` to Amtseid day accomplishes this naturally, since the old government keeps its `active` flag until the new one is inserted.

### Candidate selection detail (sub-decision S5)

- Phase 1 candidate: `agreement.chancellorCandidate.partyId` if present, else `FRAKTION_LEADERS[coalition[0]]`. Name: `agreement.chancellorCandidate.name` or `FRAKTION_LEADERS[coalition[0]]`.
- Phase 2 candidates: any party may nominate — for the sim, iterate through parties by seat count, each gets one round. Cap at `KANZLERWAHL_PHASE2_MAX_ROUNDS`. A round passes if `tallyChancellorVote(candidate, "absolute").passed === true`.
- Phase 3 candidate: party with the highest Phase-2 vote count (the "relative-majority winner" ready-made). If Phase 2 had zero rounds, fall back to coalition leader's candidate.
