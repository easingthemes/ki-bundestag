/**
 * Cycle 2b PR 5 — Parliamentary-QA (Regierungsbefragung + Fragestunde).
 *
 * One module for both weekly session types. Pure helpers (question picking,
 * minister-party derivation, prompt building, response parsing) sit at the
 * top and are unit-tested directly. Thin DB wrappers (scheduling, persist
 * answers) sit at the bottom — PR 6 will call them from the loop.
 *
 * See `docs/plans/043-cycle2b-spec.md` §Design Piece 3.
 */

import type { BillCategory, Government, Minister, MinistryPortfolio, Party } from "@ki-bundestag/types";
import { eq, and, isNull, gte, lte } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";
import type { BatchRequest, BatchResult } from "../agent/batch-client.js";
import { parseAIJson, logAICall } from "../agent/ai-json.js";
import {
  MDB_QUESTION_POOL,
  MINISTRY_FALLBACK_PARTY,
  REGIERUNGSBEFRAGUNG_QUESTIONS_PER_SESSION,
  FRAGESTUNDE_QUESTIONS_PER_SESSION,
  PARLIAMENTARY_QA_FALLBACK_ANSWER,
  PARLIAMENTARY_QA_MAX_BATCH_ATTEMPTS,
  type MdbQuestionTemplate,
} from "../config/parliamentary-qa.js";

// ── Types (session row + question shape) ───────────────────────────────

export type ParliamentaryQaKind = "regierungsbefragung" | "fragestunde";

export interface ParliamentaryQaQuestion {
  questionId: string;                 // template id (stable)
  askingPartyId: string;
  askingPartyName: string;
  text: string;
  ministry: MinistryPortfolio;
  ministerPartyId: string;
  answer: string | null;
}

export interface ParliamentaryQaSession {
  id: string;
  kind: ParliamentaryQaKind;
  day: number;
  questions: ParliamentaryQaQuestion[];
  batchRequestId: string | null;
  batchAttempts: number;
  answeredOnDay: number | null;
}

// ── Random helpers (deterministic via optional RNG seed) ───────────────

export type RNG = () => number;
const defaultRng: RNG = Math.random;

function rngInt(rng: RNG, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function rngPick<T>(rng: RNG, list: readonly T[]): T {
  return list[Math.floor(rng() * list.length) % list.length];
}

function rngShuffle<T>(rng: RNG, list: readonly T[]): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ── Pure helpers (unit-testable, no DB) ────────────────────────────────

export interface QuestionPickOptions {
  /** Bill categories with active pipeline rows — bias the weight toward these. */
  activeCategories?: BillCategory[];
  /** Ministries covered by active crises — bias toward these. */
  activeCrisisMinistries?: MinistryPortfolio[];
  /** Exclude these template ids (e.g. already used earlier this Sitzungswoche). */
  excludeIds?: string[];
}

/**
 * Pick N unique questions from the pool, weighted by active categories +
 * crises. Deterministic under a seeded RNG.
 */
export function pickQuestionsForSession(
  count: number,
  opts: QuestionPickOptions = {},
  rng: RNG = defaultRng,
): MdbQuestionTemplate[] {
  const { activeCategories = [], activeCrisisMinistries = [], excludeIds = [] } = opts;
  const excluded = new Set(excludeIds);
  const candidates = MDB_QUESTION_POOL.filter(q => !excluded.has(q.id));

  if (candidates.length <= count) {
    // Degenerate case: pool is exhausted. Return whatever's left, shuffled.
    return rngShuffle(rng, candidates).slice(0, count);
  }

  // Build weighted buckets: active-category entries appear 3x, active-crisis
  // ministry entries appear 2x, everything else 1x. Draw `count` unique ids.
  const weighted: MdbQuestionTemplate[] = [];
  for (const q of candidates) {
    weighted.push(q);
    if (activeCategories.includes(q.category)) weighted.push(q, q);
    if (activeCrisisMinistries.includes(q.ministry)) weighted.push(q);
  }

  const picked = new Map<string, MdbQuestionTemplate>();
  // Safety cap: weighted draws can repeat the same id, so guard against an
  // infinite loop by bounding iterations at weighted.length * 2.
  const maxIterations = weighted.length * 2;
  let iterations = 0;
  while (picked.size < count && iterations < maxIterations) {
    const q = rngPick(rng, weighted);
    if (!picked.has(q.id)) picked.set(q.id, q);
    iterations++;
  }

  // Fallback: if the weighted draw didn't find `count` unique items (only
  // possible with heavy weighting on few items), top up from the plain pool.
  if (picked.size < count) {
    for (const q of rngShuffle(rng, candidates)) {
      if (!picked.has(q.id)) picked.set(q.id, q);
      if (picked.size >= count) break;
    }
  }

  return [...picked.values()].slice(0, count);
}

/**
 * Derive the minister party from the live cabinet. Falls back to
 * MINISTRY_FALLBACK_PARTY when the cabinet is empty or lacks this portfolio.
 */
export function deriveMinisterPartyId(
  cabinet: Minister[] | null | undefined,
  ministry: MinistryPortfolio,
): string {
  if (cabinet && cabinet.length > 0) {
    const hit = cabinet.find(m => m.portfolio === ministry);
    if (hit) return hit.partyId;
  }
  return MINISTRY_FALLBACK_PARTY[ministry];
}

/**
 * Build a session row (not yet persisted). Caller decides asking-party
 * assignment. Opposition parties are preferred as askers to match real
 * Regierungsbefragung dynamics — Fragestunde allows coalition askers too.
 */
export function buildSession(
  id: string,
  kind: ParliamentaryQaKind,
  day: number,
  templates: MdbQuestionTemplate[],
  government: Government | null,
  parties: Party[],
  rng: RNG = defaultRng,
): ParliamentaryQaSession {
  const coalition = new Set<string>(government ? [government.chancellorPartyId, ...government.ministers.map(m => m.partyId)] : []);
  const opposition = parties.filter(p => !coalition.has(p.id));
  const askerPool = kind === "regierungsbefragung" && opposition.length > 0 ? opposition : parties;

  const questions: ParliamentaryQaQuestion[] = templates.map(t => {
    const asker = rngPick(rng, askerPool);
    return {
      questionId: t.id,
      askingPartyId: asker.id,
      askingPartyName: asker.name,
      text: t.text,
      ministry: t.ministry,
      ministerPartyId: deriveMinisterPartyId(government?.ministers ?? null, t.ministry),
      answer: null,
    };
  });

  return {
    id,
    kind,
    day,
    questions,
    batchRequestId: null,
    batchAttempts: 0,
    answeredOnDay: null,
  };
}

/**
 * Build a BatchRequest for a single session. One request per session, asking
 * the AI to answer all 2–3 questions inline. Response schema:
 *   { "answers": [{ "id": "<templateId>", "answer": "<2-3 Sätze>" }] }
 */
export function buildSessionBatchRequest(
  session: ParliamentaryQaSession,
): BatchRequest {
  const kindLabel = session.kind === "regierungsbefragung" ? "Regierungsbefragung" : "Fragestunde";
  const questionList = session.questions
    .map((q, i) => `[${i + 1}] ID: ${q.questionId} | Abgeordnete*r: ${q.askingPartyName}\n    Ministerium: ${q.ministry}\n    Frage: "${q.text}"`)
    .join("\n\n");

  return {
    customId: `parl-qa-${session.id}`,
    system: `Du bist Regierungssprecher*in der Bundesregierung und beantwortest Fragen in einer ${kindLabel} im Deutschen Bundestag.

Beantworte jede Frage knapp und sachlich in 2–3 Sätzen auf Deutsch. Vermeide Floskeln. Wenn du keine belastbare Antwort hast, verweise auf die schriftliche Beantwortung.

Antworte AUSSCHLIESSLICH mit gültigem JSON:
{"answers": [{"id": "<templateId>", "answer": "<2-3 Sätze>"}]}

Beantworte ALLE Fragen. Verwende die exakten "id"-Werte aus der Liste.`,
    prompt: `Fragen:\n\n${questionList}\n\nAntworte jeder Frage.`,
    maxTokens: Math.max(256, session.questions.length * 140),
    roleKey: "daily",
  };
}

/**
 * Parse the model's JSON response into a `Map<questionId, answer>`.
 * Returns an empty map on parse/validation failure (caller decides fallback).
 */
export function parseSessionAnswers(text: string): Map<string, string> {
  const parsed = parseAIJson<{ answers: Array<{ id: string; answer: string }> }>(
    text,
    (v: unknown) => {
      const o = v as Record<string, unknown>;
      if (!Array.isArray(o.answers)) return null;
      const answers: Array<{ id: string; answer: string }> = [];
      for (const item of o.answers as unknown[]) {
        const it = item as Record<string, unknown>;
        if (typeof it.id !== "string" || typeof it.answer !== "string") continue;
        answers.push({ id: it.id, answer: it.answer });
      }
      return { answers };
    },
    "ParliamentaryQA",
  );
  const out = new Map<string, string>();
  if (!parsed) return out;
  for (const a of parsed.answers) out.set(a.id, a.answer);
  return out;
}

/**
 * Apply a parsed answer map back onto a session. Questions missing an answer
 * stay `null` unless `force === true`, in which case they get the fallback.
 * Force is used when `batchAttempts >= PARLIAMENTARY_QA_MAX_BATCH_ATTEMPTS`.
 */
export function applyAnswersToSession(
  session: ParliamentaryQaSession,
  answers: Map<string, string>,
  opts: { force?: boolean } = {},
): ParliamentaryQaSession {
  const force = opts.force === true;
  const updated = session.questions.map(q => {
    if (q.answer !== null) return q;
    const hit = answers.get(q.questionId);
    if (hit !== undefined) return { ...q, answer: hit };
    if (force) return { ...q, answer: PARLIAMENTARY_QA_FALLBACK_ANSWER };
    return q;
  });
  const allAnswered = updated.every(q => q.answer !== null);
  return {
    ...session,
    questions: updated,
    answeredOnDay: allAnswered ? session.answeredOnDay : session.answeredOnDay,
  };
}

/**
 * Return the count per session kind. Pure helper used by schedulers and tests.
 */
export function questionsPerSession(kind: ParliamentaryQaKind, rng: RNG = defaultRng): number {
  const cfg = kind === "regierungsbefragung"
    ? REGIERUNGSBEFRAGUNG_QUESTIONS_PER_SESSION
    : FRAGESTUNDE_QUESTIONS_PER_SESSION;
  return rngInt(rng, cfg.min, cfg.max);
}

// ── DB-touching wrappers (thin, used by PR 6 loop wire) ────────────────

function generateId(): string {
  return Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}

/**
 * Insert a session row for this Sitzungswoche if one doesn't already exist
 * for the (kind, day) pair. Returns the newly-created session, or null if
 * a row already exists.
 */
export function persistScheduledSession(
  session: Omit<ParliamentaryQaSession, "id"> & { id?: string },
): ParliamentaryQaSession | null {
  const db = getDb();
  const existing = db.select().from(schema.parliamentaryQaSessions)
    .where(and(
      eq(schema.parliamentaryQaSessions.kind, session.kind),
      eq(schema.parliamentaryQaSessions.day, session.day),
    ))
    .get();
  if (existing) return null;

  const id = session.id ?? `pqa-${generateId()}`;
  const row: ParliamentaryQaSession = { ...session, id };
  db.insert(schema.parliamentaryQaSessions).values({
    id,
    kind: row.kind,
    day: row.day,
    questions: row.questions as unknown as string,
    batchRequestId: row.batchRequestId,
    batchAttempts: row.batchAttempts,
    answeredOnDay: row.answeredOnDay,
  }).run();
  return row;
}

/**
 * Load all sessions whose `day <= currentDay` and `answered_on_day IS NULL`.
 * These are the sessions the weekly batch needs to answer.
 */
export function getPendingSessions(currentDay: number): ParliamentaryQaSession[] {
  const db = getDb();
  const rows = db.select().from(schema.parliamentaryQaSessions)
    .where(and(
      isNull(schema.parliamentaryQaSessions.answeredOnDay),
      lte(schema.parliamentaryQaSessions.day, currentDay),
    ))
    .all();
  return rows.map(rowToSession);
}

/**
 * Build BatchRequests for all pending sessions. One request per session.
 * Caller (PR 6) feeds the returned `{ req, sessionId }` list into
 * `submitBatch()` alongside other weekly requests.
 */
export function buildParliamentaryQABatchRequests(
  pendingSessions: ParliamentaryQaSession[],
): Array<{ req: BatchRequest; sessionId: string }> {
  return pendingSessions.map(s => ({
    req: buildSessionBatchRequest(s),
    sessionId: s.id,
  }));
}

/**
 * Consume batch results, apply answers to session rows, persist, and return
 * a list of sessions that reached "fully answered" state this call — PR 6
 * emits one `regierungsbefragung` / `fragestunde` event per such session.
 */
export function processParliamentaryQABatchResult(
  results: BatchResult[],
  pendingSessions: ParliamentaryQaSession[],
  currentDay: number,
): { answered: ParliamentaryQaSession[] } {
  const db = getDb();
  const answered: ParliamentaryQaSession[] = [];

  for (const session of pendingSessions) {
    const result = results.find(r => r.customId === `parl-qa-${session.id}`);
    const nextAttempt = session.batchAttempts + 1;
    const exhausted = nextAttempt >= PARLIAMENTARY_QA_MAX_BATCH_ATTEMPTS;

    let answers = new Map<string, string>();
    if (result && result.text) {
      answers = parseSessionAnswers(result.text);
      logAICall({
        task: "parliamentary-qa",
        model: result.model,
        provider: result.provider as "anthropic" | "xai",
        latencyMs: 0,
        parseOk: answers.size > 0,
        validationOk: answers.size === session.questions.length,
      });
    }

    const updated = applyAnswersToSession(session, answers, { force: exhausted });
    const allAnswered = updated.questions.every(q => q.answer !== null);
    const answeredOnDay = allAnswered ? currentDay : null;

    db.update(schema.parliamentaryQaSessions)
      .set({
        questions: updated.questions as unknown as string,
        batchAttempts: nextAttempt,
        answeredOnDay,
      })
      .where(eq(schema.parliamentaryQaSessions.id, session.id))
      .run();

    if (allAnswered) {
      answered.push({ ...updated, batchAttempts: nextAttempt, answeredOnDay: currentDay });
    }
  }

  return { answered };
}

/**
 * Load all sessions scheduled for a Sitzungswoche range, used by PR 6's
 * dedup check before calling `persistScheduledSession()`.
 */
export function getSessionsInRange(startDay: number, endDay: number): ParliamentaryQaSession[] {
  const db = getDb();
  const rows = db.select().from(schema.parliamentaryQaSessions)
    .where(and(
      gte(schema.parliamentaryQaSessions.day, startDay),
      lte(schema.parliamentaryQaSessions.day, endDay),
    ))
    .all();
  return rows.map(rowToSession);
}

function rowToSession(row: typeof schema.parliamentaryQaSessions.$inferSelect): ParliamentaryQaSession {
  return {
    id: row.id,
    kind: row.kind as ParliamentaryQaKind,
    day: row.day,
    questions: row.questions as unknown as ParliamentaryQaQuestion[],
    batchRequestId: row.batchRequestId,
    batchAttempts: row.batchAttempts,
    answeredOnDay: row.answeredOnDay,
  };
}
