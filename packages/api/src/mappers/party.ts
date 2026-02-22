import { getUserDb, schema } from "@ki-bundestag/engine";
import { count, sql } from "drizzle-orm";
import type { Party, PolicyPriorities } from "@ki-bundestag/types";

export function mapParty(row: typeof schema.parties.$inferSelect, memberCount = 0): Party {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    ideology: row.ideology,
    seatCount: row.seatCount,
    approvalRating: row.approvalRating,
    policyPriorities: row.policyPriorities as unknown as PolicyPriorities,
    coalitionRole: row.coalitionRole as Party["coalitionRole"],
    memberCount,
  };
}

export function getMemberCounts(): Map<string, number> {
  const userDb = getUserDb();
  const rows = userDb
    .select({ partyId: schema.users.partyId, cnt: count() })
    .from(schema.users)
    .where(sql`${schema.users.partyId} IS NOT NULL`)
    .groupBy(schema.users.partyId)
    .all();
  const map = new Map<string, number>();
  for (const r of rows) if (r.partyId) map.set(r.partyId, r.cnt);
  return map;
}
