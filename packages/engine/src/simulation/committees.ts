import { eq } from "drizzle-orm";
import type { Bill, BillCategory, BillImpact, CommitteeRecommendation, Party } from "@ki-bundestag/types";
import { getDb, getSqlite, schema } from "../db/index.js";
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

function generateId(): string {
  return Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}

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
 * Find the bill category that best matches a committee name via keyword matching.
 */
function findCategoryForCommittee(name: string): string | null {
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(kw => name.toLowerCase().includes(kw.toLowerCase()))) {
      return category;
    }
  }
  return null;
}

/**
 * Extract a short name from a full committee name.
 * e.g., "Ausschuss für Verteidigung" → "Verteidigung"
 */
function extractShortName(name: string): string {
  const m = name.match(/(?:Ausschuss\s+(?:für|des)\s+)?(.+)/i);
  return m ? m[1].trim() : name;
}

/**
 * Seed committees from stored real names (or fallback).
 * Deactivates old committees and inserts new ones.
 */
export function seedCommittees(currentDay: number): void {
  const db = getDb();
  const sqlite = getSqlite();
  const names = getStoredCommitteeNames();
  const committeeNames = names.length > 0 ? names : Object.values(FALLBACK_MAP);

  // Deactivate old
  sqlite.prepare("UPDATE committees SET active = 0").run();

  for (const name of committeeNames) {
    const category = findCategoryForCommittee(name);
    db.insert(schema.committees).values({
      id: `committee-${generateId()}`,
      name,
      shortName: extractShortName(name),
      billCategory: category,
      active: true,
      createdOnDay: currentDay,
    }).run();
  }
}

/**
 * Check if committees need seeding (table empty or no active committees).
 */
export function shouldSeedCommittees(): boolean {
  const sqlite = getSqlite();
  const row = sqlite.prepare("SELECT COUNT(*) as cnt FROM committees WHERE active = 1").get() as { cnt: number } | undefined;
  return !row || row.cnt === 0;
}

/**
 * Assign MdBs to committees proportionally after an election.
 * Clears old memberships and creates new ones.
 */
export function assignCommitteeMemberships(currentDay: number): void {
  const db = getDb();
  const sqlite = getSqlite();

  // Clear old memberships
  sqlite.prepare("DELETE FROM committee_memberships").run();

  const activeCommittees = db.select().from(schema.committees)
    .where(eq(schema.committees.active, true)).all();
  const activeSeats = db.select().from(schema.bundestagSeats)
    .where(eq(schema.bundestagSeats.active, true)).all();

  if (activeCommittees.length === 0 || activeSeats.length === 0) return;

  // Group seats by party
  const seatsByParty: Record<string, typeof activeSeats> = {};
  for (const seat of activeSeats) {
    (seatsByParty[seat.partyId] ??= []).push(seat);
  }

  const totalSeats = activeSeats.length;
  const COMMITTEE_SIZE = 20;

  for (const committee of activeCommittees) {
    const members: Array<{ seatId: string; role: string; partyId: string }> = [];

    // Proportional allocation per party
    for (const [partyId, seats] of Object.entries(seatsByParty)) {
      const share = Math.max(1, Math.round((seats.length / totalSeats) * COMMITTEE_SIZE));
      const shuffled = [...seats].sort(() => Math.random() - 0.5);
      for (let i = 0; i < Math.min(share, shuffled.length); i++) {
        members.push({ seatId: shuffled[i].id, role: "member", partyId });
      }
    }

    // Assign chair to first member, deputy to member from a different party
    if (members.length > 0) members[0].role = "chair";
    if (members.length > 1) {
      const chairParty = members[0].partyId;
      const deputy = members.find((m, i) => i > 0 && m.partyId !== chairParty);
      if (deputy) deputy.role = "deputy_chair";
    }

    // Insert memberships
    for (const m of members) {
      db.insert(schema.committeeMemberships).values({
        id: `cm-${generateId()}`,
        committeeId: committee.id,
        seatId: m.seatId,
        role: m.role,
        assignedOnDay: currentDay,
      }).run();
    }
  }
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
