import { and, eq } from "drizzle-orm";
import type { Amendment, Bill, BillCategory, BillImpact, NationalState, Party, SimulationEvent } from "@ki-bundestag/types";
import { getDb, getUserDb, schema } from "../db/index.js";
import { assignCommittee, generateRecommendation } from "./committees.js";
import { tallyAmendmentVotes, applyAmendmentToBill } from "./voting.js";
import { createNotification } from "./event-queue.js";
import { isSitzungsTag } from "./parliament-calendar.js";
import { checkPresidentialVeto } from "./veto.js";
import { applyBillImpact } from "./economy.js";
import { updateSentiment } from "./opinion.js";
import { BILL_STAGE_DURATIONS, BUNDESRAT_DURATION, AUSFERTIGUNG_DURATION, INKRAFTTRETEN_OFFSET } from "../config/parliament.js";

/**
 * Uniform draw from an inclusive integer range.
 */
function randomInRange(min: number, max: number): number {
  if (max <= min) return min;
  return min + Math.floor(Math.random() * (max - min + 1));
}

/**
 * Days the given bill has spent in its current stage.
 * Falls back to statusChangedOnDay / proposedOnDay for pre-Cycle-1 bills
 * that have no stageEntryDay set.
 */
export function dwellDays(bill: Bill, day: number): number {
  const entry = bill.stageEntryDay
    ?? bill.statusChangedOnDay
    ?? bill.proposedOnDay
    ?? day;
  return day - entry;
}

/**
 * Committee range for this bill's complexity tier. Persisted per-bill at
 * committee entry so re-runs and late-readers see the same numbers.
 */
export function committeeRange(bill: Bill): { min: number; max: number } {
  return bill.isComplexBill
    ? BILL_STAGE_DURATIONS.committee.complex
    : BILL_STAGE_DURATIONS.committee.ordinary;
}

/**
 * Advance all active bills through the multi-stage reading pipeline.
 *
 * Stage transitions are gated by:
 *   - minimum dwell time (stageMinDuration — persisted per-bill at stage entry)
 *   - Sitzungstag calendar (for reading stages only; committee dwell continues
 *     through recess weeks)
 *
 * Returns simulation events generated during pipeline advancement.
 */
export function advanceBillPipeline(
  day: number,
  allBills: Bill[],
  parties: Party[],
  coalitionParties: string[],
  startDate?: Date,
  nationalState?: NationalState,
): Array<Omit<SimulationEvent, "id">> {
  const db = getDb();
  const events: Array<Omit<SimulationEvent, "id">> = [];

  const onSitzungsTag = !startDate || isSitzungsTag(day, startDate);

  // Stage 1: proposed → first_reading (or proposed → committee for government bills)
  // Gate: Sitzungstag for first_reading (plenary event). Government bills skip 1st
  //       reading and enter committee — no Sitzungstag gate required.
  const proposedBills = allBills.filter(b => b.status === "proposed" && dwellDays(b, day) >= BILL_STAGE_DURATIONS.proposed.min);
  for (const bill of proposedBills) {
    if ((bill as any).isGovernmentBill) {
      const committeeName = assignCommittee(bill.category as BillCategory);
      const recommendation = generateRecommendation(bill, parties, coalitionParties);
      const range = committeeRange(bill);
      const minDur = randomInRange(range.min, range.max);

      bill.status = "committee";
      bill.committeeName = committeeName;
      bill.committeeRecommendation = recommendation as any;
      bill.statusChangedOnDay = day;
      bill.stageEntryDay = day;
      bill.stageMinDuration = minDur;
      bill.stageMaxDuration = range.max;

      db.update(schema.bills)
        .set({
          status: "committee",
          reading: null as any,
          committeeName,
          committeeRecommendation: recommendation,
          statusChangedOnDay: day,
          stageEntryDay: day,
          stageMinDuration: minDur,
          stageMaxDuration: range.max,
        })
        .where(eq(schema.bills.id, bill.id))
        .run();

      events.push({
        dayNumber: day,
        type: "bill_committee",
        actor: "system",
        title: `"${bill.title}" — Direkt in den Ausschuss (Regierungsentwurf)`,
        description: `Regierungsentwurf überspringt 1. Lesung. Ausschuss: ${committeeName}, Empfehlung: ${recommendation}`,
        data: { billId: bill.id, committeeName, recommendation, isGovernmentBill: true, stageMinDuration: minDur },
      });
      console.log(`  [Pipeline] "${bill.title}" → committee (Govt. Bill, min ${minDur}d)`);
    } else if (onSitzungsTag) {
      const minDur = BILL_STAGE_DURATIONS.first_reading.min;
      bill.status = "first_reading";
      bill.reading = 1;
      bill.statusChangedOnDay = day;
      bill.stageEntryDay = day;
      bill.stageMinDuration = minDur;
      bill.stageMaxDuration = BILL_STAGE_DURATIONS.first_reading.max;
      db.update(schema.bills)
        .set({
          status: "first_reading",
          reading: 1,
          statusChangedOnDay: day,
          stageEntryDay: day,
          stageMinDuration: minDur,
          stageMaxDuration: BILL_STAGE_DURATIONS.first_reading.max,
        })
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
  // Gate: min-dwell (first reading always lasts exactly one sitting day by config).
  //       Committee entry itself does not need a Sitzungstag — it's a committee
  //       referral, not a plenary event.
  const firstReadingBills = allBills.filter(b => b.status === "first_reading" && dwellDays(b, day) >= BILL_STAGE_DURATIONS.first_reading.min);
  for (const bill of firstReadingBills) {
    const committeeName = assignCommittee(bill.category as BillCategory);
    const recommendation = generateRecommendation(bill, parties, coalitionParties);
    const range = committeeRange(bill);
    const minDur = randomInRange(range.min, range.max);

    bill.status = "committee";
    bill.reading = undefined;
    bill.committeeName = committeeName;
    bill.committeeRecommendation = recommendation;
    bill.statusChangedOnDay = day;
    bill.stageEntryDay = day;
    bill.stageMinDuration = minDur;
    bill.stageMaxDuration = range.max;

    db.update(schema.bills)
      .set({
        status: "committee",
        reading: null as any,
        committeeName,
        committeeRecommendation: recommendation,
        statusChangedOnDay: day,
        stageEntryDay: day,
        stageMinDuration: minDur,
        stageMaxDuration: range.max,
      })
      .where(eq(schema.bills.id, bill.id))
      .run();

    events.push({
      dayNumber: day,
      type: "bill_committee",
      actor: "system",
      title: `"${bill.title}" — Ausschussprüfung: ${committeeName}`,
      description: `Ausschussempfehlung: ${recommendation} (voraussichtlich ${minDur} Tage Beratung)`,
      data: { billId: bill.id, committeeName, recommendation, stageMinDuration: minDur },
    });
    console.log(`  [Pipeline] "${bill.title}" → committee (${committeeName}: ${recommendation}, min ${minDur}d)`);
  }

  // Stage 3: committee → second_reading
  // Gate: committee min-dwell reached (6–12 wks ordinary, 3–6 mo complex) AND
  //       a Sitzungstag (2nd reading is a plenary event).
  //       Rejection roll evaluates once, when the minimum dwell is first met.
  const committeeBills = allBills.filter(b => b.status === "committee" && dwellDays(b, day) >= (b.stageMinDuration ?? BILL_STAGE_DURATIONS.committee.ordinary.min));
  for (const bill of committeeBills) {
    // Reject opposition bills that committee recommends rejecting (~40% chance).
    // Only evaluated once per bill — at the first day dwell >= minimum.
    const isCoalitionBill = coalitionParties.includes(bill.proposedBy);
    if (
      bill.committeeRecommendation === "reject" &&
      !isCoalitionBill &&
      !(bill as any).isGovernmentBill &&
      dwellDays(bill, day) === (bill.stageMinDuration ?? BILL_STAGE_DURATIONS.committee.ordinary.min) &&
      Math.random() < 0.40
    ) {
      bill.status = "rejected";
      bill.statusChangedOnDay = day;
      bill.stageEntryDay = day;

      db.update(schema.bills)
        .set({ status: "rejected", statusChangedOnDay: day, stageEntryDay: day })
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

    if (!onSitzungsTag) continue;

    const minDur = BILL_STAGE_DURATIONS.second_reading.min;
    bill.status = "second_reading";
    bill.reading = 2;
    bill.amendments = bill.amendments ?? [];
    bill.statusChangedOnDay = day;
    bill.stageEntryDay = day;
    bill.stageMinDuration = minDur;
    bill.stageMaxDuration = BILL_STAGE_DURATIONS.second_reading.max;

    db.update(schema.bills)
      .set({
        status: "second_reading",
        reading: 2,
        amendments: (bill.amendments ?? []) as any,
        statusChangedOnDay: day,
        stageEntryDay: day,
        stageMinDuration: minDur,
        stageMaxDuration: BILL_STAGE_DURATIONS.second_reading.max,
      })
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
  // Gate: second_reading min-dwell AND Sitzungstag. third_reading.min = 0, so 2nd→3rd
  //       can happen on the same sitting day (GO-BT §81 — standard practice).
  const secondReadingReady = allBills.filter(b => b.status === "second_reading" && dwellDays(b, day) >= BILL_STAGE_DURATIONS.second_reading.min);
  for (const bill of secondReadingReady) {
    if (!onSitzungsTag) continue;

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

    const minDur = BILL_STAGE_DURATIONS.third_reading.min;
    bill.status = "third_reading";
    bill.reading = 3;
    bill.statusChangedOnDay = day;
    bill.stageEntryDay = day;
    bill.stageMinDuration = minDur;
    bill.stageMaxDuration = BILL_STAGE_DURATIONS.third_reading.max;

    db.update(schema.bills)
      .set({
        status: "third_reading",
        reading: 3,
        amendments: amendments as any,
        impact: bill.impact as any,
        originalImpact: bill.originalImpact as any ?? null,
        statusChangedOnDay: day,
        stageEntryDay: day,
        stageMinDuration: minDur,
        stageMaxDuration: BILL_STAGE_DURATIONS.third_reading.max,
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

  // Stage 5: third_reading (bundesratState='pending') → Bundesrat cleared + veto check.
  // Entered when loop.ts tallies a passing 3rd-reading vote and sets bundesratState.
  // Dwell clock uses bundesratEntryDay; min duration is stored in stageMinDuration
  // (re-drawn per-bill in loop.ts from BUNDESRAT_DURATION).
  const bundesratPending = allBills.filter(b =>
    b.status === "third_reading" &&
    b.bundesratState === "pending" &&
    b.bundesratEntryDay != null &&
    (day - b.bundesratEntryDay) >= (b.stageMinDuration ?? BUNDESRAT_DURATION.min),
  );
  for (const bill of bundesratPending) {
    const { vetoed, events: vetoEvents } = checkPresidentialVeto(bill, parties, day);
    for (const ev of vetoEvents) events.push(ev);
    if (vetoed) {
      // veto.ts has already updated status='rejected' + vetoedByPresident in DB.
      bill.status = "rejected";
      bill.statusChangedOnDay = day;
      continue;
    }
    const ausfertigung = day + randomInRange(AUSFERTIGUNG_DURATION.min, AUSFERTIGUNG_DURATION.max);
    const inkrafttreten = ausfertigung + INKRAFTTRETEN_OFFSET;
    bill.bundesratState = "cleared";
    bill.ausfertigungDay = ausfertigung;
    bill.inkrafttretenDay = inkrafttreten;
    db.update(schema.bills)
      .set({
        bundesratState: "cleared",
        ausfertigungDay: ausfertigung,
        inkrafttretenDay: inkrafttreten,
      })
      .where(eq(schema.bills.id, bill.id))
      .run();
    console.log(`  [Pipeline] "${bill.title}" → Bundesrat cleared, Inkrafttreten day ${inkrafttreten}`);
  }

  // Stage 6: Inkrafttreten — status='passed', apply economic impact, emit bill_passed.
  const inkrafttretenReady = allBills.filter(b =>
    b.status === "third_reading" &&
    b.bundesratState === "cleared" &&
    b.inkrafttretenDay != null &&
    day >= b.inkrafttretenDay,
  );
  for (const bill of inkrafttretenReady) {
    bill.status = "passed";
    bill.statusChangedOnDay = day;
    bill.stageEntryDay = day;
    db.update(schema.bills)
      .set({ status: "passed", statusChangedOnDay: day, stageEntryDay: day })
      .where(eq(schema.bills.id, bill.id))
      .run();

    if (nationalState) {
      const impact = bill.impact as BillImpact;
      nationalState.economy = applyBillImpact(nationalState.economy, impact);
      nationalState.publicSentiment = updateSentiment(nationalState.publicSentiment, impact);
    }

    events.push({
      dayNumber: day,
      type: "bill_passed",
      actor: "system",
      title: `"${bill.title}" — tritt in Kraft`,
      description: `Das Gesetz wurde im Bundesgesetzblatt verkündet und tritt heute in Kraft.`,
      data: { billId: bill.id, inkrafttretenDay: day },
    });
    console.log(`  [Pipeline] "${bill.title}" → passed (Inkrafttreten)`);
  }

  return events;
}
