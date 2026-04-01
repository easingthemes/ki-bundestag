/**
 * Voting alignment analysis, baseline comparison, and calibration context.
 *
 * Pure computation functions that operate on bill data to produce:
 * - Party-to-party voting alignment matrix
 * - Per-party voting tendencies (yes/no/abstain rates)
 * - Historical baseline comparison (frozen starting-point snapshot vs simulation)
 * - Voting calibration context for agent prompts (fades after 50 bills)
 */

import { getDb, schema } from "../db/index.js";
import { eq, and } from "drizzle-orm";
import type { Bill, Party } from "@ki-bundestag/types";

// ---------------------------------------------------------------------------
// Faction-to-party-ID mapping (bridges abgeordnetenwatch data to sim)
// ---------------------------------------------------------------------------

const FACTION_TO_PARTY_ID: Record<string, string | null> = {
  "SPD": "spd",
  "CDU/CSU": "cdu",
  "GRÜNE": "gruene",
  "Grüne": "gruene",
  "FDP": "fdp",
  "AfD": "afd",
  "DIE LINKE": "linke",
  "Die Linke": "linke",
  "BSW": null, // no simulation equivalent
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AlignmentMatrix {
  parties: Array<{ id: string; name: string; color: string }>;
  matrix: Record<string, Record<string, number | null>>;
  billCount: number;
  windowDays: number | null;
}

export interface PartyVotingTendency {
  partyId: string;
  totalBillsVoted: number;
  yesRate: number;
  noRate: number;
  abstainRate: number;
  governmentBillSupport: number;
  oppositionBillSupport: number;
}

export interface RealWorldVotingPattern {
  pollCount: number;
  pairwiseAgreement: Record<string, Record<string, number>>;
  partyDiscipline: Record<string, number>;
  capturedOnDay: number;
}

export interface VotingComparison {
  parties: Array<{ id: string; name: string; color: string }>;
  simulated: Record<string, Record<string, number | null>>;
  baseline: Record<string, Record<string, number | null>>;
  drift: Record<string, Record<string, number | null>>;
  baselineCapturedOnDay: number;
  baselinePollCount: number;
}

// ---------------------------------------------------------------------------
// Core: calculateVotingAlignment
// ---------------------------------------------------------------------------

export function calculateVotingAlignment(
  bills: Bill[],
  parties: Party[],
  windowDays?: number,
  currentDay?: number,
): AlignmentMatrix {
  const partyIds = parties.map(p => p.id);

  // Filter bills by window if specified
  let filteredBills = bills;
  if (windowDays != null && currentDay != null) {
    const minDay = currentDay - windowDays;
    filteredBills = bills.filter(b => b.proposedOnDay >= minDay);
  }

  // Only consider bills that have votes
  const votedBills = filteredBills.filter(b => Array.isArray(b.votes) && b.votes.length > 0);

  const matrix: Record<string, Record<string, number | null>> = {};

  for (const a of partyIds) {
    matrix[a] = {};
    for (const b of partyIds) {
      if (a === b) {
        matrix[a][b] = 100;
        continue;
      }
      let shared = 0;
      let agreed = 0;
      for (const bill of votedBills) {
        const vA = bill.votes.find(v => v.partyId === a);
        const vB = bill.votes.find(v => v.partyId === b);
        if (!vA || !vB) continue;
        shared++;
        if (vA.vote === vB.vote) agreed++;
      }
      matrix[a][b] = shared >= 3 ? Math.round((agreed / shared) * 100) : null;
    }
  }

  return {
    parties: parties.map(p => ({ id: p.id, name: p.name, color: p.color })),
    matrix,
    billCount: votedBills.length,
    windowDays: windowDays ?? null,
  };
}

// ---------------------------------------------------------------------------
// Core: calculateVotingTendencies
// ---------------------------------------------------------------------------

export function calculateVotingTendencies(
  bills: Bill[],
  parties: Party[],
  coalitionParties: string[],
): PartyVotingTendency[] {
  const votedBills = bills.filter(b => Array.isArray(b.votes) && b.votes.length > 0);

  return parties.map(party => {
    let yes = 0, no = 0, abstain = 0;
    let govBillYes = 0, govBillTotal = 0;
    let oppBillYes = 0, oppBillTotal = 0;

    for (const bill of votedBills) {
      const vote = bill.votes.find(v => v.partyId === party.id);
      if (!vote) continue;

      if (vote.vote === "yes") yes++;
      else if (vote.vote === "no") no++;
      else abstain++;

      const isGovBill = bill.isGovernmentBill || coalitionParties.includes(bill.proposedBy);
      if (isGovBill) {
        govBillTotal++;
        if (vote.vote === "yes") govBillYes++;
      } else {
        oppBillTotal++;
        if (vote.vote === "yes") oppBillYes++;
      }
    }

    const total = yes + no + abstain;
    return {
      partyId: party.id,
      totalBillsVoted: total,
      yesRate: total > 0 ? Math.round((yes / total) * 100) : 0,
      noRate: total > 0 ? Math.round((no / total) * 100) : 0,
      abstainRate: total > 0 ? Math.round((abstain / total) * 100) : 0,
      governmentBillSupport: govBillTotal > 0 ? Math.round((govBillYes / govBillTotal) * 100) : 0,
      oppositionBillSupport: oppBillTotal > 0 ? Math.round((oppBillYes / oppBillTotal) * 100) : 0,
    };
  });
}

// ---------------------------------------------------------------------------
// Baseline: buildVotingPatternDigest
// ---------------------------------------------------------------------------

/**
 * Parse breakdown strings from abgeordnetenwatch poll vote breakdowns
 * and produce a structured voting pattern digest.
 *
 * Each breakdown string looks like:
 *   "SPD: 180 Ja, 0 Nein, 2 Enthaltung; CDU/CSU: 0 Ja, 196 Nein, 1 Enthaltung; ..."
 */
export function buildVotingPatternDigest(
  breakdowns: string[],
  capturedOnDay: number,
): RealWorldVotingPattern | null {
  if (breakdowns.length === 0) return null;

  // Parse each breakdown into per-party tallies
  const pollResults: Array<Record<string, { yes: number; no: number; abstain: number }>> = [];

  for (const breakdown of breakdowns) {
    const partyTallies: Record<string, { yes: number; no: number; abstain: number }> = {};
    const parts = breakdown.split(";").map(s => s.trim()).filter(Boolean);

    for (const part of parts) {
      // "SPD: 180 Ja, 0 Nein, 2 Enthaltung"
      const colonIdx = part.indexOf(":");
      if (colonIdx < 0) continue;
      const factionName = part.slice(0, colonIdx).trim();
      const partyId = FACTION_TO_PARTY_ID[factionName];
      if (!partyId) continue; // skip unknown factions

      const nums = part.slice(colonIdx + 1);
      const jaMatch = nums.match(/(\d+)\s*Ja/);
      const neinMatch = nums.match(/(\d+)\s*Nein/);
      const enthMatch = nums.match(/(\d+)\s*Enthaltung/);

      partyTallies[partyId] = {
        yes: jaMatch ? parseInt(jaMatch[1]) : 0,
        no: neinMatch ? parseInt(neinMatch[1]) : 0,
        abstain: enthMatch ? parseInt(enthMatch[1]) : 0,
      };
    }

    if (Object.keys(partyTallies).length > 0) {
      pollResults.push(partyTallies);
    }
  }

  if (pollResults.length === 0) return null;

  // Determine majority vote per party per poll
  const partyMajorityVotes: Array<Record<string, string>> = [];
  const partyPollCounts: Record<string, number> = {};
  const partyUnanimousCounts: Record<string, number> = {};

  for (const poll of pollResults) {
    const majorityVotes: Record<string, string> = {};
    for (const [partyId, tally] of Object.entries(poll)) {
      const total = tally.yes + tally.no + tally.abstain;
      if (total === 0) continue;

      let majority: string;
      if (tally.yes >= tally.no && tally.yes >= tally.abstain) majority = "yes";
      else if (tally.no >= tally.yes && tally.no >= tally.abstain) majority = "no";
      else majority = "abstain";

      majorityVotes[partyId] = majority;
      partyPollCounts[partyId] = (partyPollCounts[partyId] ?? 0) + 1;

      // Check unanimity (majority vote captures > 90% of total)
      const majorityCount = majority === "yes" ? tally.yes : majority === "no" ? tally.no : tally.abstain;
      if (majorityCount / total >= 0.9) {
        partyUnanimousCounts[partyId] = (partyUnanimousCounts[partyId] ?? 0) + 1;
      }
    }
    partyMajorityVotes.push(majorityVotes);
  }

  // Compute pairwise agreement
  const allPartyIds = [...new Set(pollResults.flatMap(p => Object.keys(p)))];
  const pairwiseAgreement: Record<string, Record<string, number>> = {};

  for (const a of allPartyIds) {
    pairwiseAgreement[a] = {};
    for (const b of allPartyIds) {
      if (a === b) {
        pairwiseAgreement[a][b] = 100;
        continue;
      }
      let shared = 0, agreed = 0;
      for (const majorityVotes of partyMajorityVotes) {
        if (majorityVotes[a] && majorityVotes[b]) {
          shared++;
          if (majorityVotes[a] === majorityVotes[b]) agreed++;
        }
      }
      pairwiseAgreement[a][b] = shared > 0 ? Math.round((agreed / shared) * 100) : 0;
    }
  }

  // Compute party discipline
  const partyDiscipline: Record<string, number> = {};
  for (const partyId of allPartyIds) {
    const total = partyPollCounts[partyId] ?? 0;
    const unanimous = partyUnanimousCounts[partyId] ?? 0;
    partyDiscipline[partyId] = total > 0 ? Math.round((unanimous / total) * 100) : 0;
  }

  return {
    pollCount: pollResults.length,
    pairwiseAgreement,
    partyDiscipline,
    capturedOnDay,
  };
}

// ---------------------------------------------------------------------------
// Baseline: store and retrieve
// ---------------------------------------------------------------------------

/**
 * Store voting pattern baseline if not already stored.
 * Returns true if stored, false if already exists.
 */
export function storeVotingPatternBaseline(pattern: RealWorldVotingPattern): boolean {
  const db = getDb();
  const existing = db.select({ id: schema.realWorldKnowledge.id })
    .from(schema.realWorldKnowledge)
    .where(eq(schema.realWorldKnowledge.category, "voting_pattern"))
    .limit(1)
    .all();

  if (existing.length > 0) return false; // baseline already frozen

  const genId = () => Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
  db.insert(schema.realWorldKnowledge).values({
    id: genId(),
    generation: 0,
    category: "voting_pattern",
    partyId: null,
    digest: JSON.stringify(pattern),
    sourceUrls: null,
    fetchedAt: new Date().toISOString(),
    simDayFirstUsed: null,
    active: true,
  }).run();

  return true;
}

/**
 * Retrieve the frozen voting pattern baseline from DB.
 */
export function getVotingPatternBaseline(): RealWorldVotingPattern | null {
  const db = getDb();
  const row = db.select({ digest: schema.realWorldKnowledge.digest })
    .from(schema.realWorldKnowledge)
    .where(eq(schema.realWorldKnowledge.category, "voting_pattern"))
    .limit(1)
    .all();

  if (row.length === 0) return null;

  try {
    return JSON.parse(row[0].digest) as RealWorldVotingPattern;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Comparison: simulated vs baseline
// ---------------------------------------------------------------------------

export function compareVotingPatterns(
  bills: Bill[],
  parties: Party[],
): VotingComparison | null {
  const baseline = getVotingPatternBaseline();
  if (!baseline) return null;

  const alignment = calculateVotingAlignment(bills, parties);
  const partyIds = parties.map(p => p.id);

  const baselineMatrix: Record<string, Record<string, number | null>> = {};
  const driftMatrix: Record<string, Record<string, number | null>> = {};

  for (const a of partyIds) {
    baselineMatrix[a] = {};
    driftMatrix[a] = {};
    for (const b of partyIds) {
      const baselineVal = baseline.pairwiseAgreement[a]?.[b] ?? null;
      const simVal = alignment.matrix[a]?.[b] ?? null;

      baselineMatrix[a][b] = baselineVal;

      if (simVal != null && baselineVal != null) {
        driftMatrix[a][b] = simVal - baselineVal;
      } else {
        driftMatrix[a][b] = null;
      }
    }
  }

  return {
    parties: alignment.parties,
    simulated: alignment.matrix,
    baseline: baselineMatrix,
    drift: driftMatrix,
    baselineCapturedOnDay: baseline.capturedOnDay,
    baselinePollCount: baseline.pollCount,
  };
}

// ---------------------------------------------------------------------------
// Calibration: voting tendency seed for agent prompts
// ---------------------------------------------------------------------------

const PARTY_LABELS: Record<string, string> = {
  spd: "SPD",
  cdu: "CDU/CSU",
  gruene: "Grüne",
  fdp: "FDP",
  afd: "AfD",
  linke: "Die Linke",
};

/**
 * Build a German-language voting calibration context for a party agent.
 * Returns null if:
 * - totalBillsVoted >= 50 (sim has enough own history)
 * - No voting_pattern baseline exists
 */
export function getVotingCalibrationContext(
  partyId: string,
  totalBillsVoted: number,
): string | null {
  if (totalBillsVoted >= 50) return null;

  const baseline = getVotingPatternBaseline();
  if (!baseline) return null;

  const partyAgreements = baseline.pairwiseAgreement[partyId];
  if (!partyAgreements) return null;

  const lines: string[] = [];
  for (const [otherId, pct] of Object.entries(partyAgreements)) {
    if (otherId === partyId) continue;
    const label = PARTY_LABELS[otherId];
    if (!label) continue;
    lines.push(`- Mit ${label}: ${pct}% Übereinstimmung`);
  }

  if (lines.length === 0) return null;

  return `ABSTIMMUNGSTENDENZEN (Ausgangslage):
Basierend auf historischen Bundestagsdaten tendiert Ihre Partei zu folgenden Übereinstimmungen:
${lines.join("\n")}
Diese Werte dienen als Orientierung. Ihre Abstimmungen sollten sich primär an der aktuellen Simulationslage orientieren.`;
}
