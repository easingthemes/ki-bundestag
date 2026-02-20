import { eq } from "drizzle-orm";
import type { Government, Minister, MinistryPortfolio, Party, BillCategory } from "@ki-bundestag/types";
import { getDb, schema } from "../db/index.js";
import { FRAKTION_LEADERS } from "./fraktionen.js";

/** 3-4 real German politicians per party who could serve as ministers */
export const MINISTER_CANDIDATES: Record<string, string[]> = {
  spd: ["Karl Lauterbach", "Nancy Faeser", "Hubertus Heil", "Svenja Schulze"],
  cdu: ["Jens Spahn", "Julia Klöckner", "Norbert Röttgen", "Annegret Kramp-Karrenbauer"],
  gruene: ["Robert Habeck", "Annalena Baerbock", "Steffi Lemke", "Cem Özdemir"],
  fdp: ["Christian Lindner", "Marco Buschmann", "Bettina Stark-Watzinger", "Volker Wissing"],
  afd: ["Tino Chrupalla", "Stephan Brandner", "Beatrix von Storch", "Gottfried Curio"],
  linke: ["Gregor Gysi", "Janine Wissler", "Sahra Wagenknecht", "Klaus Ernst"],
};

/** Display names for each ministry */
export const MINISTRY_NAMES: Record<MinistryPortfolio, string> = {
  finance: "Bundesministerium der Finanzen",
  labour: "Bundesministerium für Arbeit und Soziales",
  environment: "Bundesministerium für Umwelt",
  interior: "Bundesministerium des Innern",
  defence: "Bundesministerium der Verteidigung",
  education: "Bundesministerium für Bildung und Forschung",
  health: "Bundesministerium für Gesundheit",
  infrastructure: "Bundesministerium für Digitales und Verkehr",
};

/** Maps ministry portfolio to corresponding BillCategory */
export const MINISTRY_TO_CATEGORY: Record<MinistryPortfolio, BillCategory> = {
  finance: "economy",
  labour: "social",
  environment: "environment",
  interior: "immigration",
  defence: "defense",
  education: "education",
  health: "healthcare",
  infrastructure: "infrastructure",
};

/** Ordered list of portfolio keys — leader party gets finance first */
export const MINISTRY_PORTFOLIOS: MinistryPortfolio[] = [
  "finance", "labour", "environment", "interior",
  "defence", "education", "health", "infrastructure",
];

function generateId(): string {
  return Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}

/**
 * Form a new cabinet after coalition formation.
 * Chancellor = FRAKTION_LEADERS[coalition leader].
 * Ministries distributed proportionally by seat count.
 */
export function formCabinet(
  coalition: string[],
  allParties: Party[],
  electionId: string | null,
  currentDay: number,
): Government {
  const db = getDb();

  // Deactivate previous government
  dissolveGovernment(currentDay);

  const leaderPartyId = coalition[0];
  const chancellorName = FRAKTION_LEADERS[leaderPartyId] ?? "Unknown";

  // Get coalition parties sorted by seat count (leader first for tie-breaking)
  const coalitionParties = coalition
    .map(id => allParties.find(p => p.id === id)!)
    .filter(Boolean);
  const totalSeats = coalitionParties.reduce((s, p) => s + p.seatCount, 0);

  // Calculate proportional ministry allocation
  const partyMinistryCount: Record<string, number> = {};
  const remainders: Array<{ partyId: string; remainder: number }> = [];
  let allocated = 0;

  for (const p of coalitionParties) {
    const share = (p.seatCount / totalSeats) * MINISTRY_PORTFOLIOS.length;
    const whole = Math.floor(share);
    partyMinistryCount[p.id] = whole;
    allocated += whole;
    remainders.push({ partyId: p.id, remainder: share - whole });
  }

  // Distribute remaining seats by largest remainder
  remainders.sort((a, b) => b.remainder - a.remainder);
  let remIdx = 0;
  while (allocated < MINISTRY_PORTFOLIOS.length) {
    partyMinistryCount[remainders[remIdx].partyId]++;
    allocated++;
    remIdx++;
  }

  // Assign ministries — leader party gets finance (first portfolio)
  const ministers: Minister[] = [];
  const candidateIndexes: Record<string, number> = {};
  for (const id of coalition) candidateIndexes[id] = 0;

  let portfolioIdx = 0;
  for (const partyId of coalition) {
    const count = partyMinistryCount[partyId] ?? 0;
    const candidates = MINISTER_CANDIDATES[partyId] ?? [];
    for (let i = 0; i < count && portfolioIdx < MINISTRY_PORTFOLIOS.length; i++) {
      ministers.push({
        name: candidates[candidateIndexes[partyId]++ % Math.max(candidates.length, 1)],
        partyId,
        portfolio: MINISTRY_PORTFOLIOS[portfolioIdx++],
      });
    }
  }

  const gov: Government = {
    id: `gov-${generateId()}`,
    electionId,
    chancellorName,
    chancellorPartyId: leaderPartyId,
    ministers,
    formedOnDay: currentDay,
    dissolvedOnDay: null,
    active: true,
  };

  db.insert(schema.government).values({
    id: gov.id,
    electionId: gov.electionId,
    chancellorName: gov.chancellorName,
    chancellorPartyId: gov.chancellorPartyId,
    ministers: gov.ministers as any,
    formedOnDay: gov.formedOnDay,
    dissolvedOnDay: null,
    active: true,
  }).run();

  return gov;
}

/** Get the currently active government, or null if none */
export function getActiveGovernment(): Government | null {
  const db = getDb();
  const rows = db.select().from(schema.government).all();
  const active = rows.find(r => r.active);
  if (!active) return null;
  return mapGovernment(active);
}

/** Dissolve the current active government */
export function dissolveGovernment(currentDay: number): void {
  const db = getDb();
  const rows = db.select().from(schema.government).all();
  for (const row of rows) {
    if (row.active) {
      db.update(schema.government)
        .set({ active: false, dissolvedOnDay: currentDay })
        .where(eq(schema.government.id, row.id))
        .run();
    }
  }
}

/** Check if a bill qualifies as a government bill (proposer's party has a minister with matching category) */
export function isGovernmentBill(proposerPartyId: string, billCategory: BillCategory): boolean {
  const gov = getActiveGovernment();
  if (!gov) return false;

  // Check if any minister from the proposer's party covers a ministry that maps to this category
  return gov.ministers.some(m =>
    m.partyId === proposerPartyId && MINISTRY_TO_CATEGORY[m.portfolio] === billCategory,
  );
}

function mapGovernment(row: typeof schema.government.$inferSelect): Government {
  return {
    id: row.id,
    electionId: row.electionId,
    chancellorName: row.chancellorName,
    chancellorPartyId: row.chancellorPartyId,
    ministers: row.ministers as unknown as Minister[],
    formedOnDay: row.formedOnDay,
    dissolvedOnDay: row.dissolvedOnDay,
    active: row.active,
  };
}
