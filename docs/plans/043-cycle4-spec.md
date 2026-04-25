# 043 Cycle 4 — Spec + Implementation Plan (P3 structural additions)

**Scope**: Four structurally additive pieces — Untersuchungsausschuss (parliamentary inquiry committees) · Schuldenbremse-Aussetzung (Art. 115 GG fiscal-emergency vote) · Nachtragshaushalt (supplementary budget) · debate sub-formats (Kurzintervention + Zwischenfrage + Erklärung zur Abstimmung).
**Source**: [`043-cycle4-brainstorm.md`](./043-cycle4-brainstorm.md) (locked Q1–Q9 + S1–S16), [`../todo/043-sim-timing-fidelity.md`](../todo/043-sim-timing-fidelity.md) §Cycle 4.
**Delete this file** once Cycle 4 has shipped (in Cycle 5's final PR per the established housekeeping cadence).

## Decisions (locked)

Restated from the brainstorm with sub-decisions surfaced while designing.

| # | Question | Decision |
|---|----------|----------|
| Q1 | Sub-cycles? | **No.** One cycle, four PR-commits, mirroring Cycle 3's cadence. |
| Q2 | Which deferred | **Enquete-Kommission + Ausschussanhörungen** — both depend on a missing external-expert-witness actor model. Defer to Cycle 5+ as a paired feature. |
| Q3 | Inquiry fidelity | **B (Mid)**: lifecycle + AI hearing summaries (1 batch item per active hearing) + AI final report at conclusion. Court powers deferred. |
| Q4 | Inquiry trigger | **Agent action with crisis amplification via `AgentContext`**. No auto-spawn; agents always make the call. Crisis context surfaced as a flag in opposition agent prompts. |
| Q5 | Fiscal-emergency trigger | **Hybrid agent-driven + crisis context injection**, symmetric with Q4. Coalition leader sees fiscal-pressure flags (provisional-budget streak ≥30 days OR active high-severity crisis). |
| Q5b | Schuldenbremse mechanics | **Bundestag vote + Nachtragshaushalt via existing budget machinery**. Schuldenbremse-Aussetzung is a separate vote event. On pass, queue an injection that flows through `tallyBudgetVote()` + `applyBudgetEconomicEffect()`. Simple-majority threshold (real Bundestag uses qualified majority — flagged as Cycle 5+ refinement, see Open items). |
| Q6 | Debate sub-formats | **Three sub-formats, all data-hooked**. Kurzintervention + Zwischenfrage as deterministic flavor at `bill_first_reading` + `bill_second_reading` (30% per reading, independent rolls). Erklärung zur Abstimmung post-`bill_third_reading` for each MdB seat where `disciplineLevel >= 1` AND vote ≠ party line. Ordnungsruf deferred. |
| Q7 | Inquiry runtime | **Real-aligned, party-level**. 180–540 sim days uniform draw; hearings every 30 sim days; max 2 active simultaneously; no per-seat `committee_memberships` rows (deferred). |
| Q8 | Migration | **In-place, idempotent**, inline in `seed.ts::migrateDatabase()`, guarded by single `cycle4Migrated` boolean meta flag. Same pattern as Cycles 1/2a/2b/3. |
| Q9 | Failure modes | **Soft-watchdog**: inquiries auto-conclude as `cleared` if `currentDay > scheduledEndDay + 30` and no hearing in the prior 60 days. Schuldenbremse vs Nachtragshaushalt timing collision impossible by construction (Nachtragshaushalt completes within the same daily tick the injection drains). |
| S1 | Inquiry conclusion outcome | Deterministic, weighted by govt approval at conclusion. `<30%` → 70% wrongdoing-found; `30–50%` → 40%; `>50%` → 20%. Pure helper `pickInquiryOutcome(govApproval, rng?)`. |
| S2 | Inquiry approval impacts | Filing party `+0.3` one-time on file; target party `-0.05/day` while active (clamped per R1). Conclusion: `wrongdoing_found` → target `-1.5`, filer `+0.8`; `cleared` → target `+0.5`, filer `-0.3`. |
| S3 | Schuldenbremse duration | 365 sim days. Coalition must re-file to extend. Auto-clears via `checkSchuldenbremseExpiry()` daily check. |
| S4 | Nachtragshaushalt allocation | Auto-generated, crisis-weighted. Total: uniform draw 50–150B EUR. Allocation = base coalition allocation + `+30%` boost to the crisis category's mapped ministry. |
| S5 | Erklärung zur Abstimmung mechanics | Fires once per `bill_third_reading` per discipline-breaking MdB seat. Templated description names MdB + bill + which-way-broke (`vs_party_line`). Routine-tier. |
| S6 | Kurzintervention + Zwischenfrage | 30% probability per `bill_first_reading` / `bill_second_reading` event for each sub-format (independent rolls). Speaker = bill-proposing party; interjector = random opposition party (Kurzintervention) or random non-bill-proposer (Zwischenfrage). |
| S7 | Migration | Single `cycle4Migrated` meta flag. Migration block appended to existing `migrateDatabase()` ordering (no order dependency on prior cycles). Wrapped in `sqlite.transaction()`. |
| S8 | Inquiry rate-limit | Min 60 sim days between inquiry filings globally (across all parties). Tracked via `simulation_meta.last_inquiry_filed_day`. |
| S9 | Active-inquiry cap | Max 2 globally. Filing attempt while at cap returns a fixable error per the existing `action-parser.ts` validation pattern (matches `file_misstrauensvotum` cap rejection style). |
| S10 | RNG model | `Math.random` in production; seeded RNG accepted as optional param in pure helpers for tests. End-to-end seeded RNG plumbing remains deferred (carried open from Cycle 3). |
| S11 | `committees` table reuse rejected | Inquiry committees use a dedicated `inquiry_committees` table — different lifecycle, no member-roster, no bill-routing role. Naming kept distinct to avoid consumer confusion. |
| S12 | Schuldenbremse vote tally | New pure helper `tallySchuldenbremseVote(parties, coalitionIds, sentiment, crisisSeverity)` in `simulation/budget.ts`. Coalition typically yes; opposition mixed by sentiment + crisis severity. One-shot vote (no revision concept). |
| S13 | Nachtragshaushalt allocator | Lives in `budget.ts` next to `generateBudgetAllocations`, named `generateNachtragsAllocations(coalition, crisisCategory, total)`. No new module. |
| S14 | Inquiry / fiscal-emergency context injection | Opposition agent's `AgentContext` gains `inquiryOpportunity?: { triggerCrisisId; targetPartyId; severity }`. Coalition leader's `AgentContext` gains `fiscalEmergencyJustified?: { activeCrisisId?; provisionalBudgetDays }`. Both optional; absence means agents shouldn't file in a normal day. Prompt section in `agent/prompt.ts` explains when each flag is "a moment to act." |
| S15 | Event tier classifications (12 new) | `inquiry_filed` → important; `inquiry_hearing_held` → standard (default); `inquiry_concluded` → important; `schuldenbremse_aussetzung_proposed` → important; `schuldenbremse_aussetzung_passed` → critical; `schuldenbremse_aussetzung_rejected` → important; `nachtragshaushalt_proposed` → important; `nachtragshaushalt_passed` → important; `nachtragshaushalt_rejected` → important; `kurzintervention` → routine; `zwischenfrage` → routine; `erklaerung_zur_abstimmung` → routine. All 12 explicitly registered in `simulation/timing.ts` per Cycle 3 R-item lesson. |
| S16 | Cycle 3 spec-file cleanup | PR 4 (final commit) deletes `docs/plans/043-cycle3-brainstorm.md` + `docs/plans/043-cycle3-spec.md`, mirroring the Cycle 2/3 housekeeping pattern. Same commit as the debate-sub-format work; not a separate chore PR. |
| **S17** | Inquiry target type | Two valid targets: `targetPartyId` (a coalition party — most common) OR `targetMinistry` (a ministry portfolio when the offence is institutional rather than partisan). At least one MUST be non-null — invariant enforced at filing time AND asserted in tests. The "no longer exists" branch (R3) only applies to `targetPartyId`. |
| **S18** | Crisis→ministry mapping | A static map `CRISIS_CATEGORY_TO_MINISTRY` lives in `config/parliament.ts` next to `MINISTRY_CATEGORIES`. Used by S4 (Nachtragshaushalt boost) AND R5 (heuristic for "politically embarrassing for govt" inquiry-context flag). One source of truth. |
| **S19** | Nachtragshaushalt entry path | Exclusively via `pending_injections` (type `nachtragshaushalt`). Existing `isBudgetDay()` regular-cycle guard does NOT trigger Nachtragshaushalt — they share `tallyBudgetVote` + `applyBudgetEconomicEffect` but enter via different code paths. R4 enforced. |
| **S20** | Inquiry hearing summary AI prompt | One Haiku call per active hearing, batched. Prompt: 2–4 sentences, German, neutral journalistic register, references the inquiry subject + filer + target. No invented facts beyond crisis context already in `AgentContext`. Returns plain text (no JSON). Logged via `logAICall("inquiry_hearing")`. |
| **S21** | Inquiry final report AI prompt | One Haiku call per concluded inquiry, batched on the conclusion day. Prompt: 4–6 sentences, German, journalistic register, references the predetermined `outcome` (so the AI doesn't have to "decide" — it narrates). Returns plain text. Logged via `logAICall("inquiry_final_report")`. Stored in `inquiry_committees.final_report`. |
| **S22** | Erklärung zur Abstimmung text generation | **Templated, no AI**. Format: `"{mdbName} ({partyId}, MdB) erklärt Abstimmungsverhalten: gegen die Fraktion gestimmt zu '{billTitle}' (Disziplin-Stufe {level})."` Discipline-break detection is the value-add; AI text would be decoration cost (per brainstorm Q6 reasoning). |

## Non-goals

- **No external expert witnesses** — Enquete-Kommission + Ausschussanhörungen deferred to Cycle 5+ pending an expert-actor model.
- **No court-like inquiry powers** — minister summons, scandal-severity axis, multiple inquiry types deferred (Q3 brainstorm option C rejected).
- **No per-seat inquiry committee membership** — `committee_memberships`-style rows deferred (Q7 option C rejected; party-level only).
- **No qualified-majority threshold** for Schuldenbremse-Aussetzung — simple majority used as pragmatic simplification. Tracked as Cycle 5+ refinement (R2).
- **No agent customization of Nachtragshaushalt allocation** — formulaic given active crisis. Cycle 5+ polish (Open items).
- **No Ordnungsruf** — requires MdB-misbehavior signal that doesn't exist (Q6 brainstorm option D rejected).
- **No AI text on Kurzintervention / Zwischenfrage** — deterministic templates only (decoration cost rejected per Q6).
- **No end-to-end seeded RNG plumbing** — pure helpers accept optional `rng`; production uses `Math.random`. Carried open from Cycle 3.
- **No retroactive impact on in-flight bills / negotiations / elections** at migration time — new physics applies forward only (Cycle-3 S5/S6 precedent).
- **No changes** to Cycle 1 (calendar/bill-timing), Cycle 2a (Bundesrat/Kanzlerwahl), Cycle 2b (Parliamentary-QA/Aktuelle Stunde/Petitions), or Cycle 3 (P2 tuning) code paths.

## Design — Piece 1: Untersuchungsausschuss (parliamentary inquiry committees)

The heaviest piece. Lifecycle table + state machine + AI hearing summaries + AI final report. Triggered by an opposition agent action with crisis amplification via `AgentContext`.

### File layout

- **New module**: `packages/engine/src/simulation/inquiry-committees.ts` (~350 LOC)
- **New constants**: `packages/engine/src/config/parliament.ts` (8 new constants per below)
- **New schema**: `packages/engine/src/db/schema-sim.ts` (1 new table)
- **New DDL**: `packages/engine/src/db/ddl.ts` (1 CREATE TABLE in `SIM_TABLE_DDL` + 3 column adds in `SIM_COLUMN_MIGRATIONS`)
- **New event types** (3): `types/meta.ts` `SimulationEventType` union
- **Tier classification**: `simulation/timing.ts` IMPORTANT_EVENTS / ROUTINE_EVENTS sets
- **New agent action**: `agent/action-parser.ts` validation block + agent prompt section in `agent/prompt.ts`
- **AgentContext extension**: `types/agent.ts` (or wherever `AgentContext` lives — verify at impl time)
- **Loop integration**: `simulation/loop.ts` lifecycle tick + AgentContext flag population
- **Tests**: new `inquiry-committees.test.ts` (+15 cases); `action-parser.test.ts` (+3 cases for new action validation)

### Schema

**New table** `inquiry_committees` in `simulation.db` (per S11 — explicitly NOT reusing `committees`):

```ts
// db/schema-sim.ts
export const inquiryCommittees = sqliteTable("inquiry_committees", {
  id: text("id").primaryKey(),
  subject: text("subject").notNull(),                              // 1-line German subject
  filingPartyId: text("filing_party_id").notNull()
    .references(() => parties.id),
  targetPartyId: text("target_party_id")
    .references(() => parties.id),                                 // nullable per S17
  targetMinistry: text("target_ministry"),                         // nullable per S17 — one of MINISTRY_CATEGORIES
  filedOnDay: integer("filed_on_day").notNull(),
  scheduledEndDay: integer("scheduled_end_day").notNull(),         // filedOnDay + draw(180,540)
  concludedOnDay: integer("concluded_on_day"),                     // null while active
  status: text("status", { enum: ["active", "concluded"] })
    .notNull().default("active"),
  outcome: text("outcome", { enum: ["wrongdoing_found", "cleared"] }),  // null while active
  finalReport: text("final_report"),                               // populated at conclusion (S21)
  hearingCount: integer("hearing_count").notNull().default(0),
  lastHearingDay: integer("last_hearing_day"),                     // null until first hearing
});
```

**Invariant** (per S17): at least one of `targetPartyId` or `targetMinistry` must be non-null. Enforced at `fileInquiry()` filing time:

```ts
// inquiry-committees.ts::fileInquiry
if (input.targetPartyId == null && input.targetMinistry == null) {
  // R12: this is a structural invariant of the inquiry-committees table.
  // The dedicated table avoids `committees`-table conflation per S11.
  throw new Error("Inquiry must target a party or a ministry");
}
```

A 50_000-trial generator-property test asserts the invariant holds for all randomly-shaped inputs.

**New columns** on existing tables:

```ts
// national_state — add column
schuldenbremseSuspended: integer("schuldenbremse_suspended", { mode: "boolean" })
  .notNull().default(false),

// simulation_meta — add columns
schuldenbremseSuspendedUntilDay: integer("schuldenbremse_suspended_until_day"),  // nullable, auto-expiry
lastInquiryFiledDay: integer("last_inquiry_filed_day"),                          // nullable, S8 rate-limit
cycle4Migrated: integer("cycle4_migrated", { mode: "boolean" })
  .notNull().default(false),                                                     // S7
```

(`schuldenbremseSuspended` + `schuldenbremseSuspendedUntilDay` schema lines belong logically to Piece 2 but the migration adds them in the same `cycle4Migrated` block — colocated here for spec readability.)

### Constants (`config/parliament.ts`)

```ts
// --- Cycle 4 PR 1 — Untersuchungsausschuss ---

/** Min sim days an Untersuchungsausschuss runs before scheduled conclusion. */
export const INQUIRY_DURATION_MIN = 180;

/** Max sim days an Untersuchungsausschuss runs before scheduled conclusion. */
export const INQUIRY_DURATION_MAX = 540;

/** Hearings fire every N sim days while an inquiry is active. */
export const INQUIRY_HEARING_INTERVAL = 30;

/** Max simultaneously-active inquiries across all parties (S9). */
export const INQUIRY_MAX_ACTIVE = 2;

/** Min sim days between inquiry filings globally (S8 rate-limit). */
export const INQUIRY_MIN_DAYS_BETWEEN_FILINGS = 60;

/** Combined opposition-Fraktion seat share threshold to file (Bundestag rule: 25%). */
export const INQUIRY_THRESHOLD_PERCENT = 0.25;

/** One-time approval bonus for filing party at filing time (S2). */
export const INQUIRY_FILER_FILING_BONUS = 0.3;

/** Per-day approval drag on target party while inquiry is active (S2). */
export const INQUIRY_TARGET_DAILY_DRAG = -0.05;

/** Conclusion: wrongdoing-found target/filer impacts (S2). */
export const INQUIRY_WRONGDOING_TARGET_IMPACT = -1.5;
export const INQUIRY_WRONGDOING_FILER_IMPACT = 0.8;

/** Conclusion: cleared target/filer impacts (S2). */
export const INQUIRY_CLEARED_TARGET_IMPACT = 0.5;
export const INQUIRY_CLEARED_FILER_IMPACT = -0.3;

/** Watchdog: auto-conclude as cleared if past scheduled-end + this many days with no hearing (Q9). */
export const INQUIRY_WATCHDOG_GRACE_DAYS = 30;
export const INQUIRY_WATCHDOG_HEARING_GAP_DAYS = 60;

/**
 * Maps each `crises.category` value to a ministry portfolio in MINISTRY_CATEGORIES.
 * Used by S4 (Nachtragshaushalt allocation boost) and R5 (inquiry-opportunity heuristic).
 */
export const CRISIS_CATEGORY_TO_MINISTRY: Record<CrisisCategory, MinistryPortfolio> = {
  defense: "verteidigung",
  health: "gesundheit",
  economy: "wirtschaft",
  finance: "finanzen",
  environment: "umwelt",
  social: "soziales",
  education: "bildung",
  immigration: "inneres",
};
```

### Pure helpers (`simulation/inquiry-committees.ts`)

```ts
/**
 * R5: heuristic for "is this inquiry a politically valuable filing right now?".
 * Returns a target if a high-severity crisis maps to a coalition-held ministry.
 * Used to populate AgentContext.inquiryOpportunity in loop.ts.
 */
export function findInquiryOpportunity(
  crises: Crisis[],
  government: Government | null,
  parties: Party[],
): { triggerCrisisId: string; targetPartyId: string; severity: string } | null {
  if (!government) return null;
  for (const crisis of crises.filter(c => c.severity === "high" && c.active)) {
    const ministry = CRISIS_CATEGORY_TO_MINISTRY[crisis.category];
    if (!ministry) continue;
    const minister = government.ministers.find(m => m.portfolio === ministry);
    if (!minister) continue;
    return {
      triggerCrisisId: crisis.id,
      targetPartyId: minister.partyId,
      severity: crisis.severity,
    };
  }
  return null;
}

/**
 * S1: deterministic outcome roll, weighted by govt approval at conclusion day.
 * Pure for testability; `rng` defaults to Math.random in production.
 * Tested via 50_000-trial LCG convergence (project pattern).
 */
export function pickInquiryOutcome(
  govApproval: number,
  rng: () => number = Math.random,
): "wrongdoing_found" | "cleared" {
  let probWrongdoing: number;
  if (govApproval < 30) probWrongdoing = 0.7;
  else if (govApproval <= 50) probWrongdoing = 0.4;
  else probWrongdoing = 0.2;
  return rng() < probWrongdoing ? "wrongdoing_found" : "cleared";
}

/**
 * Returns true on every INQUIRY_HEARING_INTERVAL'th day after filedOnDay,
 * up to scheduledEndDay. Pure function; deterministic.
 */
export function shouldFireHearing(
  inquiry: InquiryCommittee,
  currentDay: number,
): boolean {
  if (inquiry.status !== "active") return false;
  if (currentDay >= inquiry.scheduledEndDay) return false;
  if (inquiry.lastHearingDay == null) {
    return currentDay >= inquiry.filedOnDay + INQUIRY_HEARING_INTERVAL;
  }
  return currentDay - inquiry.lastHearingDay >= INQUIRY_HEARING_INTERVAL;
}

/**
 * Q9 watchdog: an inquiry past scheduled-end-day + grace AND with no hearing
 * in the prior 60 days auto-concludes as "cleared" — prevents stuck inquiries
 * from clogging the active-cap when the hearing-batch path silently fails.
 */
export function shouldWatchdogConclude(
  inquiry: InquiryCommittee,
  currentDay: number,
): boolean {
  if (inquiry.status !== "active") return false;
  if (currentDay <= inquiry.scheduledEndDay + INQUIRY_WATCHDOG_GRACE_DAYS) return false;
  const lastHearing = inquiry.lastHearingDay ?? inquiry.filedOnDay;
  return currentDay - lastHearing >= INQUIRY_WATCHDOG_HEARING_GAP_DAYS;
}

/**
 * S2: applies the per-day target-party drag while inquiry is active.
 * Returns the impact delta (caller applies via the existing approval-update path
 * which handles clamping per opinion.ts — see R1).
 */
export function inquiryDailyDrag(): number {
  return INQUIRY_TARGET_DAILY_DRAG;
}
```

### Stateful lifecycle (`simulation/inquiry-committees.ts`)

```ts
export interface FileInquiryInput {
  filingPartyId: string;
  subject: string;
  targetPartyId: string | null;
  targetMinistry: MinistryPortfolio | null;
}

/**
 * Cycle 4 PR 1: file a new Untersuchungsausschuss. Validates invariants
 * (S17, S8 rate-limit, S9 active-cap) BEFORE any DB write.
 * Throws on invariant violation — caller is action-parser, which converts
 * to a fixable error per existing pattern.
 */
export function fileInquiry(
  input: FileInquiryInput,
  currentDay: number,
  rng: () => number = Math.random,
): { inquiry: InquiryCommittee; event: SimulationEvent } {
  // S17 invariant
  if (input.targetPartyId == null && input.targetMinistry == null) {
    throw new Error("Inquiry must target a party or a ministry");
  }
  // S8 rate-limit
  const meta = readMeta();
  if (meta.lastInquiryFiledDay != null
      && currentDay - meta.lastInquiryFiledDay < INQUIRY_MIN_DAYS_BETWEEN_FILINGS) {
    throw new Error(`Inquiry rate-limit: ${INQUIRY_MIN_DAYS_BETWEEN_FILINGS} day cooldown`);
  }
  // S9 cap
  const activeCount = countActiveInquiries();
  if (activeCount >= INQUIRY_MAX_ACTIVE) {
    throw new Error(`Inquiry cap: max ${INQUIRY_MAX_ACTIVE} active`);
  }
  const duration = INQUIRY_DURATION_MIN
    + Math.floor(rng() * (INQUIRY_DURATION_MAX - INQUIRY_DURATION_MIN + 1));
  const inquiry: InquiryCommittee = {
    id: `inquiry_${currentDay}_${input.filingPartyId}_${Math.floor(rng() * 1e6)}`,
    subject: input.subject,
    filingPartyId: input.filingPartyId,
    targetPartyId: input.targetPartyId,
    targetMinistry: input.targetMinistry,
    filedOnDay: currentDay,
    scheduledEndDay: currentDay + duration,
    concludedOnDay: null,
    status: "active",
    outcome: null,
    finalReport: null,
    hearingCount: 0,
    lastHearingDay: null,
  };
  // DB writes wrapped in a transaction per database.md
  getSqlite().transaction(() => {
    insertInquiry(inquiry);
    setMetaFlag("lastInquiryFiledDay", currentDay);
    applyApprovalDelta(input.filingPartyId, INQUIRY_FILER_FILING_BONUS);
  })();
  const event: SimulationEvent = {
    dayNumber: currentDay,
    type: "inquiry_filed",
    actor: input.filingPartyId,
    title: `Untersuchungsausschuss eingesetzt: ${input.subject}`,
    description: buildFiledDescription(inquiry, parties),
    data: { inquiryId: inquiry.id, ...input },
  };
  return { inquiry, event };
}

/**
 * Daily tick — runs every sim day in runDay() step ~5.5 (after bill pipeline).
 * Returns events for: hearings dispatched, watchdog auto-conclusions.
 * Hearing AI summaries are NOT inlined here — they enter the batch pipeline
 * via buildInquiryHearingBatchRequest() and are processed in a later loop step.
 */
export function tickActiveInquiries(currentDay: number): {
  hearingsToBatch: InquiryCommittee[];
  watchdogConclusions: SimulationEvent[];
} {
  const active = listActiveInquiries();
  const hearingsToBatch: InquiryCommittee[] = [];
  const watchdogConclusions: SimulationEvent[] = [];
  for (const inquiry of active) {
    if (shouldWatchdogConclude(inquiry, currentDay)) {
      const event = concludeInquiry(inquiry, currentDay, "cleared", /* watchdog */ true);
      watchdogConclusions.push(event);
      continue;
    }
    if (shouldFireHearing(inquiry, currentDay)) {
      hearingsToBatch.push(inquiry);
    }
    // Daily drag (R1: clamping handled by opinion.ts approval-update path)
    if (inquiry.targetPartyId) {
      applyApprovalDelta(inquiry.targetPartyId, INQUIRY_TARGET_DAILY_DRAG);
    }
    // Scheduled-end conclusion (non-watchdog) — outcome roll on current govt approval
    if (currentDay >= inquiry.scheduledEndDay && inquiry.status === "active") {
      const govApproval = computeGovernmentApproval();
      const outcome = pickInquiryOutcome(govApproval);
      const event = concludeInquiry(inquiry, currentDay, outcome, /* watchdog */ false);
      watchdogConclusions.push(event);  // (mis-named — actually scheduled conclusions too)
    }
  }
  return { hearingsToBatch, watchdogConclusions };
}

/**
 * Conclude an inquiry — applies approval impacts (S2), stores outcome,
 * emits inquiry_concluded event. AI final-report generation is dispatched
 * separately via buildInquiryFinalReportBatchRequest() — same batch pass.
 * R3: target party may have left coalition / merged. Apply impact only if
 * party still exists; skip otherwise (logged at info level).
 */
export function concludeInquiry(
  inquiry: InquiryCommittee,
  currentDay: number,
  outcome: "wrongdoing_found" | "cleared",
  watchdog: boolean,
): SimulationEvent {
  // R3: graceful "target no longer exists" branch
  const target = inquiry.targetPartyId
    ? findParty(inquiry.targetPartyId)
    : null;
  const filer = findParty(inquiry.filingPartyId);
  getSqlite().transaction(() => {
    updateInquiry(inquiry.id, {
      status: "concluded",
      outcome,
      concludedOnDay: currentDay,
    });
    if (outcome === "wrongdoing_found") {
      if (target) applyApprovalDelta(target.id, INQUIRY_WRONGDOING_TARGET_IMPACT);
      if (filer) applyApprovalDelta(filer.id, INQUIRY_WRONGDOING_FILER_IMPACT);
    } else {
      if (target) applyApprovalDelta(target.id, INQUIRY_CLEARED_TARGET_IMPACT);
      if (filer) applyApprovalDelta(filer.id, INQUIRY_CLEARED_FILER_IMPACT);
    }
  })();
  return {
    dayNumber: currentDay,
    type: "inquiry_concluded",
    actor: inquiry.filingPartyId,
    title: outcome === "wrongdoing_found"
      ? `Untersuchungsausschuss: Verfehlungen festgestellt — ${inquiry.subject}`
      : `Untersuchungsausschuss abgeschlossen — ${inquiry.subject}`,
    description: watchdog
      ? "Untersuchungsausschuss vorzeitig abgeschlossen (Verfahren versandet)."
      : buildConcludedDescription(inquiry, outcome, target, filer),
    data: { inquiryId: inquiry.id, outcome, watchdog, targetExists: target != null },
  };
}
```

### AI batch builder + processor (S20, S21)

Mirrors the `media.ts` / `summary.ts` patterns.

```ts
/** S20: builds the hearing-summary batch request (one item per active hearing). */
export function buildInquiryHearingBatchRequest(
  hearings: InquiryCommittee[],
  context: AgentContext,
): BatchRequestItem[] {
  return hearings.map(h => ({
    id: `inquiry_hearing_${h.id}_day_${context.currentDay}`,
    body: {
      system: HEARING_SYSTEM_PROMPT,
      messages: [{
        role: "user",
        content: buildHearingPrompt(h, context),
      }],
      max_tokens: 200,
      model: MODELS.daily,  // existing routing
    },
  }));
}

/** Processes a returned batch — updates hearingCount + lastHearingDay + emits events. */
export function processInquiryHearingBatchResult(
  results: BatchResult[],
  hearings: InquiryCommittee[],
  currentDay: number,
): SimulationEvent[] {
  const events: SimulationEvent[] = [];
  for (const inquiry of hearings) {
    const result = findResult(results, `inquiry_hearing_${inquiry.id}_day_${currentDay}`);
    if (!result?.text) continue;  // batch error — skip; watchdog will handle stuck inquiries
    const summary = result.text.trim();
    logAICall("inquiry_hearing", result, summary);
    getSqlite().transaction(() => {
      updateInquiry(inquiry.id, {
        hearingCount: inquiry.hearingCount + 1,
        lastHearingDay: currentDay,
      });
    })();
    events.push({
      dayNumber: currentDay,
      type: "inquiry_hearing_held",
      actor: inquiry.filingPartyId,
      title: `Anhörung: ${inquiry.subject}`,
      description: summary,
      data: { inquiryId: inquiry.id, hearingNumber: inquiry.hearingCount + 1 },
    });
  }
  return events;
}

/** S21: same shape for the final-report batch. */
export function buildInquiryFinalReportBatchRequest(
  concluded: { inquiry: InquiryCommittee; outcome: "wrongdoing_found" | "cleared" }[],
  context: AgentContext,
): BatchRequestItem[] { /* analogous; one item per conclusion */ }

export function processInquiryFinalReportBatchResult(
  results: BatchResult[],
  concluded: { inquiry: InquiryCommittee; outcome: "wrongdoing_found" | "cleared" }[],
): void {
  for (const { inquiry, outcome } of concluded) {
    const result = findResult(results, `inquiry_final_report_${inquiry.id}`);
    if (!result?.text) continue;  // graceful degrade — finalReport stays NULL
    logAICall("inquiry_final_report", result, result.text);
    updateInquiry(inquiry.id, { finalReport: result.text.trim() });
  }
}
```

### Loop integration (`simulation/loop.ts`)

```ts
// After step 5 (bill pipeline + party agents), before step 6 (citizen Qs):
//
// 5.5: Untersuchungsausschuss daily tick + AgentContext flag population
//
// R5: inquiry-opportunity flag wired into opposition agent's AgentContext
//     BEFORE step 5 fires (so agents see it during action selection).
//     This means populating the flag at top of step 5, then ticking
//     active inquiries AFTER agents have submitted actions (which may
//     include a new file_inquiry_committee action).

// Top of step 5 (before agent dispatch):
context.inquiryOpportunity = findInquiryOpportunity(activeCrises, government, parties);
context.fiscalEmergencyJustified = findFiscalEmergencyOpportunity(...);  // see Piece 2

// After step 5 (agents have spoken; new inquiries may have been filed):
const { hearingsToBatch, watchdogConclusions } = tickActiveInquiries(currentDay);
events.push(...watchdogConclusions);

// Hearings join batch group D (new — or reuse C). Spec locks NEW BATCH GROUP D
// for inquiry-related AI to keep the existing group structure auditable.
const hearingItems = buildInquiryHearingBatchRequest(hearingsToBatch, context);
const concluded = watchdogConclusions
  .filter(e => e.data?.watchdog === false)
  .map(e => ({ inquiry: getInquiry(e.data.inquiryId), outcome: e.data.outcome }));
const finalReportItems = buildInquiryFinalReportBatchRequest(concluded, context);

// Submit batch group D (single batch, one network round-trip)
const groupDResults = await submitBatch([...hearingItems, ...finalReportItems]);
events.push(...processInquiryHearingBatchResult(groupDResults, hearingsToBatch, currentDay));
processInquiryFinalReportBatchResult(groupDResults, concluded);
```

### Agent action `file_inquiry_committee` (`agent/action-parser.ts`)

```ts
// Validation block, mirroring file_misstrauensvotum pattern at action-parser.ts
case "file_inquiry_committee": {
  // Fraktion gate (already-existing helper)
  if (!hasFraktion(parties, party.id)) {
    return fixable(`Party ${party.id} lacks Fraktion — cannot file inquiry`);
  }
  // Opposition gate (must NOT be in coalition)
  if (government?.coalitionPartyIds.includes(party.id)) {
    return fixable(`Coalition parties cannot file inquiries against themselves`);
  }
  // Combined opposition seat threshold (Bundestag rule: 25% of seats)
  const oppositionSeats = parties
    .filter(p => !government?.coalitionPartyIds.includes(p.id) && hasFraktion(parties, p.id))
    .reduce((s, p) => s + p.seatCount, 0);
  if (oppositionSeats < BUNDESTAG_SIZE * INQUIRY_THRESHOLD_PERCENT) {
    return fixable(`Combined opposition seats below ${INQUIRY_THRESHOLD_PERCENT * 100}% threshold`);
  }
  // S9 cap
  if (countActiveInquiries() >= INQUIRY_MAX_ACTIVE) {
    return fixable(`Inquiry cap reached: max ${INQUIRY_MAX_ACTIVE} active`);
  }
  // S8 rate-limit
  const meta = readMeta();
  if (meta.lastInquiryFiledDay != null
      && currentDay - meta.lastInquiryFiledDay < INQUIRY_MIN_DAYS_BETWEEN_FILINGS) {
    return fixable(`Inquiry rate-limit: ${INQUIRY_MIN_DAYS_BETWEEN_FILINGS} day cooldown active`);
  }
  // S17 invariant
  if (action.targetPartyId == null && action.targetMinistry == null) {
    return fixable(`Inquiry must specify targetPartyId or targetMinistry`);
  }
  // R8: max 1 active inquiry per filing party
  if (countActiveInquiriesByParty(party.id) >= 1) {
    return fixable(`Party ${party.id} already has 1 active inquiry`);
  }
  return ok();
}
```

Agent prompt section (`agent/prompt.ts`) gets a new conditional block:

```ts
if (context.inquiryOpportunity) {
  prompt += `

**Untersuchungsausschuss-Gelegenheit**: Eine Krise (${context.inquiryOpportunity.triggerCrisisId})
betrifft ein von der Regierung kontrolliertes Ministerium. Du kannst einen
Untersuchungsausschuss gegen die verantwortliche Regierungspartei
(${context.inquiryOpportunity.targetPartyId}) einsetzen. Maximal ${INQUIRY_MAX_ACTIVE}
Untersuchungsausschüsse gleichzeitig aktiv.
`;
}
```

### Tests (`inquiry-committees.test.ts` — +15 cases)

1. `pickInquiryOutcome` — 50_000-trial LCG convergence at `<30%`, `30-50%`, `>50%` govt approval (3 cases, ±1.5pp tolerance).
2. `pickInquiryOutcome` — boundary points (29.999, 30.0, 50.0, 50.001) deterministic with seeded RNG.
3. `shouldFireHearing` — fires on day `filedOnDay + 30`, `filedOnDay + 60`; not on day `filedOnDay + 29`.
4. `shouldFireHearing` — never fires past `scheduledEndDay`.
5. `shouldWatchdogConclude` — fires when past scheduled-end + 30 AND no hearing in 60 days.
6. `shouldWatchdogConclude` — does not fire if hearing fired in prior 60 days.
7. `fileInquiry` — invariant: throws when both `targetPartyId` and `targetMinistry` are null (S17).
8. `fileInquiry` — invariant: throws when at active-cap (S9).
9. `fileInquiry` — invariant: throws when within rate-limit window (S8).
10. `fileInquiry` — happy path: writes inquiry row, sets `lastInquiryFiledDay`, applies `+0.3` to filer.
11. `fileInquiry` — duration draw is uniform[180, 540] (1000-trial range check).
12. `concludeInquiry` — wrongdoing applies `-1.5` to target, `+0.8` to filer.
13. `concludeInquiry` — cleared applies `+0.5` / `-0.3`.
14. `concludeInquiry` — R3: target no longer exists (party deleted) → no-throw, no-target-impact branch fires.
15. `findInquiryOpportunity` — returns null if no high-severity crisis; returns `{triggerCrisisId, targetPartyId, severity}` for a high-severity crisis mapped to a coalition-held ministry.

`action-parser.test.ts` adds 3 cases: opposition-Fraktion gate, threshold gate, cap gate.

## Design — Piece 2: Schuldenbremse-Aussetzung (Art. 115 GG fiscal-emergency vote)

A separate Bundestag vote that suspends the structural debt brake for 365 sim days. Once passed, the queue receives a Nachtragshaushalt injection (Piece 3).

### File layout

- **New helpers in existing module**: `simulation/budget.ts` gains `tallySchuldenbremseVote()`, `applySchuldenbremseAussetzung()`, `checkSchuldenbremseExpiry()`, `findFiscalEmergencyOpportunity()` (~120 LOC added)
- **New constants**: `config/budget.ts`
- **New event types** (3): `types/meta.ts`
- **Tier classification**: `simulation/timing.ts` (proposed/rejected → important; passed → critical per S15)
- **Schema**: column adds via the same `cycle4Migrated` migration block (already listed in Piece 1)
- **Loop integration**: `simulation/loop.ts` (see below)
- **New agent action**: `agent/action-parser.ts` `propose_fiscal_emergency`
- **AgentContext extension**: `fiscalEmergencyJustified?: { activeCrisisId?: string; provisionalBudgetDays: number }`
- **Tests**: `budget.test.ts` (+8 cases)

### Constants (`config/budget.ts`)

```ts
// --- Cycle 4 PR 2 — Schuldenbremse-Aussetzung ---

/** Sim days a Schuldenbremse-Aussetzung remains in effect (S3). */
export const SCHULDENBREMSE_SUSPENSION_DURATION = 365;

/** Sim days a coalition must wait after a successful Aussetzung before re-filing. */
export const FISCAL_EMERGENCY_COOLDOWN = 365;

/** Min consecutive days `provisionalBudget === true` before agent gate opens (Q5). */
export const FISCAL_EMERGENCY_PROVISIONAL_BUDGET_DAYS = 30;
```

### Pure helpers (`simulation/budget.ts`)

```ts
/**
 * S12: one-shot vote tally. No "revision" concept (unlike tallyBudgetVote).
 * Coalition typically yes; opposition mixed by sentiment + crisis severity.
 * Pure — accepts seeded RNG for tests.
 */
export function tallySchuldenbremseVote(
  parties: Party[],
  coalitionIds: string[],
  sentiment: number,
  crisisSeverity: "low" | "medium" | "high" | null,
  rng: () => number = Math.random,
): { yesVotes: number; noVotes: number; passed: boolean } {
  const baselineCoalitionYes = 0.95;  // coalition discipline
  const oppositionYesBase = 0.15;     // most opposition opposes by default
  // Sentiment + severity raise opposition yes share
  const sentimentAdj = (sentiment - 45) / 100;       // -0.40..+0.30
  const severityAdj =
    crisisSeverity === "high" ? 0.30 :
    crisisSeverity === "medium" ? 0.15 :
    crisisSeverity === "low" ? 0.05 : 0;
  const oppositionYesShare = Math.min(0.85, oppositionYesBase + sentimentAdj + severityAdj);

  let yesVotes = 0;
  let noVotes = 0;
  for (const p of parties) {
    if (!hasFraktion(parties, p.id)) continue;
    const yesProb = coalitionIds.includes(p.id) ? baselineCoalitionYes : oppositionYesShare;
    const partyYes = rng() < yesProb;
    if (partyYes) yesVotes += p.seatCount;
    else noVotes += p.seatCount;
  }
  return { yesVotes, noVotes, passed: yesVotes >= MAJORITY_SEATS };
}

/**
 * S3: applies the suspension flag + sets expiry on simulation_meta.
 * Idempotent — re-filing while already suspended extends the expiry day
 * (annual re-declaration matches real-world Bundestag behavior).
 */
export function applySchuldenbremseAussetzung(currentDay: number): void {
  getSqlite().transaction(() => {
    setNationalState({ schuldenbremseSuspended: true });
    setMetaFlag("schuldenbremseSuspendedUntilDay",
      currentDay + SCHULDENBREMSE_SUSPENSION_DURATION);
  })();
}

/**
 * Q9: daily check. Auto-clears the suspension when the expiry day arrives.
 * Called from loop.ts step 5.5 alongside the inquiry tick.
 */
export function checkSchuldenbremseExpiry(currentDay: number): SimulationEvent | null {
  const meta = readMeta();
  if (meta.schuldenbremseSuspendedUntilDay == null) return null;
  if (currentDay < meta.schuldenbremseSuspendedUntilDay) return null;
  getSqlite().transaction(() => {
    setNationalState({ schuldenbremseSuspended: false });
    setMetaFlag("schuldenbremseSuspendedUntilDay", null);
  })();
  // No event for expiry — silent. (Could add a "schuldenbremse_expired" event
  // in a follow-up cycle if narrative analysis shows the auto-restore moment
  // matters. Spec keeps the event-type list to 12.)
  return null;
}

/**
 * Heuristic for AgentContext.fiscalEmergencyJustified.
 * Coalition leader sees this when:
 *   - active high-severity crisis exists, OR
 *   - provisionalBudget has been true for ≥30 days
 * Returns null if neither condition holds (gate closed).
 */
export function findFiscalEmergencyOpportunity(
  crises: Crisis[],
  state: NationalState,
  meta: SimulationMeta,
  currentDay: number,
): { activeCrisisId?: string; provisionalBudgetDays: number } | null {
  const provisionalDays = state.provisionalBudget && meta.provisionalBudgetSinceDay != null
    ? currentDay - meta.provisionalBudgetSinceDay
    : 0;
  const highSeverityCrisis = crises.find(c => c.severity === "high" && c.active);
  if (highSeverityCrisis) {
    return { activeCrisisId: highSeverityCrisis.id, provisionalBudgetDays: provisionalDays };
  }
  if (provisionalDays >= FISCAL_EMERGENCY_PROVISIONAL_BUDGET_DAYS) {
    return { provisionalBudgetDays: provisionalDays };
  }
  return null;
}
```

(`provisionalBudgetSinceDay` is referenced above — it does NOT yet exist on `simulation_meta`. Spec adds it as a 4th column under the same `cycle4Migrated` flag. Documented in the migration block below.)

### Loop integration (`simulation/loop.ts`)

When `propose_fiscal_emergency` action fires (in step 5 agent action parsing):

```ts
// Inside action processing loop in step 5
case "propose_fiscal_emergency": {
  const proposalEvent: SimulationEvent = {
    dayNumber: currentDay,
    type: "schuldenbremse_aussetzung_proposed",
    actor: party.id,
    title: `Schuldenbremse-Aussetzung beantragt`,
    description: `${party.name} beantragt Aussetzung der Schuldenbremse nach Art. 115 GG.`,
    data: { activeCrisisId: action.activeCrisisId, justification: action.justification },
  };
  events.push(proposalEvent);
  // Vote happens same day
  const vote = tallySchuldenbremseVote(parties, government.coalitionPartyIds, sentiment, crisisSeverity);
  if (vote.passed) {
    applySchuldenbremseAussetzung(currentDay);
    events.push({
      dayNumber: currentDay,
      type: "schuldenbremse_aussetzung_passed",
      actor: party.id,
      title: `Schuldenbremse für 365 Tage ausgesetzt`,
      description: `Bundestag mit ${vote.yesVotes}:${vote.noVotes} für Aussetzung der Schuldenbremse.`,
      data: { yesVotes: vote.yesVotes, noVotes: vote.noVotes, until: currentDay + SCHULDENBREMSE_SUSPENSION_DURATION },
    });
    // S19: queue Nachtragshaushalt via injection (Piece 3 consumes this)
    queueInjection({
      type: "nachtragshaushalt",
      dayNumber: currentDay,
      data: { activeCrisisId: action.activeCrisisId },
    });
  } else {
    events.push({
      dayNumber: currentDay,
      type: "schuldenbremse_aussetzung_rejected",
      actor: party.id,
      title: `Schuldenbremse-Aussetzung abgelehnt`,
      description: `Bundestag lehnt Aussetzungsantrag mit ${vote.noVotes}:${vote.yesVotes} ab.`,
      data: { yesVotes: vote.yesVotes, noVotes: vote.noVotes },
    });
  }
  break;
}
```

Daily tick at step 5.5 (alongside inquiry tick):

```ts
checkSchuldenbremseExpiry(currentDay);  // silent flag-clear at expiry
context.fiscalEmergencyJustified = findFiscalEmergencyOpportunity(
  activeCrises, state, meta, currentDay,
);
```

### Agent action `propose_fiscal_emergency`

```ts
case "propose_fiscal_emergency": {
  // Coalition leader only
  if (party.id !== government?.coalitionPartyIds[0]) {
    return fixable("Only coalition leader can propose fiscal emergency");
  }
  // Cooldown — can't re-file within 365 days of a previous successful Aussetzung
  const meta = readMeta();
  const lastSuspendUntil = meta.schuldenbremseSuspendedUntilDay;
  if (lastSuspendUntil != null
      && currentDay < lastSuspendUntil + FISCAL_EMERGENCY_COOLDOWN - SCHULDENBREMSE_SUSPENSION_DURATION) {
    return fixable("Fiscal emergency cooldown active");
  }
  // Justification gate (matches AgentContext flag — agents cannot file in a normal day)
  const opportunity = findFiscalEmergencyOpportunity(activeCrises, state, meta, currentDay);
  if (opportunity == null) {
    return fixable("No fiscal emergency justification (no high-severity crisis AND provisionalBudget < 30 days)");
  }
  return ok();
}
```

### Tests (`budget.test.ts` — +8 cases)

1. `tallySchuldenbremseVote` — 50_000-trial LCG convergence: coalition yes ≈ 95%, opposition yes scales with sentiment + severity.
2. `tallySchuldenbremseVote` — pass at majority threshold, fail just below.
3. `tallySchuldenbremseVote` — high-severity crisis raises opposition yes share.
4. `applySchuldenbremseAussetzung` — sets flag + expiry; re-filing while active extends expiry (idempotent).
5. `checkSchuldenbremseExpiry` — clears flag exactly on expiry day.
6. `checkSchuldenbremseExpiry` — no-op before expiry.
7. `findFiscalEmergencyOpportunity` — returns null when neither gate holds.
8. `findFiscalEmergencyOpportunity` — returns `{provisionalBudgetDays}` after 30-day streak; returns `{activeCrisisId, ...}` when a high-severity crisis is active.

`action-parser.test.ts` adds 2 cases: cooldown rejection, opportunity-gate rejection.

## Design — Piece 3: Nachtragshaushalt (supplementary budget)

Reuses existing `tallyBudgetVote()` + `applyBudgetEconomicEffect()` machinery. Enters via the `pending_injections` queue path (S19) — never via `isBudgetDay()` regular cycle (R4).

### File layout

- **New helper in existing module**: `simulation/budget.ts` gains `generateNachtragsAllocations()`, `processNachtragsInjection()` (~80 LOC added)
- **New constants**: `config/budget.ts`
- **New event types** (3): `types/meta.ts`
- **Tier classification**: `simulation/timing.ts` (all 3 → important per S15)
- **Loop integration**: `simulation/loop.ts` injection-queue consumer
- **No new agent action** — Nachtragshaushalt is auto-generated when Schuldenbremse passes (Q5b).
- **Tests**: `budget.test.ts` (+8 cases)

### Constants (`config/budget.ts`)

```ts
// --- Cycle 4 PR 3 — Nachtragshaushalt ---

/** Min Nachtragshaushalt total (B EUR), uniform draw per S4. */
export const NACHTRAGSHAUSHALT_TOTAL_MIN = 50;

/** Max Nachtragshaushalt total (B EUR). */
export const NACHTRAGSHAUSHALT_TOTAL_MAX = 150;

/** S4: ministry-allocation boost share for the active-crisis category. */
export const NACHTRAGSHAUSHALT_CRISIS_BOOST = 0.30;
```

### Pure helper (`simulation/budget.ts`)

```ts
/**
 * S13/S4: generate ministry-keyed allocations for a Nachtragshaushalt.
 * Crisis-weighted: the ministry mapped to the active crisis category gets
 * a +30% boost over its base coalition share; remaining ministries scale down
 * proportionally to keep the total at `total`.
 *
 * R4: this is the ONLY entry point for Nachtragshaushalt allocation.
 *     Regular budget cycle uses generateBudgetAllocations(); never call this from
 *     isBudgetDay() flow.
 */
export function generateNachtragsAllocations(
  coalition: Party[],
  crisisCategory: CrisisCategory | null,
  total: number,
): MinistryAllocation[] {
  // Start from the same coalition-weighted base as the regular budget
  const base = generateBudgetAllocations(coalition, total);

  if (!crisisCategory) return base;
  const boostedMinistry = CRISIS_CATEGORY_TO_MINISTRY[crisisCategory];
  if (!boostedMinistry) return base;

  // Apply boost: target ministry +30%; everyone else scaled down proportionally
  const boostedAmount = base.find(a => a.ministry === boostedMinistry)?.amount ?? 0;
  const boostDelta = boostedAmount * NACHTRAGSHAUSHALT_CRISIS_BOOST;
  const otherTotal = total - boostedAmount - boostDelta;
  const otherSum = base
    .filter(a => a.ministry !== boostedMinistry)
    .reduce((s, a) => s + a.amount, 0);
  return base.map(a =>
    a.ministry === boostedMinistry
      ? { ...a, amount: a.amount + boostDelta }
      : { ...a, amount: (a.amount / otherSum) * otherTotal }
  );
}

/**
 * Consumes a `pending_injections` row of type "nachtragshaushalt".
 * Generates allocations, runs vote tally, applies economic effect on pass.
 * Reuses tallyBudgetVote() + applyBudgetEconomicEffect() per Q5b/C.
 */
export function processNachtragsInjection(
  injection: PendingInjection,
  parties: Party[],
  government: Government,
  state: NationalState,
  currentDay: number,
  rng: () => number = Math.random,
): SimulationEvent[] {
  const events: SimulationEvent[] = [];
  const total = NACHTRAGSHAUSHALT_TOTAL_MIN
    + Math.floor(rng() * (NACHTRAGSHAUSHALT_TOTAL_MAX - NACHTRAGSHAUSHALT_TOTAL_MIN + 1));
  const activeCrisis = injection.data?.activeCrisisId
    ? findCrisis(injection.data.activeCrisisId)
    : null;
  const allocations = generateNachtragsAllocations(
    parties.filter(p => government.coalitionPartyIds.includes(p.id)),
    activeCrisis?.category ?? null,
    total,
  );
  events.push({
    dayNumber: currentDay,
    type: "nachtragshaushalt_proposed",
    actor: "government",
    title: `Nachtragshaushalt: ${total}B EUR`,
    description: `Coalition legt Nachtragshaushalt mit Krisenfokus vor.`,
    data: { total, allocations, activeCrisisId: activeCrisis?.id },
  });

  // Reuse existing tallyBudgetVote — no "revision" concept here, so isRevision=false
  const vote = tallyBudgetVote(parties, government.coalitionPartyIds, state.sentiment, false, rng);
  if (vote.passed) {
    applyBudgetEconomicEffect(state, allocations);
    events.push({
      dayNumber: currentDay,
      type: "nachtragshaushalt_passed",
      actor: "government",
      title: `Nachtragshaushalt verabschiedet`,
      description: `Bundestag mit ${vote.yesVotes}:${vote.noVotes} für Nachtragshaushalt.`,
      data: { total, yesVotes: vote.yesVotes, noVotes: vote.noVotes },
    });
    // R4 invariant: the Nachtragshaushalt completes on the same day the injection drains.
    // Schuldenbremse-Aussetzung expiry mid-Nachtragshaushalt is impossible by construction.
  } else {
    events.push({
      dayNumber: currentDay,
      type: "nachtragshaushalt_rejected",
      actor: "government",
      title: `Nachtragshaushalt abgelehnt`,
      description: `Bundestag lehnt Nachtragshaushalt mit ${vote.noVotes}:${vote.yesVotes} ab.`,
      data: { total, yesVotes: vote.yesVotes, noVotes: vote.noVotes },
    });
  }
  return events;
}
```

### Loop integration (`simulation/loop.ts`)

The existing injection-consumer in step 3 (process injections) gains a new branch:

```ts
case "nachtragshaushalt": {
  if (!government) {
    console.warn(`[loop] nachtragshaushalt injection drained with no government — skipping`);
    break;
  }
  const newEvents = processNachtragsInjection(injection, parties, government, state, currentDay);
  events.push(...newEvents);
  break;
}
```

### GDP-drag suppression while suspended

Per Cycle 4 brainstorm: while `state.schuldenbremseSuspended === true`, the existing `provisionalBudget` GDP drag (`-0.01/day`) is suppressed. Edit point in `simulation/economy.ts` `applyEconomicDrift()`:

```ts
// Existing:
if (state.provisionalBudget) gdp -= 0.01;
// New:
if (state.provisionalBudget && !state.schuldenbremseSuspended) gdp -= 0.01;
```

One-line guard. R4-related — debt brake suspended ⇒ no fiscal pressure penalty.

### Tests (`budget.test.ts` — +8 cases)

1. `generateNachtragsAllocations` — sum of allocations equals `total` (within rounding).
2. `generateNachtragsAllocations` — boosted ministry receives +30% of its base.
3. `generateNachtragsAllocations` — null crisis category → returns base allocation unchanged.
4. `generateNachtragsAllocations` — defense crisis → `verteidigung` ministry boosted.
5. `processNachtragsInjection` — passes vote → emits `proposed` + `passed` events; runs economic effect.
6. `processNachtragsInjection` — fails vote → emits `proposed` + `rejected` events; no economic effect.
7. Integration: Schuldenbremse pass → injection queued → next-day drain → Nachtragshaushalt fires.
8. `applyEconomicDrift` — GDP drag suppressed when `schuldenbremseSuspended === true` AND `provisionalBudget === true`.

## Design — Piece 4: Debate sub-formats

Three sub-formats. Two purely deterministic flavor (Kurzintervention + Zwischenfrage); one data-hooked to existing discipline-break detection (Erklärung zur Abstimmung).

### File layout

- **New module**: `packages/engine/src/simulation/debate-formats.ts` (~120 LOC) — keeps `bill-pipeline.ts` from getting more crowded
- **New constants**: `config/parliament.ts`
- **New event types** (3): `types/meta.ts`
- **Tier classification**: `simulation/timing.ts` (all 3 → routine per S15)
- **Bill-pipeline integration**: `simulation/bill-pipeline.ts` calls helpers at `bill_first_reading` / `bill_second_reading` event-emit branches
- **Discipline integration**: `simulation/bill-pipeline.ts` (or wherever `bill_third_reading` fires) iterates MdB votes for Erklärung zur Abstimmung
- **Tests**: `debate-formats.test.ts` (+10 cases)

### Constants (`config/parliament.ts`)

```ts
// --- Cycle 4 PR 4 — Debate sub-formats ---

/** S6: probability per bill-reading event of one Kurzintervention firing. */
export const KURZINTERVENTION_PROBABILITY = 0.30;

/** S6: probability per bill-reading event of one Zwischenfrage firing. */
export const ZWISCHENFRAGE_PROBABILITY = 0.30;
```

### Pure helpers (`simulation/debate-formats.ts`)

```ts
/**
 * S6: rolls a Kurzintervention event for a bill-reading. Returns null on miss.
 * Pure — accepts seeded RNG for tests.
 */
export function rollKurzintervention(
  bill: Bill,
  parties: Party[],
  reading: "first" | "second",
  rng: () => number = Math.random,
): SimulationEvent | null {
  if (rng() >= KURZINTERVENTION_PROBABILITY) return null;
  const speakerParty = parties.find(p => p.id === bill.proposingPartyId);
  const opposition = parties.filter(p =>
    p.id !== bill.proposingPartyId && hasFraktion(parties, p.id)
  );
  if (!speakerParty || opposition.length === 0) return null;
  const interjector = opposition[Math.floor(rng() * opposition.length)];
  return {
    dayNumber: bill.lastEventDay ?? 0,  // caller fills in
    type: "kurzintervention",
    actor: interjector.id,
    title: `Kurzintervention: ${interjector.name} vs. ${speakerParty.name}`,
    description: `Während der ${readingLabel(reading)} zu "${bill.title}" unterbricht ${interjector.name} die Rede der ${speakerParty.name}.`,
    data: { billId: bill.id, reading, speakerPartyId: speakerParty.id, interjectorPartyId: interjector.id },
  };
}

/**
 * S6: rolls a Zwischenfrage event. Independent of Kurzintervention roll.
 * Speaker = bill-proposing party; questioner = random non-proposer Fraktion.
 */
export function rollZwischenfrage(
  bill: Bill,
  parties: Party[],
  reading: "first" | "second",
  rng: () => number = Math.random,
): SimulationEvent | null {
  if (rng() >= ZWISCHENFRAGE_PROBABILITY) return null;
  // ...analogous; pickRandomNonProposer
}

/**
 * S5: post-3rd-reading hook. For each MdB seat where:
 *   disciplineLevel >= 1 AND vote !== party_line
 * emit one erklaerung_zur_abstimmung event with templated description (S22).
 *
 * Pure — accepts an iterable of MdB votes.
 */
export function detectDisciplineBreaks(
  bill: Bill,
  mdbVotes: MdbVote[],
  parties: Party[],
  partyLineByPartyId: Record<string, "yes" | "no" | "abstain">,
  currentDay: number,
): SimulationEvent[] {
  const events: SimulationEvent[] = [];
  for (const v of mdbVotes) {
    if ((v.disciplineLevel ?? 0) < 1) continue;
    const partyLine = partyLineByPartyId[v.partyId];
    if (!partyLine || v.vote === partyLine) continue;
    const direction =
      v.vote === "yes" ? "für" :
      v.vote === "no" ? "gegen" :
      "Enthaltung bei";
    events.push({
      dayNumber: currentDay,
      type: "erklaerung_zur_abstimmung",
      actor: v.partyId,
      title: `Erklärung zur Abstimmung: ${v.mdbName}`,
      description: `${v.mdbName} (${v.partyId}, MdB) erklärt Abstimmungsverhalten: ${direction} die Fraktion gestimmt zu "${bill.title}" (Disziplin-Stufe ${v.disciplineLevel}).`,
      data: { billId: bill.id, mdbId: v.mdbId, partyId: v.partyId, brokeFromParty: partyLine, votedFor: v.vote },
    });
  }
  return events;
}
```

### Bill-pipeline integration (`simulation/bill-pipeline.ts`)

Where `bill_first_reading` and `bill_second_reading` events are currently emitted, emit two extra events conditionally:

```ts
// At the bill_first_reading emit site:
addEvent(events, firstReadingEvent);
const ki = rollKurzintervention(bill, parties, "first");
if (ki) { ki.dayNumber = day; addEvent(events, ki); }
const zf = rollZwischenfrage(bill, parties, "first");
if (zf) { zf.dayNumber = day; addEvent(events, zf); }

// Same shape at bill_second_reading emit site (reading: "second").

// At the bill_third_reading vote-tally emit site (post-vote block):
const breaks = detectDisciplineBreaks(bill, mdbVotes, parties, partyLineByPartyId, day);
events.push(...breaks);
```

### Tests (`debate-formats.test.ts` — +10 cases)

1. `rollKurzintervention` — 50_000-trial LCG convergence at exactly 30% fire rate (±0.5pp tolerance).
2. `rollKurzintervention` — boundary points: rng=0.299 fires; rng=0.300 misses (deterministic).
3. `rollKurzintervention` — fewer than 1 opposition Fraktion → returns null.
4. `rollKurzintervention` — interjector is always opposition (50_000-trial property test).
5. `rollZwischenfrage` — independent of Kurzintervention (joint roll matrix).
6. `rollZwischenfrage` — questioner is never the bill-proposing party.
7. `detectDisciplineBreaks` — emits one event per discipline-break vote.
8. `detectDisciplineBreaks` — emits zero events when no MdB has `disciplineLevel >= 1`.
9. `detectDisciplineBreaks` — emits zero events when all MdBs vote with party line.
10. `detectDisciplineBreaks` — templated description includes MdB name, bill title, direction, level.

## Interaction risks

| # | Risk | Mitigation |
|---|------|------------|
| R1 | Inquiry → target party `-0.05/day` for up to 540 days = up to `-27` cumulative approval. With other approval drains (failed bills, Vertrauensfrage, presidential veto), party can sink into negative territory. | Existing `applyApprovalDelta()` in `opinion.ts` handles clamping to `[0, 100]` — applies at write time. Document the interaction inline at the daily-drag site. Test: fire 540 days of drag against a party at 5% approval and assert it never goes negative. |
| R2 | Schuldenbremse simple-majority deviates from real qualified-majority. AI agents will eventually realize the threshold is "easier than the law says" and game it. | Documented as Cycle 5+ refinement (Open items). Spec uses simple majority for pragmatic simplification — flagged in the agent prompt section so AI parties don't claim historical accuracy. |
| R3 | Inquiry conclusion `wrongdoing_found` against a party that has since left coalition / merged / dissolved. | `concludeInquiry()` looks up `targetPartyId` via `findParty()`; if null, skip the impact (logged at info level) and continue. Tested in case 14. |
| R4 | Nachtragshaushalt fires *outside* the regular 365-day budget cycle. If `isBudgetDay()` accidentally triggers Nachtragshaushalt processing, two budgets fire on the same day and economic effects double-apply. | Spec S19 locks: Nachtragshaushalt enters EXCLUSIVELY via `pending_injections` (type `nachtragshaushalt`). `isBudgetDay()` and `processNachtragsInjection()` are independent code paths. Inline R4 comment at the injection-consumer branch. Test: assert injection-only entry. |
| R5 | "Politically embarrassing for govt" heuristic in `findInquiryOpportunity()` is heuristic-based. False positives → opposition spam-files inquiries; false negatives → opposition under-files. | Heuristic: `severity === "high"` AND crisis category maps to a coalition-held ministry via `CRISIS_CATEGORY_TO_MINISTRY` (S18). Documented; tunable. The S9 cap + S8 rate-limit + agent-action budget naturally throttle false positives. |
| R6 | Debate sub-format events fire at 30% × 30% × N readings/day = potentially 0–6 sub-format events per active sitting day. With 1–2 readings/day average, expected ~0.6 sub-format events/day. | Manageable; doesn't dominate the feed. Routine-tier classification (S15) ensures frontend renders compactly, not as full event cards. |
| R7 | Erklärung zur Abstimmung depends on MdB seat data. In ultra-fast / fast presets with 0% human-seat ratio, all seats are AI-controlled. Discipline data still exists for AI seats (per `mdb-actions.ts`). | No mitigation needed — `disciplineLevel` is set on MdB seat rows regardless of human/AI control. Test case 7 covers AI-only seats. |
| R8 | Active-inquiry cap = 2. If both slots full and a viable third opportunity arises, agents will keep trying — wasting agent-action budget. | Agent prompt explicitly states cap. Plus: opposition agent's `inquiryOpportunity` flag is null when cap is reached (computed in `findInquiryOpportunity` — extend to check `countActiveInquiries() < INQUIRY_MAX_ACTIVE`). Documented in code. |
| R9 | AI cost variance with 0–2 active inquiries: $0/sim-day (0 active) to $0.001/sim-day (2 active during a hearing month). Expected average $0.0005/sim-day. | Verify post-implementation with `logAICall` averages. If the `inquiry_hearing` cost line averages above $0.002/sim-day in a 4-year sim, drop the prompt to `MODELS.daily` (already there) or shorten the summary. |
| R10 | Twelve new event types added to `SimulationEventType` union. Cycle 6 housekeeping must verify none accidentally emit raw strings (escaping type safety). | All twelve are explicitly added to the union AND classified in `simulation/timing.ts` (S15). Pre-flight grep for `as SimulationEventType` casts in PR-review checklist. |
| R11 | Cycle 3 review praised R-item back-references. Cycle 4 must continue this — every non-obvious decision in implementation cites its R-number. | Spec lists R-numbers used in implementation; PR review checklist asserts R-comments present at the locations called out in this spec (ModuleR4 → injection-consumer; R3 → concludeInquiry; R5 → findInquiryOpportunity; R8 → action-parser cap branch; etc.). |
| R12 | The `committees.ts` module exists for *standing* committees and shares infrastructure with what could naively be reused for Untersuchungsausschuss. Reuse rejected per S11. | Module-level docstring in both `committees.ts` and `inquiry-committees.ts` cross-references S11 reasoning. New file naming chosen to be unmistakably distinct. |
| **R13** | Schuldenbremse-Aussetzung passes on the same day a regular budget cycle is running. Two votes on overlapping concerns within one daily tick. | Acceptable. The regular budget cycle runs in step 9 of `runDay()`; Schuldenbremse-Aussetzung action processes in step 5. They don't share state at the vote level. The Nachtragshaushalt injection drains on the *next* tick (queued today, drained tomorrow), preventing same-day double-budget compounding. |
| **R14** | `pending_injections` consumer order matters. If a Nachtragshaushalt injection drains BEFORE other injections (e.g., crisis injection from same day), the Nachtragshaushalt may apply economic effect against the wrong baseline state. | The existing injection-consumer drains in insertion order (FIFO). Schuldenbremse passes in step 5; injection inserted then; same-day crisis injections were inserted in step 3 before. So the Nachtragshaushalt drains naturally last on the next tick (after step-3 crisis injections). Document inline. |
| **R15** | `provisionalBudgetSinceDay` column is new — `findFiscalEmergencyOpportunity()` reads it. If existing in-flight `provisionalBudget === true` rows lack this column, the helper returns 0 days (gate stays closed). | Migration backfill: when `cycle4Migrated` runs, set `provisionalBudgetSinceDay = currentDay` if `provisionalBudget === true` AND the column is null. Single SQL UPDATE wrapped in the migration transaction. |
| **R16** | `AgentContext` shape change breaks any consumer that exhaustively destructures it. Both new optional fields are non-breaking by themselves; combined with TypeScript's exact-optional mode (project default: false), absent fields read as undefined. | Both fields are `?:` optional. Default behavior is undefined. Verified by `npm run typecheck` after the change. |
| **R17** | Erklärung zur Abstimmung depends on `MdbVote.disciplineLevel` field. Verify this field exists on the MdB-vote schema before implementation; if not, the discipline data lives on MdB rosters (party_id, discipline_level), not vote rows — adjust helper to join them. | Pre-flight check at PR 4 implementation: read `db/schema-user.ts` for `mdbVotes` shape. Helper signature in spec assumes `MdbVote.disciplineLevel` exists; adjust if needed (no functional change to spec). |
| **R18** | Zero MdB seats human-controlled (ultra-fast preset). Erklärung zur Abstimmung still emits, but `mdb_name` may be a generic AI-seat label like `MdB Seat #42`. | Acceptable — events fire on AI-seats too per R7. The templated description is graceful. Frontend renders the AI-seat label as-is. |

## Migration strategy

All Cycle 4 schema changes ship in a **single migration block** appended to `seed.ts::migrateDatabase()`, guarded by a single `cycle4Migrated` boolean meta flag (S7). The block is idempotent and wrapped in `sqlite.transaction()` per `tool-safety.md`.

### Migration block contents

```ts
// === Cycle 4 — Untersuchungsausschuss + Schuldenbremse + Nachtragshaushalt + debate sub-formats ===
if (!meta.cycle4Migrated) {
  getSqlite().transaction(() => {
    // 1. New table: inquiry_committees
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS inquiry_committees (
        id TEXT PRIMARY KEY,
        subject TEXT NOT NULL,
        filing_party_id TEXT NOT NULL REFERENCES parties(id),
        target_party_id TEXT REFERENCES parties(id),
        target_ministry TEXT,
        filed_on_day INTEGER NOT NULL,
        scheduled_end_day INTEGER NOT NULL,
        concluded_on_day INTEGER,
        status TEXT NOT NULL DEFAULT 'active',
        outcome TEXT,
        final_report TEXT,
        hearing_count INTEGER NOT NULL DEFAULT 0,
        last_hearing_day INTEGER
      );
    `);
    // 2. New columns on national_state
    addColumnIfMissing(sqlite, "national_state", "schuldenbremse_suspended INTEGER NOT NULL DEFAULT 0");
    // 3. New columns on simulation_meta
    addColumnIfMissing(sqlite, "simulation_meta", "schuldenbremse_suspended_until_day INTEGER");
    addColumnIfMissing(sqlite, "simulation_meta", "last_inquiry_filed_day INTEGER");
    addColumnIfMissing(sqlite, "simulation_meta", "provisional_budget_since_day INTEGER");
    addColumnIfMissing(sqlite, "simulation_meta", "cycle4_migrated INTEGER NOT NULL DEFAULT 0");
    // 4. R15: backfill provisional_budget_since_day for already-true rows
    sqlite.exec(`
      UPDATE simulation_meta
      SET provisional_budget_since_day = (SELECT current_day FROM national_state LIMIT 1)
      WHERE provisional_budget_since_day IS NULL
        AND EXISTS (SELECT 1 FROM national_state WHERE provisional_budget = 1)
    `);
    // 5. Set the migration flag
    sqlite.exec(`UPDATE simulation_meta SET cycle4_migrated = 1`);
  })();
}
```

### Ordering inside `migrateDatabase()`

No order dependency between Cycle 4 and prior cycles — Cycle 4 is structurally additive (new table + new columns), no row backfill of pre-existing tables (R15 backfill is on the new column, idempotent).

```
1. (existing) Cycle 1 stage-entry-day backfill
2. (existing) Cycle 1 stage-min/max bill backfill
3. (existing) Cycle 3 piece 4 — 735→630 seat reapportionment
4. (existing) Cycle 2a synthetic kanzlerwahl-row backfill
5. (existing) Cycle 2a bundesrat_mode backfill
6. (existing) Cycle 2b counter-column inits
7. (existing) Cycle 3 piece 6 — last_negotiation_round_day column add
8. NEW: Cycle 4 — inquiry_committees table + 4 column adds + R15 backfill + cycle4Migrated flag
```

### Idempotency

- Table creation uses `CREATE TABLE IF NOT EXISTS`.
- Column adds use `addColumnIfMissing()` (existing helper that catches `duplicate column` errors).
- Row backfill (R15) is gated on `provisional_budget_since_day IS NULL`.
- The flag write is the final step; running migrate twice is safe.

### Pre-flight invariant assert (per database.md / project pattern)

Before the transaction:

```ts
// Pre-flight: verify required tables exist (parties, national_state, simulation_meta)
assertTableExists(sqlite, "parties");
assertTableExists(sqlite, "national_state");
assertTableExists(sqlite, "simulation_meta");
```

These have all existed since Cycle 0; assertion is defensive.

## Implementation plan — 4 PRs (commits, no PRs until user says otherwise)

PR-style commits on `claude/sim-fidelity-cycle4` branch, mirroring Cycle 3's cadence. Each commit fully tested + typechecked + built. No GitHub PR until user explicitly says.

### PR 1 — Untersuchungsausschuss (heaviest)

**Commit message**: `feat(sim-fidelity): Untersuchungsausschuss lifecycle + AI hearing summaries (Cycle 4 PR 1)`

**Touch list**:

- `packages/types/src/meta.ts` — add `inquiry_filed`, `inquiry_hearing_held`, `inquiry_concluded` to `SimulationEventType` union
- `packages/types/src/agent.ts` (or wherever `AgentContext` lives) — add `inquiryOpportunity?: { triggerCrisisId: string; targetPartyId: string; severity: string }`
- `packages/engine/src/db/schema-sim.ts` — new `inquiryCommittees` table
- `packages/engine/src/db/ddl.ts` — `CREATE TABLE inquiry_committees` in `SIM_TABLE_DDL`; `last_inquiry_filed_day` column add in `SIM_COLUMN_MIGRATIONS`
- `packages/engine/src/seed.ts` — Cycle 4 migration block (full block — Schuldenbremse columns ship in PR 2 as no-op-here / referenced-only since the same `cycle4Migrated` flag guards everything)
  - **Implementation note**: PR 1 includes the FULL migration block (all 4 column adds + the table + R15 backfill + flag write) so the flag-guard works correctly across PR sequence. PR 2/3 do not re-touch the migration block.
- `packages/engine/src/config/parliament.ts` — 13 inquiry constants per Piece 1 + `CRISIS_CATEGORY_TO_MINISTRY` map (S18 — used by PR 3 too)
- `packages/engine/src/simulation/inquiry-committees.ts` — NEW module (pure helpers + lifecycle + AI batch builders/processors)
- `packages/engine/src/simulation/timing.ts` — tier classifications: `inquiry_filed` → IMPORTANT_EVENTS; `inquiry_concluded` → IMPORTANT_EVENTS; `inquiry_hearing_held` → standard (default; no entry needed but documented inline)
- `packages/engine/src/simulation/loop.ts` — step 5 AgentContext flag population; step 5.5 inquiry tick; new batch group D dispatch
- `packages/engine/src/agent/action-parser.ts` — new `file_inquiry_committee` validation block
- `packages/engine/src/agent/prompt.ts` — opposition agent prompt section explaining `inquiryOpportunity` flag
- `packages/engine/src/__tests__/inquiry-committees.test.ts` — NEW (+15 cases per Piece 1)
- `packages/engine/src/agent/__tests__/action-parser.test.ts` — +3 cases for new action validation

**Tests**: +18 new test cases; `npm run typecheck && npm test && npm run build` green.

### PR 2 — Schuldenbremse-Aussetzung

**Commit message**: `feat(sim-fidelity): Art. 115 GG fiscal emergency vote (Cycle 4 PR 2)`

**Touch list**:

- `packages/types/src/meta.ts` — add `schuldenbremse_aussetzung_proposed`, `_passed`, `_rejected` to `SimulationEventType` union
- `packages/types/src/agent.ts` — add `fiscalEmergencyJustified?: { activeCrisisId?: string; provisionalBudgetDays: number }` to `AgentContext`
- `packages/engine/src/db/schema-sim.ts` — `schuldenbremseSuspended` boolean on `nationalState`; `schuldenbremseSuspendedUntilDay`, `provisionalBudgetSinceDay` integer on `simulationMeta`
- `packages/engine/src/db/ddl.ts` — column adds in `SIM_COLUMN_MIGRATIONS` (already added in PR 1's migration block; this PR adds them to the schema-side only)
- `packages/engine/src/config/budget.ts` — `SCHULDENBREMSE_SUSPENSION_DURATION = 365`, `FISCAL_EMERGENCY_COOLDOWN = 365`, `FISCAL_EMERGENCY_PROVISIONAL_BUDGET_DAYS = 30`
- `packages/engine/src/simulation/budget.ts` — `tallySchuldenbremseVote()`, `applySchuldenbremseAussetzung()`, `checkSchuldenbremseExpiry()`, `findFiscalEmergencyOpportunity()` helpers
- `packages/engine/src/simulation/timing.ts` — tier classifications: `schuldenbremse_aussetzung_proposed` → IMPORTANT_EVENTS; `_passed` → CRITICAL_EVENTS (existing tier); `_rejected` → IMPORTANT_EVENTS
- `packages/engine/src/simulation/loop.ts` — step 5 action processing branch; step 5.5 expiry check + AgentContext flag
- `packages/engine/src/simulation/economy.ts` — guard GDP drag with `!state.schuldenbremseSuspended` (Piece 3 GDP-drag suppression — though logically Piece 3, the schema flag belongs to Piece 2 so the guard ships here)
- `packages/engine/src/agent/action-parser.ts` — new `propose_fiscal_emergency` validation block
- `packages/engine/src/agent/prompt.ts` — coalition leader prompt section explaining `fiscalEmergencyJustified` flag
- `packages/engine/src/__tests__/budget.test.ts` — +8 cases per Piece 2
- `packages/engine/src/agent/__tests__/action-parser.test.ts` — +2 cases (cooldown, opportunity-gate)

**Tests**: +10 new test cases; full green.

### PR 3 — Nachtragshaushalt

**Commit message**: `feat(sim-fidelity): Nachtragshaushalt supplementary budget via emergency suspension (Cycle 4 PR 3)`

**Touch list**:

- `packages/types/src/meta.ts` — add `nachtragshaushalt_proposed`, `_passed`, `_rejected` to `SimulationEventType` union
- `packages/engine/src/config/budget.ts` — `NACHTRAGSHAUSHALT_TOTAL_MIN = 50`, `NACHTRAGSHAUSHALT_TOTAL_MAX = 150`, `NACHTRAGSHAUSHALT_CRISIS_BOOST = 0.30`
- `packages/engine/src/simulation/budget.ts` — `generateNachtragsAllocations()`, `processNachtragsInjection()` helpers
- `packages/engine/src/simulation/timing.ts` — tier classifications: all 3 → IMPORTANT_EVENTS
- `packages/engine/src/simulation/loop.ts` — injection-consumer branch for `type: "nachtragshaushalt"` (step 3)
- `packages/engine/src/__tests__/budget.test.ts` — +8 cases per Piece 3 (incl. integration test of Schuldenbremse pass → Nachtragshaushalt fire)

**Tests**: +8 new test cases; full green.

### PR 4 — Debate sub-formats + Cycle 3 spec-file cleanup

**Commit message**: `feat(sim-fidelity): Kurzintervention + Zwischenfrage + Erklärung zur Abstimmung (Cycle 4 PR 4)`

**Touch list**:

- `packages/types/src/meta.ts` — add `kurzintervention`, `zwischenfrage`, `erklaerung_zur_abstimmung` to `SimulationEventType` union
- `packages/engine/src/config/parliament.ts` — `KURZINTERVENTION_PROBABILITY = 0.30`, `ZWISCHENFRAGE_PROBABILITY = 0.30`
- `packages/engine/src/simulation/debate-formats.ts` — NEW module with `rollKurzintervention()`, `rollZwischenfrage()`, `detectDisciplineBreaks()`
- `packages/engine/src/simulation/timing.ts` — tier classifications: all 3 → ROUTINE_EVENTS
- `packages/engine/src/simulation/bill-pipeline.ts` — call `rollKurzintervention` + `rollZwischenfrage` at `bill_first_reading` + `bill_second_reading` emit sites; call `detectDisciplineBreaks` post-3rd-reading vote tally
- `packages/engine/src/__tests__/debate-formats.test.ts` — NEW (+10 cases per Piece 4)
- `packages/engine/src/__tests__/bill-pipeline.test.ts` — +2 cases asserting sub-format events emit alongside readings (smoke test, not coverage)
- **`docs/plans/043-cycle3-brainstorm.md`** — DELETED (S16)
- **`docs/plans/043-cycle3-spec.md`** — DELETED (S16)

**Tests**: +12 new test cases; full green.

### Post-merge cleanup

Cycle 4 brainstorm + spec stay until Cycle 4 ships AND Cycle 5 begins. Cycle 5's final PR deletes `043-cycle4-brainstorm.md` + `043-cycle4-spec.md` per the established cadence. (Cycle 4 PR 4 does NOT self-delete — that's Cycle 5's job per the lag pattern.)

## Success criteria

- `npm run typecheck && npm test && npm run build` green on each of the 4 PR-commits.
- `npm run seed && npm run simulate 1461` completes without error after all 4 commits.
- After a fresh `simulate 1461` (one full term ≈ 4 years):
  - **Inquiry-filed events**: 4–8 (per term); max 2 active simultaneously verified by max-active assertion in a sim-end check.
  - **Inquiry-concluded events**: equal to filed count minus any active at term end.
  - **Inquiry-hearing-held events**: ~6–18 per concluded inquiry.
  - **Schuldenbremse-Aussetzung events**: 0–2 per term (matches real-world ~1/term frequency).
  - **Nachtragshaushalt events**: equal to passed Schuldenbremse-Aussetzung count.
  - **Kurzintervention + Zwischenfrage event count**: ≈ 0.6 × bill-reading-event count (30% × 2 sub-formats × 2 reading stages).
  - **Erklärung zur Abstimmung events**: nonzero — sanity check that discipline-break detection fires (any term with at least one whipped vote should produce ≥1).
- **AI cost**: `logAICall` averages stay within ±$0.001/sim-day vs. pre-Cycle-4 baseline. Specific check: `inquiry_hearing` average prompt-cost ≤ $0.0007/sim-day; `inquiry_final_report` average ≤ $0.0001/sim-day.
- **Wall-clock per term**: similar ±10% to Cycle 3 baseline (no new sequential AI calls — all batched).
- **Migration idempotency**: running `npm run migrate` twice is a no-op on the second run; `cycle4Migrated` flag set; no DDL errors.
- **Schema invariant**: `SELECT COUNT(*) FROM inquiry_committees WHERE target_party_id IS NULL AND target_ministry IS NULL` returns 0 (S17).
- **Cycle 3 spec files** deleted: `ls docs/plans/043-cycle3*.md` returns no files.

## Open items surfaced for later cycles

- **Schuldenbremse qualified-majority threshold** — real Bundestag uses qualified majority for Art. 115 GG suspension; spec uses simple majority for pragmatic simplification. Refine when a "qualified-majority vote" primitive is added (also unblocks Bundesrat Zustimmungsgesetz refinement). **Cycle 5+**.
- **Untersuchungsausschuss seat-level membership** — populating `committee_memberships`-style rows for inquiry committees (158 MdBs each in real Bundestag). Required when the seat-roster front-end becomes relevant. **Cycle 5+**.
- **Enquete-Kommission + Ausschussanhörungen** — both deferred this cycle pending external-expert-witness actor model. Plan a "Cycle 5: expert-witness infrastructure" to unblock both at once.
- **Ordnungsruf** — requires MdB-misbehavior signal. Could hook into discipline-level escalations or profanity-flagged statements. **Cycle 5+ polish**.
- **Inquiry court powers** — minister summons, scandal-severity axis, multiple inquiry types. **Cycle 5+** if narrative analysis shows the current model is too thin.
- **Nachtragshaushalt agent customization** — currently formulaic; coalition agent could amend allocations within bounds. **Cycle 5+ polish**.
- **End-to-end seeded RNG plumbing through `runDay()`** — same open item carried from Cycle 3. Pure helpers accept seeded RNG; production end-to-end seed is deferred.
- **Schuldenbremse expiry event** — currently silent (auto-clears via daily check). If narrative analysis shows the auto-restore moment matters, add a `schuldenbremse_expired` event in a follow-up cycle.
- **AI text on Kurzintervention / Zwischenfrage** — deterministic templates this cycle. If viewer-feedback says they read same-y, escalate to a single shared 1-sentence Haiku call per debate-day (rather than per event). **Cycle 5+ polish**.
- **Frontend rendering** for all 12 new event types — backend ships this cycle; frontend treatment (compact vs full event card) is a follow-up. Routine-tier events need a one-line treatment; important-tier need standard cards; critical-tier (`schuldenbremse_aussetzung_passed`) needs the BreakingBanner treatment.
