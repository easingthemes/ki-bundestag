import type { Party } from "@ki-bundestag/types";
import {
  COURT_STRIKE_DOWN_PROBABILITY,
  COURT_APPROVAL_IMPACTS,
  STRIKE_DOWN_REASONS,
  UPHOLD_REASONS,
} from "../config/index.js";
import { clampApproval } from "./opinion.js";

// Re-export for external consumers
export { COURT_STRIKE_DOWN_PROBABILITY as STRIKE_DOWN_PROBABILITY } from "../config/index.js";

function pickFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function adjudicateChallenge(_billTitle: string): { struckDown: boolean; reasoning: string } {
  const struckDown = Math.random() < COURT_STRIKE_DOWN_PROBABILITY;
  const reasoning = struckDown ? pickFrom(STRIKE_DOWN_REASONS) : pickFrom(UPHOLD_REASONS);
  return { struckDown, reasoning };
}

export function constitutionalCourtApprovalImpact(
  struckDown: boolean,
  allParties: Party[],
  filedByPartyId: string,
  proposedByPartyId: string,
): void {
  for (const party of allParties) {
    if (struckDown) {
      if (party.id === filedByPartyId) {
        party.approvalRating = clampApproval(party.approvalRating + COURT_APPROVAL_IMPACTS.filerGainOnStrikeDown);
      } else if (party.id === proposedByPartyId) {
        party.approvalRating = clampApproval(party.approvalRating + COURT_APPROVAL_IMPACTS.proposerLossOnStrikeDown);
      }
    } else {
      if (party.id === filedByPartyId) {
        party.approvalRating = clampApproval(party.approvalRating + COURT_APPROVAL_IMPACTS.filerLossOnUphold);
      }
    }
  }
}
