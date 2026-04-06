/**
 * Budget & presidential veto configuration.
 *
 * Controls annual budget total, per-party ministry allocation weights,
 * budget vote probability tiers, economic effect thresholds, and
 * presidential veto probabilities.
 */

import type { BudgetAllocations } from "@ki-bundestag/types";

// ── Budget fundamentals ─────────────────────────────────────────────
/** Annual federal budget in billion EUR */
export const BUDGET_TOTAL = 300;
/** Centrist shift rate for budget revisions (97% old + 3% equal) */
export const BUDGET_REVISION_CENTRIST_SHIFT = 0.03;

// ── Per-party ministry allocation weights ───────────────────────────
export const PARTY_MINISTRY_WEIGHTS: Record<string, BudgetAllocations> = {
  spd:    { finance: 0.10, labour: 0.22, environment: 0.13, interior: 0.07, defence: 0.10, education: 0.14, health: 0.17, infrastructure: 0.07 },
  cdu:    { finance: 0.15, labour: 0.13, environment: 0.08, interior: 0.12, defence: 0.15, education: 0.13, health: 0.12, infrastructure: 0.12 },
  gruene: { finance: 0.08, labour: 0.14, environment: 0.22, interior: 0.06, defence: 0.06, education: 0.16, health: 0.16, infrastructure: 0.12 },
  fdp:    { finance: 0.20, labour: 0.10, environment: 0.10, interior: 0.08, defence: 0.12, education: 0.14, health: 0.10, infrastructure: 0.16 },
  afd:    { finance: 0.12, labour: 0.12, environment: 0.05, interior: 0.18, defence: 0.22, education: 0.10, health: 0.12, infrastructure: 0.09 },
  linke:  { finance: 0.07, labour: 0.25, environment: 0.14, interior: 0.05, defence: 0.05, education: 0.15, health: 0.20, infrastructure: 0.09 },
};

// ── Budget vote probability tiers ───────────────────────────────────
/**
 * Coalition and opposition yes-vote rates based on public sentiment.
 * Each tier: [sentimentFloor, coalitionYesRate, oppositionYesRate]
 * Applied top-down: first matching tier wins.
 */
export const BUDGET_VOTE_TIERS: Array<[number, number, number]> = [
  [55, 0.97, 0.05],   // sentiment > 55
  [40, 0.90, 0.10],   // sentiment > 40
  [25, 0.82, 0.15],   // sentiment > 25
  [0,  0.72, 0.20],   // fallback
];
/** Coalition yes-rate boost on budget re-vote (revision after rejection) */
export const BUDGET_REVISION_BOOST = 0.05;

// ── Budget economic effect thresholds ───────────────────────────────
/** If labour + health share > this, unemployment decreases */
export const BUDGET_LABOUR_HEALTH_THRESHOLD = 0.30;
export const BUDGET_LABOUR_HEALTH_UNEMPLOYMENT_EFFECT = -0.03;

/** If finance + infrastructure share > this, GDP increases */
export const BUDGET_FINANCE_INFRA_THRESHOLD = 0.25;
export const BUDGET_FINANCE_INFRA_GDP_EFFECT = 0.03;

/** If environment share > this, inflation decreases */
export const BUDGET_ENVIRONMENT_THRESHOLD = 0.12;
export const BUDGET_ENVIRONMENT_INFLATION_EFFECT = -0.02;

/** If defence share > this, GDP increases */
export const BUDGET_DEFENCE_THRESHOLD = 0.18;
export const BUDGET_DEFENCE_GDP_EFFECT = 0.02;

// ── Presidential veto ───────────────────────────────────────────────
/** Base probability of presidential veto on any bill */
export const VETO_BASE_PROBABILITY = 0.01;
/** Additional veto probability if |publicSentiment| > this threshold */
export const VETO_SENTIMENT_THRESHOLD = 1.5;
export const VETO_SENTIMENT_BONUS = 0.02;
/** Additional veto probability if |budget impact| > this threshold */
export const VETO_BUDGET_THRESHOLD = 2;
export const VETO_BUDGET_BONUS = 0.02;
/** Additional veto probability if |GDP impact| > this threshold */
export const VETO_GDP_THRESHOLD = 0.15;
export const VETO_GDP_BONUS = 0.01;
/** Approval penalty for proposer when bill is vetoed */
export const VETO_PROPOSER_APPROVAL_PENALTY = 0.5;

/** Random veto reason texts */
export const VETO_REASONS = [
  "The Bundespräsident has expressed constitutional concerns about this legislation.",
  "The federal president cites disproportionate economic risks to the Mittelstand.",
  "The Bundespräsident questions the compatibility of this law with fundamental rights.",
  "The federal president finds the legislation lacks sufficient democratic legitimacy.",
  "The Bundespräsident declines to sign, citing procedural irregularities in the legislative process.",
];
