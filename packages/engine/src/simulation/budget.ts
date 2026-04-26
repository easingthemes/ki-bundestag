import type { BillCategory, BudgetAllocations, BudgetVote, BillImpact, Crisis, CrisisSeverity, EconomyState, Government, NationalState, Party, PendingInjection, SimulationEvent, Bill } from "@ki-bundestag/types";
import {
  BUDGET_TOTAL, PARTY_MINISTRY_WEIGHTS, BUDGET_REVISION_CENTRIST_SHIFT,
  BUDGET_VOTE_TIERS, BUDGET_REVISION_BOOST,
  BUDGET_LABOUR_HEALTH_THRESHOLD, BUDGET_LABOUR_HEALTH_UNEMPLOYMENT_EFFECT,
  BUDGET_FINANCE_INFRA_THRESHOLD, BUDGET_FINANCE_INFRA_GDP_EFFECT,
  BUDGET_ENVIRONMENT_THRESHOLD, BUDGET_ENVIRONMENT_INFLATION_EFFECT,
  BUDGET_DEFENCE_THRESHOLD, BUDGET_DEFENCE_GDP_EFFECT,
  PRESIDENTIAL_VETO_IMPACT_THRESHOLD, PRESIDENTIAL_VETO_PROBABILITY,
  VETO_REASONS,
  SCHULDENBREMSE_SUSPENSION_DURATION,
  SCHULDENBREMSE_COALITION_YES_RATE,
  SCHULDENBREMSE_OPPOSITION_YES_BASE,
  SCHULDENBREMSE_SEVERITY_BOOSTS,
  SCHULDENBREMSE_OPPOSITION_YES_CAP,
  FISCAL_EMERGENCY_PROVISIONAL_BUDGET_DAYS,
  NACHTRAGSHAUSHALT_TOTAL_MIN,
  NACHTRAGSHAUSHALT_TOTAL_MAX,
  NACHTRAGSHAUSHALT_CRISIS_BOOST,
} from "../config/index.js";
// S14 / R12: renamed from CRISIS_CATEGORY_TO_MINISTRY (Cycle 5 PR 1).
// Same map content; new name reflects that it serves bills + crises.
import { BILL_CATEGORY_TO_MINISTRY } from "../config/parliament.js";
import { getDb, getSqlite, schema } from "../db/index.js";
import { eq } from "drizzle-orm";
import { MAJORITY_SEATS } from "../config/elections.js";

// Re-export for external consumers
export { BUDGET_TOTAL } from "../config/index.js";

const MINISTRY_KEYS: (keyof BudgetAllocations)[] = [
  "finance", "labour", "environment", "interior", "defence", "education", "health", "infrastructure",
];

/**
 * Generate budget allocations as a coalition-weighted average of party spending priorities.
 * Returns absolute amounts in billions EUR.
 */
export function generateBudgetAllocations(coalitionParties: Party[]): BudgetAllocations {
  if (coalitionParties.length === 0) {
    const equal = BUDGET_TOTAL / 8;
    return MINISTRY_KEYS.reduce((acc, k) => ({ ...acc, [k]: equal }), {} as BudgetAllocations);
  }

  const totalSeats = coalitionParties.reduce((s, p) => s + p.seatCount, 0);

  // Weighted average of ministry weight shares
  const weightedShares: BudgetAllocations = { finance: 0, labour: 0, environment: 0, interior: 0, defence: 0, education: 0, health: 0, infrastructure: 0 };
  for (const party of coalitionParties) {
    const weights = PARTY_MINISTRY_WEIGHTS[party.id] ?? { finance: 0.125, labour: 0.125, environment: 0.125, interior: 0.125, defence: 0.125, education: 0.125, health: 0.125, infrastructure: 0.125 };
    const seatShare = party.seatCount / totalSeats;
    for (const k of MINISTRY_KEYS) {
      weightedShares[k] += weights[k] * seatShare;
    }
  }

  // Normalize so shares sum to 1.0 then multiply by total
  const shareSum = MINISTRY_KEYS.reduce((s, k) => s + weightedShares[k], 0);
  const allocations: BudgetAllocations = { finance: 0, labour: 0, environment: 0, interior: 0, defence: 0, education: 0, health: 0, infrastructure: 0 };
  for (const k of MINISTRY_KEYS) {
    allocations[k] = Math.round((weightedShares[k] / shareSum) * BUDGET_TOTAL * 10) / 10;
  }

  return allocations;
}

/**
 * Tally algorithmic budget vote.
 * Coalition yes rate scales with public sentiment. Opposition rate is inverse.
 * When isRevision=true (retry after rejection), coalition gets +5pp boost.
 *
 * `rng` parameter (Cycle 4 PR 4) accepts a seeded RNG for deterministic
 * tests. Defaults to `Math.random` in production. Existing callers continue
 * to omit it; new callers (processNachtragsInjection) pass it through.
 */
export function tallyBudgetVote(
  allParties: Party[],
  coalitionIds: string[],
  publicSentiment: number,
  isRevision = false,
  rng: () => number = Math.random,
): {
  votes: BudgetVote[];
  yesSeats: number;
  noSeats: number;
  passed: boolean;
} {
  let coalitionYesRate: number = BUDGET_VOTE_TIERS[BUDGET_VOTE_TIERS.length - 1][1];
  let oppositionYesRate: number = BUDGET_VOTE_TIERS[BUDGET_VOTE_TIERS.length - 1][2];

  for (const [floor, coalRate, oppRate] of BUDGET_VOTE_TIERS) {
    if (publicSentiment > floor) {
      coalitionYesRate = coalRate;
      oppositionYesRate = oppRate;
      break;
    }
  }

  if (isRevision) coalitionYesRate = Math.min(0.99, coalitionYesRate + BUDGET_REVISION_BOOST);

  const votes: BudgetVote[] = [];
  let yesSeats = 0;
  let noSeats = 0;

  for (const party of allParties) {
    const isCoalition = coalitionIds.includes(party.id);
    const voteChoice: "yes" | "no" = rng() < (isCoalition ? coalitionYesRate : oppositionYesRate)
      ? "yes" : "no";
    votes.push({ partyId: party.id, vote: voteChoice, seats: party.seatCount });
    if (voteChoice === "yes") yesSeats += party.seatCount;
    else noSeats += party.seatCount;
  }

  return { votes, yesSeats, noSeats, passed: yesSeats > noSeats };
}

/**
 * Generate revised budget allocations — 3% centrist shift toward equal distribution.
 * Used for the renegotiation attempt after a first-vote rejection.
 */
export function generateRevisedAllocations(coalitionParties: Party[]): BudgetAllocations {
  const base = generateBudgetAllocations(coalitionParties);
  const equalShare = BUDGET_TOTAL / 8;
  const shift = BUDGET_REVISION_CENTRIST_SHIFT;
  const result = {} as BudgetAllocations;
  for (const k of MINISTRY_KEYS) {
    result[k] = Math.round((base[k] * (1 - shift) + equalShare * shift) * 10) / 10;
  }
  return result;
}

/**
 * Apply economic effects of a passed budget based on ministry allocations.
 */
export function applyBudgetEconomicEffect(
  economy: EconomyState,
  allocations: BudgetAllocations,
): { economy: EconomyState; effect: Record<string, number> } {
  const newEconomy = { ...economy };
  const effect: Record<string, number> = {};

  const labourShare = allocations.labour / BUDGET_TOTAL;
  const healthShare = allocations.health / BUDGET_TOTAL;
  const financeShare = allocations.finance / BUDGET_TOTAL;
  const infrastructureShare = allocations.infrastructure / BUDGET_TOTAL;
  const environmentShare = allocations.environment / BUDGET_TOTAL;
  const defenceShare = allocations.defence / BUDGET_TOTAL;

  if (labourShare + healthShare > BUDGET_LABOUR_HEALTH_THRESHOLD) {
    newEconomy.unemployment = clamp(Math.round((newEconomy.unemployment + BUDGET_LABOUR_HEALTH_UNEMPLOYMENT_EFFECT) * 100) / 100, 0, 20);
    effect.unemployment = BUDGET_LABOUR_HEALTH_UNEMPLOYMENT_EFFECT;
  }

  if (financeShare + infrastructureShare > BUDGET_FINANCE_INFRA_THRESHOLD) {
    newEconomy.gdpGrowth = clamp(Math.round((newEconomy.gdpGrowth + BUDGET_FINANCE_INFRA_GDP_EFFECT) * 100) / 100, -5, 10);
    effect.gdpGrowth = BUDGET_FINANCE_INFRA_GDP_EFFECT;
  }

  if (environmentShare > BUDGET_ENVIRONMENT_THRESHOLD) {
    newEconomy.inflation = clamp(Math.round((newEconomy.inflation + BUDGET_ENVIRONMENT_INFLATION_EFFECT) * 100) / 100, 0, 20);
    effect.inflation = BUDGET_ENVIRONMENT_INFLATION_EFFECT;
  }

  if (defenceShare > BUDGET_DEFENCE_THRESHOLD) {
    newEconomy.gdpGrowth = clamp(Math.round((newEconomy.gdpGrowth + BUDGET_DEFENCE_GDP_EFFECT) * 100) / 100, -5, 10);
    effect.gdpGrowth = (effect.gdpGrowth ?? 0) + BUDGET_DEFENCE_GDP_EFFECT;
  }

  return { economy: newEconomy, effect };
}

/**
 * Presidential veto check (Cycle 3 PR 1).
 *
 * Two-stage filter:
 *   1. Impact gate — `summedImpact = Σ |bill.impact[k]|` must reach
 *      PRESIDENTIAL_VETO_IMPACT_THRESHOLD. Below it, the Bundespräsident
 *      cannot veto (matches reality: only constitutional-stakes bills get
 *      vetoed).
 *   2. Capped probability — above the gate, roll PRESIDENTIAL_VETO_PROBABILITY
 *      (0.05%). Calibrated to match the real ≈0.04% lifetime rate.
 *
 * `rng` parameter accepts a seeded RNG for tests; defaults to Math.random
 * in production (consistent with the rest of the codebase per Cycle 2b S10).
 */
export function shouldPresidentVeto(
  bill: Bill,
  rng: () => number = Math.random,
): { veto: boolean; reason: string } {
  const impact = bill.impact as BillImpact | undefined;
  // Skip non-finite values (NaN poisons the comparison — `NaN < 0.6` is false,
  // so a single corrupt field would silently keep the gate open; Infinity
  // would always trip the gate). Bill impacts come from agent-parsed JSON,
  // so defending the boundary is cheap and worth it.
  const summedImpact = impact
    ? Object.values(impact).reduce((s, v) => {
        const n = v ?? 0;
        return Number.isFinite(n) ? s + Math.abs(n) : s;
      }, 0)
    : 0;

  if (summedImpact < PRESIDENTIAL_VETO_IMPACT_THRESHOLD) {
    return { veto: false, reason: "" };
  }

  const veto = rng() < PRESIDENTIAL_VETO_PROBABILITY;
  if (!veto) return { veto: false, reason: "" };

  const reason = VETO_REASONS[Math.floor(rng() * VETO_REASONS.length)];
  return { veto: true, reason };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ── Cycle 4 PR 2 — Schuldenbremse-Aussetzung helpers ────────────────────

/** Result returned by tallySchuldenbremseVote (S12). */
export interface SchuldenbremseVoteResult {
  yesVotes: number;
  noVotes: number;
  passed: boolean;
}

/**
 * S12: simple-majority vote tally for Schuldenbremse-Aussetzung. One-shot
 * (no revision concept — unlike tallyBudgetVote).
 *
 * Coalition typically yes (`SCHULDENBREMSE_COALITION_YES_RATE`); opposition
 * yes share scales with public sentiment + crisis severity. Each Fraktion-
 * bearing party rolls a Bernoulli — if yes, ALL the party's seats count yes
 * (matches the codebase's whole-party voting model).
 *
 * Pure: accepts a seeded RNG for tests. Production uses Math.random.
 *
 * R2 caveat: real Bundestag requires QUALIFIED majority for Art. 115 GG
 * suspension. We use simple majority as a pragmatic simplification (no
 * qualified-majority primitive in the engine yet). Documented in the
 * spec's Open Items as a Cycle 5+ refinement.
 */
export function tallySchuldenbremseVote(
  parties: Party[],
  coalitionPartyIds: string[],
  publicSentiment: number,
  crisisSeverity: CrisisSeverity | null,
  rng: () => number = Math.random,
): SchuldenbremseVoteResult {
  const sentimentAdj = (publicSentiment - 45) / 100; // [-0.40, +0.30] over [5, 75]
  const severityAdj = crisisSeverity ? SCHULDENBREMSE_SEVERITY_BOOSTS[crisisSeverity] : 0;
  const oppositionYesShare = Math.min(
    SCHULDENBREMSE_OPPOSITION_YES_CAP,
    Math.max(0, SCHULDENBREMSE_OPPOSITION_YES_BASE + sentimentAdj + severityAdj),
  );

  const coalitionSet = new Set(coalitionPartyIds);
  let yesVotes = 0;
  let noVotes = 0;
  for (const p of parties) {
    if (p.seatCount <= 0) continue;
    const yesProb = coalitionSet.has(p.id)
      ? SCHULDENBREMSE_COALITION_YES_RATE
      : oppositionYesShare;
    if (rng() < yesProb) yesVotes += p.seatCount;
    else noVotes += p.seatCount;
  }
  return { yesVotes, noVotes, passed: yesVotes >= MAJORITY_SEATS };
}

/**
 * S3: applies the suspension flag + sets expiry on simulation_meta.
 * Idempotent — re-filing while already suspended extends the expiry day
 * (annual re-declaration matches real-world Bundestag practice).
 */
export function applySchuldenbremseAussetzung(currentDay: number): void {
  const expiryDay = currentDay + SCHULDENBREMSE_SUSPENSION_DURATION;
  const meta = getDb().select().from(schema.simulationMeta).get();
  if (!meta) throw new Error("simulation_meta row missing");
  getSqlite().transaction(() => {
    getDb().update(schema.nationalState)
      .set({ schuldenbremseSuspended: true })
      .run();
    getDb().update(schema.simulationMeta)
      .set({ schuldenbremseSuspendedUntilDay: expiryDay })
      .where(eq(schema.simulationMeta.id, meta.id))
      .run();
  })();
}

/**
 * S22 (Cycle 5 PR 3) — pure-helper variant of `checkSchuldenbremseExpiry`.
 *
 * Closes the Cycle 4 silent-restore gap. The previous helper mutated DB
 * state in-place and returned a bool; the caller had no way to emit a
 * narrative event. This variant takes minimal slices of state + meta,
 * mutates `state.schuldenbremseSuspended` in-place, and returns the event
 * for the caller to persist + emit (loop.ts owns the DB write under
 * `simulationMeta.id` per PR #165 R2).
 *
 * No-op (returns `expired: false`, no event) when:
 *   - `state.schuldenbremseSuspended` is already false, OR
 *   - `meta.schuldenbremseSuspendedUntilDay` is null (no expiry recorded), OR
 *   - `currentDay < meta.schuldenbremseSuspendedUntilDay` (not yet expired).
 *
 * Pure: no DB writes. Caller persists via Drizzle update with WHERE clause.
 */
export function applySchuldenbremseExpiry(
  state: { schuldenbremseSuspended?: boolean },
  meta: { schuldenbremseSuspendedUntilDay: number | null },
  currentDay: number,
): { expired: boolean; event?: Omit<SimulationEvent, "id"> } {
  if (!state.schuldenbremseSuspended) return { expired: false };
  if (meta.schuldenbremseSuspendedUntilDay == null) return { expired: false };
  if (currentDay < meta.schuldenbremseSuspendedUntilDay) return { expired: false };

  state.schuldenbremseSuspended = false;
  return {
    expired: true,
    event: {
      dayNumber: currentDay,
      type: "schuldenbremse_expired",
      actor: "system",
      title: "Schuldenbremse wieder aktiv",
      description: `Die nach Art. 115 GG ausgesetzte Schuldenbremse ist nach ${SCHULDENBREMSE_SUSPENSION_DURATION} Tagen automatisch wieder in Kraft getreten.`,
      data: { suspendedUntilDay: meta.schuldenbremseSuspendedUntilDay },
    },
  };
}

/**
 * Q9 daily check. Auto-clears the suspension when the expiry day arrives.
 * Returns true if the flag was cleared this tick (caller may emit an event,
 * though the spec keeps the auto-restore moment silent — Open Item).
 *
 * Cycle 5 PR 3 (S22): superseded by `applySchuldenbremseExpiry` for new
 * call paths that need to emit a `schuldenbremse_expired` event. This helper
 * is retained for tests + any caller that just needs a bool ack.
 *
 * No-op when:
 *   - schuldenbremseSuspendedUntilDay is null (not suspended), OR
 *   - currentDay < expiry.
 */
export function checkSchuldenbremseExpiry(currentDay: number): boolean {
  const meta = getSqlite()
    .prepare("SELECT id, schuldenbremse_suspended_until_day FROM simulation_meta LIMIT 1")
    .get() as { id: number; schuldenbremse_suspended_until_day: number | null } | undefined;
  if (!meta || meta.schuldenbremse_suspended_until_day == null) return false;
  if (currentDay < meta.schuldenbremse_suspended_until_day) return false;

  getSqlite().transaction(() => {
    getDb().update(schema.nationalState)
      .set({ schuldenbremseSuspended: false })
      .run();
    getDb().update(schema.simulationMeta)
      .set({ schuldenbremseSuspendedUntilDay: null })
      .where(eq(schema.simulationMeta.id, meta.id))
      .run();
  })();
  return true;
}

/**
 * Q5 / R5 heuristic: returns the populated AgentContext flag when the
 * coalition leader has a justifiable case to propose Schuldenbremse-Aussetzung.
 *
 * Two paths:
 *   1. Active high-severity crisis (any category) — populated with `activeCrisisId`.
 *   2. provisionalBudget streak ≥ FISCAL_EMERGENCY_PROVISIONAL_BUDGET_DAYS days.
 *
 * Returns null when neither holds — coalition leader cannot file.
 *
 * Pure: takes the relevant slices of state directly so the helper is
 * unit-testable without a DB. Loop computes `provisionalBudgetSinceDay`
 * once per day and passes it in.
 */
export function findFiscalEmergencyOpportunity(
  crises: Crisis[],
  state: { provisionalBudget: boolean; schuldenbremseSuspended?: boolean },
  provisionalBudgetSinceDay: number | null,
  currentDay: number,
): { activeCrisisId?: string; provisionalBudgetDays: number } | null {
  // Already suspended → no point in opening the gate again. (Re-filing is
  // technically allowed for expiry-extension but the agent prompt only
  // surfaces the flag when there's a reason to file in the first place.)
  if (state.schuldenbremseSuspended) return null;

  const provisionalDays = state.provisionalBudget && provisionalBudgetSinceDay != null
    ? Math.max(0, currentDay - provisionalBudgetSinceDay)
    : 0;

  // Path 1: high-severity crisis trumps everything.
  const highSeverity = crises.find(c => c.severity === "high" && !c.resolved);
  if (highSeverity) {
    return { activeCrisisId: highSeverity.id, provisionalBudgetDays: provisionalDays };
  }

  // Path 2: provisional-budget streak.
  if (provisionalDays >= FISCAL_EMERGENCY_PROVISIONAL_BUDGET_DAYS) {
    return { provisionalBudgetDays: provisionalDays };
  }

  return null;
}

// ── Cycle 4 PR 3 — Nachtragshaushalt (supplementary budget) ─────────────

/**
 * S13/S4: generate ministry-keyed allocations for a Nachtragshaushalt.
 * Crisis-weighted: the ministry mapped to the active crisis category gets
 * a `+NACHTRAGSHAUSHALT_CRISIS_BOOST` (30%) absolute boost on top of its
 * base coalition share; remaining ministries scale down proportionally to
 * keep the total at `total` (no extra spending beyond what was authorized).
 *
 * R4: this is the ONLY entry point for Nachtragshaushalt allocation.
 *     Regular budget cycle uses `generateBudgetAllocations()`;
 *     never call this from the `isBudgetDay()` flow.
 *
 * Pure: no DB. Caller is `processNachtragsInjection`.
 */
export function generateNachtragsAllocations(
  coalitionParties: Party[],
  crisisCategory: BillCategory | null,
  total: number,
): BudgetAllocations {
  // Start from coalition-weighted base allocation (same shape as regular budget,
  // just scaled to `total` instead of BUDGET_TOTAL). Raw (unrounded) shares
  // are kept for the carry-the-remainder pass below (S23/R5).
  const baseFromCoalition = generateBudgetAllocations(coalitionParties);
  const scale = total / BUDGET_TOTAL;
  const baseRaw: Record<keyof BudgetAllocations, number> = {
    finance: 0, labour: 0, environment: 0, interior: 0,
    defence: 0, education: 0, health: 0, infrastructure: 0,
  };
  for (const k of MINISTRY_KEYS) baseRaw[k] = baseFromCoalition[k] * scale;

  // S23/R5: pick the raw (unrounded) shares before this point; the
  // carry-the-remainder pass below rounds the first 7 to 0.1B EUR and
  // assigns the last ministry `total - sum(first 7)` so Σ === total exactly.
  const finalRaw: Record<keyof BudgetAllocations, number> = { ...baseRaw };

  const boostedMinistry = crisisCategory ? BILL_CATEGORY_TO_MINISTRY[crisisCategory] : null;
  if (boostedMinistry) {
    // Boost target by `total * boost-rate` (so 30% of total goes extra to
    // the mapped ministry); rescale all OTHER ministries proportionally to
    // keep raw sum == total. Note we boost relative to TOTAL, not the
    // ministry's base share, so the boost magnitude is predictable regardless
    // of base weights.
    const boostDelta = total * NACHTRAGSHAUSHALT_CRISIS_BOOST;
    const newBoostedAmount = baseRaw[boostedMinistry] + boostDelta;
    const remainingTotal = total - newBoostedAmount;
    const otherSum = MINISTRY_KEYS
      .filter(k => k !== boostedMinistry)
      .reduce((s, k) => s + baseRaw[k], 0);

    finalRaw[boostedMinistry] = newBoostedAmount;
    for (const k of MINISTRY_KEYS) {
      if (k === boostedMinistry) continue;
      finalRaw[k] = otherSum > 0 ? (baseRaw[k] / otherSum) * remainingTotal : 0;
    }
  }

  return carryTheRemainder(finalRaw, total);
}

/**
 * S23/R5 — carry-the-remainder rounding. Round first 7 ministries to 0.1B EUR
 * each, last ministry gets `total - sum(first7)` so Σ === total exactly
 * (modulo IEEE-754 precision; tests use `toBeCloseTo(total, 6)`).
 *
 * Closes the floating-point drift from the previous per-ministry independent
 * `Math.round(x * 10) / 10` pattern. Pure helper, no allocation.
 */
function carryTheRemainder(
  raw: Record<keyof BudgetAllocations, number>,
  total: number,
): BudgetAllocations {
  const result: BudgetAllocations = {
    finance: 0, labour: 0, environment: 0, interior: 0,
    defence: 0, education: 0, health: 0, infrastructure: 0,
  };
  let runningSum = 0;
  for (let i = 0; i < MINISTRY_KEYS.length - 1; i++) {
    const k = MINISTRY_KEYS[i];
    const rounded = Math.round(raw[k] * 10) / 10; // 0.1B EUR precision
    result[k] = rounded;
    runningSum += rounded;
  }
  // Last ministry carries the residual exactly — NOT rounded to 0.1B; that
  // would re-introduce drift. With first-7 rounded to 0.1B and inputs that
  // are 0.1B-aligned, the residual lands at 0.1B granularity naturally
  // (modulo IEEE-754 precision). The Σ === total invariant test asserts
  // closeness to 1e-6.
  const lastKey = MINISTRY_KEYS[MINISTRY_KEYS.length - 1];
  result[lastKey] = total - runningSum;
  return result;
}

/**
 * Consumes a `pending_injections` row of type "nachtragshaushalt".
 *
 * Generates allocations, runs the existing `tallyBudgetVote()` (no separate
 * Nachtrag-specific tally — coalition discipline + opposition behavior is
 * already encoded there), applies economic effect on pass.
 *
 * Mutates `state.economy` and `state.publicSentiment` in-memory; loop.ts
 * persists at end-of-day. Returns events to push into dayEvents.
 *
 * Pure-ish (no DB writes other than via the injected `state`/`parties`):
 * fully testable with vi.mock for `getDb`. Crisis lookup is done by id
 * via the passed `crises` array (not via DB).
 */
export function processNachtragsInjection(
  injection: PendingInjection & { type: "nachtragshaushalt" },
  parties: Party[],
  government: Government,
  state: NationalState,
  crises: Crisis[],
  currentDay: number,
  rng: () => number = Math.random,
): Array<Omit<SimulationEvent, "id">> {
  const events: Array<Omit<SimulationEvent, "id">> = [];

  const total = NACHTRAGSHAUSHALT_TOTAL_MIN
    + Math.floor(rng() * (NACHTRAGSHAUSHALT_TOTAL_MAX - NACHTRAGSHAUSHALT_TOTAL_MIN + 1));
  // S24/R10: typed `NachtragsInjectionPayload` — no `as any` needed. The
  // discriminant on the parameter type narrows `data` to the payload shape.
  const activeCrisisId = injection.data.activeCrisisId;
  const triggerCrisis = activeCrisisId
    ? crises.find(c => c.id === activeCrisisId) ?? null
    : null;
  const crisisCategory = triggerCrisis?.category ?? null;

  const coalitionParties = parties.filter(p => state.coalitionParties.includes(p.id));
  const allocations = generateNachtragsAllocations(coalitionParties, crisisCategory, total);

  events.push({
    dayNumber: currentDay,
    type: "nachtragshaushalt_proposed",
    actor: "government",
    title: `Nachtragshaushalt: ${total} Mrd. EUR`,
    description: triggerCrisis
      ? `Coalition legt Nachtragshaushalt mit Krisenfokus (${triggerCrisis.name}) vor.`
      : `Coalition legt Nachtragshaushalt vor.`,
    data: { total, allocations, activeCrisisId, crisisCategory },
  });

  // Reuse existing tallyBudgetVote — Nachtragshaushalt has no revision
  // concept (single-shot vote), so isRevision=false. Pass through the rng
  // so tests can deterministically force pass/fail outcomes.
  const vote = tallyBudgetVote(parties, state.coalitionParties, state.publicSentiment, false, rng);

  if (vote.passed) {
    // R4 invariant: this is the ONLY same-day economic effect path for
    // Nachtragshaushalt — drained on a non-budget day, no double-apply
    // possible (budget cycle runs in step 11d/e, after step 3 injections).
    const result = applyBudgetEconomicEffect(state.economy, allocations);
    state.economy = result.economy;
    state.publicSentiment = Math.max(5, Math.min(75, state.publicSentiment + 0.3));
    events.push({
      dayNumber: currentDay,
      type: "nachtragshaushalt_passed",
      actor: "government",
      title: `Nachtragshaushalt verabschiedet (${total} Mrd. EUR)`,
      description: `Bundestag mit ${vote.yesSeats}:${vote.noSeats} für Nachtragshaushalt.`,
      data: { total, yesSeats: vote.yesSeats, noSeats: vote.noSeats, economicEffect: result.effect },
    });
  } else {
    events.push({
      dayNumber: currentDay,
      type: "nachtragshaushalt_rejected",
      actor: "government",
      title: `Nachtragshaushalt abgelehnt`,
      description: `Bundestag lehnt Nachtragshaushalt mit ${vote.noSeats}:${vote.yesSeats} ab.`,
      data: { total, yesSeats: vote.yesSeats, noSeats: vote.noSeats },
    });
  }
  return events;
}

