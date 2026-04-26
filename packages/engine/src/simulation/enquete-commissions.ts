/**
 * Cycle 5 PR 2 — Enquete-Kommission lifecycle (Q2=A: mid-fidelity establish +
 * AI Schlussbericht). Long-form policy commission, bipartisan per S17 (visible
 * to both coalition + opposition agents in their context).
 *
 * Lifecycle:
 *   1. `proposed` — agent fires `request_enquete_kommission`; same-tick
 *      simple-majority Bundestag-Beschluss tally (S12).
 *   2. `active`   — vote passed; row carries member allocation + experts.
 *      `rejected` — vote failed; terminal state (no AI report).
 *   3. `concluded`— scheduledEndDay reached on daily tick; AI Schlussbericht
 *      requested via batch group D piggyback. final_report column written.
 *      `lapsed`   — soft-watchdog (Q9/R7): scheduledEndDay ≤ currentDay - 30
 *      AND status was still 'active' (e.g. AI batch never landed).
 *
 * Pattern note: mirrors Cycle 4 `inquiry-committees.ts` and Cycle 5 PR 1
 * `anhoerungen.ts` — pure helpers up top with injectable RNG for the 50k-trial
 * LCG convergence tests, then DB helpers, then AI batch builder/processor.
 */

import { eq, and, lte } from "drizzle-orm";
import type {
  Crisis,
  Party,
  Expert,
  MinistryPortfolio,
  EnqueteCommissionRow,
  EnqueteCommissionStatus,
  EnqueteVoteResult,
  SimulationEvent,
} from "@ki-bundestag/types";
import { getDb, getSqlite, schema } from "../db/index.js";
import type { BatchRequest, BatchResult } from "../agent/batch-client.js";
import { findResult } from "../agent/batch-client.js";
import { logAICall } from "../agent/ai-json.js";
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
  ENQUETE_WATCHDOG_GRACE_DAYS,
  BILL_CATEGORY_TO_MINISTRY,
} from "../config/parliament.js";
import { PARIAH_PARTIES } from "../config/elections.js";

export interface EnqueteOpportunity {
  topic: MinistryPortfolio;
  crisisId: string;
  daysActive: number;
}

// ---------------------------------------------------------------------------
// Pure helpers (testable, no DB; injectable RNG)
// ---------------------------------------------------------------------------

/**
 * S11: surface a persistent-crisis-driven Enquete opportunity.
 *
 * Picks the longest-active crisis with `daysActive >= ENQUETE_PERSISTENT_CRISIS_THRESHOLD_DAYS`
 * and maps its category to a MinistryPortfolio via `BILL_CATEGORY_TO_MINISTRY`.
 * Returns null if no crisis qualifies.
 *
 * S17: visible to BOTH coalition + opposition agents (unlike Cycle 4
 * `inquiryOpportunity` which was opposition-only). Enqueten are bipartisan.
 */
export function findEnqueteOpportunity(
  crises: Crisis[],
  currentDay: number,
): EnqueteOpportunity | null {
  let best: EnqueteOpportunity | null = null;
  for (const c of crises) {
    if (c.resolved) continue;
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
 * S10: proportional MdB slot allocation across Fraktion-bearing parties via
 * the Hare quota / largest-remainder method.
 *
 * Sum-invariant (test-asserted): Σ result === ENQUETE_MDB_SLOTS exactly.
 * Negative-counts invariant: every result value ≥ 0.
 *
 * Caller filters `parties` to Fraktion-bearing only — passing parties without
 * a Fraktion would dilute the allocation among non-Bundestag parties.
 */
export function selectEnqueteMembers(
  parties: Party[],
  totalSlots: number = ENQUETE_MDB_SLOTS,
): Record<string, number> {
  if (parties.length === 0) return {};
  const totalSeats = parties.reduce((s, p) => s + p.seatCount, 0);
  if (totalSeats === 0) return {};

  // Phase 1: integer floors of proportional shares + their fractional remainders.
  const floors = parties.map(p => {
    const exact = (p.seatCount / totalSeats) * totalSlots;
    return { id: p.id, floor: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });

  const allocated = floors.reduce((s, f) => s + f.floor, 0);
  const leftover = totalSlots - allocated;

  // Phase 2: distribute leftover slots to largest fractional remainders.
  // Stable sort: tie-break by party id so the test convergence is deterministic
  // for the same input shape.
  floors.sort((a, b) => {
    if (b.remainder !== a.remainder) return b.remainder - a.remainder;
    return a.id.localeCompare(b.id);
  });
  for (let i = 0; i < leftover; i++) {
    floors[i % floors.length].floor += 1;
  }

  const result: Record<string, number> = {};
  for (const f of floors) result[f.id] = f.floor;
  return result;
}

/**
 * S10: pick `[ENQUETE_EXPERT_SLOTS_MIN, ENQUETE_EXPERT_SLOTS_MAX]` experts whose
 * `expertiseAreas` overlap `topic`. Sampled without replacement via Fisher-Yates
 * partial shuffle.
 *
 * Throws if filtered pool < ENQUETE_EXPERT_SLOTS_MIN — the S2 EXPERTS_SEED
 * invariant prevents this at runtime (≥ 3 experts per ministry portfolio,
 * test-asserted in `experts-seed.test.ts`). Caller should treat the throw as
 * a hard invariant violation, not a recoverable error.
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
  const range = ENQUETE_EXPERT_SLOTS_MAX - ENQUETE_EXPERT_SLOTS_MIN + 1;
  const desiredSlots = ENQUETE_EXPERT_SLOTS_MIN + Math.floor(rng() * range);
  const count = Math.min(desiredSlots, matching.length);

  const shuffled = [...matching];
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(rng() * (shuffled.length - i));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}

/**
 * S12: tally a same-tick simple-majority Bundestag-Beschluss on an
 * Enquete-Kommission proposal.
 *
 * Voting pattern (Bernoulli per party, weighted by seatCount):
 *   - Proposing party: ENQUETE_PROPOSING_YES_RATE (1.00)
 *   - Coalition (non-pariah): ENQUETE_COALITION_YES_RATE (0.98)
 *   - Opposition (non-pariah): ENQUETE_OPPOSITION_YES_BASE + sentimentAdj
 *     where sentimentAdj = clamp((publicSentiment - 45) / 100, ±0.10)
 *   - Pariah (PARIAH_PARTIES set): ENQUETE_PARIAH_YES_RATE (0.50)
 *
 * passed := yes > no (simple majority of cast votes).
 *
 * Pure: accepts seeded RNG for tests. 50k LCG convergence asserts pass-rate
 * ≥ 92% for typical configurations (cross-party support is the norm).
 */
export function tallyEnqueteVote(
  parties: Party[],
  proposingPartyId: string,
  coalitionPartyIds: string[],
  publicSentiment: number,
  rng: () => number = Math.random,
): EnqueteVoteResult {
  const coalitionSet = new Set(coalitionPartyIds);
  // Sentiment baseline 45; positive sentiment helps opposition support; cap at
  // ±ENQUETE_OPPOSITION_SENTIMENT_ADJ_CAP to keep the convergence band stable.
  const sentimentAdj = Math.max(
    -ENQUETE_OPPOSITION_SENTIMENT_ADJ_CAP,
    Math.min(ENQUETE_OPPOSITION_SENTIMENT_ADJ_CAP, (publicSentiment - 45) / 100),
  );
  const oppositionYesShare = Math.min(
    1.0,
    Math.max(0, ENQUETE_OPPOSITION_YES_BASE + sentimentAdj),
  );

  let yes = 0;
  let no = 0;
  for (const p of parties) {
    if (p.seatCount <= 0) continue;
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

/** S7: uniform draw of Kommission scheduled duration in sim days. */
export function pickEnqueteDuration(rng: () => number = Math.random): number {
  const range = ENQUETE_DURATION_MAX_DAYS - ENQUETE_DURATION_MIN_DAYS + 1;
  return ENQUETE_DURATION_MIN_DAYS + Math.floor(rng() * range);
}

// ---------------------------------------------------------------------------
// DB helpers (DB-backed; called from loop.ts)
// ---------------------------------------------------------------------------

/** S8 cap query: count rows where status ∈ {proposed, active}. */
export function countActiveEnqueteCommissions(): number {
  const row = getSqlite()
    .prepare("SELECT COUNT(*) as cnt FROM enquete_commissions WHERE status IN ('proposed','active')")
    .get() as { cnt: number };
  return row.cnt;
}

/** S9 rate-limit lookup. */
export function getLastEnqueteProposedDay(): number | null {
  const row = getSqlite()
    .prepare("SELECT last_enquete_proposed_day FROM simulation_meta LIMIT 1")
    .get() as { last_enquete_proposed_day: number | null } | undefined;
  return row?.last_enquete_proposed_day ?? null;
}

/**
 * Daily tick (called from loop.ts step 11): collect Kommissionen whose
 * scheduledEndDay has been reached AND status is still 'active', plus apply
 * the soft-watchdog (Q9/R7) to stale rows.
 *
 * Returns the rows that need an AI Schlussbericht batch item generated. The
 * caller (loop.ts) builds the batch via `buildEnqueteFinalReportBatchRequest`,
 * piggybacks on group D, then calls `processEnqueteFinalReportBatchResult`
 * which writes the report + transitions status to 'concluded'.
 *
 * Watchdog: rows past `scheduledEndDay + ENQUETE_WATCHDOG_GRACE_DAYS` that are
 * still 'active' (e.g. AI batch never landed) transition to 'lapsed' here.
 */
export function tickEnqueteCommissions(currentDay: number): {
  toConclude: EnqueteCommissionRow[];
  lapsedEvents: Array<Omit<SimulationEvent, "id">>;
} {
  const db = getDb();
  // 1. Soft-watchdog: stale active rows → 'lapsed'. Run BEFORE the conclude
  //    sweep so a watchdog'd row doesn't double-fire the AI Schlussbericht.
  const stale = db.select().from(schema.enqueteCommissions)
    .where(and(
      eq(schema.enqueteCommissions.status, "active"),
      lte(schema.enqueteCommissions.scheduledEndDay, currentDay - ENQUETE_WATCHDOG_GRACE_DAYS),
    ))
    .all();

  const lapsedEvents: Array<Omit<SimulationEvent, "id">> = [];
  for (const row of stale) {
    getSqlite().transaction(() => {
      db.update(schema.enqueteCommissions)
        .set({ status: "lapsed", concludedOnDay: currentDay })
        .where(eq(schema.enqueteCommissions.id, row.id))
        .run();
    })();
    // Lapsed Kommissionen still emit an enquete_concluded event so the
    // narrative thread closes (no AI report — templated description).
    lapsedEvents.push({
      dayNumber: currentDay,
      type: "enquete_concluded",
      actor: row.proposingPartyId,
      title: `Enquete-Kommission "${row.topic}" versandet`,
      description: `Enquete-Kommission "${row.topic}" lief ohne abschließenden Schlussbericht aus (${ENQUETE_WATCHDOG_GRACE_DAYS} Tage Karenz überschritten).`,
      data: { rowId: row.id, topic: row.topic, watchdog: true },
    });
  }

  // 2. Collect rows ready to conclude (scheduledEndDay reached, still active).
  const concluding = db.select().from(schema.enqueteCommissions)
    .where(and(
      eq(schema.enqueteCommissions.status, "active"),
      lte(schema.enqueteCommissions.scheduledEndDay, currentDay),
    ))
    .all();

  // Map raw DB rows → typed EnqueteCommissionRow (parse JSON columns once).
  const toConclude: EnqueteCommissionRow[] = concluding.map(r => ({
    id: r.id,
    topic: r.topic as MinistryPortfolio,
    proposingPartyId: r.proposingPartyId,
    partyMemberIds: JSON.parse(r.partyMemberIds) as Record<string, number>,
    expertMemberIds: JSON.parse(r.expertMemberIds) as string[],
    formedOnDay: r.formedOnDay,
    scheduledEndDay: r.scheduledEndDay,
    concludedOnDay: r.concludedOnDay,
    status: r.status as EnqueteCommissionStatus,
    finalReport: r.finalReport,
    voteResult: r.voteResult ? JSON.parse(r.voteResult) as EnqueteVoteResult : null,
  }));

  return { toConclude, lapsedEvents };
}

// ---------------------------------------------------------------------------
// AI batch builder + processor (S20-pattern; piggybacks on group D)
// ---------------------------------------------------------------------------

const ENQUETE_FINAL_REPORT_SYSTEM_PROMPT = `Du bist Verfasser einer Schlussbericht-Zusammenfassung einer Enquete-Kommission des Deutschen Bundestages. Aufgabe: 6–10 Sätze in deutscher Sprache, journalistisch-sachlicher Ton, ohne erfundene Fakten jenseits des bereitgestellten Kontexts. Beziehe Themenkomplex, Mitgliederzusammensetzung und konkrete Politikempfehlungen ein. Liefere Klartext (kein JSON, kein Markdown, keine Aufzählungspunkte).`;

interface EnqueteFinalReportInput {
  rowId: string;
  topic: MinistryPortfolio;
  partyMemberIds: Record<string, number>;
  expertNames: string[];
  durationDays: number;
}

function buildEnqueteFinalReportPrompt(input: EnqueteFinalReportInput): string {
  const memberLines = Object.entries(input.partyMemberIds)
    .filter(([, count]) => count > 0)
    .map(([partyId, count]) => `${partyId}=${count}`)
    .join(", ");
  return [
    `THEMENKOMPLEX: ${input.topic}`,
    `LAUFZEIT: ${input.durationDays} Tage`,
    `MdB-MITGLIEDER PRO FRAKTION: ${memberLines}`,
    `SACHVERSTÄNDIGE: ${input.expertNames.join(", ")}`,
    "",
    "Verfasse die Schlussbericht-Zusammenfassung (6–10 Sätze).",
  ].join("\n");
}

/**
 * S20-pattern: builds the final-report batch (one item per just-concluded
 * Kommission). Caller (loop.ts) merges these into batch group D alongside
 * inquiry final reports + Ausschussanhörungen.
 */
export function buildEnqueteFinalReportBatchRequest(
  rows: EnqueteCommissionRow[],
  expertPool: readonly Expert[],
): BatchRequest[] {
  const expertById = new Map(expertPool.map(e => [e.id, e]));
  return rows.map(r => {
    const expertNames = r.expertMemberIds.map(id => {
      const e = expertById.get(id);
      return e ? `${e.name} (${e.affiliation})` : id;
    });
    const input: EnqueteFinalReportInput = {
      rowId: r.id,
      topic: r.topic,
      partyMemberIds: r.partyMemberIds,
      expertNames,
      durationDays: r.scheduledEndDay - r.formedOnDay,
    };
    return {
      customId: `enquete-final-${r.id}`,
      system: ENQUETE_FINAL_REPORT_SYSTEM_PROMPT,
      prompt: buildEnqueteFinalReportPrompt(input),
      maxTokens: 800,
      roleKey: "daily" as const,
    };
  });
}

/** Min length for an AI Schlussbericht to be considered valid (sanity check). */
const ENQUETE_REPORT_MIN_LENGTH = 50;

/**
 * Process the final-report batch results: writes status='concluded' +
 * finalReport on each Kommission. AI failure / empty / too-short output →
 * fallback templated text (still concludes; never silently skips).
 *
 * Returns the `enquete_concluded` events (one per row processed).
 */
export function processEnqueteFinalReportBatchResult(
  results: BatchResult[],
  rows: EnqueteCommissionRow[],
  currentDay: number,
): Array<Omit<SimulationEvent, "id">> {
  const events: Array<Omit<SimulationEvent, "id">> = [];
  const db = getDb();

  for (const row of rows) {
    const t0 = Date.now();
    const result = findResult(results, `enquete-final-${row.id}`);
    const reportText = (result?.text ?? "").trim();
    const ok = reportText.length >= ENQUETE_REPORT_MIN_LENGTH;
    const finalReport = ok
      ? reportText
      : `Enquete-Kommission "${row.topic}" abgeschlossen — Schlussbericht ausstehend.`;

    getSqlite().transaction(() => {
      db.update(schema.enqueteCommissions)
        .set({
          status: "concluded",
          finalReport,
          concludedOnDay: currentDay,
        })
        .where(eq(schema.enqueteCommissions.id, row.id))
        .run();
    })();

    logAICall({
      task: "enquete_final_report",
      model: result?.model,
      provider: result?.provider,
      latencyMs: Date.now() - t0,
      parseOk: result?.text != null,
      validationOk: ok,
      fallback: ok ? undefined : "templated-fallback",
    });

    events.push({
      dayNumber: currentDay,
      type: "enquete_concluded",
      actor: row.proposingPartyId,
      title: `Enquete-Kommission Schlussbericht: "${row.topic}"`,
      description: finalReport,
      data: {
        rowId: row.id,
        topic: row.topic,
        durationDays: row.scheduledEndDay - row.formedOnDay,
        aiOk: ok,
      },
    });
  }
  return events;
}

// ---------------------------------------------------------------------------
// Same-tick proposal handling (called from loop.ts step 10 action processor)
// ---------------------------------------------------------------------------

export interface EnqueteProposalContext {
  proposingPartyId: string;
  topic: MinistryPortfolio;
  /** Display-friendly title from the agent action — quoted in the proposed event. */
  title: string;
  /** Free-text rationale from the agent — quoted in the proposed event. */
  rationale: string;
}

export interface EnqueteProposalResult {
  rowId: string;
  status: "active" | "rejected";
  voteResult: EnqueteVoteResult;
  events: Array<Omit<SimulationEvent, "id">>;
}

/**
 * Same-tick handler for `request_enquete_kommission` (S12).
 *
 * Validation already ran in action-parser (Fraktion gate, MAX_ACTIVE cap,
 * rate-limit, once-per-turn). Per PR #165 R3 lesson: do NOT swallow inner
 * throws here (e.g. `pickEnqueteExperts` invariant violation). Let them
 * propagate to the loop's error handler so an S2 seed-pool regression is
 * visible, not silently masked. Returns null only when there are zero
 * Fraktion-bearing parties (degenerate state — same as during a dissolved
 * parliament — caller skips quietly).
 */
export function applyEnqueteProposal(
  ctx: EnqueteProposalContext,
  parties: Party[],
  fraktionPartyIds: Set<string>,
  coalitionPartyIds: string[],
  publicSentiment: number,
  expertPool: readonly Expert[],
  currentDay: number,
  rng: () => number = Math.random,
): EnqueteProposalResult | null {
  const db = getDb();

  // Largest-remainder allocation across Fraktion-bearing parties only (S10).
  const fraktionParties = parties.filter(p => fraktionPartyIds.has(p.id) && p.seatCount > 0);
  if (fraktionParties.length === 0) return null;
  const memberAlloc = selectEnqueteMembers(fraktionParties);

  // Pick experts (throws on S2 invariant violation — let it propagate, R3).
  const chosenExperts = pickEnqueteExperts(ctx.topic, expertPool, rng);

  const duration = pickEnqueteDuration(rng);
  const rowId = `enquete-${currentDay}-${ctx.topic}`;
  // Same-tick simple-majority Bundestag-Beschluss (S12).
  const voteResult = tallyEnqueteVote(
    parties, ctx.proposingPartyId, coalitionPartyIds, publicSentiment, rng,
  );
  const status: "active" | "rejected" = voteResult.passed ? "active" : "rejected";

  const events: Array<Omit<SimulationEvent, "id">> = [];

  // Persist row + meta.lastEnqueteProposedDay (S9). PR #165 R2 lesson: WHERE
  // clause on simulationMeta updates is required (single-row table without it
  // could mass-update if a future migration ever adds a second meta row).
  // Use a single transaction so a mid-block failure can't leave the row
  // inserted but the rate-limit unchanged (would let the next tick re-fire
  // the same action ahead of cooldown).
  getSqlite().transaction(() => {
    db.insert(schema.enqueteCommissions).values({
      id: rowId,
      topic: ctx.topic,
      proposingPartyId: ctx.proposingPartyId,
      partyMemberIds: JSON.stringify(memberAlloc),
      expertMemberIds: JSON.stringify(chosenExperts.map(e => e.id)),
      formedOnDay: currentDay,
      scheduledEndDay: currentDay + duration,
      status,
      voteResult: JSON.stringify(voteResult),
    }).run();

    // Resolve the meta row id (single-row table, but explicit WHERE per R2).
    const metaRow = getSqlite()
      .prepare("SELECT id FROM simulation_meta LIMIT 1")
      .get() as { id: number } | undefined;
    if (metaRow) {
      db.update(schema.simulationMeta)
        .set({ lastEnqueteProposedDay: currentDay })
        .where(eq(schema.simulationMeta.id, metaRow.id))
        .run();
    }
  })();

  // enquete_proposed always fires.
  events.push({
    dayNumber: currentDay,
    type: "enquete_proposed",
    actor: ctx.proposingPartyId,
    title: `Enquete-Kommission vorgeschlagen: "${ctx.title}"`,
    description: `${parties.find(p => p.id === ctx.proposingPartyId)?.name ?? ctx.proposingPartyId} schlägt eine Enquete-Kommission zum Themenkomplex ${ctx.topic} vor. ${ctx.rationale}`,
    data: { rowId, topic: ctx.topic },
  });

  // Outcome event (vote tally results).
  if (voteResult.passed) {
    events.push({
      dayNumber: currentDay,
      type: "enquete_convened",
      actor: "bundestag",
      title: `Bundestag setzt Enquete-Kommission "${ctx.topic}" ein`,
      description: `Bundestag-Beschluss: Enquete-Kommission zum Themenkomplex ${ctx.topic} eingesetzt. ${voteResult.yes} Ja, ${voteResult.no} Nein. Laufzeit: ${duration} Tage.`,
      data: { rowId, topic: ctx.topic, vote: voteResult, duration },
    });
  } else {
    events.push({
      dayNumber: currentDay,
      type: "enquete_rejected",
      actor: "bundestag",
      title: `Bundestag lehnt Enquete-Kommission "${ctx.topic}" ab`,
      description: `Bundestag-Beschluss: Enquete-Kommission zum Themenkomplex ${ctx.topic} abgelehnt. ${voteResult.yes} Ja, ${voteResult.no} Nein.`,
      data: { rowId, topic: ctx.topic, vote: voteResult },
    });
  }

  return { rowId, status, voteResult, events };
}

