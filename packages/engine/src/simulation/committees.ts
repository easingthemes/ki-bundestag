import type { Bill, BillCategory, BillImpact, CommitteeRecommendation, Party } from "@ki-bundestag/types";
import { getStoredCommitteeNames } from "./knowledge-fetch.js";

/**
 * Mapping from bill category to real committee name keywords.
 * Used to find the best matching real committee name when available.
 */
const CATEGORY_KEYWORDS: Record<BillCategory, string[]> = {
  economy: ["Wirtschaft", "Energie", "Finanzen"],
  social: ["Arbeit", "Soziales", "Familie"],
  environment: ["Umwelt", "Klimaschutz", "Naturschutz"],
  immigration: ["Inneres", "Heimat", "Migration"],
  defense: ["Verteidigung", "Sicherheit"],
  education: ["Bildung", "Forschung"],
  healthcare: ["Gesundheit"],
  infrastructure: ["Verkehr", "Digitales", "Infrastruktur", "Bau"],
};

/** Fallback committee names when no real data is available */
const FALLBACK_MAP: Record<BillCategory, string> = {
  economy: "Wirtschaft und Energie",
  social: "Arbeit und Soziales",
  environment: "Umwelt und Klimaschutz",
  immigration: "Inneres und Heimat",
  defense: "Verteidigung",
  education: "Bildung und Forschung",
  healthcare: "Gesundheit",
  infrastructure: "Verkehr und digitale Infrastruktur",
};

/**
 * Assign a committee to a bill based on its category.
 * Uses real Bundestag committee names from abgeordnetenwatch when available,
 * falls back to hardcoded names otherwise.
 */
export function assignCommittee(category: BillCategory): string {
  const realNames = getStoredCommitteeNames();
  if (realNames.length > 0) {
    const keywords = CATEGORY_KEYWORDS[category];
    if (keywords) {
      const match = realNames.find(name =>
        keywords.some(kw => name.toLowerCase().includes(kw.toLowerCase())),
      );
      if (match) return match;
    }
    // No keyword match — return a random real committee
    return realNames[Math.floor(Math.random() * realNames.length)];
  }
  return FALLBACK_MAP[category] ?? "Allgemeiner Ausschuss";
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
