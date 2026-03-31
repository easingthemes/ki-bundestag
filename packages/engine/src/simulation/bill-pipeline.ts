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
        title: `"${bill.title}" — Direkt in den Ausschuss (Regierungsentwurf)`,
        description: `Regierungsentwurf überspringt 1. Lesung. Ausschuss: ${committeeName}, Empfehlung: ${recommendation}`,
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
        title: `"${bill.title}" — 1. Lesung`,
        description: `Der Gesetzentwurf von ${bill.proposedBy} wurde im Bundestag eingebracht.`,
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
      title: `"${bill.title}" — Ausschussprüfung: ${committeeName}`,
      description: `Ausschussempfehlung: ${recommendation}`,
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
        title: `"${bill.title}" — Im Ausschuss abgelehnt`,
        description: `Der Ausschuss ${bill.committeeName} hat die Ablehnung empfohlen. Der Entwurf wird nicht zur 2. Lesung zugelassen.`,
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
      title: `"${bill.title}" — 2. Lesung`,
      description: `Der Gesetzentwurf geht in die 2. Lesung. Parteien können Änderungsanträge stellen.`,
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
        title: `Änderungsantrag "${amendment.title}" ${accepted ? "ANGENOMMEN" : "ABGELEHNT"}`,
        description: `Änderungsantrag zu "${bill.title}" von ${amendment.proposedBy}: ${amendment.description}`,
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
      title: `"${bill.title}" — 3. Lesung`,
      description: `Der Gesetzentwurf geht in die Schlusslesung und Abstimmung.${amendments.filter(a => a.accepted).length > 0 ? ` ${amendments.filter(a => a.accepted).length} Änderungsantrag/Änderungsanträge wurden eingearbeitet.` : ""}`,
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
          `Abstimmung nötig: "${bill.title}"`,
          `"${bill.title}" ist in der 3. Lesung. Gib deine MdB-Stimme ab, bevor der Tag endet.`,
          { billId: bill.id },
          day,
        );
      }
    } catch {}

    console.log(`  [Pipeline] "${bill.title}" → third_reading`);
  }

  return events;
}
