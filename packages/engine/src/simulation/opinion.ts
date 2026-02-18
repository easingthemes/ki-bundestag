import type { BillImpact, Party } from "@ki-bundestag/types";

const SENTIMENT_MIN = 5;
const SENTIMENT_MAX = 75;
const SENTIMENT_BASELINE = 45;
const SENTIMENT_REVERSION_RATE = 0.03;

// Update approval ratings based on party actions
export function updateApproval(party: Party, delta: number): number {
  const newRating = party.approvalRating + delta;
  return clamp(Math.round(newRating * 10) / 10, 1, 60);
}

// Bills passing/failing affects proposer approval
export function approvalFromBillOutcome(passed: boolean, isProposer: boolean): number {
  if (!isProposer) return 0;
  return passed ? 0.3 : -0.2;
}

// Update public sentiment based on bill impacts (clamped to realistic range)
export function updateSentiment(currentSentiment: number, impact: BillImpact): number {
  // Cap the per-bill sentiment swing to ±2 to prevent AI from gaming the system
  const rawDelta = impact.publicSentiment ?? 0;
  const delta = clamp(rawDelta, -2, 2);
  return clamp(Math.round((currentSentiment + delta) * 10) / 10, SENTIMENT_MIN, SENTIMENT_MAX);
}

// Daily sentiment drift — mean-reverts toward baseline + small random noise
export function applySentimentDrift(currentSentiment: number): number {
  const reversionPull = (SENTIMENT_BASELINE - currentSentiment) * SENTIMENT_REVERSION_RATE;
  const noise = (Math.random() - 0.5) * 0.4; // was 0.6 — tighter daily noise
  return clamp(
    Math.round((currentSentiment + reversionPull + noise) * 10) / 10,
    SENTIMENT_MIN,
    SENTIMENT_MAX,
  );
}

// Small random drift in approval each day
export function applyApprovalDrift(party: Party): number {
  const drift = (Math.random() - 0.5) * 0.4;
  return clamp(Math.round((party.approvalRating + drift) * 10) / 10, 1, 60);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
