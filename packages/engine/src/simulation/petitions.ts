/**
 * Cycle 2b PR 8 — Petitions (öffentliche E-Petitionen).
 *
 * Daily tick: spawn + signature growth + quorum resolution. Signature
 * growth is deterministic-logistic with salience boosts from active
 * crises and recently-proposed bills. Petitions that cross the 30k
 * quorum enter a 7-day Petitionsausschuss dwell, then resolve to
 * `debated` (35%) or `rejected` (65%). Petitions that don't cross
 * quorum within 28 days expire silently.
 *
 * No AI — everything is deterministic under a seeded RNG (R13).
 *
 * See `docs/plans/043-cycle2b-spec.md` §Design Piece 6.
 */

import type { BillCategory, Crisis } from "@ki-bundestag/types";
import { and, eq, lte, desc } from "drizzle-orm";
import { getDb, schema } from "../db/index.js";
import {
  PETITION_QUORUM,
  PETITION_PUBLIC_WINDOW_DAYS,
  PETITION_SPAWN_INTERVAL_DAYS,
  PETITION_INITIAL_SIGNATURES,
  PETITION_GROWTH_RATE,
  PETITION_CRISIS_SALIENCE_BONUS,
  PETITION_ACTIVE_BILL_SALIENCE_BONUS,
  PETITION_COMMITTEE_DWELL_DAYS,
  PETITION_COMMITTEE_OUTCOMES,
  PETITION_TEMPLATES,
  PETITION_AUTHOR_NAMES,
} from "../config/petitions.js";

// ── Types ──────────────────────────────────────────────────────────────

export type PetitionStatus = "collecting" | "quorum_reached" | "debated" | "rejected" | "expired";
export type PetitionOutcome = "accepted" | "rejected";

export interface Petition {
  id: string;
  title: string;
  description: string;
  category: BillCategory;
  authorDisplayName: string;
  startedOnDay: number;
  publicWindowEndDay: number;
  signatureCount: number;
  signatureQuorum: number;
  status: PetitionStatus;
  quorumReachedOnDay: number | null;
  debatedOnDay: number | null;
  outcome: PetitionOutcome | null;
}

export type RNG = () => number;
const defaultRng: RNG = Math.random;

function generateId(): string {
  return Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}

function rngInt(rng: RNG, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

// ── Pure helpers ───────────────────────────────────────────────────────

/**
 * Logistic growth tick. Caller passes the petition's current signature
 * count + salience factor (1.0 = baseline; 1.6 = one matching crisis;
 * 2.0+ capped). Returns the new count, capped at signatureQuorum.
 *
 * Formula: next = current + rate * current * (1 - current/cap) * salience
 * Plus a small additive term to bootstrap petitions that are still far
 * below quorum (otherwise very-low-signature petitions barely grow).
 */
export function logisticGrowthTick(
  current: number,
  cap: number,
  salience: number,
  rng: RNG = defaultRng,
): number {
  // Right-skewed momentum (u^2 * scale): most days yield low growth,
  // occasional viral spikes. Produces a naturally-bimodal distribution
  // across many petitions — the goal is ~30% reaching quorum at baseline
  // salience, the rest expiring.
  const u = rng();
  const momentum = Math.pow(u, 2.5) * 3.0;
  const logistic = Math.floor(
    PETITION_GROWTH_RATE * current * (1 - current / cap) * Math.max(0.1, salience) * momentum,
  );
  // Tiny bootstrap 0-25/day so no petition stalls at zero but it doesn't
  // dominate growth.
  const bootstrap = Math.floor(rng() * 26);
  const next = current + bootstrap + Math.max(0, logistic);
  return Math.min(cap, Math.max(0, next));
}

/**
 * Salience factor: 1.0 + bonuses for matching active crises and recent bills.
 * Capped at 2.5 to prevent runaway growth on heavily-crisis-stacked petitions.
 */
export function computeSalience(
  petition: Petition,
  activeCrises: Crisis[],
  recentBillCategories: BillCategory[],
): number {
  let salience = 1.0;
  for (const c of activeCrises) {
    if (c.category === petition.category) salience += PETITION_CRISIS_SALIENCE_BONUS;
  }
  if (recentBillCategories.includes(petition.category)) {
    salience += PETITION_ACTIVE_BILL_SALIENCE_BONUS;
  }
  return Math.min(2.5, salience);
}

/**
 * Pick a petition template + author. Pure.
 */
export function pickTemplate(rng: RNG = defaultRng): { template: typeof PETITION_TEMPLATES[number]; author: string } {
  const template = PETITION_TEMPLATES[Math.floor(rng() * PETITION_TEMPLATES.length)];
  const author = PETITION_AUTHOR_NAMES[Math.floor(rng() * PETITION_AUTHOR_NAMES.length)];
  return { template, author };
}

/**
 * Roll Petitionsausschuss outcome. Returns `accepted` or `rejected` per
 * the distribution in PETITION_COMMITTEE_OUTCOMES.
 */
export function rollCommitteeOutcome(rng: RNG = defaultRng): PetitionOutcome {
  return rng() < PETITION_COMMITTEE_OUTCOMES.accepted ? "accepted" : "rejected";
}

// ── DB-touching wrappers ───────────────────────────────────────────────

/**
 * Returns the day number of the most recently spawned petition (for spawn
 * cadence calc). -Infinity if none exist.
 */
export function lastPetitionSpawnDay(): number {
  const db = getDb();
  const row = db.select().from(schema.petitions)
    .orderBy(desc(schema.petitions.startedOnDay))
    .limit(1)
    .get();
  return row?.startedOnDay ?? -Infinity;
}

/**
 * Spawn a new petition if the interval since the last spawn has elapsed.
 * Returns the new Petition or null if it's too soon.
 */
export function maybeSpawnPetition(day: number, rng: RNG = defaultRng): Petition | null {
  const last = lastPetitionSpawnDay();
  const sinceLast = day - (last === -Infinity ? (day - PETITION_SPAWN_INTERVAL_DAYS.max) : last);
  const interval = rngInt(rng, PETITION_SPAWN_INTERVAL_DAYS.min, PETITION_SPAWN_INTERVAL_DAYS.max);
  if (sinceLast < interval) return null;

  const { template, author } = pickTemplate(rng);
  const initial = rngInt(rng, PETITION_INITIAL_SIGNATURES.min, PETITION_INITIAL_SIGNATURES.max);
  const petition: Petition = {
    id: `pet-${generateId()}`,
    title: template.title,
    description: template.description,
    category: template.category,
    authorDisplayName: author,
    startedOnDay: day,
    publicWindowEndDay: day + PETITION_PUBLIC_WINDOW_DAYS,
    signatureCount: initial,
    signatureQuorum: PETITION_QUORUM,
    status: "collecting",
    quorumReachedOnDay: null,
    debatedOnDay: null,
    outcome: null,
  };

  const db = getDb();
  db.insert(schema.petitions).values({
    id: petition.id,
    title: petition.title,
    description: petition.description,
    category: petition.category,
    authorDisplayName: petition.authorDisplayName,
    startedOnDay: petition.startedOnDay,
    publicWindowEndDay: petition.publicWindowEndDay,
    signatureCount: petition.signatureCount,
    signatureQuorum: petition.signatureQuorum,
    status: petition.status,
    quorumReachedOnDay: petition.quorumReachedOnDay,
    debatedOnDay: petition.debatedOnDay,
    outcome: petition.outcome,
  }).run();

  return petition;
}

/**
 * Tick all collecting petitions. Increments signatures via logistic
 * growth, transitions to `quorum_reached` if count >= quorum, else to
 * `expired` if publicWindowEndDay has elapsed.
 */
export function tickPetitionSignatures(
  day: number,
  activeCrises: Crisis[],
  recentBillCategories: BillCategory[],
  rng: RNG = defaultRng,
): { advanced: number; quorumReached: Petition[]; expired: Petition[] } {
  const db = getDb();
  const rows = db.select().from(schema.petitions)
    .where(eq(schema.petitions.status, "collecting"))
    .all();

  const quorumReached: Petition[] = [];
  const expired: Petition[] = [];
  let advanced = 0;

  for (const row of rows) {
    const petition = rowToPetition(row);

    // Grow signatures first.
    const salience = computeSalience(petition, activeCrises, recentBillCategories);
    const nextCount = logisticGrowthTick(petition.signatureCount, petition.signatureQuorum, salience, rng);
    advanced++;

    // Check for quorum crossing.
    if (nextCount >= petition.signatureQuorum) {
      db.update(schema.petitions)
        .set({
          signatureCount: nextCount,
          status: "quorum_reached",
          quorumReachedOnDay: day,
        })
        .where(eq(schema.petitions.id, petition.id))
        .run();
      quorumReached.push({ ...petition, signatureCount: nextCount, status: "quorum_reached", quorumReachedOnDay: day });
      continue;
    }

    // Check for window expiry.
    if (day >= petition.publicWindowEndDay) {
      db.update(schema.petitions)
        .set({ signatureCount: nextCount, status: "expired" })
        .where(eq(schema.petitions.id, petition.id))
        .run();
      expired.push({ ...petition, signatureCount: nextCount, status: "expired" });
      continue;
    }

    // Plain tick — persist the bump.
    db.update(schema.petitions)
      .set({ signatureCount: nextCount })
      .where(eq(schema.petitions.id, petition.id))
      .run();
  }

  return { advanced, quorumReached, expired };
}

/**
 * Resolve petitions that have been in `quorum_reached` state for
 * >= PETITION_COMMITTEE_DWELL_DAYS sim days. Each rolls to `debated`
 * (outcome accepted/rejected) or `rejected` (outcome rejected).
 */
export function resolveQuorumReachedPetitions(
  day: number,
  rng: RNG = defaultRng,
): { debated: Petition[]; rejected: Petition[] } {
  const db = getDb();
  const rows = db.select().from(schema.petitions)
    .where(and(
      eq(schema.petitions.status, "quorum_reached"),
      lte(schema.petitions.quorumReachedOnDay, day - PETITION_COMMITTEE_DWELL_DAYS),
    ))
    .all();

  const debated: Petition[] = [];
  const rejected: Petition[] = [];

  for (const row of rows) {
    const petition = rowToPetition(row);
    const outcome = rollCommitteeOutcome(rng);
    const nextStatus: PetitionStatus = outcome === "accepted" ? "debated" : "rejected";

    db.update(schema.petitions)
      .set({
        status: nextStatus,
        debatedOnDay: outcome === "accepted" ? day : null,
        outcome,
      })
      .where(eq(schema.petitions.id, petition.id))
      .run();

    const resolved: Petition = {
      ...petition,
      status: nextStatus,
      debatedOnDay: outcome === "accepted" ? day : null,
      outcome,
    };
    if (outcome === "accepted") debated.push(resolved);
    else rejected.push(resolved);
  }

  return { debated, rejected };
}

/**
 * Convenience reader — list all petitions, newest first.
 */
export function listPetitions(limit = 100): Petition[] {
  const db = getDb();
  const rows = db.select().from(schema.petitions)
    .orderBy(desc(schema.petitions.startedOnDay))
    .limit(limit)
    .all();
  return rows.map(rowToPetition);
}

/**
 * Single petition detail.
 */
export function getPetition(id: string): Petition | null {
  const db = getDb();
  const row = db.select().from(schema.petitions)
    .where(eq(schema.petitions.id, id))
    .get();
  return row ? rowToPetition(row) : null;
}

function rowToPetition(row: typeof schema.petitions.$inferSelect): Petition {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category as BillCategory,
    authorDisplayName: row.authorDisplayName,
    startedOnDay: row.startedOnDay,
    publicWindowEndDay: row.publicWindowEndDay,
    signatureCount: row.signatureCount,
    signatureQuorum: row.signatureQuorum,
    status: row.status as PetitionStatus,
    quorumReachedOnDay: row.quorumReachedOnDay,
    debatedOnDay: row.debatedOnDay,
    outcome: (row.outcome as PetitionOutcome | null) ?? null,
  };
}
