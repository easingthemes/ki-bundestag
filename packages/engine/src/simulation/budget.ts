import type { BudgetAllocations, BudgetVote, BillImpact, EconomyState, Party, Bill } from "@ki-bundestag/types";

export const BUDGET_TOTAL = 300; // billion EUR

const PARTY_MINISTRY_WEIGHTS: Record<string, BudgetAllocations> = {
  spd:    { finance: 0.10, labour: 0.22, environment: 0.13, interior: 0.07, defence: 0.10, education: 0.14, health: 0.17, infrastructure: 0.07 },
  cdu:    { finance: 0.15, labour: 0.13, environment: 0.08, interior: 0.12, defence: 0.15, education: 0.13, health: 0.12, infrastructure: 0.12 },
  gruene: { finance: 0.08, labour: 0.14, environment: 0.22, interior: 0.06, defence: 0.06, education: 0.16, health: 0.16, infrastructure: 0.12 },
  fdp:    { finance: 0.20, labour: 0.10, environment: 0.10, interior: 0.08, defence: 0.12, education: 0.14, health: 0.10, infrastructure: 0.16 },
  afd:    { finance: 0.12, labour: 0.12, environment: 0.05, interior: 0.18, defence: 0.22, education: 0.10, health: 0.12, infrastructure: 0.09 },
  linke:  { finance: 0.07, labour: 0.25, environment: 0.14, interior: 0.05, defence: 0.05, education: 0.15, health: 0.20, infrastructure: 0.09 },
};

const MINISTRY_KEYS: (keyof BudgetAllocations)[] = [
  "finance", "labour", "environment", "interior", "defence", "education", "health", "infrastructure",
];

const VETO_REASONS = [
  "The Bundespräsident has expressed constitutional concerns about this legislation.",
  "The federal president cites disproportionate economic risks to the Mittelstand.",
  "The Bundespräsident questions the compatibility of this law with fundamental rights.",
  "The federal president finds the legislation lacks sufficient democratic legitimacy.",
  "The Bundespräsident declines to sign, citing procedural irregularities in the legislative process.",
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
  let coalitionYesRate: number;
  let oppositionYesRate: number;

  if (publicSentiment > 55)      { coalitionYesRate = 0.97; oppositionYesRate = 0.05; }
  else if (publicSentiment > 40) { coalitionYesRate = 0.90; oppositionYesRate = 0.10; }
  else if (publicSentiment > 25) { coalitionYesRate = 0.82; oppositionYesRate = 0.15; }
  else                           { coalitionYesRate = 0.72; oppositionYesRate = 0.20; }

  if (isRevision) coalitionYesRate = Math.min(0.99, coalitionYesRate + 0.05);

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
  const result = {} as BudgetAllocations;
  for (const k of MINISTRY_KEYS) {
    result[k] = Math.round((base[k] * 0.97 + equalShare * 0.03) * 10) / 10;
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

  if (labourShare + healthShare > 0.30) {
    newEconomy.unemployment = clamp(Math.round((newEconomy.unemployment - 0.03) * 100) / 100, 0, 20);
    effect.unemployment = -0.03;
  }

  if (financeShare + infrastructureShare > 0.25) {
    newEconomy.gdpGrowth = clamp(Math.round((newEconomy.gdpGrowth + 0.03) * 100) / 100, -5, 10);
    effect.gdpGrowth = 0.03;
  }

  if (environmentShare > 0.12) {
    newEconomy.inflation = clamp(Math.round((newEconomy.inflation - 0.02) * 100) / 100, 0, 20);
    effect.inflation = -0.02;
  }

  if (defenceShare > 0.18) {
    newEconomy.gdpGrowth = clamp(Math.round((newEconomy.gdpGrowth + 0.02) * 100) / 100, -5, 10);
    effect.gdpGrowth = (effect.gdpGrowth ?? 0) + 0.02;
  }

  return { economy: newEconomy, effect };
}

/**
 * Presidential veto check. Returns whether the Bundespräsident vetoes the bill and a reason.
 */
export function shouldPresidentVeto(bill: Bill): { veto: boolean; reason: string } {
  const impact = bill.impact as BillImpact | undefined;
  let prob = 0.01;

  if (Math.abs(impact?.publicSentiment ?? 0) > 1.5) prob += 0.02;
  if (Math.abs(impact?.budget ?? 0) > 2) prob += 0.02;
  if (Math.abs(impact?.gdpGrowth ?? 0) > 0.15) prob += 0.01;

  const veto = Math.random() < prob;
  const reason = VETO_REASONS[Math.floor(Math.random() * VETO_REASONS.length)];
  return { veto, reason };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
