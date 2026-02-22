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
    impact: row.impact as unknown as BillImpact,
    votes: row.votes as unknown as BillVote[],
    proposedOnDay: row.proposedOnDay,
    reading: row.reading ?? undefined,
    committeeName: row.committeeName ?? undefined,
    committeeRecommendation: row.committeeRecommendation as Bill["committeeRecommendation"] ?? undefined,
    amendments: row.amendments as unknown as Bill["amendments"] ?? undefined,
    originalImpact: row.originalImpact as unknown as BillImpact ?? undefined,
    statusChangedOnDay: row.statusChangedOnDay ?? undefined,
    isGovernmentBill: row.isGovernmentBill ?? undefined,
    vetoedByPresident: row.vetoedByPresident ?? undefined,
    memberInitiative: row.memberInitiative ?? undefined,
    proposerDisplayName: row.proposerDisplayName ?? undefined,
  };
}
