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

// ── Presidential veto (Cycle 3 PR 1: real-data-matched rate) ────────
/**
 * Two-stage veto filter (Q2 hybrid). Real Bundespräsident veto rate is
 * ~0.04% (≈6 vetoes / 15_000 passed bills). Old impl rolled 1–6%, which
 * over-fired by 2–3 orders of magnitude.
 *
 * Stage 1: impact gate. Only constitutional-stakes bills are eligible —
 * `summedImpact = Σ |bill.impact[k]|` must reach this threshold. Below it,
 * veto cannot fire. Most bills land 0.2–1.0 in this metric; 0.6 keeps the
 * top tercile eligible. Tunable; revisit after a 4-year sim run.
 */
export const PRESIDENTIAL_VETO_IMPACT_THRESHOLD = 0.6;
/**
 * Stage 2: capped probability above the impact gate. Per term (≈320 passed
 * bills, ~1/3 above gate ≈ 100 eligible), expected vetoes = 100 × 0.0005
 * = 0.05 — matches the real ≈0.04% rate.
 */
export const PRESIDENTIAL_VETO_PROBABILITY = 0.0005;
/** Approval penalty for proposer when bill is vetoed */
export const VETO_PROPOSER_APPROVAL_PENALTY = 0.5;

// ── Cycle 4 PR 2 — Schuldenbremse-Aussetzung (Art. 115 GG) ──────────

/** Sim days a Schuldenbremse-Aussetzung remains in force (S3). 365 = annual
 *  re-declaration matching real Bundestag practice. */
export const SCHULDENBREMSE_SUSPENSION_DURATION = 365;

/** Sim days the coalition must wait after a successful Aussetzung before
 *  re-filing. Currently equal to `SCHULDENBREMSE_SUSPENSION_DURATION`, so the
 *  cooldown only blocks while the suspension is active (re-filing immediately
 *  on expiry is allowed; re-filing while still active extends the expiry). */
export const FISCAL_EMERGENCY_COOLDOWN = 365;

/** Min consecutive sim days `provisionalBudget === true` before the
 *  fiscal-emergency justification gate opens (Q5). */
export const FISCAL_EMERGENCY_PROVISIONAL_BUDGET_DAYS = 30;

/**
 * Vote-tally tuning for tallySchuldenbremseVote (S12, recalibrated S21/R4 in
 * Cycle 5 PR 3).
 *
 * R4 lesson (PR #165): the previous coalition rate (0.95) made passage near-
 * automatic when justified — too smooth for what is constitutionally a
 * controversial fiscal instrument. Lowered to 0.88 to model dissent within
 * the coalition. With this + the recalibrated opposition base, the 50k LCG
 * convergence test asserts pass-rate ∈ [60%, 80%] when justification is met.
 */
export const SCHULDENBREMSE_COALITION_YES_RATE = 0.88;
/** S21: opposition baseline yes share. Sentiment + crisis-severity boosts on
 *  top (capped). Final value derived empirically via 50k convergence test in
 *  budget.test.ts to land in the [60%, 80%] target band. */
export const SCHULDENBREMSE_OPPOSITION_YES_BASE = 0.18;
/** Map crisis severity → opposition-yes-share boost. */
export const SCHULDENBREMSE_SEVERITY_BOOSTS: Record<"low" | "medium" | "high", number> = {
  low: 0.05,
  medium: 0.15,
  high: 0.30,
};
/** Cap on opposition yes share — even with max sentiment + high severity,
 *  opposition unanimity is rare. */
export const SCHULDENBREMSE_OPPOSITION_YES_CAP = 0.85;

// ── Cycle 4 PR 3 — Nachtragshaushalt (supplementary budget) ──────────

/** Min Nachtragshaushalt total (B EUR), uniform draw per S4. */
export const NACHTRAGSHAUSHALT_TOTAL_MIN = 50;

/** Max Nachtragshaushalt total (B EUR). */
export const NACHTRAGSHAUSHALT_TOTAL_MAX = 150;

/** S4: ministry-allocation boost share for the active-crisis category
 *  (e.g. defense crisis → +30% to defence ministry over its base coalition share). */
export const NACHTRAGSHAUSHALT_CRISIS_BOOST = 0.30;

/** Random veto reason texts */
export const VETO_REASONS = [
  "The Bundespräsident has expressed constitutional concerns about this legislation.",
  "The federal president cites disproportionate economic risks to the Mittelstand.",
  "The Bundespräsident questions the compatibility of this law with fundamental rights.",
  "The federal president finds the legislation lacks sufficient democratic legitimacy.",
  "The Bundespräsident declines to sign, citing procedural irregularities in the legislative process.",
];
