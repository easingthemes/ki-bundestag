# 043 Cycle 5 (P3) — Brainstorm + Locked Decisions

**Status**: Brainstorm. Decisions locked at bottom. Next step: spec + implement.
**Source**: [`043-cycle4-spec.md`](./043-cycle4-spec.md) §"Open items surfaced for later cycles" + PR #165 review (R1–R10) + [`../todo/043-sim-timing-fidelity.md`](../todo/043-sim-timing-fidelity.md) §Cycle 5+.
**Preceding cycles shipped on `main`**: Cycle 1 (calendar + bill timing + Konstituierende Sitzung), Cycle 2a (Bundesrat + Kanzlerwahl), Cycle 2b (Parliamentary-QA + Aktuelle Stunde + Einzelfragen + Petitions), Cycle 3 (P2 frequency/timing tuning, 735→630 seats, fiscal-emergency-adjacent calibration), Cycle 4 (Untersuchungsausschuss + Schuldenbremse-Aussetzung + Nachtragshaushalt + debate sub-formats).

## Scope shape

Cycle 5 is the **expert-witness + fiscal-threshold-correctness** cycle in the 043 roadmap. Two thrusts:

1. **Expert-witness infrastructure as paired feature** — unblock both deferred Cycle-4 pieces (Ausschussanhörungen + Enquete-Kommission) on a single shared `experts` seed table.
2. **Threshold-correctness pass + Cycle 4 PR-review fixes** — Schuldenbremse-Aussetzung was approved with simple majority in Cycle 4 (R2 caveat). The constitutional reality is *absolute majority of members* (Art. 115 Abs. 2 Satz 6 GG: "Mehrheit der Mitglieder des Bundestages" = `MAJORITY_SEATS = 316` of 630). The primitive already exists in `voting.ts` ("absolute" mode) — Cycle 5 just uses it. Frees scope to fold R4/R5/R10 polish into the same PR.

A key Cycle 5 character distinction from Cycle 4: **no new vote primitive, no new threshold concept**. Schuldenbremse + Enquete-Beschluss both reuse existing voting.ts machinery. Cycle 5's "new fidelity" is mostly *consumers* of existing primitives, not new primitives. That's a much cleaner cycle than Cycle 4 (which introduced a new vote-tally pattern).

The locked four pieces cluster naturally:

1. **Ausschussanhörungen + experts seed table** (heaviest) — new infrastructure + first consumer.
2. **Enquete-Kommission** — second consumer of the experts table; agent-driven + voted.
3. **Schuldenbremse threshold + R4/R5/R10 + expiry event** — small but high-leverage threshold/calibration pass.
4. **Polish + Cycle 4 docs cleanup** — R6/R7/R8/R9 + S16 housekeeping.

## Piece-by-piece survey

### 1. Ausschussanhörungen (committee public hearings)

- Real Bundestag: öffentliche Anhörungen are *procedurally routine* — held by the relevant Fachausschuss for non-trivial bills, 3–7 invited Sachverständige give 5–10 min testimony, written Stellungnahmen supplement. Ordered by the committee chair, not voted on.
- **A. Auto-trigger on a fraction of bills, weighted by impact.** `P(hearing) = 0.20 + 0.40 × normalisedImpactMag` (capped 0.70). 3 experts auto-selected by ministry-portfolio match. 1 AI batch call per hearing-day → 3 testimonies + tone scalar in one Haiku request. Mild ±0.05 nudge on committee→2nd-reading amend-probability.
- **B. Auto-trigger on every committee-stage bill.** Maximum coverage; highest AI cost.
- **C. Agent-action triggered.** `request_anhörung` agent action — symmetric with Cycle 4 inquiry pattern but procedurally inaccurate (Anhörungen are routine, not political).

*Recommendation: A.* Matches the procedural-routine reality, gives a calibration knob (the 0.20/0.40 coefficients), avoids inflating the agent-action surface. Mid-impact bills consistently get hearings (good for narrative), trivial ones rarely do (good for cost).

### 2. Enquete-Kommission (long-form policy commission)

- Real Bundestag: convened by Bundestag-Beschluss (parliamentary resolution, simple majority of cast votes); cross-party MdB membership + invited external academic experts; runs 2–4 years; produces a Schlussbericht that often shapes a legislature's worth of policy.
- **A. Mid (establish + final report only).** Single AI batch call at conclusion (1 Haiku per concluded Kommission, German policy-report register, 6–10 sentences). Duration 360–720 sim days uniform draw. Members listed but no per-tick activity. Cost mirrors Cycle 4 `inquiry_final_report` exactly.
- **B. High (interim sessions + final).** Periodic AI session summaries every 60 sim days. 2–3× the AI cost; 9 interim summaries per typical 540-day Kommission. Adds narrative density.
- **C. Deferred.** Replace PR 2 with another open item.

*Recommendation: A.* Smallest viable Enquete that gives the simulation a recognisable Bundestag artefact (Schlussbericht). Reuses Cycle 4 final-report AI pattern verbatim (low risk, predictable cost). B inflates AI cost without much narrative payoff while a Kommission is mid-flight — readers won't follow a 9-installment policy story over 540 sim days as closely as a single Schlussbericht moment.

### 3. Expert-witness model (shared infrastructure)

- **A. Lightweight seed table.** ~30 rows with `id`, `name`, `affiliation`, `expertise_areas` (JSON `MinistryPortfolio[]`). Consumers reference by `expert_id`. Testimonies (AI text) live on the consumer entity. Recurring-character narrative coherence; one source of truth.
- **B. Fully ephemeral.** No `experts` table. Every AI call invents name + affiliation. Loses recurring-character coherence — same expert can't appear in both an Ausschussanhörung and an Enquete-Kommission, even though they should narratively.
- **C. Hybrid (seed for Enquete only).** Asymmetric. The same expert can't span both venues, which is exactly backwards from how German policy experts move between the two in real life.

*Recommendation: A, with real names.* Matches the existing `MINISTER_CANDIDATES` precedent in `government.ts` (real politicians by name). Gives the simulation recognisable institutional voices (DIW, Sachverständigenrat, Hertie, MPG, DGB, BDI, SWP, IfW Kiel, RWI, ZEW). The ~30-name seed list is a one-time research investment.

### 4. Schuldenbremse threshold (Art. 115 Abs. 2 Satz 6 GG correction)

- The Cycle 4 spec R2 caveat acknowledged "real Bundestag uses qualified majority". The actual constitutional text is more specific: **"auf Grund eines Beschlusses der Mehrheit der Mitglieder des Bundestages"** = absolute majority of members = Kanzlermehrheit = 316 of 630. NOT ⅔ (which is the Art. 79 GG Grundgesetz-amendment threshold).
- **A. Match Art. 115 Abs. 2 Satz 6 GG.** `MAJORITY_SEATS = 316` constant + `voting.ts "absolute"` mode already exist. PR 3 is a one-line threshold swap + R4 calibration tweak. Frees scope for expiry event + R5 + R10 in the same PR.
- **B. Use ⅔ super-majority.** Constitutionally inaccurate for Art. 115 GG. Would require a new primitive. Bigger PR.
- **C. Hybrid: absolute-majority for Art. 115 (PR 3) + new ⅔ primitive for future constitutional-amendment work.** Most accurate but doubles the work and presupposes a future need.

*Recommendation: A.* Constitutionally correct, reuses existing primitives (per `.claude/rules/reuse-first.md`), shrinks PR 3 enough to absorb 2–3 polish items cleanly.

### 5. Polish + Cycle 4 docs cleanup

- 7 R-items from PR #165 review minus 3 already addressed (R1–R3 in `78f8bf4`):
  - R4 (Schuldenbremse passage near-automatic) — pairs naturally with the threshold change
  - R5 (Nachtrags rounding drift) — paired with budget.ts work in PR 3
  - R6 (`(state as any)` / `(meta as any)` casts) — schema-sim.ts now has the fields, casts are droppable
  - R7 (`mdb_name: null` always) — real names available via `bundestagSeats → mdbApplications.userId → users.nickname` join
  - R8 (unused `_parties` param in `findInquiryOpportunity`)
  - R9 (`vi.mock("drizzle-orm")` fragility — comment-only)
  - R10 (typed `PendingInjection<"nachtragshaushalt">` discriminant) — paired with Nachtrags work in PR 3
- S16 lag pattern: PR 4 deletes `docs/plans/043-cycle4-{spec,brainstorm}.md`.

R4/R5/R10 route to PR 3 (Schuldenbremse-coupled); R6/R7/R8/R9 + S16 to PR 4. PR 4 thus becomes a true polish PR with no functional changes (chore-tagged, no version bump).

## Cost / speed impact

- **AI cost** (50% batch discount applied):
  - Ausschussanhörungen: ~25 hearings/term × 1 Haiku/hearing batched ≈ ~$0.0003–0.0005/sim-day
  - Enquete final reports: 0–2/term × 1 Haiku ≈ ≤$0.0001/sim-day
  - **Net Cycle 5 add: ≤$0.0006/sim-day.**
- **Speed**: neutral. New events generate from existing daily-tick paths; AI batches piggy-back on existing dispatch.
- **Event volume**: up ~5%/sim-day (~25 Anhörung events per 1461-day term + 0–3 Enquete events × 4 lifecycle moments + 0–2 Schuldenbremse-expiry events).
- **Database growth**: 3 new tables. `experts` is fixed (~30 rows). `ausschussanhoerungen` ~25 rows/term. `enquete_commissions` ~0–3 rows/term. Negligible.

## Cross-cutting design

### New event types (6 total)

| Event | Tier | Description |
|---|---|---|
| `ausschussanhoerung_held` | standard | Public hearing held by relevant committee on a bill; 3 expert testimonies + tone scalar |
| `enquete_proposed` | important | Fraktion files for an Enquete-Kommission via Bundestag-Beschluss request |
| `enquete_convened` | important | Beschluss passes; Kommission constitutes with members + experts |
| `enquete_rejected` | routine | Beschluss fails (rare; quiet political moment) |
| `enquete_concluded` | important | Schlussbericht published |
| `schuldenbremse_expired` | routine | 365-day suspension auto-restores fiscal discipline (closes Cycle 4 silent path) |

### New tables / schema

**New table** `experts` (sim DB, seeded once):
- `id` (text PK), `name` (text), `affiliation` (text), `expertise_areas` (JSON `MinistryPortfolio[]`)
- Seed via `INSERT OR IGNORE` from `EXPERTS_SEED` constant in `config/experts.ts`. Idempotent in migrate path.
- Composition: ~30 named entries covering every ministry with ≥3 experts.

**New table** `ausschussanhoerungen` (sim DB):
- `id` (text PK), `bill_id` (FK), `ministry_focus` (text), `expert_ids` (JSON), `testimonies` (JSON `[{expertId, statement}]`), `tone` (real, [-1,+1]), `held_on_day` (int), `status` ("scheduled" | "held" | "lapsed")
- Lifecycle: row written `scheduled` at trigger time → AI batch updates to `held` with testimonies + tone → `lapsed` on AI failure.

**New table** `enquete_commissions` (sim DB):
- `id` (text PK), `topic` (`MinistryPortfolio`), `proposing_party_id` (FK), `party_member_ids` (JSON `{[partyId]: number}`, Σ === 17), `expert_member_ids` (JSON `expert.id[]`, length 4–6), `formed_on_day` (int), `scheduled_end_day` (int), `concluded_on_day` (int, nullable), `status` ("proposed" | "active" | "concluded" | "rejected" | "lapsed"), `final_report` (text, nullable), `vote_result` (JSON `{yes,no,abstain,passed}`, nullable)

**No new columns** on existing tables. All Cycle 5 state lives in 3 new tables.

### New agent actions (1)

- `request_enquete_kommission` (any Fraktion-bearing party; gated on max 1 per party per day; global cap < `ENQUETE_MAX_ACTIVE = 2` active+proposed; rate-limit ≥ `ENQUETE_RATE_LIMIT_DAYS = 90` between proposals; topic must be valid `MinistryPortfolio`)

Validated in `action-parser.ts` mirroring the Cycle 4 `file_inquiry_committee` style. PR 1 has no new agent action (auto-trigger).

### New AgentContext fields (1)

- `enqueteOpportunity?: { topic; crisisId; daysActive }` — populated when a persistent crisis (≥60 days same category active) exists. Visible to **both** coalition + opposition (Enquete is bipartisan in real Bundestag, unlike Cycle 4 `inquiryOpportunity` which is opposition-only).

### Migration strategy

Inline in `seed.ts::migrateDatabase()`, idempotent, guarded by single `cycle5Migrated` boolean meta flag (mirrors Cycle 1/2a/2b/3/4 pattern).

Migration block ordering inside `migrateDatabase()`:
1. (existing) Cycle 1 stage-entry-day backfill
2. (existing) Cycle 1 stage-min/max bill backfill
3. (existing) Cycle 3 piece 4 — 735→630 seat reapportionment
4. (existing) Cycle 2a synthetic kanzlerwahl-row backfill
5. (existing) Cycle 2a bundesrat_mode backfill
6. (existing) Cycle 2b counter-column inits
7. (existing) Cycle 3 piece 6 — `last_negotiation_round_day` column add
8. (existing) Cycle 4 — `inquiry_committees` table + 3 column adds + `cycle4Migrated` flag
9. **NEW: Cycle 5 — 3 new tables + `EXPERTS_SEED` INSERT OR IGNORE + `cycle5Migrated` flag**

DDL discipline (PR #165 R1 lesson): all 3 new tables go in `SIM_TABLE_DDL` only; no synthetic `_table` rows in `SIM_COLUMN_MIGRATIONS`.

## Open brainstorming questions

- **Q1.** Schuldenbremse threshold — match Art. 115 Abs. 2 Satz 6 GG (absolute majority of members, primitive exists), use ⅔ (constitutionally inaccurate, new primitive needed), or hybrid (both)?
- **Q2.** Enquete-Kommission depth — mid (establish + final), high (interim sessions + final), or deferred?
- **Q3.** Expert-witness data model — lightweight seed table, fully ephemeral, or hybrid?
- **Q4.** Ausschussanhörungen trigger — auto-trigger on impact-weighted fraction, auto-trigger always, or agent-action?
- **Q5.** Enquete-Kommission trigger — agent action only, agent action + Bundestag-Beschluss vote, or auto on policy-domain stress?

---

## Decisions (locked)

Applying Cycle-2/3/4 principles — viewer value ↑, AI cost small, prefer agent-driven over auto-spawned for politically-charged decisions, prefer auto-procedural for routine committee business, reuse existing machinery wherever possible.

| # | Question | Decision |
|---|----------|----------|
| Q1 | Schuldenbremse threshold | **A** — Match Art. 115 Abs. 2 Satz 6 GG: absolute majority of members (`MAJORITY_SEATS = 316` of 630). Reuses `voting.ts "absolute"` mode primitive. No new vote primitive. |
| Q2 | Enquete-Kommission depth | **A (Mid)** — establish + final report only. Single AI Haiku per concluded Kommission. Mirrors Cycle 4 `inquiry_final_report` cost profile. |
| Q3 | Expert-witness data model | **A — lightweight seed table, real names**. ~30 rows in `experts`, referenced by both Ausschussanhörungen and Enquete-Kommissionen. Recurring-character coherence + reuse-first principle. |
| Q4 | Ausschussanhörungen trigger | **A (auto-trigger, impact-weighted)** — `P(hearing) = 0.20 + 0.40 × normalisedImpactMag`, capped 0.70. 3 experts per hearing, 1 AI batch call per hearing-day, ±0.05 nudge on committee→2nd-reading amend probability via tone scalar. No agent surface. |
| Q5 | Enquete-Kommission trigger | **B (agent action + simple-majority Bundestag-Beschluss)** — `request_enquete_kommission` queues `enquete_proposed` event same-day; next loop tick runs `tallyEnqueteVote` → `enquete_convened` (memberships persisted) or `enquete_rejected`. Cap 2 active, rate-limit 90 days. |

### Additional locked sub-decisions

- **S1. PR ordering** — 4 PRs on `claude/sim-fidelity-cycle5`, ordered 1 → 2 → 3 → 4 (heaviest first, mirroring Cycle 4 cadence). PR 2 depends on PR 1 (`experts` table); PR 3 + PR 4 independent.
- **S2. Experts seed pool composition** — ~30 named entries, real public-figure German policy experts, distributed across 8 ministries with ≥3 experts per ministry (asserted in tests, not just docs). Affiliations: DIW Berlin, Sachverständigenrat, IfW Kiel, RWI Essen, ZEW Mannheim, IW Köln, ifo Institut, Hertie School, SWP, DGAP, GIGA, Potsdam-Institut, MCC Berlin, RKI, Charité, MPI Strafrecht, MPI Völkerrecht, Bundesbank, AwO, Caritas, BUND/NABU, Bertelsmann Stiftung. Final list locked in PR 1's `config/experts.ts`.
- **S3. Ausschussanhörung lifecycle** — row written `status='scheduled'` at trigger time (synchronous with `bill_committee_stage` event), AI batch updates to `status='held'` with testimonies + tone in same daily tick. AI parse/validation failure → `status='lapsed'`, testimonies=`[]`, tone=0; committee→2nd-reading transition reads tone=0 (no nudge) gracefully.
- **S4. Ausschussanhörung influence** — tone scalar [-1, +1] biases committee→2nd-reading amend probability by ±`ANHOERUNG_TONE_INFLUENCE = 0.05`. Pure-helper `applyAnhoerungToneToAmendProb(baseAmendProb, tone)` clamps to [0, 1]. No influence on 3rd-reading vote (open item).
- **S5. Ausschussanhörung experts per hearing** — 3 (`ANHOERUNG_EXPERTS_PER_HEARING`). Selected by `expertise_areas ∋ ministryFocus`; sample without replacement; throws if filtered pool < 3 (S2 invariant guarantees this never happens at runtime).
- **S6. Anhörung trigger probability** — `P = clamp(0.20 + 0.40 × normalisedImpactMag, 0, 0.70)`. `normalisedImpactMag` = `(|gdpGrowth| + |publicSentiment|) / typical-bill-impact-magnitude`. 50k convergence test asserts mean P matches calibration target.
- **S7. Enquete duration** — uniform draw `[ENQUETE_DURATION_MIN_DAYS = 360, ENQUETE_DURATION_MAX_DAYS = 720]`. Many Kommissionen run beyond term-end (matches reality — Enquete-Kommissionen frequently span multiple legislatures).
- **S8. Enquete max active** — 2 (`ENQUETE_MAX_ACTIVE`). Filing attempt at cap returns fixable error per existing action-parser pattern. Matches Cycle 4 inquiry cap (S9) for the same reason: prevents Bundestag-clogging.
- **S9. Enquete rate-limit** — 90 sim days between proposals (`ENQUETE_RATE_LIMIT_DAYS`). Twice the Cycle 4 inquiry rate-limit since Kommissionen run longer.
- **S10. Enquete membership** — 17 MdB slots (`ENQUETE_MDB_SLOTS`) proportional to Fraktion-bearing party seat counts via largest-remainder method (Σ === 17 invariant). 4–6 experts (`ENQUETE_EXPERT_SLOTS_MIN..MAX`) from pool by `expertise_areas ∋ topic`. No per-MdB seat-level membership (deferred — same blocker as Cycle 4 Q7 inquiry seat-level deferral).
- **S11. Enquete trigger context** — `persistent_crisis` only (`daysActive ≥ ENQUETE_PERSISTENT_CRISIS_THRESHOLD_DAYS = 60`). The `low_sentiment_streak` trigger considered during design but rejected as redundant with the existing snap-election approval-streak trigger and would require a new state-streak column on `national_state`.
- **S12. Enquete vote tally** — `tallyEnqueteVote(parties, proposingPartyId, coalitionPartyIds, publicSentiment, rng?)` returns `{yes, no, abstain, passed}`. Proposing party 100% yes; coalition 98% yes (cross-party support norm); opposition 85% yes baseline + sentiment adjustment (capped); pariah 50% Bernoulli. `passed := yes > no` (simple majority of cast votes — Bundestag-Beschluss). 50k convergence target: pass-rate ≥ 92%.
- **S13. Migration** — single `cycle5Migrated` meta flag. 3 new tables in `SIM_TABLE_DDL` only (no synthetic `_table` rows in `SIM_COLUMN_MIGRATIONS` per PR #165 R1). `EXPERTS_SEED` rows inserted via `INSERT OR IGNORE` (idempotent on re-run, preserves any future expert-related audit data). Wrapped in `getSqlite().transaction()` per `tool-safety.md`.
- **S14. `BILL_CATEGORY_TO_MINISTRY`** — rename Cycle 4 S18's `CRISIS_CATEGORY_TO_MINISTRY` to `BILL_CATEGORY_TO_MINISTRY`. Note: `CrisisCategory` is already a type alias for `BillCategory` (see `packages/types/src/types/economy.ts:24`), so no key-type change — just naming clarity since the map now serves both Anhörung expert-selection (PR 1) and the existing Nachtrags allocation (Cycle 4, call-site updated). One source of truth.
- **S15. Event-tier classifications (6 new)** — explicit per-event registration in `simulation/timing.ts` per Cycle 3 R-item lesson (no defaults). See cross-cutting table above. `enquete_rejected` and `schuldenbremse_expired` are routine-tier (quiet political moments).
- **S16. Cycle 4 docs cleanup** — PR 4 (final commit) deletes `docs/plans/043-cycle4-spec.md` + `docs/plans/043-cycle4-brainstorm.md`, mirroring the Cycle 2/3/4 housekeeping pattern. Same commit as the polish work; not a separate chore PR.
- **S17. AgentContext.enqueteOpportunity visibility** — surfaced to **both** coalition + opposition agents (Enquete is bipartisan in real Bundestag, unlike Cycle 4 `inquiryOpportunity` which is opposition-only). Documented in `agent/prompt.ts` as "this is a moment a Fraktion may propose a cross-party policy commission."
- **S18. R-item routing** — R4 (Schuldenbremse calibration) + R5 (Nachtrags rounding) + R10 (typed `PendingInjection` discriminant) → PR 3 (paired with Schuldenbremse + Nachtrags work). R6 (any-casts) + R7 (mdb names) + R8 (unused param) + R9 (drizzle mock comment) → PR 4. R1–R3 already in `78f8bf4` from Cycle 4 review-fix commit; not repeated.
- **S19. PR 4 commit prefix** — `chore(sim-fidelity):` (polish, no functional change → no version bump in release-please). User can switch to `feat(sim-fidelity):` if a Cycle-5 minor bump is preferred for tagging consistency. Default: `chore`.
- **S20. Schuldenbremse passage threshold** — `tallySchuldenbremseVote` switches from `yes > no` Bernoulli pass to `yes >= MAJORITY_SEATS` (=316 of 630, matches Art. 115 Abs. 2 Satz 6 GG: "Mehrheit der Mitglieder des Bundestages"). Reuses `voting.ts "absolute"` mode primitive — no new mode introduced.
- **S21. Schuldenbremse coalition yes-rate (R4)** — `SCHULDENBREMSE_COALITION_YES_RATE` lowered from 0.95 → 0.88 to model dissent on a controversial fiscal instrument. `SCHULDENBREMSE_OPPOSITION_YES_BASE` recalibrated via 50k convergence test to land pass-rate at 60–80% when justification is met.
- **S22. Schuldenbremse expiry event** — new `schuldenbremse_expired` event type (routine tier). Emitted when `checkSchuldenbremseExpiry()` triggers via new `applySchuldenbremseExpiry(state, meta, currentDay)` helper that returns `{expired, event?}`. Closes Cycle 4 silent auto-restore path.
- **S23. Nachtrags rounding (R5)** — `generateNachtragsAllocations`: round first 7 ministries to 0.1B EUR; last gets `total - sum(first7)` (carry-the-remainder pattern). Σ === total invariant test added (was the gap R5 surfaced).
- **S24. Typed PendingInjection (R10)** — convert `PendingInjection.data` to a discriminated union by `type` field. `PendingInjection<"nachtragshaushalt"> = { type: "nachtragshaushalt"; data: { /* typed */ } }`. Replaces all `data: {...} as any` in loop.ts step 10h + `processNachtragsInjection`. TypeScript catches all caller sites at compile-time.

## Risks surfaced for the spec

These belong in the Cycle 5 spec, not the brainstorm — listed here so the spec author doesn't miss them.

- **R1**. Anhörung tone influence on amend probability (S4) may distort committee-stage calibration. Mitigation: small cap (0.05); tone mean should be ≈0; verify post-Cycle-5 simulate-1461 amend-rate matches Cycle 4 baseline ±2pp.
- **R2**. `selectEnqueteMembers` may produce 0-count for sub-5% Fraktionen. Largest-remainder method handles edge cases; sum-invariant test asserts no negative counts and Σ === 17 in all configurations.
- **R3**. Schuldenbremse threshold change (Q1=A) does not significantly shift pass-rate for typical coalitions (most have 316+ seats). The agent-side justification gate stays the bottleneck — the 60–80% R4 calibration target is achieved primarily via the lower coalition yes-rate (0.95 → 0.88), not via the threshold check itself.
- **R4**. R10 typed-discriminant migration breaks any callers that constructed `pending_injections` payloads inline. TypeScript compile-time check enforces every caller site is updated; PR 3 must typecheck before merge.
- **R5**. EXPERTS_SEED real-name affiliations age (people change institutions). Comment in `config/experts.ts` notes "as of brainstorm date" + suggests yearly review cadence. Annual maintenance hook surfaced in §"Open items" for Cycle 6+.
- **R6**. Anhörung AI failure path — if AI batch returns malformed JSON, the row stays `status='lapsed'` with `tone=0`. Committee→2nd-reading transition reads tone=0 (zero nudge) gracefully. Test asserts the lapse path doesn't break the bill pipeline.
- **R7**. Enquete soft-watchdog — Kommission rows where `currentDay > scheduled_end_day + 30` and no in-flight final-report batch transition to `status='lapsed'` to prevent stuck rows clogging the active cap. Mirrors Cycle 4 inquiry watchdog pattern (Cycle 4 Q9).
- **R8**. `enquete_rejected` (routine tier) is a quiet political moment — narrative treatment matters. Vote-tally string in event description (`"Yes/No/Abstention"`) makes it readable. R8 reminds the spec to write a templated description that includes the tally + proposing party.
- **R9**. Cycle 4 docs deletion (S16) hides recent context for Cycle 5 reviewers viewing the docs-tree. Git history preserves them; PRs should reference by commit SHA when needed.
- **R10**. R-item back-references (Cycle 3/4 review praise) — every non-obvious Cycle 5 decision in code cites its R or S number in a code comment. Continue this discipline.
- **R11**. Anhörung tone influence directionality — does tone > 0 increase or decrease amend probability? Answer locked: `applyAnhoerungToneToAmendProb(base, tone) = clamp(base + tone × 0.05, 0, 1)`. Positive tone (expert endorsement) *increases* amend probability — endorsed bills benefit from refinement; opposed bills get rejected at 3rd reading or pass without amendment. R11 reminds the spec to encode this directionality explicitly with a comment + test.
- **R12**. `BILL_CATEGORY_TO_MINISTRY` rename (S14) touches `simulation/budget.ts::generateNachtragsAllocations` from Cycle 4 — the existing import of `CRISIS_CATEGORY_TO_MINISTRY` becomes `BILL_CATEGORY_TO_MINISTRY`. Identifier-only change, no logic shift. PR 1 must update the import site (single line change in budget.ts).

## Cost estimate

- **Per sim-day**: ≤$0.0006 add (50% batch discount applied). Most days fire 0 Cycle-5-specific events; on hearing days, 1 batch item adds. On Enquete-conclude days, 1 batch item adds.
- **Term total** (4 years ≈ 1461 sim days): ≤$0.9 add. Rounding error in the project's existing per-term budget.
- **No new sequential AI calls** — all new AI usage flows through the existing `submitBatch()` path.

## Speed estimate

- Wall-clock per term: neutral. New event generation runs at daily-tick speed; AI summaries piggy-back on existing batch dispatch.
- Per-day variance: minimal. Hearing days have 1 extra batch item; Enquete-conclude days have 1 extra batch item; other days unchanged.

## Implementation plan — 4 PRs (commits, no PRs until user says otherwise)

PR-style commits on `claude/sim-fidelity-cycle5` branch, mirroring Cycle 4's cadence. Each commit fully tested + typechecked + built. No GitHub PR until user explicitly says.

### PR 1 — Ausschussanhörungen + experts seed table (heaviest)

`feat(sim-fidelity): Ausschussanhörungen + experts seed table (Cycle 5 PR 1)`

- New file `config/experts.ts` — `EXPERTS_SEED` constant (~30 named entries with affiliations + expertise_areas)
- New file `simulation/anhoerungen.ts` — pure helpers (`shouldHoldAnhoerung`, `pickExpertsForHearing`, `applyAnhoerungToneToAmendProb`) + AI batch builder/processor (`buildAusschussanhoerungenBatchRequest`, `processAusschussanhoerungenBatchResult`)
- New file `simulation/anhoerungen.test.ts` (~14 cases) — 50k convergence on `shouldHoldAnhoerung`, distinct-experts invariant on `pickExpertsForHearing`, clamping/sign on `applyAnhoerungToneToAmendProb`, EXPERTS_SEED ministry-coverage assertion
- Schema: `experts` + `ausschussanhoerungen` Drizzle definitions in `db/schema-sim.ts`; DDL in `db/ddl.ts` (SIM_TABLE_DDL only, no synthetic _table rows per PR #165 R1)
- Migration: `seed.ts::migrateDatabase()` opens `cycle5Migrated` block; `INSERT OR IGNORE EXPERTS_SEED` rows
- Agent surface: none (auto-trigger)
- Loop integration: step 5 trigger + batch submit + step 5b processor + step 5d tone read at committee→2nd-reading transition (via `bill-pipeline.ts`)
- New event type `ausschussanhoerung_held` (standard tier) registered in `simulation/timing.ts`
- New constants in `config/parliament.ts` (5 new): `ANHOERUNG_BASE_PROBABILITY = 0.20`, `ANHOERUNG_IMPACT_COEFFICIENT = 0.40`, `ANHOERUNG_PROBABILITY_CAP = 0.70`, `ANHOERUNG_TONE_INFLUENCE = 0.05`, `ANHOERUNG_EXPERTS_PER_HEARING = 3`
- Refactor: `CRISIS_CATEGORY_TO_MINISTRY` → `BILL_CATEGORY_TO_MINISTRY` unified map (S14, R12) with import-update at the existing Cycle 4 Nachtrags call-site
- Tests: ~14 cases. LOC estimate: ~800

### PR 2 — Enquete-Kommission

`feat(sim-fidelity): Enquete-Kommission lifecycle + AI Schlussbericht (Cycle 5 PR 2)`

- New file `simulation/enquete-commissions.ts` — pure helpers (`findEnqueteOpportunity`, `selectEnqueteMembers`, `pickEnqueteExperts`, `tallyEnqueteVote`, `pickEnqueteDuration`) + lifecycle code + AI batch builder/processor
- New file `simulation/enquete-commissions.test.ts` (~12 cases) — opportunity detection, 17-slot sum invariant, expertise overlap, vote convergence (50k), watchdog lapse
- Schema: `enquete_commissions` Drizzle definition; DDL in `db/ddl.ts` (SIM_TABLE_DDL)
- Agent action `request_enquete_kommission` in `agent/action-parser.ts` with full validation (Fraktion + cap + rate-limit + topic-validity)
- `AgentContext.enqueteOpportunity` field populated in `loop.ts` from active persistent crises (S11)
- `agent/prompt.ts` adds prompt section explaining `enqueteOpportunity` as a moment for cross-party policy commission
- Loop integration: step 5 context injection; step 10 action handling + same-day vote → `enquete_proposed` + `enquete_convened`/`enquete_rejected`; step 11 daily-conclude check + soft-watchdog
- 4 new event types in `types/meta.ts`: `enquete_proposed`, `enquete_convened`, `enquete_rejected`, `enquete_concluded`
- Tier classification (S15): proposed → important, convened → important, rejected → routine, concluded → important
- New constants in `config/parliament.ts` (7 new): `ENQUETE_MDB_SLOTS = 17`, `ENQUETE_DURATION_MIN_DAYS = 360`, `ENQUETE_DURATION_MAX_DAYS = 720`, `ENQUETE_MAX_ACTIVE = 2`, `ENQUETE_RATE_LIMIT_DAYS = 90`, `ENQUETE_EXPERT_SLOTS_MIN = 4`, `ENQUETE_EXPERT_SLOTS_MAX = 6`, `ENQUETE_PERSISTENT_CRISIS_THRESHOLD_DAYS = 60`
- Tests: ~12 cases. LOC estimate: ~700

### PR 3 — Schuldenbremse threshold + R4 calibration + R5 rounding + R10 discriminant + expiry event

`feat(sim-fidelity): Schuldenbremse absolute-majority threshold + expiry event + R4/R5/R10 polish (Cycle 5 PR 3)`

- `simulation/budget.ts`:
  - `tallySchuldenbremseVote` — pass check switches to `yes >= MAJORITY_SEATS` (S20). Reuses existing `voting.ts "absolute"` semantic; no new vote primitive.
  - `generateNachtragsAllocations` — carry-the-remainder rounding (S23, R5): round first 7 ministries to 0.1B EUR, last gets exact remainder.
  - New `applySchuldenbremseExpiry(state, meta, currentDay)` returns `{expired, event?}` (S22). Replaces in-place mutation in `checkSchuldenbremseExpiry`.
- `simulation/budget.test.ts`:
  - 50k convergence: pass-rate 60–80% when justified (R4)
  - Σ === total invariant for `generateNachtragsAllocations` (closes R5 gap)
  - Expiry event fires once at suspendedUntilDay (no event before, no event after) (S22)
- `config/budget.ts`:
  - `SCHULDENBREMSE_COALITION_YES_RATE`: 0.95 → 0.88 (S21, R4)
  - `SCHULDENBREMSE_OPPOSITION_YES_BASE`: recalibrated via convergence test
- `simulation/loop.ts`:
  - `checkSchuldenbremseExpiry` calls new `applySchuldenbremseExpiry`; persists event when emitted
  - Step 10h: drop `data: { ... } as any` via typed `PendingInjection<"nachtragshaushalt">` (S24, R10)
- `types/economy.ts`:
  - Convert `PendingInjection` to discriminated union by `type` field (S24, R10)
- New event type `schuldenbremse_expired` (routine tier) in `types/meta.ts` + `simulation/timing.ts`
- Tests: ~7 cases. LOC estimate: ~250

### PR 4 — Polish + Cycle 4 docs cleanup (S16)

`chore(sim-fidelity): polish + Cycle 4 docs cleanup (Cycle 5 PR 4)` (S19)

- `simulation/loop.ts` — drop `(state as any)` / `(meta as any)` casts at ~6 sites (R6); the `schema-sim.ts` fields exist, so types should flow without casts
- `simulation/discipline.ts` (or wherever `detectDisciplineBreaks` lives) — replace `MdB-Sitz #${seatId}` fallback with real-name join through `bundestagSeats → mdbApplications.userId → users.nickname` (R7). Falls back to templated string only when no application exists for that seat.
- `simulation/inquiry-committees.ts` — drop unused `_parties` parameter from `findInquiryOpportunity`, adjust caller in loop.ts (R8)
- `simulation/budget.test.ts` — comment block on `vi.mock("drizzle-orm")` explaining the where-clause-args-not-inspected assumption (R9)
- **Final commit deletes `docs/plans/043-cycle4-spec.md` + `docs/plans/043-cycle4-brainstorm.md`** per S16
- No new tests (R6/R7/R8 are refactors verified by typecheck + existing tests; R9 is comment-only)
- LOC estimate: ~80 added/changed (mostly subtractions and the R7 join), ~1700 deleted

### Post-merge cleanup

Cycle 5 brainstorm + spec stay until cycle 5 itself ships; deleted in Cycle 6's final PR per the established lag pattern.

## Success criteria

- `npm run typecheck && npm test && npm run build` green on each of the 4 PR-commits.
- Seed + `simulate 1461` completes without error after all 4 commits.
- After a fresh `simulate 1461` (one full term ≈ 4 years):
  - **Ausschussanhörungen**: 14–36 hearings/term (probability range × ~40–80 committee-stage bills). Tone scalar mean ∈ [-0.10, +0.10], stddev ≥ 0.20. ≥6 of 8 ministries appear as `ministry_focus`. Each expert appears 1–5×.
  - **Enquete-Kommissionen**: 0–3 proposed/term. Pass-rate ≥92% (50k convergence). Peak 2 active simultaneously. Σ `party_member_ids === 17` for every active row. `expert_member_ids` count ∈ [4, 6]. Watchdog triggers within 1 sim-day for stale rows.
  - **Schuldenbremse**: 0–2 `schuldenbremse_aussetzung_passed`/term (matches Cycle 4 band). Pass-rate when proposed: 60–80% (50k convergence). Each pass → exactly 1 `schuldenbremse_expired` event 365 sim-days later (or never if term ends first). `generateNachtragsAllocations` Σ === total to floating-point exact.
  - **Polish**: 0 `(state as any)` / `(meta as any)` in loop.ts. `detectDisciplineBreaks` populates real names for ≥80% of discipline-break events when MdB applications exist. `docs/plans/043-cycle4-{spec,brainstorm}.md` not present in tree.
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

Write `docs/plans/043-cycle5-spec.md` in the same shape as the Cycle 4 spec (Decisions — Non-goals — Design per piece — Risks — Migration — 4 PR breakdown — Success criteria — Open items). Then implement piece-by-piece as commits on `claude/sim-fidelity-cycle5` branch. No pull requests until user says otherwise.
