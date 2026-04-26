/**
 * Cycle 5 PR 1 — Ausschussanhörungen (committee hearings with expert witnesses).
 *
 * Procedural by design (Q4 = A): no agent surface. When a bill enters the
 * committee stage (`bill_committee` event), the loop rolls a probability
 * gated on the bill's combined-impact magnitude (S6) and, if it fires,
 * synchronously inserts a `scheduled` row + queues an AI batch item to
 * generate the testimonies and a [-1, +1] tone scalar (S3).
 *
 * The tone scalar nudges the committee→2nd-reading amend probability via
 * `applyAnhoerungToneToAmendProb` (S4 / R11): positive tone (endorsement)
 * increases amend probability, biased ±ANHOERUNG_TONE_INFLUENCE.
 *
 * Failure path (S3): AI parse / validation failure → row transitions to
 * `lapsed` with `tone=0`, `testimonies='[]'`. Bill pipeline reads tone=0 as
 * no-nudge gracefully.
 *
 * Pattern note: mirrors Cycle 4 `inquiry-committees.ts` — pure helpers up
 * top, AI batch builder/processor at the bottom, all RNG dependencies are
 * injectable for the 50k-trial LCG convergence tests.
 */

import { eq } from "drizzle-orm";
import type {
  Bill,
  Expert,
  MinistryPortfolio,
  SimulationEvent,
} from "@ki-bundestag/types";
import { getDb, getSqlite, schema } from "../db/index.js";
import type { BatchRequest, BatchResult } from "../agent/batch-client.js";
import { findResult } from "../agent/batch-client.js";
import { logAICall, parseAIJson } from "../agent/ai-json.js";
import {
  ANHOERUNG_BASE_PROBABILITY,
  ANHOERUNG_IMPACT_COEFFICIENT,
  ANHOERUNG_PROBABILITY_CAP,
  ANHOERUNG_TONE_INFLUENCE,
  ANHOERUNG_EXPERTS_PER_HEARING,
  BILL_CATEGORY_TO_MINISTRY,
} from "../config/parliament.js";
import type { BillCategory } from "@ki-bundestag/types";

// ---------------------------------------------------------------------------
// Pure helpers (testable, no DB)
// ---------------------------------------------------------------------------

/**
 * Q4 / S6: probability that a bill entering committee stage gets an Anhörung.
 *
 * Linear in normalised impact magnitude, hard-capped at ANHOERUNG_PROBABILITY_CAP.
 * Typical bills land in [0, 4] range for combined-magnitude (|gdpGrowth| +
 * |publicSentiment|); we normalise to [0, 1] then clamp before the roll.
 *
 * @param impactMagnitude  |gdpGrowth| + |publicSentiment| from the bill
 * @param rng              optional seeded RNG for tests (LCG in convergence tests)
 */
export function shouldHoldAnhoerung(
  impactMagnitude: number,
  rng: () => number = Math.random,
): boolean {
  const normalised = Math.min(Math.max(impactMagnitude, 0) / 4.0, 1.0);
  const p = Math.min(
    ANHOERUNG_PROBABILITY_CAP,
    ANHOERUNG_BASE_PROBABILITY + ANHOERUNG_IMPACT_COEFFICIENT * normalised,
  );
  return rng() < p;
}

/**
 * S5: select ANHOERUNG_EXPERTS_PER_HEARING distinct experts whose
 * `expertiseAreas` overlap `ministryFocus`. Sampled without replacement via
 * Fisher-Yates partial shuffle.
 *
 * Throws if the filtered pool < `count` — prevented at runtime by the S2
 * seed-pool invariant (≥3 experts per ministry, asserted in
 * `experts-seed.test.ts`).
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
  const shuffled = [...matching];
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(rng() * (shuffled.length - i));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}

/**
 * S4 / R11: apply hearing tone scalar to committee→2nd-reading amend probability.
 *
 * Positive tone (expert endorsement) INCREASES amend probability — endorsed
 * bills benefit from refinement; opposed bills get rejected at 3rd reading or
 * pass without amendment. Pure, no RNG. Clamps result to [0, 1].
 *
 * Tone of 0 (no-nudge) is the default for `scheduled` and `lapsed` rows (S3),
 * so callers can read the column unconditionally.
 */
export function applyAnhoerungToneToAmendProb(
  baseAmendProb: number,
  tone: number,
): number {
  return Math.max(0, Math.min(1, baseAmendProb + tone * ANHOERUNG_TONE_INFLUENCE));
}

/** S14: BillCategory → MinistryPortfolio lookup wrapper. */
export function billCategoryToMinistry(category: BillCategory): MinistryPortfolio {
  return BILL_CATEGORY_TO_MINISTRY[category];
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

/** Load the entire seeded experts table (small; ~30 rows). */
export function loadExpertPool(): Expert[] {
  const rows = getSqlite()
    .prepare("SELECT id, name, affiliation, expertise_areas FROM experts")
    .all() as Array<{ id: string; name: string; affiliation: string; expertise_areas: string }>;
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    affiliation: r.affiliation,
    expertiseAreas: JSON.parse(r.expertise_areas) as MinistryPortfolio[],
  }));
}

/**
 * S4: read the tone scalar for a bill's most recent Anhörung row, if any.
 * Returns 0 if no row exists OR if the row is in `scheduled` / `lapsed` state
 * — both are no-nudge by default (S3 graceful degrade).
 */
export function getAnhoerungToneForBill(billId: string): number {
  const row = getSqlite()
    .prepare("SELECT tone, status FROM ausschussanhoerungen WHERE bill_id = ? ORDER BY held_on_day DESC LIMIT 1")
    .get(billId) as { tone: number; status: string } | undefined;
  if (!row) return 0;
  // 'scheduled' and 'lapsed' both default to tone=0 in the schema; reading the
  // column is safe, but make the no-nudge intent explicit here.
  if (row.status !== "held") return 0;
  return row.tone;
}

// ---------------------------------------------------------------------------
// Trigger / lifecycle (called from loop.ts step 5)
// ---------------------------------------------------------------------------

export interface AnhoerungBatchInput {
  rowId: string;
  bill: Bill;
  ministryFocus: MinistryPortfolio;
  experts: Expert[];
}

/**
 * Q4 entry point: roll the trigger for a bill that just entered the committee
 * stage. If it fires, persist a `scheduled` row and return a batch input the
 * caller can submit alongside its other AI batches.
 *
 * No-op (returns null) if the trigger does not fire or no experts can be
 * matched. The S2 seed-pool invariant guarantees `pickExpertsForHearing`
 * does not throw when `experts` table is properly seeded.
 */
export function maybeScheduleAnhoerung(
  bill: Bill,
  currentDay: number,
  expertPool: readonly Expert[],
  rng: () => number = Math.random,
): AnhoerungBatchInput | null {
  // Combined-impact magnitude (S6 normalisation expects gdpGrowth + sentiment).
  const impact = bill.impact ?? {};
  const impactMag = Math.abs(impact.gdpGrowth ?? 0) + Math.abs(impact.publicSentiment ?? 0);
  if (!shouldHoldAnhoerung(impactMag, rng)) return null;

  const ministryFocus = billCategoryToMinistry(bill.category as BillCategory);
  let chosen: Expert[];
  try {
    chosen = pickExpertsForHearing(ministryFocus, expertPool, ANHOERUNG_EXPERTS_PER_HEARING, rng);
  } catch (err) {
    // S2 invariant violation — should never happen with a properly seeded DB.
    // Don't crash the simulation; log + skip the hearing.
    console.warn(`  [Anhörung] expert-pool invariant violated: ${(err as Error).message}`);
    return null;
  }

  const rowId = `anhoerung-${bill.id}-${currentDay}`;
  getSqlite().transaction(() => {
    getDb().insert(schema.ausschussanhoerungen).values({
      id: rowId,
      billId: bill.id,
      ministryFocus,
      expertIds: JSON.stringify(chosen.map(e => e.id)),
      testimonies: "[]",
      tone: 0,
      heldOnDay: currentDay,
      status: "scheduled",
    }).run();
  })();

  return { rowId, bill, ministryFocus, experts: chosen };
}

// ---------------------------------------------------------------------------
// AI batch builder + processor
// ---------------------------------------------------------------------------

const ANHOERUNG_SYSTEM_PROMPT = `Du bist ein neutraler Berichterstatter über deutsche Bundestags-Anhörungen. Deine Aufgabe: Sachverständigen-Stellungnahmen zu einem Gesetzentwurf in einer Ausschussanhörung formulieren, jeweils 1–2 Sätze in deutscher Sprache, journalistischer Register, ohne erfundene Fakten jenseits des bereitgestellten Kontexts.

Antwortformat (JSON, kein Markdown, keine Code-Fences):
{
  "testimonies": [{ "expertId": "<id>", "statement": "<1–2 Sätze>" }, ...],
  "tone": <Skalar von -1 (stark ablehnend) bis +1 (stark befürwortend)>
}

Der Tonus ist der gewichtete Durchschnitt der Expertenpositionen. Liefere genau eine Stellungnahme pro genanntem Experten.`;

function buildAnhoerungPrompt(input: AnhoerungBatchInput): string {
  const expertList = input.experts.map(e =>
    `- ${e.id}: ${e.name} (${e.affiliation}, Fachgebiete: ${e.expertiseAreas.join(", ")})`,
  ).join("\n");
  return [
    `GESETZENTWURF: "${input.bill.title}"`,
    `BESCHREIBUNG: ${input.bill.description}`,
    `KATEGORIE: ${input.bill.category} (Ressort: ${input.ministryFocus})`,
    "",
    "SACHVERSTÄNDIGE:",
    expertList,
    "",
    "Liefere eine Stellungnahme pro Sachverständigem und einen Tonus-Skalar als JSON.",
  ].join("\n");
}

/** S20-pattern: builds the Anhörung batch (one item per scheduled hearing). */
export function buildAusschussanhoerungenBatchRequest(
  inputs: AnhoerungBatchInput[],
): BatchRequest[] {
  return inputs.map(input => ({
    customId: `anhoerung-${input.rowId}`,
    system: ANHOERUNG_SYSTEM_PROMPT,
    prompt: buildAnhoerungPrompt(input),
    maxTokens: 600,
    roleKey: "daily" as const,
  }));
}

interface ParsedAnhoerung {
  testimonies: Array<{ expertId: string; statement: string }>;
  tone: number;
}

/**
 * S3: parse + validate the AI response. Returns null on any structural failure
 * — caller transitions row to `lapsed` (tone=0, testimonies=[]).
 */
function validateAnhoerung(value: unknown, expectedExpertCount: number): ParsedAnhoerung | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v.testimonies)) return null;
  if (v.testimonies.length !== expectedExpertCount) return null;
  if (typeof v.tone !== "number" || !Number.isFinite(v.tone)) return null;
  if (v.tone < -1 || v.tone > 1) return null;
  for (const t of v.testimonies) {
    if (!t || typeof t !== "object") return null;
    const tt = t as Record<string, unknown>;
    if (typeof tt.expertId !== "string" || typeof tt.statement !== "string") return null;
    if (tt.statement.trim().length === 0) return null;
  }
  return v as unknown as ParsedAnhoerung;
}

/**
 * Process the Anhörung batch results: writes testimonies + tone on success,
 * or transitions the row to `lapsed` on parse / validation failure.
 *
 * Returns the `ausschussanhoerung_held` events for the day (one per success).
 * Failed rows produce no event — they're a quiet procedural lapse, not a
 * news-worthy moment.
 */
export function processAusschussanhoerungenBatchResult(
  results: BatchResult[],
  inputs: AnhoerungBatchInput[],
  currentDay: number,
): Array<Omit<SimulationEvent, "id">> {
  const events: Array<Omit<SimulationEvent, "id">> = [];
  const db = getDb();

  for (const input of inputs) {
    const t0 = Date.now();
    const result = findResult(results, `anhoerung-${input.rowId}`);

    let parsed: ParsedAnhoerung | null = null;
    if (result?.text) {
      parsed = parseAIJson<ParsedAnhoerung>(
        result.text,
        v => validateAnhoerung(v, input.experts.length),
        "ausschussanhoerung",
      );
    }

    if (parsed) {
      // S3 success path: 'held' + persisted AI output.
      // R10: WHERE clause on ausschussanhoerungen update (PR #165 R2 lesson).
      getSqlite().transaction(() => {
        db.update(schema.ausschussanhoerungen)
          .set({
            status: "held",
            testimonies: JSON.stringify(parsed.testimonies),
            tone: parsed.tone,
          })
          .where(eq(schema.ausschussanhoerungen.id, input.rowId))
          .run();
      })();
      logAICall({
        task: "ausschussanhoerung",
        model: result?.model,
        provider: result?.provider,
        latencyMs: Date.now() - t0,
        parseOk: true,
        validationOk: true,
      });
      events.push({
        dayNumber: currentDay,
        type: "ausschussanhoerung_held",
        actor: "bundestag",
        title: `Anhörung im Ausschuss: "${input.bill.title}"`,
        description: `Drei Sachverständige haben im federführenden Ausschuss zum Entwurf "${input.bill.title}" Stellung genommen. Tonus: ${parsed.tone >= 0.2 ? "befürwortend" : parsed.tone <= -0.2 ? "ablehnend" : "gemischt"}.`,
        data: {
          billId: input.bill.id,
          rowId: input.rowId,
          ministryFocus: input.ministryFocus,
          tone: parsed.tone,
          testimonies: parsed.testimonies,
          expertIds: input.experts.map(e => e.id),
        },
      });
    } else {
      // S3 failure path: 'lapsed' + tone=0 + testimonies=[].
      getSqlite().transaction(() => {
        db.update(schema.ausschussanhoerungen)
          .set({ status: "lapsed", testimonies: "[]", tone: 0 })
          .where(eq(schema.ausschussanhoerungen.id, input.rowId))
          .run();
      })();
      logAICall({
        task: "ausschussanhoerung",
        model: result?.model,
        provider: result?.provider,
        latencyMs: Date.now() - t0,
        parseOk: result?.text != null,
        validationOk: false,
        fallback: "lapsed",
      });
    }
  }

  return events;
}
