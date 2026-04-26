/**
 * Process user-filed MdB parliamentary actions from pending_injections.
 *
 * Motions, interpellations, and amendments submitted by MdBs are queued
 * as pending_injections with type "mdb_motion", "mdb_interpellation", or "mdb_amendment".
 * This module consumes them during the simulation day.
 */

import { eq } from "drizzle-orm";
import type { Motion, SimulationEvent } from "@ki-bundestag/types";
import { getDb, schema } from "../db/index.js";
import { getActiveGovernment } from "./government.js";
import { tallyMotionVotes, motionSentimentImpact } from "./motions.js";
import { USER_MOTION_CAP_PER_DAY } from "../config/index.js";

function generateId(): string {
  return Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}

export interface MdbActionResult {
  events: Array<Omit<SimulationEvent, "id">>;
  sentimentDelta: number;
}

/**
 * Process pending MdB actions (motions, interpellations, amendments).
 * Called from loop.ts before party agents so AI can see user-filed actions in context.
 */
export function processMdbActions(
  currentDay: number,
  allParties: Array<{ id: string; name: string; seatCount: number; coalitionRole: string }>,
  coalitionParties: string[],
): MdbActionResult {
  const db = getDb();
  const result: MdbActionResult = { events: [], sentimentDelta: 0 };

  // Load unconsumed MdB injections
  const allRows = db.select().from(schema.pendingInjections).all()
    .filter((r: any) => !r.consumed && typeof r.type === "string" && (r.type as string).startsWith("mdb_"));

  if (allRows.length === 0) return result;

  // Cap motion processing per sim day so user/bot volume doesn't bypass the
  // ±0.5/day sentiment ceiling (each motion applies a delta). Excess motions
  // stay queued for next sim day. FIFO by id (insertion order).
  const motionRows = allRows.filter(r => r.type === "mdb_motion").slice(0, USER_MOTION_CAP_PER_DAY);
  const otherRows = allRows.filter(r => r.type !== "mdb_motion");
  const rows = [...motionRows, ...otherRows];

  const activeGov = getActiveGovernment();

  for (const row of rows) {
    const data = row.data as unknown as Record<string, unknown>;
    const type = row.type as string;

    // Mark as consumed
    db.update(schema.pendingInjections)
      .set({ consumed: true })
      .where(eq(schema.pendingInjections.id, row.id))
      .run();

    if (type === "mdb_motion") {
      const motionId = `motion-${currentDay}-${generateId()}`;
      const proposerName = (data.proposerName as string) ?? "MdB";
      const partyId = data.partyId as string;
      const motion: Motion = {
        id: motionId,
        type: (data.motionType as "motion" | "resolution") ?? "motion",
        title: data.title as string,
        description: data.description as string,
        proposedBy: partyId,
        status: "proposed",
        votes: [],
        dayNumber: currentDay,
      };

      // Tally votes algorithmically (same as AI motions)
      const { passed, votes } = tallyMotionVotes(motion, allParties as any, coalitionParties);
      motion.votes = votes;
      motion.status = passed ? "passed" : "rejected";

      const sentImpact = motionSentimentImpact(motion);
      motion.sentimentImpact = sentImpact;
      result.sentimentDelta += sentImpact;

      db.insert(schema.motions).values({
        id: motion.id,
        type: motion.type,
        title: motion.title,
        description: motion.description,
        proposedBy: motion.proposedBy,
        status: motion.status,
        votes: motion.votes as any,
        dayNumber: motion.dayNumber,
        sentimentImpact: motion.sentimentImpact ?? null,
      }).run();

      const party = allParties.find(p => p.id === partyId);
      const typeLabel = motion.type === "motion" ? "Antrag" : "Entschließung";

      result.events.push({
        dayNumber: currentDay,
        type: "motion_submitted",
        actor: partyId,
        title: `MdB ${proposerName} (${party?.name ?? partyId}) submits ${typeLabel}: "${motion.title}"`,
        description: motion.description,
        data: { motionId, motionType: motion.type, mdb: true },
      });
      result.events.push({
        dayNumber: currentDay,
        type: passed ? "motion_passed" : "motion_rejected",
        actor: "system",
        title: `${typeLabel} "${motion.title}" ${passed ? "PASSED" : "REJECTED"}`,
        description: `Votes: ${votes.filter(v => v.vote === "yes").length} yes, ${votes.filter(v => v.vote === "no").length} no`,
        data: { motionId, passed, mdb: true },
      });

      console.log(`  [MdB Motion] ${proposerName}: "${motion.title}" (${typeLabel}) — ${motion.status}`);

    } else if (type === "mdb_interpellation") {
      const partyId = data.partyId as string;
      const proposerName = (data.proposerName as string) ?? "MdB";
      const interpType = (data.interpellationType as "kleine" | "große") ?? "kleine";
      const targetMinistry = data.targetMinistry as string;

      const minister = activeGov?.ministers.find(m => m.portfolio === targetMinistry);
      if (!minister) {
        console.warn(`  [MdB Interpellation] No minister for ${targetMinistry}, skipping`);
        continue;
      }

      const interpId = `interp-${currentDay}-${generateId()}`;
      db.insert(schema.interpellations).values({
        id: interpId,
        type: interpType,
        title: data.title as string,
        question: data.question as string,
        filedByPartyId: partyId,
        targetMinistry,
        targetMinisterName: minister.name,
        targetPartyId: minister.partyId,
        response: null,
        status: "pending",
        dayNumber: currentDay,
        respondedOnDay: null,
        sentimentImpact: null,
      }).run();

      const party = allParties.find(p => p.id === partyId);
      const typeLabel = interpType === "große" ? "Große Anfrage" : "Kleine Anfrage";

      result.events.push({
        dayNumber: currentDay,
        type: "interpellation_filed",
        actor: partyId,
        title: `MdB ${proposerName} (${party?.name ?? partyId}) files ${typeLabel}: "${data.title}"`,
        description: `${typeLabel} targeting ${minister.name} (${targetMinistry}): ${data.question}`,
        data: { interpellationId: interpId, interpellationType: interpType, targetMinistry, mdb: true },
      });

      console.log(`  [MdB Interpellation] ${proposerName}: "${data.title}" (${typeLabel}) → ${minister.name}`);

    } else if (type === "mdb_amendment") {
      const partyId = data.partyId as string;
      const proposerName = (data.proposerName as string) ?? "MdB";
      const billId = data.billId as string;

      const bill = db.select().from(schema.bills).where(eq(schema.bills.id, billId)).get();
      if (!bill || bill.status !== "second_reading") {
        console.warn(`  [MdB Amendment] Bill ${billId} not in second_reading, skipping`);
        continue;
      }

      const amendmentId = `amend-${currentDay}-${generateId()}`;
      const impactChange = (data.impactChange as Record<string, number>) ?? {};

      const amendments = (bill.amendments as unknown as any[]) ?? [];
      amendments.push({
        id: amendmentId,
        billId,
        proposedBy: partyId,
        title: data.title as string,
        description: data.description as string,
        impactChange,
        accepted: false,
        votes: [],
      });

      db.update(schema.bills)
        .set({ amendments: amendments as any })
        .where(eq(schema.bills.id, billId))
        .run();

      const party = allParties.find(p => p.id === partyId);
      result.events.push({
        dayNumber: currentDay,
        type: "amendment_proposed",
        actor: partyId,
        title: `MdB ${proposerName} (${party?.name ?? partyId}) proposes amendment to "${bill.title}"`,
        description: `${data.title}: ${data.description}`,
        data: { billId, amendmentId, impactChange, mdb: true },
      });

      console.log(`  [MdB Amendment] ${proposerName} amends "${bill.title}": "${data.title}"`);
    }
  }

  return result;
}
