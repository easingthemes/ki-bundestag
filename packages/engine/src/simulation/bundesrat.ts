/**
 * Bundesrat voting — weighted per-Land bloc votes (Art. 51 Abs. 3 GG).
 *
 * Each of the 16 Länder casts its full vote weight as a single bloc (einheitliche
 * Stimmabgabe). The bloc position is resolved from the Land's governing-coalition
 * simParty mapping: each party's `policyPriorities` is scored against the bill's
 * `impact`, averaged, and thresholded. When intra-coalition ideological spread
 * exceeds `LAND_ABSTENTION_THRESHOLD`, the Land abstains (Enthaltung).
 *
 * Cycle 2a PR 1: voting logic only. Pipeline wiring is PR 2.
 */

import type {
  Bill,
  BillCategory,
  BundesratLandResult,
  BundesratMode,
  BundesratVoteResult,
  LandVote,
  Party,
} from "@ki-bundestag/types";
import {
  BUNDESRAT_LAENDER,
  BUNDESRAT_MAJORITY,
  BUNDESRAT_MODE_BY_CATEGORY,
  BUNDESRAT_TOTAL_VOTES,
  LAND_ABSTENTION_THRESHOLD,
} from "../config/bundesrat.js";

export type {
  BundesratMode,
  LandVote,
  BundesratLandResult,
  BundesratVoteResult,
} from "@ki-bundestag/types";

/** Zustimmungs- vs. Einspruchsgesetz classification (sub-decision S1). */
export function getBundesratMode(category: BillCategory): BundesratMode {
  return BUNDESRAT_MODE_BY_CATEGORY[category];
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/**
 * Directional alignment of one party with one bill, in [-1, 1].
 *
 * Combines bill-impact direction × party policy priority on matching axes:
 *   - impact.budget         ↔ policyPriorities.spending
 *   - impact.gdpGrowth      ↔ policyPriorities.economy
 *   - impact.publicSentiment ↔ policyPriorities.social
 * plus a category-scoped nudge for `environment` and `immigration` where the
 * axis isn't captured by a numeric impact field.
 */
function partyAlignment(party: Party, bill: Bill): number {
  const pp = party.policyPriorities;
  const imp = bill.impact;
  const components: number[] = [];

  if (imp.budget !== undefined && imp.budget !== 0) {
    components.push(pp.spending * Math.sign(imp.budget));
  }
  if (imp.gdpGrowth !== undefined && imp.gdpGrowth !== 0) {
    components.push(pp.economy * Math.sign(imp.gdpGrowth));
  }
  if (imp.publicSentiment !== undefined && imp.publicSentiment !== 0) {
    components.push(pp.social * Math.sign(imp.publicSentiment));
  }
  if (bill.category === "environment") {
    components.push(pp.environment);
  } else if (bill.category === "immigration") {
    components.push(pp.immigration);
  }

  if (components.length === 0) return 0;
  const sum = components.reduce((s, v) => s + v, 0);
  return clamp(sum / components.length, -1, 1);
}

/**
 * Cast a Bundesrat vote on a single bill. Returns full per-Land breakdown plus
 * the weighted tally. `passed` resolves the mode-specific majority:
 *   - zustimmung: ja >= 35
 *   - einspruch:  nein < 35   (no Einspruch filed)
 */
export function voteBundesrat(bill: Bill, parties: Party[]): BundesratVoteResult {
  const mode = getBundesratMode(bill.category);
  const partyIndex = new Map(parties.map(p => [p.id, p]));
  const federalCoalitionIds = new Set(
    parties
      .filter(p => p.coalitionRole === "leader" || p.coalitionRole === "junior")
      .map(p => p.id),
  );
  const isGovBill = bill.isGovernmentBill === true;

  const landResults: BundesratLandResult[] = [];
  let ja = 0;
  let nein = 0;
  let enthaltung = 0;

  for (const land of BUNDESRAT_LAENDER) {
    const coalitionParties = land.simParties
      .map(id => partyIndex.get(id))
      .filter((p): p is Party => Boolean(p));

    const scores = coalitionParties.map(p => partyAlignment(p, bill));
    const mean = scores.length > 0
      ? scores.reduce((s, v) => s + v, 0) / scores.length
      : 0;
    const spread = scores.length > 1 ? Math.max(...scores) - Math.min(...scores) : 0;

    const federalOverlap = land.simParties.some(id => federalCoalitionIds.has(id));
    const bonus = isGovBill && federalOverlap ? 0.15 : 0;
    const adjustedMean = clamp(mean + bonus, -1, 1);

    let vote: LandVote;
    if (spread > LAND_ABSTENTION_THRESHOLD) {
      vote = "enthaltung";
    } else if (adjustedMean > 0.1) {
      vote = "ja";
    } else if (adjustedMean < -0.1) {
      vote = "nein";
    } else {
      vote = "enthaltung";
    }

    landResults.push({
      landId: land.id,
      landName: land.name,
      votes: land.votes,
      vote,
      coalitionPosition: {
        parties: land.simParties,
        majoritySupport: adjustedMean,
      },
    });

    if (vote === "ja") ja += land.votes;
    else if (vote === "nein") nein += land.votes;
    else enthaltung += land.votes;
  }

  const passed = mode === "zustimmung"
    ? ja >= BUNDESRAT_MAJORITY
    : nein < BUNDESRAT_MAJORITY;

  return {
    mode,
    tally: { ja, nein, enthaltung },
    total: BUNDESRAT_TOTAL_VOTES,
    threshold: BUNDESRAT_MAJORITY,
    passed,
    landResults,
  };
}
