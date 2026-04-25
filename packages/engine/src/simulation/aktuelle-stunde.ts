/**
 * Cycle 2b PR 6 — Aktuelle Stunde (crisis-hooked + baseline).
 *
 * Scheduled on two triggers:
 *   - `crisis_start` with severity >= AKTUELLE_STUNDE_CRISIS_SEVERITY_MIN:
 *     schedules for the next Thursday Sitzungstag
 *   - baseline weekly tick: Poisson draw against
 *     AKTUELLE_STUNDE_BASELINE_MONTHLY_RATE / 4
 * Dedup: at most AKTUELLE_STUNDE_PER_WEEK_MAX session per Sitzungswoche.
 *
 * AI generates two-sentence positions (government + opposition) per session.
 * Requests are collected into the weekly end-of-day batch window.
 *
 * See `docs/plans/043-cycle2b-spec.md` §Design Piece 4.
 */

import type { Bill, Crisis, Government, Party } from "@ki-bundestag/types";
import { and, eq, gte, isNull, lte } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";
import type { BatchRequest, BatchResult } from "../agent/batch-client.js";
import { parseAIJson, logAICall } from "../agent/ai-json.js";
import { nextSitzungsTag, isSitzungsTag } from "./parliament-calendar.js";
import { dayToDate } from "./calendar.js";
import {
  AKTUELLE_STUNDE_CRISIS_SEVERITY_MIN,
  AKTUELLE_STUNDE_BASELINE_MONTHLY_RATE,
  AKTUELLE_STUNDE_PER_WEEK_MAX,
  AKTUELLE_STUNDE_TARGET_WEEKDAY,
  AKTUELLE_STUNDE_MAX_BATCH_ATTEMPTS,
  AKTUELLE_STUNDE_FALLBACK,
} from "../config/aktuelle-stunde.js";

// ── Types ──────────────────────────────────────────────────────────────

export type AktuelleStundeTrigger = "crisis" | "baseline";

export interface AktuelleStundePositions {
  government: string;
  opposition: string;
}

export interface AktuelleStundeSession {
  id: string;
  scheduledDay: number;
  topic: string;
  triggerKind: AktuelleStundeTrigger;
  crisisId: string | null;
  governmentPartyId: string;
  oppositionPartyId: string;
  positions: AktuelleStundePositions | null;
  batchRequestId: string | null;
  batchAttempts: number;
  emittedOnDay: number | null;
}

export type RNG = () => number;
const defaultRng: RNG = Math.random;

function generateId(): string {
  return Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}

// ── Pure helpers ───────────────────────────────────────────────────────

const CRISIS_SEVERITY_RANK: Record<string, number> = { low: 0, medium: 1, high: 2 };

/** True if the crisis severity clears the minimum trigger threshold. */
export function crisisMeetsThreshold(severity: string): boolean {
  return (CRISIS_SEVERITY_RANK[severity] ?? -1) >= (CRISIS_SEVERITY_RANK[AKTUELLE_STUNDE_CRISIS_SEVERITY_MIN] ?? 0);
}

/**
 * Find the next Sitzungstag that falls on AKTUELLE_STUNDE_TARGET_WEEKDAY
 * (typically Thursday). Bounded search — gives up after 21 days and returns
 * the next plain Sitzungstag. Caller persists whatever day this returns.
 */
export function nextAktuelleStundeDay(fromDay: number, startDate: Date): number {
  for (let i = 0; i < 21; i++) {
    const candidate = nextSitzungsTag(fromDay + i, startDate);
    const dow = ((dayToDate(candidate, startDate).getDay() + 6) % 7) + 1; // Mon=1..Sun=7
    if (dow === AKTUELLE_STUNDE_TARGET_WEEKDAY && isSitzungsTag(candidate, startDate)) {
      return candidate;
    }
  }
  return nextSitzungsTag(fromDay + 1, startDate);
}

/**
 * Select the opposition party most likely to request the Aktuelle Stunde:
 * highest approval among non-coalition parties. Deterministic under a
 * seeded RNG via tie-breaking on `id`.
 */
export function selectOppositionParty(
  parties: Party[],
  governmentPartyId: string,
  cabinetPartyIds: string[],
): Party | null {
  const coalition = new Set([governmentPartyId, ...cabinetPartyIds]);
  const opposition = parties.filter(p => !coalition.has(p.id));
  if (opposition.length === 0) return null;
  return opposition
    .slice()
    .sort((a, b) => b.approvalRating - a.approvalRating || a.id.localeCompare(b.id))[0];
}

/**
 * Baseline Poisson tick. Returns true when a new Aktuelle Stunde should be
 * scheduled this week absent any crisis trigger.
 */
export function baselineTick(rng: RNG = defaultRng): boolean {
  const weeklyRate = AKTUELLE_STUNDE_BASELINE_MONTHLY_RATE / 4;
  return rng() < weeklyRate;
}

/**
 * Build a BatchRequest for a single Aktuelle-Stunde session. One request
 * returns both government and opposition 2-sentence positions.
 */
export function buildAktuelleStundeBatchRequest(
  session: AktuelleStundeSession,
  governmentParty: Party,
  oppositionParty: Party,
): BatchRequest {
  return {
    customId: `aktst-${session.id}`,
    system: `Du formulierst zwei Kurzbeiträge für eine Aktuelle Stunde im Deutschen Bundestag zum Thema "${session.topic}".

Formuliere für die Regierungsfraktion (${governmentParty.name}) eine 2-3-Sätze-Position, die ihre Koalitionsperspektive vertritt.
Formuliere für die Oppositionsfraktion (${oppositionParty.name}) eine 2-3-Sätze-Position, die Regierungsversäumnisse kritisiert.

Schreibe beide Positionen auf Deutsch, ohne Floskeln, mit klarer inhaltlicher Haltung.

Antworte AUSSCHLIESSLICH mit gültigem JSON:
{"government": "<2-3 Sätze>", "opposition": "<2-3 Sätze>"}`,
    prompt: `Thema: ${session.topic}\n\nFormuliere die beiden Positionen.`,
    maxTokens: 512,
    roleKey: "daily",
  };
}

/**
 * Parse the model response into AktuelleStundePositions. Returns null on
 * any parse/validation failure — caller decides whether to retry or fall
 * back to AKTUELLE_STUNDE_FALLBACK.
 */
export function parseAktuelleStundePositions(text: string): AktuelleStundePositions | null {
  return parseAIJson<AktuelleStundePositions>(
    text,
    (v: unknown) => {
      const o = v as Record<string, unknown>;
      if (typeof o.government !== "string" || typeof o.opposition !== "string") return null;
      return { government: o.government, opposition: o.opposition };
    },
    "AktuelleStunde",
  );
}

// ── DB-touching wrappers ───────────────────────────────────────────────

/**
 * Returns true if an Aktuelle-Stunde row exists whose `scheduled_day` falls
 * within the Sitzungswoche containing `day` (Mon–Sun inclusive).
 */
export function hasSessionInWeek(day: number, startDate: Date): boolean {
  const date = dayToDate(day, startDate);
  const dow = ((date.getDay() + 6) % 7) + 1; // Mon=1..Sun=7
  const weekStart = day - (dow - 1);
  const weekEnd = weekStart + 6;
  const db = getDb();
  const rows = db.select().from(schema.aktuelleStundeSessions)
    .where(and(
      gte(schema.aktuelleStundeSessions.scheduledDay, weekStart),
      lte(schema.aktuelleStundeSessions.scheduledDay, weekEnd),
    ))
    .all();
  return rows.length >= AKTUELLE_STUNDE_PER_WEEK_MAX;
}

/**
 * Schedule an Aktuelle Stunde driven by a high-severity crisis. Returns the
 * persisted session, or null if the severity is below threshold, no active
 * government exists, or a session already exists this Sitzungswoche.
 */
export function scheduleAktuelleStundeForCrisis(
  crisis: Crisis,
  government: Government | null,
  parties: Party[],
  startDate: Date,
  day: number,
): AktuelleStundeSession | null {
  if (!crisisMeetsThreshold(crisis.severity)) return null;
  if (!government) return null;
  const scheduledDay = nextAktuelleStundeDay(day, startDate);
  if (hasSessionInWeek(scheduledDay, startDate)) return null;

  const opposition = selectOppositionParty(
    parties,
    government.chancellorPartyId,
    government.ministers.map(m => m.partyId),
  );
  if (!opposition) return null;

  const session: AktuelleStundeSession = {
    id: `aktst-${generateId()}`,
    scheduledDay,
    topic: crisis.name,
    triggerKind: "crisis",
    crisisId: crisis.id,
    governmentPartyId: government.chancellorPartyId,
    oppositionPartyId: opposition.id,
    positions: null,
    batchRequestId: null,
    batchAttempts: 0,
    emittedOnDay: null,
  };
  persistSession(session);
  return session;
}

/**
 * R8: predicate version of {@link scheduleAktuelleStundeForCrisis} — returns
 * `true` iff scheduling would have succeeded except for the same-week dedup.
 * Used by the crisis-start path in `loop.ts` to surface a `aktuelleStundeSkipped`
 * breadcrumb on the parent `crisis_start` event when a second high-severity
 * crisis lands in the same Sitzungswoche.
 *
 * Must be called BEFORE `scheduleAktuelleStundeForCrisis` (after, the just-
 * persisted session would always make `hasSessionInWeek` true).
 */
export function wouldDedupAktuelleStundeForCrisis(
  crisis: Crisis,
  government: Government | null,
  startDate: Date,
  day: number,
): boolean {
  if (!crisisMeetsThreshold(crisis.severity)) return false;
  if (!government) return false;
  const scheduledDay = nextAktuelleStundeDay(day, startDate);
  return hasSessionInWeek(scheduledDay, startDate);
}

/**
 * Baseline weekly scheduler. Call at Sitzungswoche start. Uses a Poisson
 * tick to decide; picks a topic from the most recently-active-bill title
 * if available, else a generic "Aktuelle Lage" topic.
 */
export function maybeScheduleBaselineAktuelleStunde(
  day: number,
  startDate: Date,
  government: Government | null,
  parties: Party[],
  recentBills: Bill[],
  rng: RNG = defaultRng,
): AktuelleStundeSession | null {
  if (!baselineTick(rng)) return null;
  if (!government) return null;
  const scheduledDay = nextAktuelleStundeDay(day, startDate);
  if (hasSessionInWeek(scheduledDay, startDate)) return null;

  const opposition = selectOppositionParty(
    parties,
    government.chancellorPartyId,
    government.ministers.map(m => m.partyId),
  );
  if (!opposition) return null;

  const topic = recentBills.length > 0
    ? `Aktuelle Lage: ${recentBills[0].title}`
    : "Aktuelle politische Lage";

  const session: AktuelleStundeSession = {
    id: `aktst-${generateId()}`,
    scheduledDay,
    topic,
    triggerKind: "baseline",
    crisisId: null,
    governmentPartyId: government.chancellorPartyId,
    oppositionPartyId: opposition.id,
    positions: null,
    batchRequestId: null,
    batchAttempts: 0,
    emittedOnDay: null,
  };
  persistSession(session);
  return session;
}

function persistSession(s: AktuelleStundeSession): void {
  const db = getDb();
  db.insert(schema.aktuelleStundeSessions).values({
    id: s.id,
    scheduledDay: s.scheduledDay,
    topic: s.topic,
    triggerKind: s.triggerKind,
    crisisId: s.crisisId,
    governmentPartyId: s.governmentPartyId,
    oppositionPartyId: s.oppositionPartyId,
    positions: s.positions as unknown as string,
    batchRequestId: s.batchRequestId,
    batchAttempts: s.batchAttempts,
    emittedOnDay: s.emittedOnDay,
  }).run();
}

/**
 * Load all sessions due on or before `currentDay` that haven't been emitted.
 */
export function getPendingAktuelleStundeSessions(currentDay: number): AktuelleStundeSession[] {
  const db = getDb();
  const rows = db.select().from(schema.aktuelleStundeSessions)
    .where(and(
      isNull(schema.aktuelleStundeSessions.emittedOnDay),
      lte(schema.aktuelleStundeSessions.scheduledDay, currentDay),
    ))
    .all();
  return rows.map(rowToSession);
}

/**
 * Build BatchRequests for pending sessions. Caller feeds these into the
 * weekly end-of-day batch window. Sessions without a resolved party pair
 * are skipped (should never happen — persist guards ensure both are set).
 */
export function buildAktuelleStundeBatchRequests(
  pendingSessions: AktuelleStundeSession[],
  parties: Party[],
): Array<{ req: BatchRequest; sessionId: string }> {
  const byId = new Map(parties.map(p => [p.id, p]));
  const out: Array<{ req: BatchRequest; sessionId: string }> = [];
  for (const s of pendingSessions) {
    const govParty = byId.get(s.governmentPartyId);
    const oppParty = byId.get(s.oppositionPartyId);
    if (!govParty || !oppParty) continue;
    out.push({
      req: buildAktuelleStundeBatchRequest(s, govParty, oppParty),
      sessionId: s.id,
    });
  }
  return out;
}

/**
 * Consume batch results, apply positions to session rows, persist, and
 * return the sessions that are now ready to emit a `aktuelle_stunde` event.
 */
export function processAktuelleStundeBatchResult(
  results: BatchResult[],
  pendingSessions: AktuelleStundeSession[],
  currentDay: number,
): { ready: AktuelleStundeSession[] } {
  const db = getDb();
  const ready: AktuelleStundeSession[] = [];

  for (const session of pendingSessions) {
    const result = results.find(r => r.customId === `aktst-${session.id}`);
    const nextAttempt = session.batchAttempts + 1;
    const exhausted = nextAttempt >= AKTUELLE_STUNDE_MAX_BATCH_ATTEMPTS;

    let positions: AktuelleStundePositions | null = null;
    if (result && result.text) {
      positions = parseAktuelleStundePositions(result.text);
      logAICall({
        task: "aktuelle-stunde",
        model: result.model,
        provider: result.provider as "anthropic" | "xai",
        latencyMs: 0,
        parseOk: positions !== null,
        validationOk: positions !== null,
      });
    }

    if (positions === null && exhausted) {
      positions = { ...AKTUELLE_STUNDE_FALLBACK };
    }

    const emittedOnDay = positions !== null ? currentDay : null;

    db.update(schema.aktuelleStundeSessions)
      .set({
        positions: positions as unknown as string,
        batchAttempts: nextAttempt,
        emittedOnDay,
      })
      .where(eq(schema.aktuelleStundeSessions.id, session.id))
      .run();

    if (positions !== null) {
      ready.push({ ...session, positions, batchAttempts: nextAttempt, emittedOnDay: currentDay });
    }
  }

  return { ready };
}

function rowToSession(row: typeof schema.aktuelleStundeSessions.$inferSelect): AktuelleStundeSession {
  return {
    id: row.id,
    scheduledDay: row.scheduledDay,
    topic: row.topic,
    triggerKind: row.triggerKind as AktuelleStundeTrigger,
    crisisId: row.crisisId,
    governmentPartyId: row.governmentPartyId,
    oppositionPartyId: row.oppositionPartyId,
    positions: row.positions as unknown as AktuelleStundePositions | null,
    batchRequestId: row.batchRequestId,
    batchAttempts: row.batchAttempts,
    emittedOnDay: row.emittedOnDay,
  };
}
