import { schema } from "@ki-bundestag/engine";
import type { Bill, BillImpact, BillVote } from "@ki-bundestag/types";

export function mapBill(row: typeof schema.bills.$inferSelect): Bill {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category as Bill["category"],
    proposedBy: row.proposedBy,
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
    bundesratState: (row.bundesratState as "pending" | "cleared" | null) ?? undefined,
    bundesratEntryDay: row.bundesratEntryDay ?? undefined,
    ausfertigungDay: row.ausfertigungDay ?? undefined,
    inkrafttretenDay: row.inkrafttretenDay ?? undefined,
  };
}
