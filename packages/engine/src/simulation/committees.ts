import type { Bill, BillCategory, BillImpact, CommitteeRecommendation, Party } from "@ki-bundestag/types";

const COMMITTEE_MAP: Record<BillCategory, string> = {
  economy: "Wirtschaft und Energie",
  social: "Arbeit und Soziales",
  environment: "Umwelt und Klimaschutz",
  immigration: "Inneres und Heimat",
  defense: "Verteidigung",
  education: "Bildung und Forschung",
  healthcare: "Gesundheit",
  infrastructure: "Verkehr und digitale Infrastruktur",
};

export function assignCommittee(category: BillCategory): string {
  return COMMITTEE_MAP[category] ?? "Allgemeiner Ausschuss";
}

/**
 * Algorithmic committee recommendation (no AI call).
 * - Coalition bill with no severe negative impact → "pass"
 * - Opposition bill with negative impact → "reject"
 * - Default → "amend"
 */
export function generateRecommendation(
  bill: Bill,
  parties: Party[],
  coalitionParties: string[],
): CommitteeRecommendation {
  const isCoalitionBill = coalitionParties.includes(bill.proposedBy);
  const impact = bill.impact as BillImpact;

  const hasSevereNegative =
    (impact.budget != null && impact.budget < -0.5) ||
    (impact.unemployment != null && impact.unemployment > 0.05) ||
    (impact.gdpGrowth != null && impact.gdpGrowth < -0.05) ||
    (impact.publicSentiment != null && impact.publicSentiment < -1);

  const hasNegativeImpact =
    (impact.budget != null && impact.budget < 0) ||
    (impact.unemployment != null && impact.unemployment > 0) ||
    (impact.gdpGrowth != null && impact.gdpGrowth < 0);

  if (isCoalitionBill && !hasSevereNegative) {
    return "pass";
  }

  if (!isCoalitionBill && hasNegativeImpact) {
    return "reject";
  }

  return "amend";
}
