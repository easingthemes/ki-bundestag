import type { BudgetAllocations, BudgetVote, BillImpact, EconomyState, Party, Bill } from "@ki-bundestag/types";
import {
  BUDGET_TOTAL, PARTY_MINISTRY_WEIGHTS, BUDGET_REVISION_CENTRIST_SHIFT,
  BUDGET_VOTE_TIERS, BUDGET_REVISION_BOOST,
  BUDGET_LABOUR_HEALTH_THRESHOLD, BUDGET_LABOUR_HEALTH_UNEMPLOYMENT_EFFECT,
  BUDGET_FINANCE_INFRA_THRESHOLD, BUDGET_FINANCE_INFRA_GDP_EFFECT,
  BUDGET_ENVIRONMENT_THRESHOLD, BUDGET_ENVIRONMENT_INFLATION_EFFECT,
  BUDGET_DEFENCE_THRESHOLD, BUDGET_DEFENCE_GDP_EFFECT,
  PRESIDENTIAL_VETO_IMPACT_THRESHOLD, PRESIDENTIAL_VETO_PROBABILITY,
  VETO_REASONS,
} from "../config/index.js";

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
 */
export function tallyBudgetVote(
  allParties: Party[],
  coalitionIds: string[],
  publicSentiment: number,
  isRevision = false,
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
    const voteChoice: "yes" | "no" = Math.random() < (isCoalition ? coalitionYesRate : oppositionYesRate)
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
  const summedImpact = impact
    ? Object.values(impact).reduce((s, v) => s + Math.abs(v ?? 0), 0)
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
