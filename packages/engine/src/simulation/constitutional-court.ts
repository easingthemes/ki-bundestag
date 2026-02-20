import type { Party } from "@ki-bundestag/types";

export const STRIKE_DOWN_PROBABILITY = 0.30;

const STRIKE_DOWN_REASONS = [
  "The court finds the economic provisions incompatible with Art. 20 GG (Sozialstaatsprinzip). The burden imposed on citizens lacks proportionality.",
  "The legislation violates the principle of proportionality (Verhältnismäßigkeit) as enshrined in the Basic Law. The means exceed what is necessary to achieve the stated aim.",
  "The Bundesverfassungsgericht holds that the law infringes upon fundamental rights under Art. 2 GG (Allgemeine Handlungsfreiheit) without sufficient constitutional justification.",
  "The court rules the law unconstitutional under Art. 14 GG (Eigentumsgarantie). The interference with property rights is disproportionate to the public benefit.",
  "The legislation conflicts with the federal principle (Art. 20 GG). Exclusive Bundesrat consent was required and was not obtained.",
];

const UPHOLD_REASONS = [
  "The Bundestag acted within its constitutional mandate. The challenged provisions are consistent with the Basic Law and fall within the legislature's margin of appreciation.",
  "The court finds no violation of fundamental rights. The law pursues a legitimate aim and the means chosen are proportionate and necessary.",
  "The constitutional challenge is dismissed. The challenged provisions comply with the rule of law principle (Rechtsstaatsprinzip) and do not infringe any protected right.",
  "The Bundesverfassungsgericht upholds the law. The legislature's assessment of necessity is constitutionally sound and within its competence.",
  "The challenge is rejected. The court finds the law consistent with Art. 20 GG and all cited fundamental rights provisions of the Basic Law.",
];

function pickFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function adjudicateChallenge(_billTitle: string): { struckDown: boolean; reasoning: string } {
  const struckDown = Math.random() < STRIKE_DOWN_PROBABILITY;
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
        // Filing party gains credibility
        party.approvalRating = Math.max(5, Math.min(75, Math.round((party.approvalRating + 0.8) * 10) / 10));
      } else if (party.id === proposedByPartyId) {
        // Proposing party suffers from having law struck down
        party.approvalRating = Math.max(5, Math.min(75, Math.round((party.approvalRating - 0.5) * 10) / 10));
      }
    } else {
      if (party.id === filedByPartyId) {
        // Challenge was frivolous — small penalty
        party.approvalRating = Math.max(5, Math.min(75, Math.round((party.approvalRating - 0.3) * 10) / 10));
      }
    }
  }
}
