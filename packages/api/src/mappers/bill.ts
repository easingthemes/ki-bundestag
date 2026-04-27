import { schema } from "@ki-bundestag/engine";
import type { Bill, BillImpact, BillVote, BundesratVoteResult } from "@ki-bundestag/types";

/**
 * Optional party-lookup map. When supplied, mapBill populates the enriched
 * `proposingParty` field so agents don't need a separate `/api/parties` call.
 * Pass `undefined` (or omit) and `proposingParty` is left undefined.
 */
export type PartyLookup = Record<string, { id: string; name: string; color: string }>;

/** Build a PartyLookup from the parties table. Cheap query — 6 rows. */
export function buildPartyLookup(rows: Array<{ id: string; name: string; color: string }>): PartyLookup {
  const map: PartyLookup = {};
  for (const r of rows) map[r.id] = { id: r.id, name: r.name, color: r.color };
  return map;
}

export function mapBill(row: typeof schema.bills.$inferSelect, parties?: PartyLookup): Bill {
  const proposingParty = parties && row.proposedBy ? parties[row.proposedBy] ?? null : undefined;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category as Bill["category"],
    proposedBy: row.proposedBy,
    proposingParty,
    status: row.status as Bill["status"],
    impact: (row.impact && typeof row.impact === 'object' ? row.impact : {}) as BillImpact,
    votes: (Array.isArray(row.votes) ? row.votes : []) as BillVote[],
    proposedOnDay: row.proposedOnDay,
    reading: row.reading ?? undefined,
    committeeName: row.committeeName ?? undefined,
    committeeRecommendation: row.committeeRecommendation as Bill["committeeRecommendation"] ?? undefined,
    amendments: (row.amendments && typeof row.amendments === 'object' ? row.amendments : undefined) as Bill["amendments"] ?? undefined,
    originalImpact: (row.originalImpact && typeof row.originalImpact === 'object' ? row.originalImpact : undefined) as BillImpact ?? undefined,
    statusChangedOnDay: row.statusChangedOnDay ?? undefined,
    isGovernmentBill: row.isGovernmentBill ?? undefined,
    vetoedByPresident: row.vetoedByPresident ?? undefined,
    memberInitiative: row.memberInitiative ?? undefined,
    proposerDisplayName: row.proposerDisplayName ?? undefined,
    stageEntryDay: row.stageEntryDay ?? undefined,
    stageMinDuration: row.stageMinDuration ?? undefined,
    stageMaxDuration: row.stageMaxDuration ?? undefined,
    isComplexBill: row.isComplexBill ?? undefined,
    bundesratState: (row.bundesratState as Bill["bundesratState"] | null) ?? undefined,
    bundesratEntryDay: row.bundesratEntryDay ?? undefined,
    ausfertigungDay: row.ausfertigungDay ?? undefined,
    inkrafttretenDay: row.inkrafttretenDay ?? undefined,
    bundesratMode: (row.bundesratMode as Bill["bundesratMode"]) ?? undefined,
    bundesratVoteResult: (row.bundesratVoteResult && typeof row.bundesratVoteResult === 'object' ? row.bundesratVoteResult as BundesratVoteResult : undefined),
    vermittlungEntryDay: row.vermittlungEntryDay ?? undefined,
    vermittlungMinDuration: row.vermittlungMinDuration ?? undefined,
    vermittlungOutcome: (row.vermittlungOutcome as Bill["vermittlungOutcome"]) ?? undefined,
  };
}
