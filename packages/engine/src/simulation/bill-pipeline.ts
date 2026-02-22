import { and, eq } from "drizzle-orm";
import type { Amendment, Bill, BillCategory, Party, SimulationEvent } from "@ki-bundestag/types";
import { getDb, getUserDb, schema } from "../db/index.js";
import { assignCommittee, generateRecommendation } from "./committees.js";
import { tallyAmendmentVotes, applyAmendmentToBill } from "./voting.js";
import { createNotification } from "./event-queue.js";

/**
 * Advance all active bills through the multi-stage reading pipeline.
 *
 * Transitions:
 *   proposed → first_reading (or → committee for government bills)
 *   first_reading → committee
 *   committee → second_reading (or → rejected if committee recommends rejection)
 *   second_reading → third_reading (tally + apply amendments)
 *
 * Returns simulation events generated during pipeline advancement.
 */
export function advanceBillPipeline(
  day: number,
  allBills: Bill[],
  parties: Party[],
  coalitionParties: string[],
): Array<Omit<SimulationEvent, "id">> {
  const db = getDb();
  const events: Array<Omit<SimulationEvent, "id">> = [];

  // Stage 1: proposed → first_reading (or proposed → committee for government bills)
  const proposedBills = allBills.filter(b => b.status === "proposed" && (b.statusChangedOnDay ?? b.proposedOnDay) < day);
  for (const bill of proposedBills) {
    if ((bill as any).isGovernmentBill) {
      // Government bills skip first reading, go directly to committee
      const committeeName = assignCommittee(bill.category as BillCategory);
      const recommendation = generateRecommendation(bill, parties, coalitionParties);

      bill.status = "committee";
      bill.committeeName = committeeName;
      bill.committeeRecommendation = recommendation as any;
      bill.statusChangedOnDay = day;

      db.update(schema.bills)
        .set({
          status: "committee",
          reading: null as any,
          committeeName,
          committeeRecommendation: recommendation,
          statusChangedOnDay: day,
        })
        .where(eq(schema.bills.id, bill.id))
        .run();

      events.push({
        dayNumber: day,
        type: "bill_committee",
        actor: "system",
        title: `"${bill.title}" — Fast-tracked to Committee (Govt. Bill)`,
        description: `Government bill skips first reading. Committee: ${committeeName}, recommendation: ${recommendation}`,
        data: { billId: bill.id, committeeName, recommendation, isGovernmentBill: true },
      });
      console.log(`  [Pipeline] "${bill.title}" → committee (Govt. Bill, fast-tracked)`);
    } else {
      bill.status = "first_reading";
      bill.reading = 1;
      bill.statusChangedOnDay = day;
      db.update(schema.bills)
        .set({ status: "first_reading", reading: 1, statusChangedOnDay: day })
        .where(eq(schema.bills.id, bill.id))
        .run();

      events.push({
        dayNumber: day,
        type: "bill_first_reading",
        actor: "system",
        title: `"${bill.title}" — First Reading`,
        description: `The bill proposed by ${bill.proposedBy} has been introduced to the Bundestag.`,
        data: { billId: bill.id },
      });
      console.log(`  [Pipeline] "${bill.title}" → first_reading`);
    }
  }

  // Stage 2: first_reading → committee
  const firstReadingBills = allBills.filter(b => b.status === "first_reading" && (b.statusChangedOnDay ?? 0) < day);
  for (const bill of firstReadingBills) {
    const committeeName = assignCommittee(bill.category as BillCategory);
    const recommendation = generateRecommendation(bill, parties, coalitionParties);

    bill.status = "committee";
    bill.reading = undefined;
    bill.committeeName = committeeName;
    bill.committeeRecommendation = recommendation;
    bill.statusChangedOnDay = day;

    db.update(schema.bills)
      .set({
        status: "committee",
        reading: null as any,
        committeeName,
        committeeRecommendation: recommendation,
        statusChangedOnDay: day,
      })
      .where(eq(schema.bills.id, bill.id))
      .run();

    events.push({
      dayNumber: day,
      type: "bill_committee",
      actor: "system",
      title: `"${bill.title}" — Committee Review: ${committeeName}`,
      description: `Committee recommendation: ${recommendation}`,
      data: { billId: bill.id, committeeName, recommendation },
    });
    console.log(`  [Pipeline] "${bill.title}" → committee (${committeeName}: ${recommendation})`);
  }

  // Stage 3: committee → second_reading (or rejected if committee recommends rejection)
  const committeeBills = allBills.filter(b => b.status === "committee" && (b.statusChangedOnDay ?? 0) < day);
  for (const bill of committeeBills) {
    // Reject opposition bills that committee recommends rejecting (~40% chance)
    const isCoalitionBill = coalitionParties.includes(bill.proposedBy);
    if (
      bill.committeeRecommendation === "reject" &&
      !isCoalitionBill &&
      !(bill as any).isGovernmentBill &&
      Math.random() < 0.40
    ) {
      bill.status = "rejected";
      bill.statusChangedOnDay = day;

      db.update(schema.bills)
        .set({ status: "rejected", statusChangedOnDay: day })
        .where(eq(schema.bills.id, bill.id))
        .run();

      events.push({
        dayNumber: day,
        type: "bill_committee_rejected",
        actor: "system",
        title: `"${bill.title}" — Rejected in Committee`,
        description: `The ${bill.committeeName} committee recommended rejection. The bill will not advance to second reading.`,
        data: { billId: bill.id, committeeName: bill.committeeName },
      });
      console.log(`  [Pipeline] "${bill.title}" → rejected (committee)`);
      continue;
    }

    bill.status = "second_reading";
    bill.reading = 2;
    bill.amendments = bill.amendments ?? [];
    bill.statusChangedOnDay = day;

    db.update(schema.bills)
      .set({ status: "second_reading", reading: 2, amendments: (bill.amendments ?? []) as any, statusChangedOnDay: day })
      .where(eq(schema.bills.id, bill.id))
      .run();

    events.push({
      dayNumber: day,
      type: "bill_second_reading",
      actor: "system",
      title: `"${bill.title}" — Second Reading`,
      description: `The bill enters second reading. Parties may propose amendments.`,
      data: { billId: bill.id },
    });
    console.log(`  [Pipeline] "${bill.title}" → second_reading`);
  }

  // Stage 4: second_reading → third_reading (tally amendment votes, apply accepted amendments)
  const secondReadingReady = allBills.filter(b => b.status === "second_reading" && (b.statusChangedOnDay ?? 0) < day);
  for (const bill of secondReadingReady) {
    const amendments = (bill.amendments ?? []) as Amendment[];

    // Tally amendment votes
    for (const amendment of amendments) {
      const { accepted, votes } = tallyAmendmentVotes(amendment, bill, parties, coalitionParties);
      amendment.accepted = accepted;
      amendment.votes = votes;

      if (accepted) {
        applyAmendmentToBill(bill, amendment);
      }

      events.push({
        dayNumber: day,
        type: "amendment_voted",
        actor: "system",
        title: `Amendment "${amendment.title}" ${accepted ? "ACCEPTED" : "REJECTED"}`,
        description: `Amendment to "${bill.title}" by ${amendment.proposedBy}: ${amendment.description}`,
        data: { billId: bill.id, amendmentId: amendment.id, accepted },
      });
      console.log(`  [Amendment] "${amendment.title}" on "${bill.title}": ${accepted ? "accepted" : "rejected"}`);
    }

    bill.status = "third_reading";
    bill.reading = 3;
    bill.statusChangedOnDay = day;

    db.update(schema.bills)
      .set({
        status: "third_reading",
        reading: 3,
        amendments: amendments as any,
        impact: bill.impact as any,
        originalImpact: bill.originalImpact as any ?? null,
        statusChangedOnDay: day,
      })
      .where(eq(schema.bills.id, bill.id))
      .run();

    events.push({
      dayNumber: day,
      type: "bill_third_reading",
      actor: "system",
      title: `"${bill.title}" — Third Reading`,
      description: `The bill enters final reading and vote.${amendments.filter(a => a.accepted).length > 0 ? ` ${amendments.filter(a => a.accepted).length} amendment(s) were incorporated.` : ""}`,
      data: { billId: bill.id, acceptedAmendments: amendments.filter(a => a.accepted).length },
    });

    // Notify MdB seat holders: vote needed
    try {
      const mdbSeats = getUserDb().select().from(schema.bundestagSeats)
        .where(and(eq(schema.bundestagSeats.active, true), eq(schema.bundestagSeats.controller, "human")))
        .all()
        .filter(s => s.userId);
      for (const seat of mdbSeats) {
        createNotification(
          seat.userId!,
          "mdb_vote_needed",
          `Vote needed: "${bill.title}"`,
          `"${bill.title}" has entered Third Reading. Cast your MdB vote before the day ends.`,
          { billId: bill.id },
          day,
        );
      }
    } catch {}

    console.log(`  [Pipeline] "${bill.title}" → third_reading`);
  }

  return events;
}
