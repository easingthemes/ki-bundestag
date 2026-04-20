/**
 * Cycle 2b PR 7 — Schriftliche Einzelfragen (counter + template, no AI).
 *
 * Real Bundestag sees ~33 filed/day and ~15 answered/day. Sim emits one
 * `schriftliche_einzelfragen` event per sim day carrying {filedCount,
 * answeredCount, cumulativeFiled, cumulativeAnswered, sampleQuestions}.
 * Sample questions are drawn from the static template pool — zero AI cost.
 *
 * Fires every sim day (not gated on Sitzungstag) because schriftliche
 * Einzelfragen are filed to the Bundestag administration, not the plenum.
 *
 * See `docs/plans/043-cycle2b-spec.md` §Design Piece 5.
 */

import { eq } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";
import {
  SCHRIFTLICHE_EINZELFRAGEN,
  SCHRIFTLICHE_EINZELFRAGE_TEMPLATES,
  type SchriftlicheEinzelfrageTemplate,
} from "../config/parliamentary-qa.js";

export type RNG = () => number;
const defaultRng: RNG = Math.random;

// ── Pure helpers ───────────────────────────────────────────────────────

/**
 * Simple rejection-method Poisson draw (Knuth). Good enough for our λ
 * range — we're not going above 60 in a single draw.
 */
export function poissonDraw(lambda: number, rng: RNG = defaultRng): number {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  // Hard cap at 3*lambda + 20 to prevent infinite loops on pathological RNGs
  const hardCap = Math.ceil(lambda * 3) + 20;
  while (k < hardCap) {
    k++;
    p *= rng();
    if (p <= L) break;
  }
  return k - 1;
}

export function clampedPoisson(mean: number, min: number, max: number, rng: RNG = defaultRng): number {
  const raw = poissonDraw(mean, rng);
  return Math.max(min, Math.min(max, raw));
}

/**
 * Sample N templates from the pool. No weighting this cycle — simple
 * uniform draw. Templates intentionally repeat across days over a long
 * sim (R15 — pool is data, growth is a follow-up).
 */
export function sampleTemplates(n: number, rng: RNG = defaultRng): SchriftlicheEinzelfrageTemplate[] {
  if (SCHRIFTLICHE_EINZELFRAGE_TEMPLATES.length === 0) return [];
  if (n >= SCHRIFTLICHE_EINZELFRAGE_TEMPLATES.length) return [...SCHRIFTLICHE_EINZELFRAGE_TEMPLATES];
  const pool = [...SCHRIFTLICHE_EINZELFRAGE_TEMPLATES];
  const out: SchriftlicheEinzelfrageTemplate[] = [];
  for (let i = 0; i < n; i++) {
    const idx = Math.floor(rng() * pool.length);
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}

export interface SchriftlicheEinzelfragenTickResult {
  filedCount: number;
  answeredCount: number;
  cumulativeFiled: number;
  cumulativeAnswered: number;
  sampleQuestions: SchriftlicheEinzelfrageTemplate[];
}

// ── Tick runner ────────────────────────────────────────────────────────

/**
 * Run one day's tick. Updates `simulation_meta` cumulative counters and
 * returns the event payload. Caller (loop.ts) emits the event.
 */
export function runSchriftlicheEinzelfragenTick(
  rng: RNG = defaultRng,
): SchriftlicheEinzelfragenTickResult {
  const filedCount = clampedPoisson(
    SCHRIFTLICHE_EINZELFRAGEN.filedPerDay.mean,
    SCHRIFTLICHE_EINZELFRAGEN.filedPerDay.min,
    SCHRIFTLICHE_EINZELFRAGEN.filedPerDay.max,
    rng,
  );
  const answeredCount = clampedPoisson(
    SCHRIFTLICHE_EINZELFRAGEN.answeredPerDay.mean,
    SCHRIFTLICHE_EINZELFRAGEN.answeredPerDay.min,
    SCHRIFTLICHE_EINZELFRAGEN.answeredPerDay.max,
    rng,
  );
  const sampleCount = Math.floor(
    rng() * (SCHRIFTLICHE_EINZELFRAGEN.sampleCount.max - SCHRIFTLICHE_EINZELFRAGEN.sampleCount.min + 1),
  ) + SCHRIFTLICHE_EINZELFRAGEN.sampleCount.min;
  const sampleQuestions = sampleTemplates(sampleCount, rng);

  // Update cumulative counters on simulation_meta. First row only — the
  // table is single-row by convention (see seed.ts).
  const db = getDb();
  const metaRow = db.select().from(schema.simulationMeta).get();
  const prevFiled = metaRow?.schriftlicheEinzelfragenFiledTotal ?? 0;
  const prevAnswered = metaRow?.schriftlicheEinzelfragenAnsweredTotal ?? 0;
  const cumulativeFiled = prevFiled + filedCount;
  const cumulativeAnswered = prevAnswered + answeredCount;

  if (metaRow) {
    db.update(schema.simulationMeta)
      .set({
        schriftlicheEinzelfragenFiledTotal: cumulativeFiled,
        schriftlicheEinzelfragenAnsweredTotal: cumulativeAnswered,
      })
      .where(eq(schema.simulationMeta.id, metaRow.id))
      .run();
  }

  return {
    filedCount,
    answeredCount,
    cumulativeFiled,
    cumulativeAnswered,
    sampleQuestions,
  };
}
