# 043 Cycle 5 — Spec + Implementation Plan (P3 expert-witness + threshold-correctness)

**Scope**: Four pieces — Ausschussanhörungen + experts seed table · Enquete-Kommission lifecycle + AI Schlussbericht · Schuldenbremse threshold (Art. 115 Abs. 2 Satz 6 GG) + R4/R5/R10 + expiry event · polish + Cycle 4 docs cleanup (S16).
**Source**: [`043-cycle5-brainstorm.md`](./043-cycle5-brainstorm.md) (locked Q1–Q5 + S1–S24 + R1–R12), [`043-cycle4-spec.md`](./043-cycle4-spec.md) §"Open items", PR #165 review (R1–R10 from Cycle 4).
**Delete this file** once Cycle 5 has shipped (in Cycle 6's final PR per the established housekeeping cadence).

## Decisions (locked)

Restated from the brainstorm with sub-decisions surfaced while designing.

| # | Question | Decision |
|---|----------|----------|
| Q1 | Schuldenbremse threshold | **A** — Match Art. 115 Abs. 2 Satz 6 GG: absolute majority of members ("Mehrheit der Mitglieder des Bundestages" = `MAJORITY_SEATS = 316` of 630). Reuses `voting.ts "absolute"` mode primitive — no new vote primitive introduced. |
| Q2 | Enquete-Kommission depth | **A (Mid)** — establish + AI Schlussbericht only at conclusion. No interim sessions. Mirrors Cycle 4 `inquiry_final_report` cost profile exactly. |
| Q3 | Expert-witness data model | **A — lightweight seed table, real names**. ~30 rows in `experts`, referenced by both Ausschussanhörungen and Enquete-Kommissionen via `expert_id`. Recurring-character coherence + reuse-first principle. |
| Q4 | Ausschussanhörungen trigger | **A (auto-trigger, impact-weighted)** — `P(hearing) = clamp(0.20 + 0.40 × normalisedImpactMag, 0, 0.70)`. 3 experts per hearing; 1 AI batch call per hearing-day; ±0.05 nudge on committee→2nd-reading amend probability via tone scalar. No agent surface. |
| Q5 | Enquete-Kommission trigger | **B (agent action + simple-majority Bundestag-Beschluss)** — `request_enquete_kommission` queues `enquete_proposed` event same-day; same-tick `tallyEnqueteVote` → `enquete_convened` (memberships + experts persisted) or `enquete_rejected`. Cap 2 active+proposed, rate-limit 90 days. |
| S1 | PR ordering | 4 PRs on `claude/sim-fidelity-cycle5`, ordered 1 → 2 → 3 → 4 (heaviest first). PR 2 depends on PR 1 (`experts` table); PR 3 + PR 4 independent. |
| S2 | Experts seed pool composition | ~30 named entries, real public-figure German policy experts, distributed across 8 ministries with ≥3 experts per ministry. Test-asserted, not just doc-asserted. Affiliations span DIW Berlin, Sachverständigenrat, IfW Kiel, RWI Essen, ZEW Mannheim, IW Köln, ifo Institut, Hertie School, SWP, DGAP, GIGA, Potsdam-Institut PIK, MCC Berlin, RKI, Charité, MPI Strafrecht, MPI Völkerrecht, Bundesbank, AwO, Caritas, BUND/NABU, Bertelsmann Stiftung Gesundheit. Final list locked in PR 1's `config/experts.ts`. |
| S3 | Ausschussanhörung lifecycle | Row written `status='scheduled'` at trigger time (synchronous with `bill_committee_stage` event); AI batch updates to `status='held'` with testimonies + tone in same daily tick. AI parse/validation failure → `status='lapsed'`, `testimonies='[]'`, `tone=0`. Committee→2nd-reading transition reads tone=0 as no-nudge gracefully. |
| S4 | Ausschussanhörung influence | Tone scalar [-1, +1] biases committee→2nd-reading amend probability by ±`ANHOERUNG_TONE_INFLUENCE = 0.05`. Pure helper `applyAnhoerungToneToAmendProb(baseAmendProb, tone)` clamps to [0, 1]. Positive tone (endorsement) increases amend probability — endorsed bills benefit from refinement. No influence on 3rd-reading vote (open item). |
| S5 | Ausschussanhörung experts per hearing | 3 (`ANHOERUNG_EXPERTS_PER_HEARING`). Selected by `expertise_areas ∋ ministryFocus`; sample without replacement. Throws if filtered pool < 3 — prevented at runtime by S2's ≥3-per-ministry invariant. |
| S6 | Anhörung trigger probability | `P = clamp(0.20 + 0.40 × normalisedImpactMag, 0, 0.70)`. `normalisedImpactMag` defined in pure-helper signature below. 50k convergence test asserts mean P matches calibration target across distribution of bill impacts. |
| S7 | Enquete duration | Uniform draw `[ENQUETE_DURATION_MIN_DAYS = 360, ENQUETE_DURATION_MAX_DAYS = 720]`. Many Kommissionen run beyond term-end (matches reality). |
| S8 | Enquete max active | 2 (`ENQUETE_MAX_ACTIVE`) counted as `proposed + active` rows. Matches Cycle 4 `INQUIRY_MAX_ACTIVE` for the same Bundestag-clogging rationale. |
| S9 | Enquete rate-limit | 90 sim days between proposals (`ENQUETE_RATE_LIMIT_DAYS`). Twice the Cycle 4 inquiry rate-limit since Kommissionen run longer. Tracked via `simulation_meta.last_enquete_proposed_day`. |
| S10 | Enquete membership | 17 MdB slots (`ENQUETE_MDB_SLOTS`) proportional to Fraktion-bearing party seat counts via largest-remainder method (Σ === 17 invariant). 4–6 experts (`ENQUETE_EXPERT_SLOTS_MIN..MAX`) from pool by `expertise_areas ∋ topic`. No per-MdB seat-level membership (deferred — same blocker as Cycle 4 Q7). |
| S11 | Enquete trigger context | `persistent_crisis` only (`daysActive ≥ ENQUETE_PERSISTENT_CRISIS_THRESHOLD_DAYS = 60`). The `low_sentiment_streak` trigger considered during design but rejected as redundant with the existing snap-election approval-streak machinery. No new state-streak column. |
| S12 | Enquete vote tally | `tallyEnqueteVote(parties, proposingPartyId, coalitionPartyIds, publicSentiment, rng?)` returns `{yes, no, abstain, passed}`. Proposing party 100% yes; coalition (non-pariah) 98% Bernoulli yes; opposition (non-pariah) 85% baseline + sentiment adjustment, capped; pariah 50% Bernoulli. `passed := yes > no` (simple majority of cast votes — Bundestag-Beschluss). 50k convergence target: pass-rate ≥ 92%. |
| S13 | Migration | Single `cycle5Migrated` meta flag. 3 new tables in `SIM_TABLE_DDL` only — no synthetic `_table` rows in `SIM_COLUMN_MIGRATIONS` per PR #165 R1. `EXPERTS_SEED` rows inserted via `INSERT OR IGNORE` (idempotent). Wrapped in `getSqlite().transaction()`. |
| S14 | `BILL_CATEGORY_TO_MINISTRY` rename | Rename Cycle 4 S18's `CRISIS_CATEGORY_TO_MINISTRY` → `BILL_CATEGORY_TO_MINISTRY`. Note: `CrisisCategory = BillCategory` is already a type alias in `packages/types/src/types/economy.ts:24`, so no key-type change — naming clarity only. Single import-update in `simulation/budget.ts::generateNachtragsAllocations`. |
| S15 | Event-tier classifications (6 new) | Explicit per-event registration in `simulation/timing.ts` per Cycle 3 R-item lesson (no defaults). `ausschussanhoerung_held` → standard; `enquete_proposed` → important; `enquete_convened` → important; `enquete_rejected` → routine; `enquete_concluded` → important; `schuldenbremse_expired` → routine. |
| S16 | Cycle 4 docs cleanup | PR 4 (final commit) deletes `docs/plans/043-cycle4-spec.md` + `docs/plans/043-cycle4-brainstorm.md`. Same commit as polish; not a separate chore PR. |
| S17 | `AgentContext.enqueteOpportunity` visibility | Surfaced to **both** coalition + opposition agents (Enquete is bipartisan in real Bundestag, unlike Cycle 4 `inquiryOpportunity` which is opposition-only). Agent-prompt section in `agent/prompt.ts` explains this is a moment a Fraktion may propose a cross-party policy commission. |
| S18 | R-item routing | R4 (Schuldenbremse calibration) + R5 (Nachtrags rounding) + R10 (typed `PendingInjection` discriminant) → PR 3. R6 (any-casts) + R7 (mdb names) + R8 (unused param) + R9 (drizzle mock comment) → PR 4. R1–R3 already in `78f8bf4` from Cycle 4 review-fix; not repeated. |
| S19 | PR 4 commit prefix | `chore(sim-fidelity):` (polish, no functional change → no version bump). User can switch to `feat(sim-fidelity):` if a Cycle-5 minor bump is preferred. Default: `chore`. |
| S20 | Schuldenbremse passage threshold | `tallySchuldenbremseVote` switches from per-party-Bernoulli simple-majority pass to `yes >= MAJORITY_SEATS` (=316 of 630, matches Art. 115 Abs. 2 Satz 6 GG). Reuses `voting.ts "absolute"` mode semantic — no new vote primitive. |
| S21 | Schuldenbremse coalition yes-rate (R4) | `SCHULDENBREMSE_COALITION_YES_RATE` lowered from 0.95 → 0.88 to model dissent on a controversial fiscal instrument. `SCHULDENBREMSE_OPPOSITION_YES_BASE` recalibrated via 50k convergence test to land pass-rate at 60–80% when justification is met. |
| S22 | Schuldenbremse expiry event | New `schuldenbremse_expired` event type (routine tier). New pure helper `applySchuldenbremseExpiry(state, meta, currentDay)` returns `{expired, event?}`. Replaces in-place mutation in existing `checkSchuldenbremseExpiry` — caller persists event when emitted. Closes Cycle 4 silent auto-restore path. |
| S23 | Nachtrags rounding (R5) | `generateNachtragsAllocations`: round first 7 ministries to 0.1B EUR each; last gets `total - sum(first7)` (carry-the-remainder pattern). Σ === total invariant test added. |
| S24 | Typed PendingInjection (R10) | Convert `PendingInjection.data` to a discriminated union by `type` field. `PendingInjection<"nachtragshaushalt"> = { type: "nachtragshaushalt"; data: { allocations; total; crisisCategory } }`. Replaces all `data: {...} as any` in `loop.ts` step 10h + `processNachtragsInjection`. TypeScript catches all caller sites at compile-time. |

## Non-goals

- **No external Enquete experts beyond seeded pool** — experts are real public-figure German policy researchers (~30 named) selected from `EXPERTS_SEED`; no AI-invented external actors.
- **No expert sentiment / ideological lean** — experts are neutral institutional voices selected by ministry expertise; political color not modeled.
- **No per-MdB Enquete-Kommissions-Mitgliedschaft** — count-only allocation per Fraktion (matches Cycle 4 Q7 inquiry seat-level deferral; same blocker, same Cycle-6+ slot).
- **No qualified-⅔-majority primitive** — not needed for Cycle 5 (Schuldenbremse uses absolute-majority per Q1). Could be added when constitutional-amendment work appears.
- **No agent customization** of Ausschussanhörung outcomes — procedural by design (Q4 = A); agents have no surface.
- **No agent customization** of Nachtragshaushalt allocation — still formulaic (Cycle 4 deferral carries).
- **No frontend rendering** for new Cycle 5 event types (6 new) or carry-forward of Cycle 4 events (12 new). Compact/standard/breaking treatments require frontend-cycle work.
- **No Ordnungsruf, no Inquiry court powers, no Nachtragshaushalt-agent customization** — Cycle 4 open items carry to Cycle 6+.
- **No end-to-end seeded RNG plumbing** — pure helpers accept optional `rng`; production uses `Math.random` (carried open from Cycle 3+4).
- **No AI text on Kurzintervention / Zwischenfrage** — Cycle 4 deferral carries.
- **No retroactive impact** on in-flight bills/Kommissionen/elections at migration time — new physics applies forward only (Cycle 3 S5/S6 + Cycle 4 precedent).
- **No changes** to Cycle 1/2a/2b/3/4 code paths beyond the targeted R-item touches in PR 3 + PR 4 + the single `BILL_CATEGORY_TO_MINISTRY` rename in PR 1 (`budget.ts` import line).

## Design — Piece 1: Ausschussanhörungen + experts seed table

The heaviest piece. Two new tables (one seeded once, one populated lifecycle-style), pure helpers, AI batch builder/processor, auto-trigger integration in `bill-pipeline.ts` + `loop.ts`, no agent surface.

### File layout

- **New module**: `packages/engine/src/simulation/anhoerungen.ts` (~280 LOC)
- **New module**: `packages/engine/src/config/experts.ts` (~180 LOC; `EXPERTS_SEED` constant with ~30 entries)
- **New constants**: `packages/engine/src/config/parliament.ts` (5 new constants for Anhörung + rename of `CRISIS_CATEGORY_TO_MINISTRY` → `BILL_CATEGORY_TO_MINISTRY` per S14)
- **New schema**: `packages/engine/src/db/schema-sim.ts` (2 new tables)
- **New DDL**: `packages/engine/src/db/ddl.ts` (2 `CREATE TABLE IF NOT EXISTS` in `SIM_TABLE_DDL`; **no synthetic `_table` rows** in `SIM_COLUMN_MIGRATIONS` per S13/PR #165 R1)
- **New event type** (1): `packages/types/src/types/meta.ts` `SimulationEventType` union — add `ausschussanhoerung_held`
- **Tier classification**: `simulation/timing.ts` — `ausschussanhoerung_held` → standard (default; documented inline)
- **Bill-pipeline hook**: `simulation/bill-pipeline.ts` — call to `applyAnhoerungToneToAmendProb` at committee→2nd-reading transition
- **Loop integration**: `simulation/loop.ts` — step 5 trigger + batch submit + step 5b processor
- **Type additions**: `packages/types/src/types/economy.ts` — `Expert`, `AusschussanhoerungRow`, `AusschussanhoerungStatus`
- **Tests**: new `anhoerungen.test.ts` (~14 cases); new `experts-seed.test.ts` (1 case for seed-pool coverage invariant)

### Schema

**New table** `experts` in `simulation.db` (per S13 — DDL-only, seeded via `INSERT OR IGNORE`):

```ts
// db/schema-sim.ts
export const experts = sqliteTable("experts", {
  id: text("id").primaryKey(),                    // 'expert-diw-fratzscher'
  name: text("name").notNull(),                   // 'Prof. Dr. Marcel Fratzscher'
  affiliation: text("affiliation").notNull(),    // 'DIW Berlin'
  expertiseAreas: text("expertise_areas").notNull(), // JSON array of MinistryPortfolio[]
});
```

**New table** `ausschussanhoerungen` in `simulation.db`:

```ts
// db/schema-sim.ts
export const ausschussanhoerungen = sqliteTable("ausschussanhoerungen", {
  id: text("id").primaryKey(),                    // 'anhoerung-{billId}-{day}'
  billId: text("bill_id").notNull()
    .references(() => bills.id),
  ministryFocus: text("ministry_focus").notNull(),// MinistryPortfolio value (mapped from BillCategory via S14)
  expertIds: text("expert_ids").notNull(),       // JSON: string[] of length === ANHOERUNG_EXPERTS_PER_HEARING
  testimonies: text("testimonies").notNull().default("[]"), // JSON: [{expertId, statement}]; [] until AI lands
  tone: real("tone").notNull().default(0),       // [-1, +1]; 0 until AI lands or on lapse
  heldOnDay: integer("held_on_day").notNull(),
  status: text("status", {
    enum: ["scheduled", "held", "lapsed"]
  }).notNull().default("scheduled"),
});
```

### Seed data (`config/experts.ts`)

```ts
// packages/engine/src/config/experts.ts
import type { MinistryPortfolio } from "../../types/src/types/economy.js";

export type ExpertSeedRow = {
  id: string;
  name: string;
  affiliation: string;
  expertiseAreas: MinistryPortfolio[];
};

/**
 * S2: ~30 named real public-figure German policy experts who routinely
 * appear at Bundestag-Anhörungen. Real institutional affiliations
 * (DIW, Sachverständigenrat, etc.) — see comment in S2 for criteria.
 *
 * R5: Affiliations age. Annual review cadence; current as of 2026-04.
 *
 * Invariant (test-asserted): every MinistryPortfolio value is covered
 * by at least 3 expertise_areas overlaps.
 */
export const EXPERTS_SEED: readonly ExpertSeedRow[] = [
  // ── Economic / fiscal (8–10 experts) ─────────────────────────────
  { id: "expert-diw-fratzscher",      name: "Prof. Dr. Marcel Fratzscher",   affiliation: "DIW Berlin",                          expertiseAreas: ["economy", "finance"] },
  { id: "expert-svr-grimm",           name: "Prof. Dr. Veronika Grimm",      affiliation: "Sachverständigenrat / FAU Erlangen",  expertiseAreas: ["economy", "environment"] },
  { id: "expert-svr-truger",          name: "Prof. Dr. Achim Truger",        affiliation: "Sachverständigenrat / Univ. Duisburg-Essen", expertiseAreas: ["economy", "finance"] },
  { id: "expert-svr-schnitzer",       name: "Prof. Dr. Monika Schnitzer",    affiliation: "Sachverständigenrat / LMU München",   expertiseAreas: ["economy"] },
  { id: "expert-svr-wieland",         name: "Prof. Dr. Volker Wieland",      affiliation: "Goethe-Universität Frankfurt",        expertiseAreas: ["economy", "finance"] },
  { id: "expert-ifw-kiel",            name: "Prof. Dr. Moritz Schularick",   affiliation: "IfW Kiel",                            expertiseAreas: ["economy", "finance"] },
  { id: "expert-rwi-essen",           name: "Prof. Dr. Christoph Schmidt",   affiliation: "RWI Essen",                           expertiseAreas: ["economy"] },
  { id: "expert-zew-mannheim",        name: "Prof. Dr. Achim Wambach",       affiliation: "ZEW Mannheim",                        expertiseAreas: ["economy", "finance"] },
  { id: "expert-iw-koeln",            name: "Prof. Dr. Michael Hüther",      affiliation: "IW Köln",                             expertiseAreas: ["economy"] },
  { id: "expert-ifo-fuest",           name: "Prof. Dr. Clemens Fuest",       affiliation: "ifo Institut",                        expertiseAreas: ["economy", "finance"] },

  // ── Defense / foreign policy (4–5 experts) ───────────────────────
  { id: "expert-swp-perthes",         name: "Dr. Volker Perthes",            affiliation: "SWP Berlin",                          expertiseAreas: ["defence", "justice"] },
  { id: "expert-dgap-kornblum",       name: "Dr. Daniela Schwarzer",         affiliation: "DGAP",                                expertiseAreas: ["defence"] },
  { id: "expert-hertie-lenz",         name: "Prof. Dr. Tonia Lenz",          affiliation: "Hertie School",                       expertiseAreas: ["defence", "justice"] },
  { id: "expert-giga-hofmeister",     name: "Prof. Dr. Robert Hofmeister",   affiliation: "GIGA Hamburg",                        expertiseAreas: ["defence", "interior"] },

  // ── Environment / climate (4–5 experts) ──────────────────────────
  { id: "expert-pik-edenhofer",       name: "Prof. Dr. Ottmar Edenhofer",    affiliation: "Potsdam-Institut PIK",                expertiseAreas: ["environment", "economy"] },
  { id: "expert-mcc-creutzig",        name: "Prof. Dr. Felix Creutzig",      affiliation: "MCC Berlin",                          expertiseAreas: ["environment"] },
  { id: "expert-diw-kemfert",         name: "Prof. Dr. Claudia Kemfert",     affiliation: "DIW Berlin (Energy)",                 expertiseAreas: ["environment", "economy"] },
  { id: "expert-bund-bandt",          name: "Olaf Bandt",                    affiliation: "BUND",                                expertiseAreas: ["environment"] },

  // ── Social / family (3–4 experts) ────────────────────────────────
  { id: "expert-hertie-allmendinger", name: "Prof. Dr. Jutta Allmendinger",  affiliation: "WZB Berlin",                          expertiseAreas: ["family", "health"] },
  { id: "expert-awo-stadler",         name: "Dr. Michael Groß",              affiliation: "AwO Bundesverband",                   expertiseAreas: ["family"] },
  { id: "expert-caritas-welskop",     name: "Eva Welskop-Deffaa",            affiliation: "Caritas",                             expertiseAreas: ["family", "health"] },

  // ── Health (3–4 experts) ─────────────────────────────────────────
  { id: "expert-rki-wieler",          name: "Prof. Dr. Hendrik Streeck",     affiliation: "Universität Bonn / Virologie",        expertiseAreas: ["health"] },
  { id: "expert-charite-kroemer",     name: "Prof. Dr. Heyo Kroemer",        affiliation: "Charité Berlin",                      expertiseAreas: ["health"] },
  { id: "expert-bertelsmann-gohl",    name: "Dr. Stefan Etgeton",            affiliation: "Bertelsmann Stiftung",                expertiseAreas: ["health", "family"] },

  // ── Justice / interior (3–4 experts) ─────────────────────────────
  { id: "expert-mpi-strafrecht",      name: "Prof. Dr. Tatjana Hörnle",      affiliation: "MPI Strafrecht Freiburg",             expertiseAreas: ["justice"] },
  { id: "expert-mpi-voelkerrecht",    name: "Prof. Dr. Anne Peters",         affiliation: "MPI Völkerrecht Heidelberg",          expertiseAreas: ["justice", "interior"] },
  { id: "expert-giga-mehler",         name: "Prof. Dr. Andreas Mehler",      affiliation: "Universität Freiburg / GIGA",         expertiseAreas: ["interior", "justice"] },

  // ── Finance specialists (2–3 experts) ────────────────────────────
  { id: "expert-bundesbank-nagel",    name: "Dr. Joachim Nagel",             affiliation: "Bundesbank",                          expertiseAreas: ["finance", "economy"] },
  { id: "expert-ifo-finance",         name: "Prof. Dr. Niklas Potrafke",     affiliation: "ifo Institut (Public Finance)",       expertiseAreas: ["finance"] },
];
```

**Seed-pool invariant** (test-asserted in `experts-seed.test.ts`):

```ts
import { EXPERTS_SEED } from "../config/experts.js";
import { MINISTRY_PORTFOLIOS } from "../config/parliament.js";

it("EXPERTS_SEED covers every ministry portfolio with ≥3 experts (S2 invariant)", () => {
  for (const ministry of MINISTRY_PORTFOLIOS) {
    const matching = EXPERTS_SEED.filter(e => e.expertiseAreas.includes(ministry));
    expect(matching.length).toBeGreaterThanOrEqual(3);
  }
});
```

### Constants (`config/parliament.ts`)

```ts
// --- Cycle 5 PR 1 — Ausschussanhörungen ---

/** Q4/S6: base hearing probability before impact-weighting. */
export const ANHOERUNG_BASE_PROBABILITY = 0.20;

/** Q4/S6: linear coefficient on normalisedImpactMag in the trigger formula. */
export const ANHOERUNG_IMPACT_COEFFICIENT = 0.40;

/** Q4/S6: hard cap on hearing probability regardless of impact. */
export const ANHOERUNG_PROBABILITY_CAP = 0.70;

/** S4: max bias on committee→2nd-reading amend probability from tone scalar. */
export const ANHOERUNG_TONE_INFLUENCE = 0.05;

/** S5: experts invited per hearing. Constraint: <= EXPERTS_SEED ministry-bucket size. */
export const ANHOERUNG_EXPERTS_PER_HEARING = 3;

// --- S14: rename of Cycle 4's CRISIS_CATEGORY_TO_MINISTRY ---
//
// CrisisCategory is already a type alias for BillCategory
// (packages/types/src/types/economy.ts:24), so this is a naming-only change.
// Used by: simulation/anhoerungen.ts (Anhörung expert selection),
//          simulation/budget.ts::generateNachtragsAllocations (Cycle 4 Nachtrags allocation).

import type { BillCategory, MinistryPortfolio } from "../../types/src/types/economy.js";

/** Map of bill (or crisis) category → relevant ministry. Cycle 4 S18 contents preserved verbatim. */
export const BILL_CATEGORY_TO_MINISTRY: Record<BillCategory, MinistryPortfolio> = {
  economy:     "economy",
  finance:     "finance",
  defence:     "defence",
  justice:     "justice",
  interior:    "interior",
  family:      "family",
  environment: "environment",
  health:      "health",
};

/** @deprecated S14 — alias kept for one cycle to avoid touching every Cycle 4 callsite. */
export const CRISIS_CATEGORY_TO_MINISTRY = BILL_CATEGORY_TO_MINISTRY;
```

### Pure helpers (`simulation/anhoerungen.ts`)

```ts
import type { Bill, BillCategory } from "../../types/src/types/bills.js";
import type { Expert, MinistryPortfolio } from "../../types/src/types/economy.js";
import {
  ANHOERUNG_BASE_PROBABILITY,
  ANHOERUNG_IMPACT_COEFFICIENT,
  ANHOERUNG_PROBABILITY_CAP,
  ANHOERUNG_TONE_INFLUENCE,
  ANHOERUNG_EXPERTS_PER_HEARING,
  BILL_CATEGORY_TO_MINISTRY,
} from "../config/parliament.js";

/**
 * Q4/S6: probability that a bill entering committee stage gets an Anhörung.
 * Linear in normalised impact magnitude, hard-capped at ANHOERUNG_PROBABILITY_CAP.
 *
 * @param impactMagnitude  |gdpGrowth| + |publicSentiment| from the bill
 * @param rng              optional seeded RNG for tests
 */
export function shouldHoldAnhoerung(
  impactMagnitude: number,
  rng: () => number = Math.random,
): boolean {
  // Typical bills land in [0, 4] range for combined-magnitude. Normalise to [0, 1].
  const normalised = Math.min(impactMagnitude / 4.0, 1.0);
  const p = Math.min(
    ANHOERUNG_PROBABILITY_CAP,
    ANHOERUNG_BASE_PROBABILITY + ANHOERUNG_IMPACT_COEFFICIENT * normalised,
  );
  return rng() < p;
}

/**
 * S5: select ANHOERUNG_EXPERTS_PER_HEARING distinct experts whose
 * expertise_areas overlap ministryFocus. Sample without replacement.
 * Throws if filtered pool < count — prevented at runtime by S2 invariant.
 */
export function pickExpertsForHearing(
  ministryFocus: MinistryPortfolio,
  pool: readonly Expert[],
  count: number = ANHOERUNG_EXPERTS_PER_HEARING,
  rng: () => number = Math.random,
): Expert[] {
  const matching = pool.filter(e => e.expertiseAreas.includes(ministryFocus));
  if (matching.length < count) {
    throw new Error(
      `Not enough experts for ministry ${ministryFocus}: ${matching.length} < ${count}`,
    );
  }
  // Fisher-Yates partial shuffle, take first `count`.
  const shuffled = [...matching];
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(rng() * (shuffled.length - i));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}

/**
 * S4: apply hearing tone scalar to committee→2nd-reading amend probability.
 *
 * Positive tone (expert endorsement) INCREASES amend probability — endorsed
 * bills benefit from refinement; opposed bills get rejected at 3rd reading
 * or pass without amendment. (R11 directionality lock.)
 *
 * Pure, no RNG. Clamps result to [0, 1].
 */
export function applyAnhoerungToneToAmendProb(
  baseAmendProb: number,
  tone: number,
): number {
  return Math.max(0, Math.min(1, baseAmendProb + tone * ANHOERUNG_TONE_INFLUENCE));
}

/** S14: BillCategory → MinistryPortfolio. Re-exports `BILL_CATEGORY_TO_MINISTRY` lookup. */
export function billCategoryToMinistry(category: BillCategory): MinistryPortfolio {
  return BILL_CATEGORY_TO_MINISTRY[category];
}
```

### AI batch builder + processor

```ts
// simulation/anhoerungen.ts (cont.)
import type { BatchRequest, BatchResult } from "../agent/batch-client.js";
import { logAICall } from "../agent/ai-json.js";
import { parseAIJson } from "../agent/ai-json.js";
import { getDb, getSqlite } from "../db/connection.js";
import { eq } from "drizzle-orm";
import { ausschussanhoerungen } from "../db/schema-sim.js";

type AnhoerungBatchInput = {
  rowId: string;        // ausschussanhoerungen.id
  bill: Bill;
  ministryFocus: MinistryPortfolio;
  experts: Expert[];    // length === ANHOERUNG_EXPERTS_PER_HEARING
};

type AnhoerungBatchResult = {
  testimonies: { expertId: string; statement: string }[];
  tone: number;        // [-1, +1]
};

const ANHOERUNG_AI_SYSTEM_PROMPT = `Du bist ein neutraler Berichterstatter über
deutsche Bundestags-Anhörungen. Deine Aufgabe: drei Sachverständigen-Stellungnahmen
zu einem Gesetzentwurf in einer Ausschussanhörung formulieren, jeweils 1–2 Sätze
in deutscher Sprache, journalistischer Register, ohne erfundene Fakten jenseits
des bereitgestellten Kontexts.

Antwort als JSON: { "testimonies": [{ "expertId": "...", "statement": "..." }, ...],
"tone": <Skalar von -1 (ablehnend) bis +1 (befürwortend), gewichteter Durchschnitt
der Expertenpositionen> }`;

export function buildAusschussanhoerungenBatchRequest(
  inputs: AnhoerungBatchInput[],
): BatchRequest[] {
  return inputs.map(input => ({
    customId: `anhoerung:${input.rowId}`,
    system: ANHOERUNG_AI_SYSTEM_PROMPT,
    prompt:
      `Gesetzentwurf: ${input.bill.title}\n` +
      `Zusammenfassung: ${input.bill.summary}\n` +
      `Kategorie: ${input.bill.category} (Ressort: ${input.ministryFocus})\n\n` +
      `Sachverständige:\n` +
      input.experts.map(e =>
        `- ${e.name} (${e.affiliation}, expertiseAreas: ${e.expertiseAreas.join(", ")})`
      ).join("\n") +
      `\n\nLiefere Stellungnahmen + Tonus-Skalar als JSON.`,
    maxTokens: 600,
    roleKey: "daily" as const,
    metadata: { task: "ausschussanhoerung", rowId: input.rowId },
  }));
}

export async function processAusschussanhoerungenBatchResult(
  results: BatchResult[],
): Promise<void> {
  const db = getDb();
  for (const result of results) {
    const rowId = result.metadata?.rowId as string;
    if (!rowId) continue;

    const startTime = Date.now();
    let parsed: AnhoerungBatchResult | null = null;
    let logStatus: "OK" | "PARSE_FAIL" | "VALIDATION_FAIL" = "OK";

    try {
      parsed = parseAIJson<AnhoerungBatchResult>(
        result.text,
        v => Array.isArray(v?.testimonies)
          && v.testimonies.length === ANHOERUNG_EXPERTS_PER_HEARING
          && typeof v.tone === "number"
          && v.tone >= -1 && v.tone <= 1,
        "ausschussanhoerung",
      );
    } catch (err) {
      logStatus = "PARSE_FAIL";
    }

    logAICall(
      "ausschussanhoerung",
      result.provider,
      result.model,
      Date.now() - startTime,
      logStatus,
    );

    if (parsed) {
      await db.update(ausschussanhoerungen)
        .set({
          status: "held",
          testimonies: JSON.stringify(parsed.testimonies),
          tone: parsed.tone,
        })
        .where(eq(ausschussanhoerungen.id, rowId));
    } else {
      // S3: AI failure → status='lapsed', tone=0; bill pipeline reads 0 as no-nudge.
      await db.update(ausschussanhoerungen)
        .set({ status: "lapsed", testimonies: "[]", tone: 0 })
        .where(eq(ausschussanhoerungen.id, rowId));
    }
  }
}
```

### Loop integration (`simulation/loop.ts`)

Step 5 (existing bill pipeline section) — when `bill_committee_stage` event is emitted for a bill, immediately roll the trigger:

```ts
// simulation/loop.ts step 5 — inside the bill_committee_stage emission block
import {
  shouldHoldAnhoerung,
  pickExpertsForHearing,
  buildAusschussanhoerungenBatchRequest,
  billCategoryToMinistry,
} from "./anhoerungen.js";
import { ausschussanhoerungen, experts as expertsTable } from "../db/schema-sim.js";

// ... existing bill_committee_stage emit ...

// Cycle 5 PR 1: roll Anhörung trigger for this committee-stage bill
const impactMag =
  Math.abs(bill.impact?.gdpGrowth ?? 0) +
  Math.abs(bill.impact?.publicSentiment ?? 0);
if (shouldHoldAnhoerung(impactMag)) {
  const ministryFocus = billCategoryToMinistry(bill.category);
  const expertPool = await db.select().from(expertsTable);
  const chosen = pickExpertsForHearing(ministryFocus, expertPool);

  const rowId = `anhoerung-${bill.id}-${currentDay}`;
  await db.insert(ausschussanhoerungen).values({
    id: rowId,
    billId: bill.id,
    ministryFocus,
    expertIds: JSON.stringify(chosen.map(e => e.id)),
    testimonies: "[]",
    tone: 0,
    heldOnDay: currentDay,
    status: "scheduled",
  });

  anhoerungBatchInputs.push({
    rowId,
    bill,
    ministryFocus,
    experts: chosen,
  });
}
```

Step 5b (post-batch — after the existing batch group A submission, in the same daily tick):

```ts
// simulation/loop.ts step 5b
if (anhoerungBatchInputs.length > 0) {
  const requests = buildAusschussanhoerungenBatchRequest(anhoerungBatchInputs);
  const results = await submitBatch(requests, batchClient);
  await processAusschussanhoerungenBatchResult(results);
}
```

### Bill-pipeline integration (`simulation/bill-pipeline.ts`)

At the committee→2nd-reading transition (existing logic that decides amend vs. pass-through), look up the matching `ausschussanhoerungen` row and apply tone:

```ts
// simulation/bill-pipeline.ts
import { applyAnhoerungToneToAmendProb } from "./anhoerungen.js";

// ... existing amend-probability calculation produces baseAmendProb ...

// Cycle 5 PR 1 / S4: Anhörung tone nudges amend probability.
const anhoerung = await db.select()
  .from(ausschussanhoerungen)
  .where(eq(ausschussanhoerungen.billId, bill.id))
  .limit(1);
const tone = anhoerung[0]?.tone ?? 0;  // 0 if no row OR if row is 'scheduled'/'lapsed'
const amendProb = applyAnhoerungToneToAmendProb(baseAmendProb, tone);
```

### Tests (`anhoerungen.test.ts` — ~14 cases)

```ts
import { describe, it, expect } from "vitest";
import {
  shouldHoldAnhoerung,
  pickExpertsForHearing,
  applyAnhoerungToneToAmendProb,
  billCategoryToMinistry,
} from "./anhoerungen.js";
import { EXPERTS_SEED } from "../config/experts.js";

describe("shouldHoldAnhoerung — convergence", () => {
  it("at impactMag=0 → P ≈ 0.20 across 50,000 trials (Q4/S6)", () => {
    let yes = 0;
    const seed = 12345;
    let state = seed;
    const lcg = () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 2 ** 32; };
    for (let i = 0; i < 50_000; i++) if (shouldHoldAnhoerung(0, lcg)) yes++;
    expect(yes / 50_000).toBeCloseTo(0.20, 2);
  });

  it("at large impactMag → P clamps to 0.70 (Q4/S6)", () => {
    let yes = 0;
    const seed = 12345;
    let state = seed;
    const lcg = () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 2 ** 32; };
    for (let i = 0; i < 50_000; i++) if (shouldHoldAnhoerung(20, lcg)) yes++;
    expect(yes / 50_000).toBeCloseTo(0.70, 2);
  });
});

describe("pickExpertsForHearing", () => {
  it("returns ANHOERUNG_EXPERTS_PER_HEARING distinct experts overlapping ministryFocus", () => {
    const chosen = pickExpertsForHearing("economy", EXPERTS_SEED, 3);
    expect(chosen).toHaveLength(3);
    expect(new Set(chosen.map(e => e.id)).size).toBe(3);
    chosen.forEach(e => expect(e.expertiseAreas).toContain("economy"));
  });

  it("throws if filtered pool < count", () => {
    const tinyPool = [EXPERTS_SEED[0]]; // 1 expert
    expect(() => pickExpertsForHearing("economy", tinyPool, 3)).toThrow(/Not enough experts/);
  });
});

describe("applyAnhoerungToneToAmendProb", () => {
  it("positive tone increases amend probability (R11 directionality)", () => {
    expect(applyAnhoerungToneToAmendProb(0.5, 1)).toBeGreaterThan(0.5);
  });
  it("negative tone decreases amend probability", () => {
    expect(applyAnhoerungToneToAmendProb(0.5, -1)).toBeLessThan(0.5);
  });
  it("zero tone is no-op (S3 lapse path)", () => {
    expect(applyAnhoerungToneToAmendProb(0.5, 0)).toBe(0.5);
  });
  it("clamps to [0, 1]", () => {
    expect(applyAnhoerungToneToAmendProb(0.99, 1)).toBeLessThanOrEqual(1);
    expect(applyAnhoerungToneToAmendProb(0.01, -1)).toBeGreaterThanOrEqual(0);
  });
  it("max bias is ANHOERUNG_TONE_INFLUENCE × 1 = 0.05", () => {
    expect(applyAnhoerungToneToAmendProb(0.5, 1) - 0.5).toBeCloseTo(0.05, 6);
  });
});

describe("billCategoryToMinistry (S14)", () => {
  it("maps every BillCategory to a defined MinistryPortfolio", () => {
    expect(billCategoryToMinistry("economy")).toBe("economy");
    expect(billCategoryToMinistry("environment")).toBe("environment");
    // ... all 8 categories
  });
});
```

Plus `experts-seed.test.ts` with the seed-pool coverage invariant assertion (S2).

## Design — Piece 2: Enquete-Kommission

Long-form policy commission. Mid-fidelity per Q2 = A: establish + AI Schlussbericht only. Agent action triggered (Q5 = B), simple-majority Bundestag-Beschluss reuses voting.ts simple-majority pattern.

### File layout

- **New module**: `packages/engine/src/simulation/enquete-commissions.ts` (~320 LOC; pure helpers + lifecycle + AI batch + watchdog)
- **New constants**: `packages/engine/src/config/parliament.ts` (8 new constants below)
- **New schema**: `packages/engine/src/db/schema-sim.ts` (1 new table) + 1 new column on `simulation_meta`
- **New DDL**: `packages/engine/src/db/ddl.ts` (1 `CREATE TABLE IF NOT EXISTS` in `SIM_TABLE_DDL`; 1 column add for `simulation_meta.last_enquete_proposed_day` in `SIM_COLUMN_MIGRATIONS`)
- **New event types** (4): `enquete_proposed`, `enquete_convened`, `enquete_rejected`, `enquete_concluded`
- **Tier classification**: `simulation/timing.ts` per S15 (3 → important, 1 → routine)
- **New agent action**: `request_enquete_kommission` in `agent/action-parser.ts` + agent prompt section in `agent/prompt.ts`
- **AgentContext extension**: `packages/types/src/types/agent.ts` — `enqueteOpportunity?: { topic; crisisId; daysActive }`
- **Loop integration**: `simulation/loop.ts` — step 5 context injection; step 10 action handling + same-tick vote; step 11 daily-conclude check + soft-watchdog
- **Tests**: `enquete-commissions.test.ts` (~12 cases)

### Schema

**New table** `enquete_commissions` in `simulation.db`:

```ts
// db/schema-sim.ts
export const enqueteCommissions = sqliteTable("enquete_commissions", {
  id: text("id").primaryKey(),                                  // 'enquete-{day}-{topic}'
  topic: text("topic").notNull(),                               // MinistryPortfolio value
  proposingPartyId: text("proposing_party_id").notNull()
    .references(() => parties.id),
  partyMemberIds: text("party_member_ids").notNull(),          // JSON: { [partyId]: number } (Σ === ENQUETE_MDB_SLOTS)
  expertMemberIds: text("expert_member_ids").notNull(),        // JSON: string[] of length [4, 6]
  formedOnDay: integer("formed_on_day").notNull(),
  scheduledEndDay: integer("scheduled_end_day").notNull(),     // formedOnDay + draw(360, 720)
  concludedOnDay: integer("concluded_on_day"),                 // null while active
  status: text("status", {
    enum: ["proposed", "active", "concluded", "rejected", "lapsed"]
  }).notNull().default("proposed"),
  finalReport: text("final_report"),                           // null until concluded
  voteResult: text("vote_result"),                             // JSON {yes, no, abstain, passed}, null until convened/rejected
});
```

**New column** on `simulation_meta`:

```ts
lastEnqueteProposedDay: integer("last_enquete_proposed_day"),  // S9 rate-limit
```

### Constants (`config/parliament.ts`)

```ts
// --- Cycle 5 PR 2 — Enquete-Kommission ---

/** S10: Total MdB slots in an Enquete-Kommission. Real Bundestag Enqueten typically have ~17. */
export const ENQUETE_MDB_SLOTS = 17;

/** S7: min/max Kommission duration (uniform draw). */
export const ENQUETE_DURATION_MIN_DAYS = 360;
export const ENQUETE_DURATION_MAX_DAYS = 720;

/** S8: max simultaneous proposed+active Kommissionen (Bundestag-clogging cap). */
export const ENQUETE_MAX_ACTIVE = 2;

/** S9: min sim days between Enquete proposals (rate-limit). */
export const ENQUETE_RATE_LIMIT_DAYS = 90;

/** S10: external expert slots per Kommission (uniform draw within range). */
export const ENQUETE_EXPERT_SLOTS_MIN = 4;
export const ENQUETE_EXPERT_SLOTS_MAX = 6;

/** S11: persistent-crisis duration that surfaces enqueteOpportunity. */
export const ENQUETE_PERSISTENT_CRISIS_THRESHOLD_DAYS = 60;

/** S12: vote tally constants. */
export const ENQUETE_PROPOSING_YES_RATE = 1.00;
export const ENQUETE_COALITION_YES_RATE = 0.98;
export const ENQUETE_OPPOSITION_YES_BASE = 0.85;
export const ENQUETE_PARIAH_YES_RATE = 0.50;
export const ENQUETE_OPPOSITION_SENTIMENT_ADJ_CAP = 0.10;
```

### Pure helpers (`simulation/enquete-commissions.ts`)

```ts
import type { Crisis } from "../../types/src/types/economy.js";
import type { Party } from "../../types/src/types/parties.js";
import type { Expert, MinistryPortfolio } from "../../types/src/types/economy.js";
import {
  ENQUETE_MDB_SLOTS,
  ENQUETE_DURATION_MIN_DAYS,
  ENQUETE_DURATION_MAX_DAYS,
  ENQUETE_EXPERT_SLOTS_MIN,
  ENQUETE_EXPERT_SLOTS_MAX,
  ENQUETE_PERSISTENT_CRISIS_THRESHOLD_DAYS,
  ENQUETE_PROPOSING_YES_RATE,
  ENQUETE_COALITION_YES_RATE,
  ENQUETE_OPPOSITION_YES_BASE,
  ENQUETE_PARIAH_YES_RATE,
  ENQUETE_OPPOSITION_SENTIMENT_ADJ_CAP,
  BILL_CATEGORY_TO_MINISTRY,
} from "../config/parliament.js";
import { PARIAH_PARTIES } from "../config/elections.js";

export type EnqueteOpportunity = {
  topic: MinistryPortfolio;
  crisisId: string;
  daysActive: number;
};

/**
 * S11: surface a persistent-crisis-driven Enquete opportunity.
 * Picks the longest-active crisis with daysActive >= 60.
 * Returns null if no crisis qualifies.
 */
export function findEnqueteOpportunity(
  crises: Crisis[],
  currentDay: number,
): EnqueteOpportunity | null {
  let best: EnqueteOpportunity | null = null;
  for (const c of crises) {
    if (c.status !== "active") continue;
    const daysActive = currentDay - c.startDay;
    if (daysActive < ENQUETE_PERSISTENT_CRISIS_THRESHOLD_DAYS) continue;
    if (best == null || daysActive > best.daysActive) {
      best = {
        topic: BILL_CATEGORY_TO_MINISTRY[c.category],
        crisisId: c.id,
        daysActive,
      };
    }
  }
  return best;
}

/**
 * S10: proportional MdB slot allocation across Fraktion-bearing parties
 * via largest-remainder method (Hare quota). Σ output values === totalSlots.
 */
export function selectEnqueteMembers(
  parties: Party[],                      // Fraktion-bearing only (caller filters)
  totalSlots: number = ENQUETE_MDB_SLOTS,
): Record<string, number> {
  const totalSeats = parties.reduce((s, p) => s + p.seatCount, 0);
  if (totalSeats === 0) return {};

  // Phase 1: integer floors of proportional shares
  const exactShares = parties.map(p => ({
    id: p.id,
    exact: (p.seatCount / totalSeats) * totalSlots,
  }));
  const floors = exactShares.map(({ id, exact }) => ({
    id,
    floor: Math.floor(exact),
    remainder: exact - Math.floor(exact),
  }));

  let allocated = floors.reduce((s, f) => s + f.floor, 0);
  let leftover = totalSlots - allocated;

  // Phase 2: distribute leftover slots to largest remainders (largest-remainder method)
  floors.sort((a, b) => b.remainder - a.remainder);
  for (let i = 0; i < leftover; i++) {
    floors[i % floors.length].floor += 1;
  }

  const result: Record<string, number> = {};
  for (const f of floors) result[f.id] = f.floor;
  return result;
}

/**
 * S10: pick 4–6 experts whose expertise_areas overlap topic.
 * Sample without replacement; throws if filtered pool < ENQUETE_EXPERT_SLOTS_MIN.
 */
export function pickEnqueteExperts(
  topic: MinistryPortfolio,
  pool: readonly Expert[],
  rng: () => number = Math.random,
): Expert[] {
  const matching = pool.filter(e => e.expertiseAreas.includes(topic));
  if (matching.length < ENQUETE_EXPERT_SLOTS_MIN) {
    throw new Error(
      `Not enough experts for topic ${topic}: ${matching.length} < ${ENQUETE_EXPERT_SLOTS_MIN}`,
    );
  }
  const slots = ENQUETE_EXPERT_SLOTS_MIN
    + Math.floor(rng() * (ENQUETE_EXPERT_SLOTS_MAX - ENQUETE_EXPERT_SLOTS_MIN + 1));
  const count = Math.min(slots, matching.length);

  const shuffled = [...matching];
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(rng() * (shuffled.length - i));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}

/**
 * S12: tally a Bundestag-Beschluss on an Enquete-Kommission proposal.
 *
 * Voting pattern:
 *   - Proposing party: 100% yes
 *   - Coalition (non-pariah): 98% Bernoulli yes (cross-party support norm)
 *   - Opposition (non-pariah): 85% baseline + sentiment-adjusted, capped
 *   - Pariah: 50% Bernoulli
 *
 * passed := yes > no (simple majority of cast votes — Bundestag-Beschluss).
 *
 * Pure: accepts seeded RNG for tests.
 */
export function tallyEnqueteVote(
  parties: Party[],
  proposingPartyId: string,
  coalitionPartyIds: string[],
  publicSentiment: number,
  rng: () => number = Math.random,
): { yes: number; no: number; abstain: number; passed: boolean } {
  const coalitionSet = new Set(coalitionPartyIds);
  const sentimentAdj = Math.max(
    -ENQUETE_OPPOSITION_SENTIMENT_ADJ_CAP,
    Math.min(
      ENQUETE_OPPOSITION_SENTIMENT_ADJ_CAP,
      (publicSentiment - 45) / 100,
    ),
  );
  const oppositionYesShare = Math.min(
    1.0,
    Math.max(0, ENQUETE_OPPOSITION_YES_BASE + sentimentAdj),
  );

  let yes = 0;
  let no = 0;
  for (const p of parties) {
    let yesProb: number;
    if (p.id === proposingPartyId) {
      yesProb = ENQUETE_PROPOSING_YES_RATE;
    } else if (PARIAH_PARTIES.has(p.id)) {
      yesProb = ENQUETE_PARIAH_YES_RATE;
    } else if (coalitionSet.has(p.id)) {
      yesProb = ENQUETE_COALITION_YES_RATE;
    } else {
      yesProb = oppositionYesShare;
    }
    if (rng() < yesProb) yes += p.seatCount;
    else no += p.seatCount;
  }
  return { yes, no, abstain: 0, passed: yes > no };
}

/** S7: uniform draw of Kommission scheduled duration. */
export function pickEnqueteDuration(rng: () => number = Math.random): number {
  return ENQUETE_DURATION_MIN_DAYS
    + Math.floor(rng() * (ENQUETE_DURATION_MAX_DAYS - ENQUETE_DURATION_MIN_DAYS + 1));
}
```

### AI batch builder + processor

```ts
// simulation/enquete-commissions.ts (cont.)
import type { BatchRequest, BatchResult } from "../agent/batch-client.js";
import { logAICall } from "../agent/ai-json.js";
import { getDb } from "../db/connection.js";
import { eq } from "drizzle-orm";
import { enqueteCommissions } from "../db/schema-sim.js";

const ENQUETE_FINAL_REPORT_SYSTEM_PROMPT = `Du bist Verfasser einer Enquete-
Kommissions-Schlussberichtszusammenfassung des Deutschen Bundestages.
Aufgabe: 6–10 Sätze in deutscher Sprache, journalistisch-sachlicher Ton, ohne
erfundene Fakten. Beziehe Themenkomplex, Mitgliederzusammensetzung und konkrete
Politikempfehlungen ein. Liefere Klartext (kein JSON, kein Markdown).`;

type EnqueteFinalReportInput = {
  rowId: string;
  topic: MinistryPortfolio;
  partyMemberIds: Record<string, number>;
  expertNames: string[];
  durationDays: number;
};

export function buildEnqueteFinalReportBatchRequest(
  inputs: EnqueteFinalReportInput[],
): BatchRequest[] {
  return inputs.map(input => ({
    customId: `enquete-final:${input.rowId}`,
    system: ENQUETE_FINAL_REPORT_SYSTEM_PROMPT,
    prompt:
      `Themenkomplex: ${input.topic}\n` +
      `Laufzeit: ${input.durationDays} Tage\n` +
      `MdB-Mitglieder pro Fraktion: ` +
      Object.entries(input.partyMemberIds).map(([k, v]) => `${k}=${v}`).join(", ") +
      `\n` +
      `Sachverständige: ${input.expertNames.join(", ")}\n\n` +
      `Verfasse die Schlussbericht-Zusammenfassung.`,
    maxTokens: 800,
    roleKey: "daily" as const,
    metadata: { task: "enquete_final_report", rowId: input.rowId },
  }));
}

export async function processEnqueteFinalReportBatchResult(
  results: BatchResult[],
  currentDay: number,
): Promise<void> {
  const db = getDb();
  for (const result of results) {
    const rowId = result.metadata?.rowId as string;
    if (!rowId) continue;

    const startTime = Date.now();
    const reportText = (result.text ?? "").trim();
    const ok = reportText.length >= 50;  // basic sanity
    logAICall(
      "enquete_final_report",
      result.provider,
      result.model,
      Date.now() - startTime,
      ok ? "OK" : "VALIDATION_FAIL",
    );

    await db.update(enqueteCommissions)
      .set({
        status: "concluded",
        finalReport: ok ? reportText : "Kommission abgeschlossen — Bericht ausstehend.",
        concludedOnDay: currentDay,
      })
      .where(eq(enqueteCommissions.id, rowId));
  }
}
```

### Loop integration (`simulation/loop.ts`)

**Step 5** — populate `enqueteOpportunity` in AgentContext for both coalition + opposition (S17):

```ts
// step 5
import { findEnqueteOpportunity } from "./enquete-commissions.js";

const activeCrises = await db.select().from(crises).where(eq(crises.status, "active"));
const enqueteOpp = findEnqueteOpportunity(activeCrises, currentDay);

// In the per-party AgentContext build:
context.enqueteOpportunity = enqueteOpp ?? undefined;
```

**Step 10** — handle `request_enquete_kommission` actions, run same-tick vote:

```ts
// step 10
import {
  selectEnqueteMembers,
  pickEnqueteExperts,
  tallyEnqueteVote,
  pickEnqueteDuration,
  buildEnqueteFinalReportBatchRequest,
  processEnqueteFinalReportBatchResult,
} from "./enquete-commissions.js";
import { enqueteCommissions, experts as expertsTable } from "../db/schema-sim.js";
import { ENQUETE_RATE_LIMIT_DAYS, ENQUETE_MAX_ACTIVE } from "../config/parliament.js";

// Inside the action-processing loop:
let enqueteProcessed = false;
for (const action of actions) {
  if (action.type !== "request_enquete_kommission" || enqueteProcessed) continue;
  enqueteProcessed = true;

  // Validation already in action-parser; defense-in-depth:
  const activeCount = await db.select().from(enqueteCommissions)
    .where(or(
      eq(enqueteCommissions.status, "proposed"),
      eq(enqueteCommissions.status, "active"),
    ));
  if (activeCount.length >= ENQUETE_MAX_ACTIVE) continue;

  const lastDay = meta.lastEnqueteProposedDay ?? -Infinity;
  if (currentDay - lastDay < ENQUETE_RATE_LIMIT_DAYS) continue;

  const fraktionParties = parties.filter(p => p.hasFraktion);
  const memberAlloc = selectEnqueteMembers(fraktionParties);
  const expertPool = await db.select().from(expertsTable);
  const chosenExperts = pickEnqueteExperts(action.topic, expertPool);
  const duration = pickEnqueteDuration();

  const rowId = `enquete-${currentDay}-${action.topic}`;
  const voteResult = tallyEnqueteVote(
    parties, action.partyId, coalitionPartyIds, nationalState.publicSentiment,
  );

  const status = voteResult.passed ? "active" : "rejected";

  await db.insert(enqueteCommissions).values({
    id: rowId,
    topic: action.topic,
    proposingPartyId: action.partyId,
    partyMemberIds: JSON.stringify(memberAlloc),
    expertMemberIds: JSON.stringify(chosenExperts.map(e => e.id)),
    formedOnDay: currentDay,
    scheduledEndDay: currentDay + duration,
    status,
    voteResult: JSON.stringify(voteResult),
  });

  // Update meta rate-limit (S9). Note WHERE clause per PR #165 R2.
  await db.update(simulationMeta)
    .set({ lastEnqueteProposedDay: currentDay })
    .where(eq(simulationMeta.id, meta.id));

  // Emit events
  await emitEvent({ type: "enquete_proposed", ... });
  if (voteResult.passed) {
    await emitEvent({ type: "enquete_convened", description: `Bundestag-Beschluss: Enquete-Kommission "${action.topic}" eingesetzt. ${voteResult.yes} Ja, ${voteResult.no} Nein.`, ... });
  } else {
    await emitEvent({ type: "enquete_rejected", description: `Bundestag lehnt Enquete-Kommission "${action.topic}" ab. ${voteResult.yes} Ja, ${voteResult.no} Nein.`, ... });
  }
}
```

**Step 11** — daily check for concluded Kommissionen + soft-watchdog:

```ts
// step 11
const concluding = await db.select().from(enqueteCommissions)
  .where(and(
    eq(enqueteCommissions.status, "active"),
    lte(enqueteCommissions.scheduledEndDay, currentDay),
  ));

const finalReportInputs: EnqueteFinalReportInput[] = [];
for (const k of concluding) {
  const expertIds = JSON.parse(k.expertMemberIds) as string[];
  const expertRows = await db.select().from(expertsTable)
    .where(inArray(expertsTable.id, expertIds));
  finalReportInputs.push({
    rowId: k.id,
    topic: k.topic as MinistryPortfolio,
    partyMemberIds: JSON.parse(k.partyMemberIds),
    expertNames: expertRows.map(e => e.name),
    durationDays: k.scheduledEndDay - k.formedOnDay,
  });
}

if (finalReportInputs.length > 0) {
  const requests = buildEnqueteFinalReportBatchRequest(finalReportInputs);
  const results = await submitBatch(requests, batchClient);
  await processEnqueteFinalReportBatchResult(results, currentDay);

  // Emit enquete_concluded events for each, with the final report text in description.
  for (const k of concluding) {
    const row = await db.select().from(enqueteCommissions).where(eq(enqueteCommissions.id, k.id)).limit(1);
    await emitEvent({
      type: "enquete_concluded",
      description: `Enquete-Kommission "${k.topic}" Schlussbericht: ${row[0].finalReport}`,
      ...
    });
  }
}

// R7 / Cycle 4 Q9: soft-watchdog
const stale = await db.select().from(enqueteCommissions)
  .where(and(
    eq(enqueteCommissions.status, "active"),
    lte(enqueteCommissions.scheduledEndDay, currentDay - 30),
  ));
for (const k of stale) {
  await db.update(enqueteCommissions)
    .set({ status: "lapsed", concludedOnDay: currentDay })
    .where(eq(enqueteCommissions.id, k.id));
}
```

### Agent action `request_enquete_kommission`

```ts
// agent/action-parser.ts — new validation block
import { ENQUETE_MAX_ACTIVE, ENQUETE_RATE_LIMIT_DAYS } from "../config/parliament.js";

if (action.type === "request_enquete_kommission") {
  // 1. Fraktion-bearing party only
  if (!party.hasFraktion) {
    return { ok: false, reason: "Nur Fraktionen können Enquete-Kommissionen vorschlagen." };
  }
  // 2. Topic validity (MinistryPortfolio enum value)
  if (!MINISTRY_PORTFOLIOS.includes(action.topic)) {
    return { ok: false, reason: `Ungültiges Themenressort: ${action.topic}` };
  }
  // 3. Cap (proposed + active < ENQUETE_MAX_ACTIVE)
  const activeCount = ctx.activeEnqueteCount; // populated by loop.ts
  if (activeCount >= ENQUETE_MAX_ACTIVE) {
    return { ok: false, reason: `Bundestag hat bereits ${ENQUETE_MAX_ACTIVE} aktive Enquete-Kommissionen.` };
  }
  // 4. Rate-limit
  const lastDay = ctx.lastEnqueteProposedDay ?? -Infinity;
  if (ctx.currentDay - lastDay < ENQUETE_RATE_LIMIT_DAYS) {
    return { ok: false, reason: `Mindestabstand zwischen Enquete-Vorschlägen: ${ENQUETE_RATE_LIMIT_DAYS} Tage.` };
  }
  // 5. Once per party per turn
  if (ctx.enqueteRequestedThisTurn) {
    return { ok: false, reason: "Pro Tag nur ein Enquete-Vorschlag pro Fraktion." };
  }

  return { ok: true };
}
```

Agent prompt addition in `agent/prompt.ts`:

```ts
// agent/prompt.ts — Enquete-Opportunity context section (S17 — visible to coalition + opposition)
if (ctx.enqueteOpportunity) {
  promptSections.push(
    `### Enquete-Kommissions-Möglichkeit\n` +
    `Eine Krise im Bereich ${ctx.enqueteOpportunity.topic} läuft seit ` +
    `${ctx.enqueteOpportunity.daysActive} Tagen. Der Bundestag könnte eine ` +
    `parteiübergreifende Enquete-Kommission einsetzen, um langfristige ` +
    `Politikempfehlungen zu erarbeiten. ` +
    `Action: \`request_enquete_kommission\` mit topic="${ctx.enqueteOpportunity.topic}".`
  );
}
```

### Tests (`enquete-commissions.test.ts` — ~12 cases)

Standard convergence + invariant pattern. Highlights:
- `findEnqueteOpportunity` — returns longest-active crisis ≥60d; null when none qualifies
- `selectEnqueteMembers` — Σ === 17 invariant across many seat configurations; no negative counts
- `pickEnqueteExperts` — count ∈ [4, 6]; throws on insufficient pool
- `tallyEnqueteVote` — 50k convergence: pass-rate ≥ 92% across typical configurations
- `tallyEnqueteVote` — boundary cases: large pariah party, fragmented coalition
- Watchdog test: row with `scheduledEndDay = currentDay - 31` transitions to `status='lapsed'` within 1 sim-day
- Action-parser: rate-limit (within window blocks; just past window allows), cap, Fraktion-only, topic-validity

## Design — Piece 3: Schuldenbremse threshold + R4/R5/R10 + expiry event

Smallest piece. Three R-items + threshold swap + expiry event. No new tables, no new agent surface.

### File layout

- **Modified**: `packages/engine/src/simulation/budget.ts` (~3 helper changes)
- **Modified**: `packages/engine/src/config/budget.ts` (1 constant lowered, 1 recalibrated)
- **Modified**: `packages/engine/src/simulation/loop.ts` (typed-discriminant migration in step 10h + expiry event emission in step 11)
- **Modified**: `packages/types/src/types/economy.ts` (typed `PendingInjection` discriminated union)
- **New event type** (1): `schuldenbremse_expired` — `types/meta.ts` + tier classification (routine, S15)
- **Tests**: extended `budget.test.ts` (~7 cases)

### Schema (no changes)

PR 3 does not touch the schema. The existing `nationalState.schuldenbremseSuspended` + `simulationMeta.schuldenbremseSuspendedUntilDay` columns from Cycle 4 are sufficient.

### Constants (`config/budget.ts` updates)

```ts
// CHANGED — Cycle 5 PR 3 / R4 / S21
// Was: 0.95 (PR #165 R4 flagged passage as near-automatic when proposed)
export const SCHULDENBREMSE_COALITION_YES_RATE = 0.88;

// CHANGED — Cycle 5 PR 3 / S21 — recalibrated to land 60-80% pass when justified
// (50k convergence test in budget.test.ts asserts the target).
// Was: 0.15
export const SCHULDENBREMSE_OPPOSITION_YES_BASE = 0.18;  // tune via convergence
```

### Pure helper changes (`simulation/budget.ts`)

**Change 1** — `tallySchuldenbremseVote` pass check (S20):

```ts
// simulation/budget.ts (modified)
import { MAJORITY_SEATS } from "../config/elections.js";

export function tallySchuldenbremseVote(
  parties: Party[],
  coalitionPartyIds: string[],
  publicSentiment: number,
  crisisSeverity: CrisisSeverity | null,
  rng: () => number = Math.random,
): SchuldenbremseVoteResult {
  // ... existing per-party Bernoulli yes/no logic UNCHANGED ...
  // ... yes/no totals computed ...

  // S20: Match Art. 115 Abs. 2 Satz 6 GG — "Mehrheit der Mitglieder des Bundestages"
  // = absolute majority of members (Kanzlermehrheit). Reuses the voting.ts "absolute"
  // semantic. Was: yes > no derived from per-party Bernoulli.
  const passed = yes >= MAJORITY_SEATS;

  return { yes, no, abstain: 0, passed };
}
```

**Change 2** — `generateNachtragsAllocations` carry-the-remainder rounding (S23, R5):

```ts
// simulation/budget.ts (modified)
export function generateNachtragsAllocations(
  coalitionPartyIds: string[],
  crisisCategory: BillCategory,
  total: number,
  rng: () => number = Math.random,
): MinistryAllocation[] {
  // ... existing share-per-ministry calculation produces rawShares: number[] of length 8 ...

  // S23 / R5: carry-the-remainder pattern so Σ === total exactly.
  // Round first 7 ministries to 0.1B EUR; last ministry gets total - sum(first7).
  const allocations: MinistryAllocation[] = [];
  let runningSum = 0;
  for (let i = 0; i < 7; i++) {
    const rounded = Math.round(rawShares[i] * 10) / 10;  // 0.1B EUR precision
    allocations.push({ ministry: MINISTRIES[i], amount: rounded });
    runningSum += rounded;
  }
  allocations.push({ ministry: MINISTRIES[7], amount: total - runningSum });
  return allocations;
}
```

**Change 3** — `applySchuldenbremseExpiry` extracted helper (S22):

```ts
// simulation/budget.ts (new)
import type { SimulationEvent } from "../../types/src/types/meta.js";

/**
 * S22: extract Schuldenbremse-expiry side-effects from `checkSchuldenbremseExpiry`.
 *
 * Was: in-place mutation of state + meta. Now: pure transition, returns event
 * to be emitted by caller. Closes the Cycle 4 silent auto-restore path.
 */
export function applySchuldenbremseExpiry(
  state: { schuldenbremseSuspended: boolean },
  meta: { schuldenbremseSuspendedUntilDay: number | null },
  currentDay: number,
): { expired: boolean; event?: SimulationEvent } {
  if (!state.schuldenbremseSuspended) return { expired: false };
  if (meta.schuldenbremseSuspendedUntilDay == null) return { expired: false };
  if (currentDay < meta.schuldenbremseSuspendedUntilDay) return { expired: false };

  state.schuldenbremseSuspended = false;
  // meta.schuldenbremseSuspendedUntilDay reset is the caller's responsibility (DB write).
  return {
    expired: true,
    event: {
      type: "schuldenbremse_expired",
      day: currentDay,
      title: "Schuldenbremse wieder aktiv",
      description: `Die nach Art. 115 GG ausgesetzte Schuldenbremse ist nach 365 Tagen automatisch wieder in Kraft getreten.`,
    } as SimulationEvent,
  };
}
```

### Loop integration changes (`simulation/loop.ts`)

**Change A** — `checkSchuldenbremseExpiry` calls new helper, emits event:

```ts
// step 11 — modified
import { applySchuldenbremseExpiry } from "./budget.js";

const expiryResult = applySchuldenbremseExpiry(nationalState, meta, currentDay);
if (expiryResult.expired) {
  await db.update(simulationMeta)
    .set({ schuldenbremseSuspendedUntilDay: null })
    .where(eq(simulationMeta.id, meta.id));         // R2 lesson — WHERE clause
  await db.update(nationalStateTable)
    .set({ schuldenbremseSuspended: false })
    .where(eq(nationalStateTable.id, nationalState.id));  // R2 lesson
  await emitEvent(expiryResult.event!);
}
```

**Change B** — typed `PendingInjection` discriminant (S24, R10):

```ts
// types/economy.ts (modified)
export type PendingInjection =
  | { id: string; type: "crisis"; data: CrisisInjectionPayload }
  | { id: string; type: "snap_election"; data: SnapElectionPayload }
  | { id: string; type: "economic_shock"; data: EconomicShockPayload }
  | { id: string; type: "trigger_budget"; data: BudgetTriggerPayload }
  | { id: string; type: "nachtragshaushalt"; data: NachtragsInjectionPayload };

export type NachtragsInjectionPayload = {
  total: number;
  crisisCategory: BillCategory;
  allocations: MinistryAllocation[];
};
```

```ts
// simulation/loop.ts step 10h — drop `as any`
import type { NachtragsInjectionPayload } from "../../types/src/types/economy.js";

const payload = injection.data as NachtragsInjectionPayload;  // discriminant matches
```

`processNachtragsInjection` similarly typed; no inline `as any` remaining.

### Tests (`budget.test.ts` extensions)

```ts
describe("tallySchuldenbremseVote — Cycle 5 PR 3 / S20+S21", () => {
  it("requires yes >= MAJORITY_SEATS to pass (S20)", () => {
    // Build a config where yes total < 316 → must fail.
    // Convergence: with default coalition + sentiment=45, pass-rate ∈ [60%, 80%]
    let passed = 0;
    let state = 12345;
    const lcg = () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 2 ** 32; };
    for (let i = 0; i < 50_000; i++) {
      const r = tallySchuldenbremseVote(mkParties(), ["spd", "gruene"], 45, "high", lcg);
      if (r.passed) passed++;
    }
    expect(passed / 50_000).toBeGreaterThanOrEqual(0.60);
    expect(passed / 50_000).toBeLessThanOrEqual(0.80);
  });
});

describe("generateNachtragsAllocations — Cycle 5 PR 3 / S23 / R5", () => {
  it("Σ allocations === total exactly (closes R5 gap)", () => {
    for (const total of [50, 87.5, 99.9, 124.3, 150]) {
      const alloc = generateNachtragsAllocations(["spd", "gruene"], "defence", total);
      const sum = alloc.reduce((s, a) => s + a.amount, 0);
      expect(sum).toBeCloseTo(total, 6);
    }
  });
});

describe("applySchuldenbremseExpiry — Cycle 5 PR 3 / S22", () => {
  it("returns expired=false when suspendedUntilDay > currentDay", () => {
    const r = applySchuldenbremseExpiry(
      { schuldenbremseSuspended: true },
      { schuldenbremseSuspendedUntilDay: 100 },
      99,
    );
    expect(r.expired).toBe(false);
  });
  it("returns expired=true + event when currentDay >= suspendedUntilDay", () => {
    const state = { schuldenbremseSuspended: true };
    const r = applySchuldenbremseExpiry(state, { schuldenbremseSuspendedUntilDay: 100 }, 100);
    expect(r.expired).toBe(true);
    expect(r.event?.type).toBe("schuldenbremse_expired");
    expect(state.schuldenbremseSuspended).toBe(false);
  });
  it("no event when not currently suspended", () => {
    const r = applySchuldenbremseExpiry(
      { schuldenbremseSuspended: false },
      { schuldenbremseSuspendedUntilDay: 100 },
      150,
    );
    expect(r.expired).toBe(false);
    expect(r.event).toBeUndefined();
  });
});
```

## Design — Piece 4: Polish + Cycle 4 docs cleanup (S16)

Pure refactor. No functional changes. `chore:` commit prefix per S19.

### R6: drop `(state as any)` / `(meta as any)` casts in `loop.ts`

The Cycle 4 schema-sim.ts already declares `schuldenbremseSuspended`, `provisionalBudgetSinceDay`, `schuldenbremseSuspendedUntilDay`, etc. Casts are no longer needed.

```ts
// simulation/loop.ts (modified — ~6 sites)
// BEFORE:
schuldenbremseSuspended: (state as any).schuldenbremseSuspended ?? false,
// AFTER:
schuldenbremseSuspended: state.schuldenbremseSuspended ?? false,
```

Verification: `npm run typecheck` green; `grep -rn "as any" packages/engine/src/simulation/loop.ts` returns 0 hits in the touched lines.

### R7: real names in `detectDisciplineBreaks`

```ts
// simulation/discipline.ts (or wherever detectDisciplineBreaks lives)
// BEFORE:
const mdbName = `MdB-Sitz #${seatId}`;

// AFTER:
const application = await db.select()
  .from(mdbApplications)
  .where(eq(mdbApplications.seatId, seatId))
  .limit(1);
const userId = application[0]?.userId;
const user = userId
  ? (await db.select().from(users).where(eq(users.id, userId)).limit(1))[0]
  : null;
const mdbName = user?.nickname ?? `MdB-Sitz #${seatId}`;  // R7 fallback only when no application
```

### R8: drop unused `_parties` param

```ts
// simulation/inquiry-committees.ts
// BEFORE:
export function findInquiryOpportunity(
  crises: Crisis[],
  _parties: Party[],          // unused
  currentDay: number,
): InquiryOpportunity | null { ... }

// AFTER:
export function findInquiryOpportunity(
  crises: Crisis[],
  currentDay: number,
): InquiryOpportunity | null { ... }
```

Caller in `loop.ts`:

```ts
// BEFORE: findInquiryOpportunity(activeCrises, parties, currentDay);
// AFTER:  findInquiryOpportunity(activeCrises, currentDay);
```

### R9: drizzle mock comment

```ts
// simulation/budget.test.ts
// EXISTING:
vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  sql: vi.fn(),
}));
// ADD COMMENT ABOVE:
//
// R9 (Cycle 4 PR review): this mock returns plain `vi.fn()` for `eq`/`and`/`sql`.
// The mock is fragile — it silently returns wrong-typed values if a helper starts
// using a new export. Currently safe because budget.ts callers never inspect the
// where-clause arg shape; they only check whether `where()` was called. If you
// add a helper that DOES inspect the arg shape, replace this with a typed mock.
```

### S16: Cycle 4 docs cleanup (final commit)

```bash
git rm docs/plans/043-cycle4-spec.md
git rm docs/plans/043-cycle4-brainstorm.md
```

## Interaction risks

| # | Risk | Mitigation |
|---|------|------------|
| R1 | `ANHOERUNG_TONE_INFLUENCE = 0.05` may distort committee→2nd-reading calibration if tone has systematic bias. | Small absolute cap; 50k AI-tone-distribution check post-merge. Verify tone mean ∈ [-0.10, +0.10] across simulate-1461; if not, recalibrate AI prompt. |
| R2 | `selectEnqueteMembers` may produce 0-count for sub-5% Fraktionen. | Largest-remainder method handles it; sum-invariant test asserts Σ === 17. Caller pre-filters to Fraktion-bearing parties (≥5%), so all input parties have ≥31 seats — never 0. |
| R3 | Schuldenbremse threshold change (S20) does not significantly shift pass-rate for typical coalitions (most have ≥316 seats). | The R4 calibration target (60-80% pass when justified) is achieved primarily via the lower coalition yes-rate (S21: 0.95 → 0.88), not via the threshold check itself. Convergence test (50k) drives the final value of `SCHULDENBREMSE_OPPOSITION_YES_BASE`. |
| R4 | R10 typed-discriminant breaks any callers that constructed `pending_injections` payloads inline with raw object literals. | TypeScript compile-time check. `npm run typecheck` blocks the PR until every caller uses the discriminated payload. Pre-emptive grep for `as any` in `loop.ts` step 10h + `processNachtragsInjection`. |
| R5 | EXPERTS_SEED real-name affiliations age (people change institutions). | Module-level docstring in `config/experts.ts` notes "current as of brainstorm date" + suggests yearly review cadence. Surfaced as a Cycle 6+ open item. |
| R6 | Anhörung AI failure path — if AI batch returns malformed JSON, the row stays `status='lapsed'` with `tone=0`. Bill pipeline reads tone=0 (no nudge) gracefully. | Tested in case 9 of `anhoerungen.test.ts`: AI parse failure → status='lapsed' + zero impact on amend probability. |
| R7 | Enquete soft-watchdog — Kommission rows where `currentDay > scheduled_end_day + 30` and no in-flight final-report batch transition to `status='lapsed'`. | Mirrors Cycle 4 inquiry watchdog (Cycle 4 Q9). Tested: row with `scheduledEndDay = currentDay - 31` transitions within 1 sim-day. |
| R8 | `enquete_rejected` (routine tier) is a quiet political moment — narrative treatment matters. | Templated description includes vote tally + proposing party + topic. The reader can see *why* the Beschluss failed (e.g., "187 Ja, 322 Nein"). |
| R9 | Cycle 4 docs deletion (S16) hides recent context for Cycle 5 reviewers viewing the docs-tree. | Git history preserves them via `git show <SHA>:docs/plans/043-cycle4-spec.md`. PRs reference by commit SHA when needed. |
| R10 | R-item back-references in code comments (Cycle 3/4 review praise). Every non-obvious decision in Cycle 5 code cites its R or S number. | Spec lists S/R-numbers used in implementation; PR-review checklist asserts presence of S-/R-comments at locations called out here. |
| R11 | Anhörung tone influence directionality (S4): positive tone *increases* amend probability (endorsed bills benefit from refinement). Inverse interpretation is plausible — the spec must lock the direction. | Pure helper signature comment + dedicated test (`anhoerungen.test.ts` case "positive tone increases amend probability") verify directionality at unit-test level. |
| R12 | `BILL_CATEGORY_TO_MINISTRY` rename (S14) touches `simulation/budget.ts` import. | Single-line import update in PR 1 (alongside the rename). Backward-compatible alias `CRISIS_CATEGORY_TO_MINISTRY` retained for one cycle to avoid future-cycle churn. |

## Migration strategy

All Cycle 5 schema changes ship in a **single migration block** appended to `seed.ts::migrateDatabase()`, guarded by single `cycle5Migrated` boolean meta flag (S13). The block is idempotent and wrapped in `getSqlite().transaction()` per `tool-safety.md`.

### Migration block contents

```ts
// === Cycle 5 — experts seed table + Ausschussanhörungen + Enquete-Kommission ===
if (!meta.cycle5Migrated) {
  getSqlite().transaction(() => {
    // 1. (no-op here — `experts`, `ausschussanhoerungen`, `enquete_commissions`
    //    tables ship in SIM_TABLE_DDL and are auto-created on every startup.
    //    Per S13/PR #165 R1, no synthetic _table rows in SIM_COLUMN_MIGRATIONS.)

    // 2. Add `last_enquete_proposed_day` column to simulation_meta
    addColumnIfMissing(sqlite, "simulation_meta", "last_enquete_proposed_day INTEGER");

    // 3. Seed EXPERTS_SEED via INSERT OR IGNORE (idempotent — re-runs no-op)
    const expertInsert = sqlite.prepare(`
      INSERT OR IGNORE INTO experts (id, name, affiliation, expertise_areas)
      VALUES (?, ?, ?, ?)
    `);
    for (const e of EXPERTS_SEED) {
      expertInsert.run(e.id, e.name, e.affiliation, JSON.stringify(e.expertiseAreas));
    }

    // 4. Set the migration flag
    sqlite.exec(`UPDATE simulation_meta SET cycle5_migrated = 1 WHERE id = '${meta.id}'`);
  })();
}
```

### Ordering inside `migrateDatabase()`

No order dependency between Cycle 5 and prior cycles. Cycle 5 is structurally additive (3 new tables + 1 new column + 1 idempotent seed-insert).

```
1. (existing) Cycle 1 stage-entry-day backfill
2. (existing) Cycle 1 stage-min/max bill backfill
3. (existing) Cycle 3 piece 4 — 735→630 seat reapportionment
4. (existing) Cycle 2a synthetic kanzlerwahl-row backfill
5. (existing) Cycle 2a bundesrat_mode backfill
6. (existing) Cycle 2b counter-column inits
7. (existing) Cycle 3 piece 6 — last_negotiation_round_day column add
8. (existing) Cycle 4 — inquiry_committees + 4 column adds + R15 backfill + cycle4Migrated flag
9. NEW: Cycle 5 — last_enquete_proposed_day column add + EXPERTS_SEED seed + cycle5Migrated flag
```

The new tables (`experts`, `ausschussanhoerungen`, `enquete_commissions`) are added to `SIM_TABLE_DDL` only; they're rerun on every startup with `IF NOT EXISTS` and don't need a migration-block step.

### Idempotency

- New tables in `SIM_TABLE_DDL` use `CREATE TABLE IF NOT EXISTS`.
- `last_enquete_proposed_day` column add via `addColumnIfMissing()` (catches `duplicate column` errors).
- `EXPERTS_SEED` insert uses `INSERT OR IGNORE` keyed on `experts.id` — re-running the migration is a no-op for already-seeded rows.
- The `cycle5Migrated` flag write is the final step; running migrate twice is safe.

### Pre-flight invariant assert

```ts
// Pre-flight: verify required tables exist
assertTableExists(sqlite, "parties");
assertTableExists(sqlite, "national_state");
assertTableExists(sqlite, "simulation_meta");
assertTableExists(sqlite, "bills");
assertTableExists(sqlite, "experts");
assertTableExists(sqlite, "ausschussanhoerungen");
assertTableExists(sqlite, "enquete_commissions");
```

## Implementation plan — 4 PRs (commits, no PRs until user says otherwise)

PR-style commits on `claude/sim-fidelity-cycle5` branch, mirroring Cycle 4's cadence. Each commit fully tested + typechecked + built. No GitHub PR until user explicitly says.

### PR 1 — Ausschussanhörungen + experts seed table (heaviest)

**Commit message**: `feat(sim-fidelity): Ausschussanhörungen + experts seed table (Cycle 5 PR 1)`

**Touch list**:

- `packages/types/src/types/meta.ts` — add `ausschussanhoerung_held` to `SimulationEventType` union
- `packages/types/src/types/economy.ts` — `Expert`, `AusschussanhoerungRow`, `AusschussanhoerungStatus` types
- `packages/engine/src/db/schema-sim.ts` — `experts` + `ausschussanhoerungen` Drizzle definitions
- `packages/engine/src/db/ddl.ts` — both tables in `SIM_TABLE_DDL` (no synthetic _table rows per S13)
- `packages/engine/src/db/seed.ts` — opens `cycle5Migrated` block; `EXPERTS_SEED` INSERT OR IGNORE; assert+set flag
- `packages/engine/src/config/experts.ts` — NEW (`EXPERTS_SEED` per S2)
- `packages/engine/src/config/parliament.ts` — 5 new `ANHOERUNG_*` constants + rename `CRISIS_CATEGORY_TO_MINISTRY` → `BILL_CATEGORY_TO_MINISTRY` (S14) with deprecated alias retained
- `packages/engine/src/simulation/anhoerungen.ts` — NEW module (~280 LOC: pure helpers + AI batch builder/processor)
- `packages/engine/src/simulation/budget.ts` — single-line import update (S14, R12): `CRISIS_CATEGORY_TO_MINISTRY` → `BILL_CATEGORY_TO_MINISTRY` in `generateNachtragsAllocations`
- `packages/engine/src/simulation/timing.ts` — `ausschussanhoerung_held` standard tier (default; comment per S15)
- `packages/engine/src/simulation/bill-pipeline.ts` — `applyAnhoerungToneToAmendProb` call at committee→2nd-reading transition
- `packages/engine/src/simulation/loop.ts` — step 5 trigger + step 5b batch submit/processor
- `packages/engine/src/simulation/anhoerungen.test.ts` — NEW (~14 cases per Piece 1 tests)
- `packages/engine/src/simulation/experts-seed.test.ts` — NEW (1 case: `EXPERTS_SEED` ministry-coverage invariant per S2)

**LOC estimate**: ~800

**Verification**:
- `npm run typecheck && npm test && npm run build` green
- `npm run migrate` twice — second run is no-op
- `npm run seed && sqlite3 -header -column data/simulation.db "SELECT COUNT(*) FROM experts"` returns ≥30
- `EXPERTS_SEED` ministry-coverage test passes

### PR 2 — Enquete-Kommission

**Commit message**: `feat(sim-fidelity): Enquete-Kommission lifecycle + AI Schlussbericht (Cycle 5 PR 2)`

**Touch list**:

- `packages/types/src/types/meta.ts` — add `enquete_proposed`, `enquete_convened`, `enquete_rejected`, `enquete_concluded` to `SimulationEventType` union
- `packages/types/src/types/agent.ts` — `EnqueteOpportunity` type + `enqueteOpportunity?` field on `AgentContext` + `RequestEnqueteKommissionAction` in action union
- `packages/types/src/types/economy.ts` — `EnqueteCommissionRow`, `EnqueteCommissionStatus` types
- `packages/engine/src/db/schema-sim.ts` — `enqueteCommissions` Drizzle definition; `lastEnqueteProposedDay` on `simulationMeta`
- `packages/engine/src/db/ddl.ts` — `enquete_commissions` in `SIM_TABLE_DDL`; `last_enquete_proposed_day` in `SIM_COLUMN_MIGRATIONS`
- `packages/engine/src/config/parliament.ts` — 8 new `ENQUETE_*` constants
- `packages/engine/src/simulation/enquete-commissions.ts` — NEW module (~320 LOC: pure helpers + lifecycle + AI batch + watchdog)
- `packages/engine/src/simulation/timing.ts` — `enquete_proposed`/`enquete_convened`/`enquete_concluded` → IMPORTANT_EVENTS; `enquete_rejected` → ROUTINE_EVENTS
- `packages/engine/src/agent/action-parser.ts` — `request_enquete_kommission` validation block
- `packages/engine/src/agent/prompt.ts` — `enqueteOpportunity` context section (visible to coalition + opposition per S17)
- `packages/engine/src/simulation/loop.ts` — step 5 context injection; step 10 action handling + same-tick vote; step 11 daily-conclude check + soft-watchdog
- `packages/engine/src/simulation/enquete-commissions.test.ts` — NEW (~12 cases)
- `packages/engine/src/agent/action-parser.test.ts` — +5 cases for `request_enquete_kommission` validation

**LOC estimate**: ~700

**Verification**:
- `npm run typecheck && npm test && npm run build` green
- `npm run migrate` twice — second run is no-op
- Action-parser test cases pass for all 5 validation paths
- 50k convergence test on `tallyEnqueteVote` reports pass-rate ≥ 92%

### PR 3 — Schuldenbremse threshold + R4/R5/R10 + expiry event

**Commit message**: `feat(sim-fidelity): Schuldenbremse absolute-majority threshold + expiry event + R4/R5/R10 polish (Cycle 5 PR 3)`

**Touch list**:

- `packages/types/src/types/meta.ts` — add `schuldenbremse_expired` to `SimulationEventType` union
- `packages/types/src/types/economy.ts` — convert `PendingInjection` to discriminated union by `type`; add `NachtragsInjectionPayload` (S24, R10)
- `packages/engine/src/config/budget.ts` — `SCHULDENBREMSE_COALITION_YES_RATE` 0.95 → 0.88 (R4); recalibrate `SCHULDENBREMSE_OPPOSITION_YES_BASE` (~0.18 — value finalized via convergence test)
- `packages/engine/src/simulation/budget.ts`:
  - `tallySchuldenbremseVote` pass check → `yes >= MAJORITY_SEATS` (S20)
  - `generateNachtragsAllocations` carry-the-remainder rounding (S23)
  - new `applySchuldenbremseExpiry` helper (S22)
- `packages/engine/src/simulation/loop.ts`:
  - step 11: call new `applySchuldenbremseExpiry`, persist event when emitted
  - step 10h: drop `as any` casts (R10) via typed `PendingInjection<"nachtragshaushalt">` discriminant
  - `processNachtragsInjection` retyped (R10)
- `packages/engine/src/simulation/timing.ts` — `schuldenbremse_expired` → ROUTINE_EVENTS
- `packages/engine/src/simulation/budget.test.ts` — +7 cases (Piece 3 test list)

**LOC estimate**: ~250

**Verification**:
- `npm run typecheck && npm test && npm run build` green
- 50k convergence test reports `tallySchuldenbremseVote` pass-rate ∈ [60%, 80%] when justified
- `generateNachtragsAllocations` Σ === total invariant test passes
- `grep -rn "as any" packages/engine/src/simulation/loop.ts | grep -i "nachtrags\|inject"` returns 0 hits

### PR 4 — Polish + Cycle 4 docs cleanup (S16)

**Commit message**: `chore(sim-fidelity): polish + Cycle 4 docs cleanup (Cycle 5 PR 4)` (S19; user can override to `feat:`)

**Touch list**:

- `packages/engine/src/simulation/loop.ts` — drop `(state as any)` / `(meta as any)` casts at ~6 sites (R6)
- `packages/engine/src/simulation/discipline.ts` (or wherever `detectDisciplineBreaks` lives — confirmed via `grep -rn "detectDisciplineBreaks"`) — real-name join through `bundestagSeats → mdbApplications.userId → users.nickname` (R7)
- `packages/engine/src/simulation/inquiry-committees.ts` — drop unused `_parties` parameter from `findInquiryOpportunity` (R8); update caller in `loop.ts`
- `packages/engine/src/simulation/budget.test.ts` — comment block on `vi.mock("drizzle-orm")` (R9)
- `docs/plans/043-cycle4-spec.md` — DELETED (S16)
- `docs/plans/043-cycle4-brainstorm.md` — DELETED (S16)

**LOC estimate**: ~80 added/changed (mostly subtractions and the R7 join), ~1700 deleted

**Verification**:
- `npm run typecheck && npm test && npm run build` green
- `grep -rn "(state as any)\|(meta as any)" packages/engine/src/simulation/loop.ts` returns 0 hits
- `find docs/plans -name "043-cycle4-*.md"` returns 0 hits

### Post-merge cleanup

Cycle 5 brainstorm + spec stay until cycle 5 itself ships; deleted in Cycle 6's final PR per the established lag pattern.

## Success criteria

- `npm run typecheck && npm test && npm run build` green on each of the 4 PR-commits.
- Seed + `simulate 1461` completes without error after all 4 commits.
- After a fresh `simulate 1461` (one full term ≈ 4 years):
  - **Ausschussanhörungen**:
    - 14–36 hearings/term (probability range × ~40–80 committee-stage bills)
    - Tone scalar mean ∈ [-0.10, +0.10], stddev ≥ 0.20
    - ≥6 of 8 ministries appear as `ministry_focus`
    - Each expert appears 1–5×
  - **Enquete-Kommissionen**:
    - 0–3 proposed/term (function of persistent-crisis frequency)
    - Pass-rate ≥ 92% (50k convergence)
    - Peak 2 active simultaneously (cap respected)
    - Σ `party_member_ids === 17` for every active row (sum invariant)
    - `expert_member_ids` count ∈ [4, 6] for every row
    - Watchdog triggers within 1 sim-day for stale rows
  - **Schuldenbremse**:
    - 0–2 `schuldenbremse_aussetzung_passed`/term (matches Cycle 4 band)
    - Pass-rate when proposed: 60–80% (50k convergence)
    - Each pass → exactly 1 `schuldenbremse_expired` event 365 sim-days later (or never if term ends first)
    - `generateNachtragsAllocations` Σ === total (floating-point exact, R5 closing assertion)
  - **Polish**:
    - 0 `(state as any)` / `(meta as any)` in loop.ts
    - `detectDisciplineBreaks` populates real names for ≥80% of discipline-break events when MdB applications exist
    - `docs/plans/043-cycle4-{spec,brainstorm}.md` not present in tree
- AI cost: `logAICall("ausschussanhoerung")` + `logAICall("enquete_final_report")` averages ≤$0.0006/sim-day combined.
- Wall-clock per term: similar ±10% to Cycle 4 baseline.
- `cycle5Migrated` flag set on `simulation_meta`; idempotency verified by running migrate twice.

## Open items surfaced for later cycles

**New (surfaced during Cycle 5 design):**

- **Frontend rendering for Cycle 4 + Cycle 5 event types** (18+ events without compact/standard/breaking treatment). Deserves a dedicated frontend cycle.
- **Per-MdB Enquete-Kommissions-Mitgliedschaft** — seat-level rows (matches Cycle 4 inquiry seat-level deferral; same blocker, same Cycle-6+ slot).
- **Anhörung tone influence on 3rd-reading vote** — currently only biases committee→2nd-reading amend probability. Could extend to opposition yes-rate at 3rd reading.
- **Schuldenbremse expiry agent reaction** — no agent reads the `schuldenbremse_expired` event currently. A coalition-leader debrief or media wave could amplify the moment.
- **Real-name expert seed maintenance** — annual review of `EXPERTS_SEED` affiliations as institutions/roles change.
- **Ausschussanhörung influence calibration data** — post-Cycle-5 simulate-1461 may show the tone influence is too weak or too strong. Cycle 6 candidate.

**Carry-forward (still deferred):**

- Untersuchungsausschuss seat-level membership (Cycle 4 open)
- Ordnungsruf — depends on MdB-misbehavior signal
- Inquiry court powers (minister summons, scandal-severity axis, multiple inquiry types)
- Nachtragshaushalt agent customization (formulaic → coalition-amended)
- End-to-end seeded RNG plumbing through `runDay()`
- AI text on Kurzintervention / Zwischenfrage (decoration cost rejected; revisit if reader feedback says they read same-y)
- Qualified-⅔-majority primitive (when constitutional-amendment work appears — Art. 79 GG territory)

## Next action

Implement piece-by-piece as commits on `claude/sim-fidelity-cycle5` branch. Start with PR 1 — Ausschussanhörungen + experts seed table. No GitHub pull requests until user says otherwise.
