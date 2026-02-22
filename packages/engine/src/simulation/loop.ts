import { and, desc, eq, ne, count, gte, inArray } from "drizzle-orm";
import type {
  AgentContext,
  Bill,
  BillImpact,
  BillVote,
  CoalitionAgreement,
  ConfidenceVote,
  ConstitutionalChallenge,
  Crisis,
  Election,
  Interpellation,
  Motion,
  NationalState,
  NegotiationRound,
  Party,
  SimulationEvent,
} from "@ki-bundestag/types";
import { getDb, getUserDb, schema, migrateDatabase } from "../db/index.js";
import { runPartyAgent } from "../agent/index.js";
import { applyEconomicDrift, applyBillImpact, reverseBillImpact } from "./economy.js";
import { tallyVotes, tallyAmendmentVotes, applyAmendmentToBill } from "./voting.js";
import { assignCommittee, generateRecommendation } from "./committees.js";
import { applyApprovalDrift, approvalFromBillOutcome, updateSentiment, applySentimentDrift, membershipBonus } from "./opinion.js";
import { maybeTriggerCrisis, applyCrisisImpacts, resolveExpiredCrises } from "./crises.js";
import { isPollDay, isMonthlyDay, isBudgetDay, weeklyOpinionRecalc, monthlyEconomicReport } from "./cycles.js";
import { shouldTriggerElection, announceElection, advanceElectionPhase, calculateResults, formGovernment } from "./elections.js";
import { TIME_CONFIG } from "./timing.js";
import { runNegotiationRound, synthesizeAgreement, buildNegotiationEvents, getMaxNegotiationRounds } from "./negotiations.js";
import { generateWeeklyPolls, resolveExpiredPolls } from "./polls.js";
import { generateDailyMedia, getRecentMedia, mediaSentimentImpact } from "./media.js";
import { answerPendingQuestions } from "./questions.js";
import { maybeGenerateReferendum, resolveExpiredReferendums } from "./referendums.js";
import { processInjections } from "./injections.js";
import { updateFraktionen, getActiveFraktionen } from "./fraktionen.js";
import { tallyMotionVotes, motionSentimentImpact } from "./motions.js";
import { formCabinet, getActiveGovernment, dissolveGovernment, isGovernmentBill as checkIsGovernmentBill } from "./government.js";
import { answerPendingInterpellations } from "./interpellations.js";
import { tallyVertrauensfrage, tallyMisstrauensvotum, confidenceVoteSentimentImpact } from "./confidence-votes.js";
import { adjudicateChallenge, constitutionalCourtApprovalImpact } from "./constitutional-court.js";
import { generateBudgetAllocations, generateRevisedAllocations, tallyBudgetVote, applyBudgetEconomicEffect, shouldPresidentVeto, BUDGET_TOTAL } from "./budget.js";
import { generateDailySummary } from "./summary.js";
import { reviewInternalProposals } from "./internal-proposals.js";
import { resetAllSeats, allocateSeats, reviewMdbApplications } from "./seats.js";
import { processDaySpeeches } from "./speeches.js";
import { processMdbActions } from "./mdb-actions.js";
import { reviewPartyDiscipline } from "./discipline.js";
import type { TimingPreset } from "./timing.js";

function generateId(): string {
  return Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}

function addEvent(
  events: Array<Omit<SimulationEvent, "id">>,
  ev: Omit<SimulationEvent, "id">,
) {
  events.push(ev);
}

export async function runDay(): Promise<number> {
  // Ensure schema is up-to-date (idempotent, creates missing tables like fraktionen)
  migrateDatabase();

  const db = getDb();

  // 1. Load current state
  const metaRows = db.select().from(schema.simulationMeta).all();
  const meta = metaRows[0];
  if (!meta) throw new Error("No simulation meta found. Run seed first.");

  const currentDay = meta.currentDay + 1;
  console.log(`\n=== DAY ${currentDay} ===`);

  // Write currentDay + dayStartedAt immediately so the API reflects the new day in real time
  db.update(schema.simulationMeta)
    .set({ currentDay, dayStartedAt: new Date().toISOString() } as any)
    .where(eq(schema.simulationMeta.id, meta.id))
    .run();

  // 2. Load all data
  const allParties = db.select().from(schema.parties).all() as unknown as Party[];
  const stateRows = db.select().from(schema.nationalState).all();
  const state = stateRows[0];
  if (!state) throw new Error("No national state found.");

  const nationalState: NationalState = {
    coalitionParties: state.coalitionParties as unknown as string[],
    oppositionParties: state.oppositionParties as unknown as string[],
    economy: {
      budget: state.budget,
      unemployment: state.unemployment,
      inflation: state.inflation,
      gdpGrowth: state.gdpGrowth,
    },
    publicSentiment: state.publicSentiment,
    provisionalBudget: (state as any).provisionalBudget ?? false,
  };

  const allBills = db.select().from(schema.bills).all() as unknown as Bill[];
  const activeBillStatuses = ["proposed", "first_reading", "committee", "second_reading", "third_reading"];
  const pendingBills = allBills.filter(b => activeBillStatuses.includes(b.status));

  const recentEvents = db.select().from(schema.simulationEvents).all() as unknown as SimulationEvent[];
  // Only keep last 20 events for context
  const recentForContext = recentEvents.slice(-20);

  const dayEvents: Array<Omit<SimulationEvent, "id">> = [];

  // Day start event
  addEvent(dayEvents, {
    dayNumber: currentDay,
    type: "day_start",
    actor: "system",
    title: `Day ${currentDay} begins`,
    description: `A new day in the Bundestag. Budget: ${nationalState.economy.budget}B, Unemployment: ${nationalState.economy.unemployment}%, Inflation: ${nationalState.economy.inflation}%, GDP Growth: ${nationalState.economy.gdpGrowth}%`,
  });

  // 3. Apply economic drift
  const driftedEconomy = applyEconomicDrift(nationalState.economy);
  nationalState.economy = driftedEconomy;

  // 3b. Provisional budget drag — uncertainty suppresses GDP growth
  if (nationalState.provisionalBudget) {
    nationalState.economy.gdpGrowth = Math.max(-3, Math.round((nationalState.economy.gdpGrowth - 0.01) * 1000) / 1000);
  }

  addEvent(dayEvents, {
    dayNumber: currentDay,
    type: "economy_update",
    actor: "system",
    title: "Economic indicators updated",
    description: `Budget: ${driftedEconomy.budget}B, Unemployment: ${driftedEconomy.unemployment}%, Inflation: ${driftedEconomy.inflation}%, GDP Growth: ${driftedEconomy.gdpGrowth}%`,
  });

  // 3a. Process pending injections
  const allCrisesForInjection = db.select().from(schema.crises).all()
    .filter((c: any) => !c.resolved).map(mapCrisis);
  const injections = processInjections(currentDay, allCrisesForInjection);
  for (const ev of injections.events) {
    addEvent(dayEvents, ev);
  }

  // Apply injected crisis
  if (injections.crisis) {
    db.insert(schema.crises).values({
      id: injections.crisis.id,
      templateId: injections.crisis.templateId,
      name: injections.crisis.name,
      description: injections.crisis.description,
      category: injections.crisis.category,
      severity: injections.crisis.severity,
      startDay: injections.crisis.startDay,
      endDay: injections.crisis.endDay,
      dailyImpact: injections.crisis.dailyImpact as any,
      resolved: false,
    }).run();
    console.log(`  [Injection] Crisis: ${injections.crisis.name}`);
  }

  // Apply injected economic shock
  if (injections.economicShock) {
    const shock = injections.economicShock;
    if (shock.budget) nationalState.economy.budget = Math.round((nationalState.economy.budget + shock.budget) * 10) / 10;
    if (shock.unemployment) nationalState.economy.unemployment = Math.max(0, Math.round((nationalState.economy.unemployment + shock.unemployment) * 10) / 10);
    if (shock.inflation) nationalState.economy.inflation = Math.max(0, Math.round((nationalState.economy.inflation + shock.inflation) * 10) / 10);
    if (shock.gdpGrowth) nationalState.economy.gdpGrowth = Math.round((nationalState.economy.gdpGrowth + shock.gdpGrowth) * 10) / 10;
    if (shock.publicSentiment) nationalState.publicSentiment = Math.max(5, Math.min(75, Math.round((nationalState.publicSentiment + shock.publicSentiment) * 10) / 10));
    console.log(`  [Injection] Economic shock applied`);
  }

  let nextElectionDay = meta.nextElectionDay ?? TIME_CONFIG.TERM_DAYS;
  const budgetRetryDay: number | null = (meta as any).budgetRetryDay ?? null;

  // 3a2. Handle election invalidation
  if (injections.invalidateElection) {
    // Check for active (non-completed) election first
    const activeElRows = db.select().from(schema.elections)
      .where(ne(schema.elections.status, "completed")).all();
    if (activeElRows.length > 0) {
      // Cancel any active election
      for (const row of activeElRows) {
        db.update(schema.elections)
          .set({ status: "invalidated" as any })
          .where(eq(schema.elections.id, row.id))
          .run();
        console.log(`  [Invalidation] Cancelled active election ${row.id}`);
      }
    }

    // Find most recent completed election
    const completedElections = db.select().from(schema.elections).all()
      .filter((e: any) => e.status === "completed")
      .sort((a: any, b: any) => b.electionDay - a.electionDay);

    if (completedElections.length > 0) {
      const lastEl = completedElections[0];
      const electionResults = lastEl.results as unknown as import("@ki-bundestag/types").ElectionResult[] | null;

      // Mark as invalidated
      db.update(schema.elections)
        .set({ status: "invalidated" as any })
        .where(eq(schema.elections.id, lastEl.id))
        .run();

      // Restore pre-election seat counts
      if (electionResults) {
        for (const result of electionResults) {
          const oldSeats = result.seatsWon - result.seatDelta;
          db.update(schema.parties)
            .set({ seatCount: oldSeats })
            .where(eq(schema.parties.id, result.partyId))
            .run();

          const party = allParties.find(p => p.id === result.partyId);
          if (party) party.seatCount = oldSeats;

          console.log(`  [Invalidation] Restored ${result.partyId}: ${result.seatsWon} → ${oldSeats} seats`);
        }
      }

      console.log(`  [Invalidation] Election ${lastEl.id} invalidated (Day ${lastEl.electionDay})`);
    }

    // Update Fraktionen after seat restoration
    const fraktionInvResult = updateFraktionen(currentDay, allParties);
    for (const ev of fraktionInvResult.events) {
      addEvent(dayEvents, ev);
    }

    // Set nextElectionDay to currentDay so election triggers immediately
    nextElectionDay = currentDay;
    db.update(schema.simulationMeta)
      .set({ nextElectionDay: currentDay })
      .where(eq(schema.simulationMeta.id, meta.id))
      .run();

    addEvent(dayEvents, {
      dayNumber: currentDay,
      type: "day_start",
      actor: "system",
      title: "Election invalidated by court order",
      description: "The most recent election has been invalidated. Pre-election seat counts restored. A new election will be called immediately.",
      data: { invalidated: true },
    });
  }

  // 3b. Crisis system
  const allCrisesRows = db.select().from(schema.crises).all();
  let activeCrises: Crisis[] = allCrisesRows
    .filter((c: any) => !c.resolved)
    .map(mapCrisis);

  // Resolve expired crises
  const resolved = resolveExpiredCrises(currentDay, activeCrises);
  for (const crisis of resolved) {
    db.update(schema.crises)
      .set({ resolved: true })
      .where(eq(schema.crises.id, crisis.id))
      .run();

    addEvent(dayEvents, {
      dayNumber: currentDay,
      type: "crisis_end",
      actor: "system",
      title: `Crisis ended: ${crisis.name}`,
      description: `The ${crisis.name} (${crisis.severity}) has been resolved after ${currentDay - crisis.startDay} days.`,
      data: { crisisId: crisis.id, templateId: crisis.templateId },
    });

    console.log(`  [Crisis] Ended: ${crisis.name}`);
  }

  // Filter to only still-active after resolution
  activeCrises = activeCrises.filter(c => !c.resolved);

  // Maybe trigger new crisis
  const monthly = isMonthlyDay(currentDay);
  const newCrisis = maybeTriggerCrisis(currentDay, activeCrises, monthly);
  if (newCrisis) {
    db.insert(schema.crises).values({
      id: newCrisis.id,
      templateId: newCrisis.templateId,
      name: newCrisis.name,
      description: newCrisis.description,
      category: newCrisis.category,
      severity: newCrisis.severity,
      startDay: newCrisis.startDay,
      endDay: newCrisis.endDay,
      dailyImpact: newCrisis.dailyImpact as any,
      resolved: false,
    }).run();

    activeCrises.push(newCrisis);

    // Immediate sentiment hit on crisis start
    nationalState.publicSentiment = Math.max(5, Math.round(
      (nationalState.publicSentiment - (newCrisis.severity === "high" ? 3 : newCrisis.severity === "medium" ? 2 : 1)) * 10,
    ) / 10);

    addEvent(dayEvents, {
      dayNumber: currentDay,
      type: "crisis_start",
      actor: "system",
      title: `Crisis: ${newCrisis.name}`,
      description: newCrisis.description,
      data: { crisisId: newCrisis.id, severity: newCrisis.severity, category: newCrisis.category, endDay: newCrisis.endDay },
    });

    console.log(`  [Crisis] Started: ${newCrisis.name} (${newCrisis.severity}, until day ${newCrisis.endDay})`);
  }

  // Apply daily crisis impacts
  if (activeCrises.length > 0) {
    const crisisResult = applyCrisisImpacts(nationalState.economy, nationalState.publicSentiment, activeCrises);
    nationalState.economy = crisisResult.economy;
    nationalState.publicSentiment = crisisResult.sentiment;
  }

  // 4. Election system
  // Track low sentiment streak
  let lowSentimentStreak = meta.lowSentimentStreak ?? 0;
  if (nationalState.publicSentiment < 25) {
    lowSentimentStreak++;
  } else {
    lowSentimentStreak = 0;
  }

  // Load active election (if any) — exclude completed and invalidated
  const activeElectionRows = db.select().from(schema.elections)
    .where(and(ne(schema.elections.status, "completed"), ne(schema.elections.status, "invalidated"))).all();
  let activeElection: Election | null = activeElectionRows.length > 0
    ? mapElection(activeElectionRows[0])
    : null;

  // Check if we should trigger a new election (including injected elections)
  if (!activeElection) {
    const trigger = injections.triggerElection
      ? { trigger: true, reason: "User-injected snap election" }
      : shouldTriggerElection(currentDay, nextElectionDay, lowSentimentStreak, null);
    if (trigger.trigger) {
      const newElection = announceElection(currentDay, trigger.reason);
      activeElection = newElection;

      db.insert(schema.elections).values({
        id: newElection.id,
        triggerReason: newElection.triggerReason,
        announcedOnDay: newElection.announcedOnDay,
        campaignStartDay: newElection.campaignStartDay,
        electionDay: newElection.electionDay,
        status: newElection.status,
        results: null,
        newCoalition: null,
        newOpposition: null,
        negotiationRounds: null,
        coalitionAgreement: null,
      }).run();

      addEvent(dayEvents, {
        dayNumber: currentDay,
        type: "election_announced",
        actor: "system",
        title: `Election announced: ${trigger.reason}`,
        description: `A federal election has been called. Campaign begins Day ${newElection.campaignStartDay}, Election Day ${newElection.electionDay}.`,
        data: { electionId: newElection.id, reason: trigger.reason },
      });

      console.log(`  [Election] Announced: ${trigger.reason} (election day: ${newElection.electionDay})`);
    }
  }

  // Handle negotiation phase
  let skipPartyAgents = false;

  if (activeElection && activeElection.status === "negotiation") {
    skipPartyAgents = true;
    console.log(`  [Negotiation] Day ${currentDay}: Running negotiation round...`);

    const previousRounds = (activeElection.negotiationRounds || []) as NegotiationRound[][];
    const roundNumber = previousRounds.length + 1;

    const roundResults = await runNegotiationRound(
      activeElection.results!,
      allParties,
      previousRounds,
      roundNumber,
      currentDay,
    );

    const allRounds = [...previousRounds, roundResults];

    // Add negotiation events
    const negEvents = buildNegotiationEvents(roundResults, allParties, currentDay, roundNumber);
    for (const ev of negEvents) {
      addEvent(dayEvents, ev);
    }

    // Check if negotiations are complete (max rounds reached)
    if (roundNumber >= getMaxNegotiationRounds()) {
      console.log(`  [Negotiation] Max rounds reached, synthesizing agreement...`);

      // Try AI synthesis
      const agreement = await synthesizeAgreement(allRounds, activeElection.results!, allParties);

      let coalition: string[];
      let opposition: string[];

      if (agreement && agreement.parties.length >= 2) {
        // Use AI-negotiated coalition
        coalition = agreement.parties;
        opposition = allParties
          .filter(p => !coalition.includes(p.id))
          .map(p => p.id);

        console.log(`  [Negotiation] AI coalition: ${coalition.join(", ")}`);
      } else {
        // Fall back to algorithmic
        const govResult = formGovernment(activeElection.results!, allParties);
        coalition = govResult.coalition;
        opposition = govResult.opposition;

        console.log(`  [Negotiation] Fallback algorithmic coalition: ${coalition.join(", ")}`);
      }

      // Complete the election
      db.update(schema.elections)
        .set({
          status: "completed",
          negotiationRounds: allRounds as any,
          coalitionAgreement: agreement as any,
          newCoalition: coalition as any,
          newOpposition: opposition as any,
        })
        .where(eq(schema.elections.id, activeElection.id))
        .run();

      // Update party seats and roles
      for (const result of activeElection.results!) {
        const role = coalition[0] === result.partyId
          ? "leader"
          : coalition.includes(result.partyId)
            ? "junior"
            : "opposition";

        db.update(schema.parties)
          .set({ seatCount: result.seatsWon, coalitionRole: role })
          .where(eq(schema.parties.id, result.partyId))
          .run();

        const party = allParties.find(p => p.id === result.partyId);
        if (party) {
          party.seatCount = result.seatsWon;
          party.coalitionRole = role;
        }
      }

      // Update national state coalition/opposition
      nationalState.coalitionParties = coalition;
      nationalState.oppositionParties = opposition;

      // Reset streak and schedule next election
      lowSentimentStreak = 0;
      db.update(schema.simulationMeta)
        .set({
          nextElectionDay: currentDay + TIME_CONFIG.TERM_DAYS,
          lowSentimentStreak: 0,
        })
        .where(eq(schema.simulationMeta.id, meta.id))
        .run();

      addEvent(dayEvents, {
        dayNumber: currentDay,
        type: "negotiation_complete",
        actor: "system",
        title: "Coalition negotiations concluded",
        description: agreement
          ? `Agreement reached: ${agreement.summary}`
          : "No agreement reached — coalition formed algorithmically.",
        data: { electionId: activeElection.id, agreement },
      });

      // Update Fraktionen based on new seat counts
      const fraktionResult = updateFraktionen(currentDay, allParties);
      for (const ev of fraktionResult.events) {
        addEvent(dayEvents, ev);
      }

      const coalitionNames = coalition.map(id => allParties.find(p => p.id === id)!.name).join(", ");
      addEvent(dayEvents, {
        dayNumber: currentDay,
        type: "government_formed",
        actor: "system",
        title: "New government formed",
        description: `Coalition: ${coalitionNames}`,
        data: { electionId: activeElection.id, coalition, opposition },
      });

      // Form cabinet (Chancellor + Ministers)
      const cabinet = formCabinet(coalition, allParties, activeElection.id, currentDay);
      const ministerList = cabinet.ministers.map(m => `${m.name} (${m.partyId}) — ${m.portfolio}`).join(", ");
      addEvent(dayEvents, {
        dayNumber: currentDay,
        type: "government_cabinet_formed",
        actor: "system",
        title: `Chancellor ${cabinet.chancellorName} forms cabinet`,
        description: `Chancellor: ${cabinet.chancellorName} (${cabinet.chancellorPartyId}). Ministers: ${ministerList}`,
        data: { governmentId: cabinet.id, chancellorName: cabinet.chancellorName, ministers: cabinet.ministers },
      });
      console.log(`  [Cabinet] Chancellor: ${cabinet.chancellorName}, ${cabinet.ministers.length} ministers`);

      // Allocate Bundestag seats per party based on election results
      const timingPreset = (meta.timingPreset ?? "normal") as TimingPreset;
      resetAllSeats();
      for (const result of activeElection.results!) {
        allocateSeats(result.partyId, result.seatsWon, activeElection.id, currentDay, timingPreset);
      }

      // Expire pending MdB applications from previous term
      try {
        const userSqlite = (await import("../db/index.js")).getUserSqlite();
        userSqlite.prepare("UPDATE mdb_applications SET status = 'expired' WHERE status = 'pending'").run();
      } catch { /* table may not exist yet */ }

      console.log(`  [Election] New coalition: ${coalitionNames}`);
      activeElection = null;
    } else {
      // Save intermediate rounds
      db.update(schema.elections)
        .set({ negotiationRounds: allRounds as any })
        .where(eq(schema.elections.id, activeElection.id))
        .run();
    }
  }

  // Advance election phase (for non-negotiation states)
  if (activeElection && activeElection.status !== "negotiation") {
    const { updated, events: electionEvents } = advanceElectionPhase(currentDay, activeElection);
    activeElection = updated;

    // Persist status change
    if (updated.status !== activeElectionRows[0]?.status) {
      db.update(schema.elections)
        .set({ status: updated.status })
        .where(eq(schema.elections.id, updated.id))
        .run();
    }

    for (const ev of electionEvents) {
      addEvent(dayEvents, ev);
    }

    if (activeElection.status === "voting") {
      // ELECTION DAY — calculate results, then enter negotiation
      skipPartyAgents = true;
      console.log(`  [Election] Election day! Calculating results...`);
      const results = calculateResults(allParties);

      // Store results and transition to negotiation
      db.update(schema.elections)
        .set({
          status: "negotiation",
          results: results as any,
          negotiationRounds: [] as any,
        })
        .where(eq(schema.elections.id, activeElection.id))
        .run();

      activeElection.results = results;
      activeElection.status = "negotiation";

      const resultsStr = results
        .sort((a, b) => b.seatsWon - a.seatsWon)
        .map(r => {
          const p = allParties.find(pp => pp.id === r.partyId)!;
          const delta = r.seatDelta >= 0 ? `+${r.seatDelta}` : `${r.seatDelta}`;
          return `${p.name}: ${r.votesPercent}% (${r.seatsWon} seats, ${delta})`;
        })
        .join(", ");

      addEvent(dayEvents, {
        dayNumber: currentDay,
        type: "election_result",
        actor: "system",
        title: "Federal election results",
        description: resultsStr,
        data: { electionId: activeElection.id, results },
      });

      console.log(`  [Election] Results: ${resultsStr}`);
      console.log(`  [Election] Entering negotiation phase...`);
    }
  }

  if (!skipPartyAgents) {
    // === BILL PIPELINE — multi-stage lifecycle ===
    // Each stage advances when statusChangedOnDay < currentDay

    // Stage 1: proposed → first_reading (or proposed → committee for government bills)
    const proposedBills = allBills.filter(b => b.status === "proposed" && (b.statusChangedOnDay ?? b.proposedOnDay) < currentDay);
    for (const bill of proposedBills) {
      if ((bill as any).isGovernmentBill) {
        // Government bills skip first reading, go directly to committee
        const committeeName = assignCommittee(bill.category as import("@ki-bundestag/types").BillCategory);
        const recommendation = generateRecommendation(bill, allParties, nationalState.coalitionParties);

        bill.status = "committee";
        bill.committeeName = committeeName;
        bill.committeeRecommendation = recommendation as any;
        bill.statusChangedOnDay = currentDay;

        db.update(schema.bills)
          .set({
            status: "committee",
            reading: null as any,
            committeeName,
            committeeRecommendation: recommendation,
            statusChangedOnDay: currentDay,
          })
          .where(eq(schema.bills.id, bill.id))
          .run();

        addEvent(dayEvents, {
          dayNumber: currentDay,
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
        bill.statusChangedOnDay = currentDay;
        db.update(schema.bills)
          .set({ status: "first_reading", reading: 1, statusChangedOnDay: currentDay })
          .where(eq(schema.bills.id, bill.id))
          .run();

        addEvent(dayEvents, {
          dayNumber: currentDay,
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
    const firstReadingBills = allBills.filter(b => b.status === "first_reading" && (b.statusChangedOnDay ?? 0) < currentDay);
    for (const bill of firstReadingBills) {
      const committeeName = assignCommittee(bill.category as import("@ki-bundestag/types").BillCategory);
      const recommendation = generateRecommendation(bill, allParties, nationalState.coalitionParties);

      bill.status = "committee";
      bill.reading = undefined;
      bill.committeeName = committeeName;
      bill.committeeRecommendation = recommendation;
      bill.statusChangedOnDay = currentDay;

      db.update(schema.bills)
        .set({
          status: "committee",
          reading: null as any,
          committeeName,
          committeeRecommendation: recommendation,
          statusChangedOnDay: currentDay,
        })
        .where(eq(schema.bills.id, bill.id))
        .run();

      addEvent(dayEvents, {
        dayNumber: currentDay,
        type: "bill_committee",
        actor: "system",
        title: `"${bill.title}" — Committee Review: ${committeeName}`,
        description: `Committee recommendation: ${recommendation}`,
        data: { billId: bill.id, committeeName, recommendation },
      });
      console.log(`  [Pipeline] "${bill.title}" → committee (${committeeName}: ${recommendation})`);
    }

    // Stage 3: committee → second_reading (or rejected if committee recommends rejection)
    const committeeBills = allBills.filter(b => b.status === "committee" && (b.statusChangedOnDay ?? 0) < currentDay);
    for (const bill of committeeBills) {
      // Reject opposition bills that committee recommends rejecting (~40% chance)
      const isCoalitionBill = nationalState.coalitionParties.includes(bill.proposedBy);
      if (
        bill.committeeRecommendation === "reject" &&
        !isCoalitionBill &&
        !(bill as any).isGovernmentBill &&
        Math.random() < 0.40
      ) {
        bill.status = "rejected";
        bill.statusChangedOnDay = currentDay;

        db.update(schema.bills)
          .set({ status: "rejected", statusChangedOnDay: currentDay })
          .where(eq(schema.bills.id, bill.id))
          .run();

        addEvent(dayEvents, {
          dayNumber: currentDay,
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
      bill.statusChangedOnDay = currentDay;

      db.update(schema.bills)
        .set({ status: "second_reading", reading: 2, amendments: (bill.amendments ?? []) as any, statusChangedOnDay: currentDay })
        .where(eq(schema.bills.id, bill.id))
        .run();

      addEvent(dayEvents, {
        dayNumber: currentDay,
        type: "bill_second_reading",
        actor: "system",
        title: `"${bill.title}" — Second Reading`,
        description: `The bill enters second reading. Parties may propose amendments.`,
        data: { billId: bill.id },
      });
      console.log(`  [Pipeline] "${bill.title}" → second_reading`);
    }

    // Stage 4: second_reading → third_reading (tally amendment votes, apply accepted amendments)
    const secondReadingReady = allBills.filter(b => b.status === "second_reading" && (b.statusChangedOnDay ?? 0) < currentDay);
    for (const bill of secondReadingReady) {
      const amendments = (bill.amendments ?? []) as import("@ki-bundestag/types").Amendment[];

      // Tally amendment votes
      for (const amendment of amendments) {
        const { accepted, votes } = tallyAmendmentVotes(amendment, bill, allParties, nationalState.coalitionParties);
        amendment.accepted = accepted;
        amendment.votes = votes;

        if (accepted) {
          applyAmendmentToBill(bill, amendment);
        }

        addEvent(dayEvents, {
          dayNumber: currentDay,
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
      bill.statusChangedOnDay = currentDay;

      db.update(schema.bills)
        .set({
          status: "third_reading",
          reading: 3,
          amendments: amendments as any,
          impact: bill.impact as any,
          originalImpact: bill.originalImpact as any ?? null,
          statusChangedOnDay: currentDay,
        })
        .where(eq(schema.bills.id, bill.id))
        .run();

      addEvent(dayEvents, {
        dayNumber: currentDay,
        type: "bill_third_reading",
        actor: "system",
        title: `"${bill.title}" — Third Reading`,
        description: `The bill enters final reading and vote.${amendments.filter(a => a.accepted).length > 0 ? ` ${amendments.filter(a => a.accepted).length} amendment(s) were incorporated.` : ""}`,
        data: { billId: bill.id, acceptedAmendments: amendments.filter(a => a.accepted).length },
      });
      console.log(`  [Pipeline] "${bill.title}" → third_reading`);
    }

    // Collect bills for agent calls
    const thirdReadingBills = allBills.filter(b => b.status === "third_reading");
    const secondReadingBills = allBills.filter(b => b.status === "second_reading");

    // 5b. Load recent media for agent context
    const recentMedia = getRecentMedia(3);

    // 5c. Load active Fraktionen for agent context
    const activeFraktionen = getActiveFraktionen();
    const fraktionByParty = new Map(activeFraktionen.map(f => [f.partyId, f]));

    // 5d. Load recent motions for agent context
    const allMotionRows = db.select().from(schema.motions).all();
    const recentMotions: Motion[] = allMotionRows
      .filter((m: any) => m.dayNumber >= currentDay - 3)
      .map(mapMotion);

    // 5e. Load recent interpellations for agent context
    const allInterpellationRows = db.select().from(schema.interpellations).all();
    const recentInterpellations: Interpellation[] = allInterpellationRows
      .filter((i: any) => i.dayNumber >= currentDay - 5)
      .map(mapInterpellation);

    // 5e2. Load recent confidence votes for agent context
    const allConfidenceVoteRows = db.select().from(schema.confidenceVotes).all();
    const recentConfidenceVotes: ConfidenceVote[] = allConfidenceVoteRows
      .filter((v: any) => v.dayNumber >= currentDay - 7)
      .map(mapConfidenceVote);

    // 5e3. Load recent constitutional challenges for agent context
    const allChallengeRows = db.select().from(schema.constitutionalChallenges).all();
    const recentConstitutionalChallenges: ConstitutionalChallenge[] = allChallengeRows
      .filter((c: any) => c.dayNumber >= currentDay - 7)
      .map(mapConstitutionalChallenge);

    // Bills that passed in the last 14 days (challengeable)
    const passedBillsForChallenge = allBills.filter(
      b => b.status === "passed" && (b.statusChangedOnDay ?? 0) >= currentDay - 14,
    );

    // 5f. Load active government for agent context
    const activeGov = getActiveGovernment();

    // 5g. Process MdB parliamentary actions (motions, interpellations, amendments)
    try {
      const mdbActionResult = processMdbActions(
        currentDay,
        allParties as any,
        nationalState.coalitionParties,
      );
      for (const ev of mdbActionResult.events) {
        addEvent(dayEvents, ev);
      }
      if (mdbActionResult.sentimentDelta !== 0) {
        nationalState.publicSentiment = Math.max(5, Math.min(75,
          Math.round((nationalState.publicSentiment + mdbActionResult.sentimentDelta) * 10) / 10,
        ));
      }
    } catch (err) {
      console.error("[Loop] Error processing MdB actions:", err);
    }

    // 6. Run each party agent
    const partyActions = new Map<string, import("@ki-bundestag/types").AgentAction[]>();

    // Load top internal proposals per party (for agent context)
    const internalProposalsByParty = new Map<string, Array<{ title: string; category: string; score: number; totalVotes: number }>>();
    try {
      const openProps = getUserDb().select().from(schema.internalProposals)
        .where(eq(schema.internalProposals.status, "open"))
        .all();
      for (const p of allParties) {
        const partyProps = openProps
          .filter(r => r.partyId === p.id)
          .sort((a, b) => b.voteScore - a.voteScore)
          .slice(0, 3)
          .map(r => ({ title: r.title, category: r.category, score: r.voteScore, totalVotes: r.totalVotes }));
        internalProposalsByParty.set(p.id, partyProps);
      }
    } catch { /* table may not exist yet */ }

    // Load member signals for third_reading bills
    const memberSignalsByBill: Record<string, { yes: number; no: number }> = {};
    if (thirdReadingBills.length > 0) {
      try {
        const billIds = thirdReadingBills.map(b => b.id);
        const sigs = getUserDb().select().from(schema.memberSignals)
          .where(inArray(schema.memberSignals.billId, billIds))
          .all();
        for (const s of sigs) {
          if (!memberSignalsByBill[s.billId]) memberSignalsByBill[s.billId] = { yes: 0, no: 0 };
          if (s.signal === "yes") memberSignalsByBill[s.billId].yes++;
          else memberSignalsByBill[s.billId].no++;
        }
      } catch { /* table may not exist yet */ }
    }

    // Load MdB vote summaries for third_reading bills (for agent context)
    const mdbVoteSummaryByBill: Record<string, { yes: number; no: number; abstain: number; total: number }> = {};
    if (thirdReadingBills.length > 0) {
      try {
        const billIds = thirdReadingBills.map(b => b.id);
        const mdbVotesAll = getUserDb().select().from(schema.mdbVotes)
          .where(inArray(schema.mdbVotes.billId, billIds))
          .all();
        for (const v of mdbVotesAll) {
          if (!mdbVoteSummaryByBill[v.billId]) mdbVoteSummaryByBill[v.billId] = { yes: 0, no: 0, abstain: 0, total: 0 };
          mdbVoteSummaryByBill[v.billId].total++;
          if (v.vote === "yes") mdbVoteSummaryByBill[v.billId].yes++;
          else if (v.vote === "no") mdbVoteSummaryByBill[v.billId].no++;
          else mdbVoteSummaryByBill[v.billId].abstain++;
        }
      } catch { /* table may not exist yet */ }
    }

    for (const party of allParties) {
      const fraktion = fraktionByParty.get(party.id);

      const ctx: AgentContext = {
        party,
        allParties,
        nationalState,
        pendingBills: [...thirdReadingBills, ...secondReadingBills, ...allBills.filter(b => b.status === "first_reading" || b.status === "committee" || b.status === "proposed")],
        recentEvents: recentForContext,
        currentDay,
        activeCrises,
        activeElection: activeElection ?? undefined,
        recentMedia,
        recentMotions,
        recentInterpellations,
        recentConfidenceVotes,
        recentConstitutionalChallenges,
        passedBillsForChallenge,
        hasFraktion: !!fraktion,
        fraktionLeader: fraktion?.leaderName,
        government: activeGov ?? undefined,
        topInternalProposals: internalProposalsByParty.get(party.id),
        memberSignals: Object.keys(memberSignalsByBill).length > 0 ? memberSignalsByBill : undefined,
        mdbVoteSummary: Object.keys(mdbVoteSummaryByBill).length > 0 ? mdbVoteSummaryByBill : undefined,
      };

      const actions = await runPartyAgent(ctx, thirdReadingBills, secondReadingBills);
      partyActions.set(party.id, actions);
    }

    // 7. Process all proposals first (create new bills)
    for (const [partyId, actions] of partyActions) {
      for (const action of actions) {
        if (action.type !== "propose_bill") continue;

        const billId = `bill-${currentDay}-${generateId()}`;
        const govBill = checkIsGovernmentBill(partyId, action.category);
        const newBill: typeof schema.bills.$inferInsert = {
          id: billId,
          title: action.title,
          description: action.description,
          category: action.category,
          proposedBy: partyId,
          status: "proposed",
          impact: action.impact as any,
          votes: [] as any,
          proposedOnDay: currentDay,
          statusChangedOnDay: currentDay,
          isGovernmentBill: govBill || null,
        };

        db.insert(schema.bills).values(newBill).run();

        // Mirror AI proposal to internal caucus list
        try {
          const party = allParties.find(p => p.id === partyId)!;
          db.insert(schema.internalProposals).values({
            id: `iprop-ai-${billId}`,
            partyId,
            proposedBy: "ai",
            proposerName: `${party.name} AI`,
            title: action.title,
            description: action.description,
            category: action.category,
            rationale: null,
            status: "open",
            voteScore: 0,
            totalVotes: 0,
            createdOnDay: currentDay,
            reviewByDay: currentDay + 5,
          }).run();
        } catch { /* ignore if table missing */ }

        const party = allParties.find(p => p.id === partyId)!;
        addEvent(dayEvents, {
          dayNumber: currentDay,
          type: "bill_proposed",
          actor: partyId,
          title: `${party.name} proposes: "${action.title}"${govBill ? " [Govt. Bill]" : ""}`,
          description: action.description,
          data: { billId, category: action.category, impact: action.impact, isGovernmentBill: govBill },
        });

        console.log(`  [Proposal] ${party.name}: "${action.title}"${govBill ? " (Govt. Bill)" : ""}`);
      }
    }

    // 7b. Process amendments (store on second_reading bills)
    for (const [partyId, actions] of partyActions) {
      for (const action of actions) {
        if (action.type !== "propose_amendment") continue;

        const targetBill = secondReadingBills.find(b => b.id === action.billId);
        if (!targetBill) continue;

        const amendmentId = `amend-${currentDay}-${generateId()}`;
        const amendment: import("@ki-bundestag/types").Amendment = {
          id: amendmentId,
          billId: action.billId,
          proposedBy: partyId,
          title: action.title,
          description: action.description,
          impactChange: action.impactChange,
          accepted: false,
          votes: [],
        };

        const existing = (targetBill.amendments ?? []) as import("@ki-bundestag/types").Amendment[];
        existing.push(amendment);
        targetBill.amendments = existing;

        db.update(schema.bills)
          .set({ amendments: existing as any })
          .where(eq(schema.bills.id, targetBill.id))
          .run();

        const party = allParties.find(p => p.id === partyId)!;
        addEvent(dayEvents, {
          dayNumber: currentDay,
          type: "amendment_proposed",
          actor: partyId,
          title: `${party.name} proposes amendment to "${targetBill.title}"`,
          description: `${action.title}: ${action.description}`,
          data: { billId: targetBill.id, amendmentId, impactChange: action.impactChange },
        });

        console.log(`  [Amendment] ${party.name} amends "${targetBill.title}": "${action.title}"`);
      }
    }

    // 8. Process all votes on third_reading bills
    for (const bill of thirdReadingBills) {
      const votes: BillVote[] = [];

      for (const [partyId, actions] of partyActions) {
        const voteAction = actions.find(
          a => a.type === "vote" && a.billId === bill.id,
        );
        if (voteAction && voteAction.type === "vote") {
          votes.push({
            partyId,
            vote: voteAction.vote,
            reason: voteAction.reason,
          });

          const party = allParties.find(p => p.id === partyId)!;
          addEvent(dayEvents, {
            dayNumber: currentDay,
            type: "vote_cast",
            actor: partyId,
            title: `${party.name} votes ${voteAction.vote} on "${bill.title}"`,
            description: voteAction.reason,
            data: { billId: bill.id, vote: voteAction.vote },
          });
        }
      }

      // Update bill with votes
      bill.votes = votes;
      db.update(schema.bills)
        .set({ votes: votes as any })
        .where(eq(schema.bills.id, bill.id))
        .run();

      // Load MdB votes for this bill + human seat counts for tally
      let mdbVoteEntries: import("./voting.js").MdbVoteEntry[] = [];
      let humanSeatCountsForTally: Record<string, number> = {};
      try {
        const rawMdbVotes = getUserDb().select().from(schema.mdbVotes)
          .where(eq(schema.mdbVotes.billId, bill.id))
          .all();
        if (rawMdbVotes.length > 0) {
          // Look up each voter's seat to get partyId, proxyDefault, disciplineLevel
          for (const mv of rawMdbVotes) {
            const seat = db.select().from(schema.bundestagSeats)
              .where(eq(schema.bundestagSeats.id, mv.seatId))
              .get();
            if (seat) {
              mdbVoteEntries.push({
                seatId: mv.seatId,
                partyId: seat.partyId,
                userId: mv.userId,
                vote: mv.vote as import("@ki-bundestag/types").VoteChoice,
                proxyDefault: seat.proxyDefault,
                disciplineLevel: seat.disciplineLevel,
              });
            }
          }
          // Count human seats per party (for proxy calculation)
          const humanSeats = db.select().from(schema.bundestagSeats)
            .where(and(eq(schema.bundestagSeats.active, true), eq(schema.bundestagSeats.controller, "human")))
            .all();
          for (const s of humanSeats) {
            humanSeatCountsForTally[s.partyId] = (humanSeatCountsForTally[s.partyId] ?? 0) + 1;
          }
        }
      } catch { /* tables may not exist yet */ }

      // Tally and determine outcome
      const result = tallyVotes(bill, allParties, mdbVoteEntries.length > 0 ? mdbVoteEntries : undefined, Object.keys(humanSeatCountsForTally).length > 0 ? humanSeatCountsForTally : undefined);
      const newStatus = result.passed ? "passed" : "rejected";

      db.update(schema.bills)
        .set({ status: newStatus })
        .where(eq(schema.bills.id, bill.id))
        .run();

      addEvent(dayEvents, {
        dayNumber: currentDay,
        type: result.passed ? "bill_passed" : "bill_rejected",
        actor: "system",
        title: `"${bill.title}" ${result.passed ? "PASSED" : "REJECTED"}`,
        description: `Yes: ${result.yesSeats} seats, No: ${result.noSeats} seats, Abstain: ${result.abstainSeats} seats`,
        data: { billId: bill.id, ...result },
      });

      console.log(`  [Vote] "${bill.title}": ${newStatus} (Yes: ${result.yesSeats}, No: ${result.noSeats})`);

      // 9. Apply passed bill impacts (with presidential veto check)
      if (result.passed) {
        const { veto, reason } = shouldPresidentVeto(bill);
        if (veto) {
          db.update(schema.bills)
            .set({ status: "rejected", vetoedByPresident: true })
            .where(eq(schema.bills.id, bill.id))
            .run();
          addEvent(dayEvents, {
            dayNumber: currentDay,
            type: "presidential_veto",
            actor: "system",
            title: `Bundespräsident vetoes "${bill.title}"`,
            description: reason,
            data: { billId: bill.id },
          });
          const proposer = allParties.find(p => p.id === bill.proposedBy);
          if (proposer) proposer.approvalRating = Math.round((proposer.approvalRating - 0.5) * 10) / 10;
          console.log(`  [President] Veto: "${bill.title}"`);
        } else {
          const impact = bill.impact as BillImpact;
          nationalState.economy = applyBillImpact(nationalState.economy, impact);
          nationalState.publicSentiment = updateSentiment(nationalState.publicSentiment, impact);
        }
      }

      // Update proposer approval
      for (const party of allParties) {
        const delta = approvalFromBillOutcome(result.passed, party.id === bill.proposedBy);
        if (delta !== 0) {
          party.approvalRating = Math.round((party.approvalRating + delta) * 10) / 10;
        }
      }
    }

    // 10. Process statements and campaign statements
    for (const [partyId, actions] of partyActions) {
      for (const action of actions) {
        if (action.type === "statement") {
          const party = allParties.find(p => p.id === partyId)!;
          addEvent(dayEvents, {
            dayNumber: currentDay,
            type: "statement",
            actor: partyId,
            title: `${party.name}: ${action.title}`,
            description: action.statement,
          });
          console.log(`  [Statement] ${party.name}: "${action.title}"`);
        } else if (action.type === "campaign_statement") {
          const party = allParties.find(p => p.id === partyId)!;
          addEvent(dayEvents, {
            dayNumber: currentDay,
            type: "election_campaign",
            actor: partyId,
            title: `${party.name} campaign: ${action.title}`,
            description: action.promise,
          });
          console.log(`  [Campaign] ${party.name}: "${action.title}"`);
        }
      }
    }

    // 10c. Process motions
    for (const [partyId, actions] of partyActions) {
      for (const action of actions) {
        if (action.type !== "submit_motion") continue;

        const motionId = `motion-${currentDay}-${generateId()}`;
        const motion: Motion = {
          id: motionId,
          type: action.motionType,
          title: action.title,
          description: action.description,
          proposedBy: partyId,
          status: "proposed",
          votes: [],
          dayNumber: currentDay,
        };

        // Tally votes algorithmically
        const { passed, votes } = tallyMotionVotes(motion, allParties, nationalState.coalitionParties);
        motion.votes = votes;
        motion.status = passed ? "passed" : "rejected";

        // Calculate sentiment impact
        const sentImpact = motionSentimentImpact(motion);
        motion.sentimentImpact = sentImpact;

        if (sentImpact !== 0) {
          nationalState.publicSentiment = Math.max(5, Math.min(75,
            Math.round((nationalState.publicSentiment + sentImpact) * 10) / 10,
          ));
        }

        // Persist motion
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

        const party = allParties.find(p => p.id === partyId)!;
        const typeLabel = motion.type === "motion" ? "Antrag" : "Entschließung";

        addEvent(dayEvents, {
          dayNumber: currentDay,
          type: "motion_submitted",
          actor: partyId,
          title: `${party.name} submits ${typeLabel}: "${motion.title}"`,
          description: motion.description,
          data: { motionId, motionType: motion.type },
        });

        addEvent(dayEvents, {
          dayNumber: currentDay,
          type: passed ? "motion_passed" : "motion_rejected",
          actor: "system",
          title: `${typeLabel} "${motion.title}" ${passed ? "PASSED" : "REJECTED"}`,
          description: `Votes: ${votes.filter(v => v.vote === "yes").length} yes, ${votes.filter(v => v.vote === "no").length} no`,
          data: { motionId, passed },
        });

        console.log(`  [Motion] ${party.name}: "${motion.title}" (${typeLabel}) — ${motion.status}`);
      }
    }

    // 10d. Process interpellations filed by agents
    for (const [partyId, actions] of partyActions) {
      for (const action of actions) {
        if (action.type !== "file_interpellation") continue;

        const party = allParties.find(p => p.id === partyId)!;
        const minister = activeGov?.ministers.find(m => m.portfolio === action.targetMinistry);
        if (!minister) {
          console.warn(`  [Interpellation] No minister for ${action.targetMinistry}, skipping`);
          continue;
        }

        const interpId = `interp-${currentDay}-${generateId()}`;
        db.insert(schema.interpellations).values({
          id: interpId,
          type: action.interpellationType,
          title: action.title,
          question: action.question,
          filedByPartyId: partyId,
          targetMinistry: action.targetMinistry,
          targetMinisterName: minister.name,
          targetPartyId: minister.partyId,
          response: null,
          status: "pending",
          dayNumber: currentDay,
          respondedOnDay: null,
          sentimentImpact: null,
        }).run();

        const typeLabel = action.interpellationType === "große" ? "Große Anfrage" : "Kleine Anfrage";
        addEvent(dayEvents, {
          dayNumber: currentDay,
          type: "interpellation_filed",
          actor: partyId,
          title: `${party.name} files ${typeLabel}: "${action.title}"`,
          description: `${typeLabel} targeting ${minister.name} (${action.targetMinistry}): ${action.question}`,
          data: { interpellationId: interpId, interpellationType: action.interpellationType, targetMinistry: action.targetMinistry },
        });

        console.log(`  [Interpellation] ${party.name}: "${action.title}" (${typeLabel}) → ${minister.name}`);
      }
    }

    // 10e. Process confidence votes (max 1 Vertrauensfrage + 1 Misstrauensvotum per day)
    let vertrauensfrageProcessed = false;
    let misstrauensvotumProcessed = false;

    for (const [partyId, actions] of partyActions) {
      for (const action of actions) {

        if (action.type === "call_vertrauensfrage" && !vertrauensfrageProcessed) {
          vertrauensfrageProcessed = true;

          const govNow = getActiveGovernment();
          if (!govNow) {
            console.warn(`  [ConfidenceVote] No active government, skipping Vertrauensfrage`);
            continue;
          }

          const tally = tallyVertrauensfrage(allParties, nationalState.coalitionParties);
          const cvId = `cv-${currentDay}-${generateId()}`;
          const cvStatus = tally.passed ? "passed" : "failed";

          db.insert(schema.confidenceVotes).values({
            id: cvId,
            type: "vertrauensfrage",
            governmentId: govNow.id,
            initiatedByPartyId: partyId,
            chancellorName: govNow.chancellorName,
            proposedChancellor: null,
            proposedChancellorPartyId: null,
            title: action.title,
            description: action.description,
            status: cvStatus,
            votes: tally.votes as any,
            dayNumber: currentDay,
            sentimentImpact: null,
          }).run();

          const party = allParties.find(p => p.id === partyId)!;
          addEvent(dayEvents, {
            dayNumber: currentDay,
            type: "confidence_vote_filed",
            actor: partyId,
            title: `${party.name} calls Vertrauensfrage: "${action.title}"`,
            description: action.description,
            data: { confidenceVoteId: cvId, type: "vertrauensfrage" },
          });

          addEvent(dayEvents, {
            dayNumber: currentDay,
            type: tally.passed ? "confidence_vote_passed" : "confidence_vote_failed",
            actor: "system",
            title: `Vertrauensfrage "${action.title}" — ${tally.passed ? "PASSED" : "FAILED"}`,
            description: `Yes: ${tally.yesSeats} seats, No: ${tally.noSeats} seats. ${tally.passed ? "Government survives." : "Government falls — snap election triggered."}`,
            data: { confidenceVoteId: cvId, yesSeats: tally.yesSeats, noSeats: tally.noSeats },
          });

          confidenceVoteSentimentImpact("vertrauensfrage", tally.passed, allParties, nationalState.coalitionParties);

          console.log(`  [ConfidenceVote] Vertrauensfrage by ${party.name}: ${cvStatus} (Yes: ${tally.yesSeats}, No: ${tally.noSeats})`);

          if (!tally.passed) {
            // Government falls — dissolve and trigger snap election
            dissolveGovernment(currentDay);
            addEvent(dayEvents, {
              dayNumber: currentDay,
              type: "government_dissolved",
              actor: "system",
              title: `Government dissolved — Vertrauensfrage failed`,
              description: `Chancellor ${govNow.chancellorName}'s government has lost the confidence of the Bundestag. A snap election will be called.`,
              data: { governmentId: govNow.id, confidenceVoteId: cvId },
            });

            // Schedule snap election for next day
            nextElectionDay = currentDay;
            db.update(schema.simulationMeta)
              .set({ nextElectionDay: currentDay })
              .where(eq(schema.simulationMeta.id, meta.id))
              .run();

            console.log(`  [ConfidenceVote] Government dissolved — snap election triggered`);
          }
        }

        if (action.type === "file_misstrauensvotum" && !misstrauensvotumProcessed) {
          misstrauensvotumProcessed = true;

          const govNow = getActiveGovernment();
          if (!govNow) {
            console.warn(`  [ConfidenceVote] No active government, skipping Misstrauensvotum`);
            continue;
          }

          const tally = tallyMisstrauensvotum(allParties, nationalState.coalitionParties, partyId);
          const cvId = `cv-${currentDay}-${generateId()}`;
          const cvStatus = tally.passed ? "passed" : "failed";

          db.insert(schema.confidenceVotes).values({
            id: cvId,
            type: "misstrauensvotum",
            governmentId: govNow.id,
            initiatedByPartyId: partyId,
            chancellorName: govNow.chancellorName,
            proposedChancellor: action.proposedChancellor,
            proposedChancellorPartyId: action.proposedChancellorPartyId,
            title: action.title,
            description: action.description,
            status: cvStatus,
            votes: tally.votes as any,
            dayNumber: currentDay,
            sentimentImpact: null,
          }).run();

          const party = allParties.find(p => p.id === partyId)!;
          addEvent(dayEvents, {
            dayNumber: currentDay,
            type: "confidence_vote_filed",
            actor: partyId,
            title: `${party.name} files Misstrauensvotum: "${action.title}"`,
            description: `${action.description} Proposed Chancellor: ${action.proposedChancellor} (${action.proposedChancellorPartyId})`,
            data: { confidenceVoteId: cvId, type: "misstrauensvotum", proposedChancellor: action.proposedChancellor },
          });

          addEvent(dayEvents, {
            dayNumber: currentDay,
            type: tally.passed ? "confidence_vote_passed" : "confidence_vote_failed",
            actor: "system",
            title: `Misstrauensvotum "${action.title}" — ${tally.passed ? "PASSED" : "FAILED"}`,
            description: `Yes: ${tally.yesSeats} seats, No: ${tally.noSeats} seats. ${tally.passed ? `New Chancellor: ${action.proposedChancellor}.` : "Government survives."}`,
            data: { confidenceVoteId: cvId, yesSeats: tally.yesSeats, noSeats: tally.noSeats },
          });

          confidenceVoteSentimentImpact("misstrauensvotum", tally.passed, allParties, nationalState.coalitionParties, partyId);

          console.log(`  [ConfidenceVote] Misstrauensvotum by ${party.name}: ${cvStatus} (Yes: ${tally.yesSeats}, No: ${tally.noSeats})`);

          if (tally.passed) {
            // New government formed — opposition takes power without election
            addEvent(dayEvents, {
              dayNumber: currentDay,
              type: "government_dissolved",
              actor: "system",
              title: `Government dissolved — Misstrauensvotum passed`,
              description: `Chancellor ${govNow.chancellorName}'s government has been voted out. ${action.proposedChancellor} (${action.proposedChancellorPartyId}) takes over.`,
              data: { governmentId: govNow.id, confidenceVoteId: cvId },
            });

            // Build new coalition: proposing party leads, other opposition parties join; old coalition becomes opposition
            const oldCoalition = new Set(nationalState.coalitionParties);
            const newCoalitionLeader = action.proposedChancellorPartyId;
            const newCoalition = [
              newCoalitionLeader,
              ...allParties
                .filter(p => !oldCoalition.has(p.id) && p.id !== newCoalitionLeader && p.seatCount > 0)
                .map(p => p.id),
            ];
            const newOpposition = allParties
              .filter(p => oldCoalition.has(p.id))
              .map(p => p.id);

            // Update party coalition roles in DB and in-memory
            for (const p of allParties) {
              const newRole = p.id === newCoalitionLeader
                ? "leader"
                : newCoalition.includes(p.id)
                  ? "junior"
                  : "opposition";

              db.update(schema.parties)
                .set({ coalitionRole: newRole })
                .where(eq(schema.parties.id, p.id))
                .run();

              p.coalitionRole = newRole;
            }

            // Update national state
            nationalState.coalitionParties = newCoalition;
            nationalState.oppositionParties = newOpposition;

            // Form new cabinet
            const newCabinet = formCabinet(newCoalition, allParties, null, currentDay);
            const coalitionNames = newCoalition.map(id => allParties.find(p => p.id === id)?.name ?? id).join(", ");

            addEvent(dayEvents, {
              dayNumber: currentDay,
              type: "government_formed",
              actor: "system",
              title: `New government formed via Misstrauensvotum`,
              description: `Coalition: ${coalitionNames}. Chancellor: ${newCabinet.chancellorName}.`,
              data: { coalition: newCoalition, opposition: newOpposition, confidenceVoteId: cvId },
            });

            addEvent(dayEvents, {
              dayNumber: currentDay,
              type: "government_cabinet_formed",
              actor: "system",
              title: `Chancellor ${newCabinet.chancellorName} forms cabinet`,
              description: `New cabinet formed after Konstruktives Misstrauensvotum. ${newCabinet.ministers.length} ministers appointed.`,
              data: { governmentId: newCabinet.id, chancellorName: newCabinet.chancellorName },
            });

            console.log(`  [ConfidenceVote] New government formed: ${newCabinet.chancellorName} leads ${coalitionNames}`);
          }
        }
      }
    }

    // 10f. Process constitutional challenges (max 1 per day, first valid action wins)
    let constitutionalChallengeProcessed = false;

    for (const [partyId, actions] of partyActions) {
      for (const action of actions) {
        if (action.type !== "file_constitutional_challenge" || constitutionalChallengeProcessed) continue;

        // Find the target bill (must be passed, within last 14 days)
        const targetBill = allBills.find(
          b => b.id === action.billId && b.status === "passed"
            && (b.statusChangedOnDay ?? 0) >= currentDay - 14,
        );
        if (!targetBill) {
          console.warn(`  [ConstitutionalCourt] Bill ${action.billId} not challengeable, skipping`);
          continue;
        }

        constitutionalChallengeProcessed = true;

        const { struckDown, reasoning } = adjudicateChallenge(targetBill.title);
        const challengeId = `cc-${currentDay}-${generateId()}`;
        const decision = struckDown ? "struck_down" : "upheld";

        db.insert(schema.constitutionalChallenges).values({
          id: challengeId,
          billId: targetBill.id,
          billTitle: targetBill.title,
          filedByPartyId: partyId,
          arguments: action.arguments,
          decision,
          reasoning,
          status: "ruled",
          dayNumber: currentDay,
          ruledOnDay: currentDay,
          sentimentImpact: struckDown ? -0.5 : null,
        }).run();

        const party = allParties.find(p => p.id === partyId)!;
        addEvent(dayEvents, {
          dayNumber: currentDay,
          type: "constitutional_challenge_filed",
          actor: partyId,
          title: `${party.name} challenges "${targetBill.title}" at Bundesverfassungsgericht`,
          description: action.arguments,
          data: { challengeId, billId: targetBill.id },
        });

        addEvent(dayEvents, {
          dayNumber: currentDay,
          type: "constitutional_court_ruled",
          actor: "system",
          title: `Bundesverfassungsgericht: "${targetBill.title}" — ${struckDown ? "STRUCK DOWN" : "UPHELD"}`,
          description: reasoning,
          data: { challengeId, billId: targetBill.id, decision },
        });

        console.log(`  [ConstitutionalCourt] "${targetBill.title}" challenged by ${party.name}: ${decision}`);

        if (struckDown) {
          // Change bill status to struck_down
          db.update(schema.bills)
            .set({ status: "struck_down" })
            .where(eq(schema.bills.id, targetBill.id))
            .run();

          // Reverse economic impact
          const impact = targetBill.impact as BillImpact;
          nationalState.economy = reverseBillImpact(nationalState.economy, impact);

          // Reverse sentiment (legal uncertainty + original sentiment impact)
          nationalState.publicSentiment = Math.max(5, Math.min(75,
            Math.round((nationalState.publicSentiment - 0.5 - Math.abs(impact.publicSentiment ?? 0)) * 10) / 10,
          ));

          console.log(`  [ConstitutionalCourt] Economic impacts reversed for "${targetBill.title}"`);
        }

        // Apply approval impacts
        constitutionalCourtApprovalImpact(struckDown, allParties, partyId, targetBill.proposedBy);
      }
    }
  }

  // 10a2. Process MdB speeches
  try {
    const speechSentimentDelta = processDaySpeeches(currentDay);
    if (speechSentimentDelta !== 0) {
      nationalState.publicSentiment = Math.max(5, Math.min(75,
        Math.round((nationalState.publicSentiment + speechSentimentDelta) * 10) / 10,
      ));
    }
  } catch (err) {
    console.error("[Loop] Error processing MdB speeches:", err);
  }

  // 10b. Answer pending citizen questions
  await answerPendingQuestions(allParties, currentDay);

  // 10c. Review internal party proposals (accept/decline/expire)
  try {
    await reviewInternalProposals(currentDay);
  } catch (err) {
    console.error("[Loop] Error reviewing internal proposals:", err);
  }

  // 10d. Review MdB seat applications
  try {
    await reviewMdbApplications(currentDay);
  } catch (err) {
    console.error("[Loop] Error reviewing MdB applications:", err);
  }

  // 10d2. Review party discipline (every 7 sim days)
  if (currentDay % 7 === 0) {
    try {
      await reviewPartyDiscipline(currentDay);
    } catch (err) {
      console.error("[Loop] Error reviewing party discipline:", err);
    }
  }

  // 10e. Answer pending interpellations + expire overdue ones
  const govForInterpellations = getActiveGovernment();
  const interpResult = await answerPendingInterpellations(allParties, govForInterpellations, currentDay);

  for (const answered of interpResult.answered) {
    const filingParty = allParties.find(p => p.id === answered.filedByPartyId);
    if (filingParty && answered.sentimentImpact) {
      filingParty.approvalRating = Math.max(5, Math.min(75,
        Math.round((filingParty.approvalRating + answered.sentimentImpact) * 10) / 10,
      ));
    }

    addEvent(dayEvents, {
      dayNumber: currentDay,
      type: "interpellation_answered",
      actor: answered.targetPartyId,
      title: `${answered.targetMinisterName} answers: "${answered.title}"`,
      description: answered.response ?? "No response recorded.",
      data: { interpellationId: answered.id, filedBy: answered.filedByPartyId, targetMinistry: answered.targetMinistry },
    });
  }

  for (const expired of interpResult.expired) {
    const targetParty = allParties.find(p => p.id === expired.targetPartyId);
    if (targetParty && expired.sentimentImpact) {
      targetParty.approvalRating = Math.max(5, Math.min(75,
        Math.round((targetParty.approvalRating + expired.sentimentImpact) * 10) / 10,
      ));
    }

    addEvent(dayEvents, {
      dayNumber: currentDay,
      type: "interpellation_expired",
      actor: "system",
      title: `Unanswered: "${expired.title}" — embarrassment for ${targetParty?.name ?? expired.targetPartyId}`,
      description: `The ${expired.type === "große" ? "Große Anfrage" : "Kleine Anfrage"} from ${expired.filedByPartyId} went unanswered for 14 days.`,
      data: { interpellationId: expired.id, targetPartyId: expired.targetPartyId },
    });
  }

  // 11. Apply approval drift to all parties + sentiment drift
  const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;
  for (const party of allParties) {
    party.approvalRating = applyApprovalDrift(party);
    // Membership bonus: tiny daily reward for engaged party members
    try {
      const activeCount = getUserDb().select({ cnt: count() }).from(schema.users)
        .where(and(
          eq(schema.users.partyId, party.id),
          gte(schema.users.lastActive, Date.now() - TWO_WEEKS_MS),
        ))
        .get()?.cnt ?? 0;
      if (activeCount > 0) {
        const bonus = membershipBonus(activeCount);
        party.approvalRating = Math.max(1, Math.min(60,
          Math.round((party.approvalRating + bonus) * 10) / 10,
        ));
      }
    } catch { /* table may not exist in old DBs */ }
  }
  nationalState.publicSentiment = applySentimentDrift(nationalState.publicSentiment);

  // 11b. Resolve expired polls and referendums (daily)
  resolveExpiredPolls(currentDay, allParties, nationalState.publicSentiment);
  resolveExpiredReferendums(currentDay, dayEvents);

  // 11c. Weekly opinion recalculation
  if (isPollDay(currentDay)) {
    weeklyOpinionRecalc(allParties, allBills, nationalState.publicSentiment, currentDay);

    // Generate weekly polls
    const recentBillTitles = allBills
      .filter(b => b.proposedOnDay >= currentDay - 7)
      .map(b => b.title);
    await generateWeeklyPolls(allParties, activeCrises, recentBillTitles, currentDay);

    addEvent(dayEvents, {
      dayNumber: currentDay,
      type: "weekly_report",
      actor: "system",
      title: `Weekly Report — Day ${currentDay}`,
      description: `Weekly opinion recalculation complete. Sentiment: ${nationalState.publicSentiment}/100. Active crises: ${activeCrises.length}.`,
    });

    console.log(`  [Cycle] Weekly report — Day ${currentDay}`);
  }

  // 11c2. Maybe generate referendum (every 30 days)
  const recentBillsForRef = allBills
    .filter(b => b.proposedOnDay >= currentDay - TIME_CONFIG.ECONOMY_INTERVAL)
    .map(b => b.title);
  await maybeGenerateReferendum(currentDay, allParties, activeCrises, recentBillsForRef);

  // 11c. Monthly economic report
  if (monthly) {
    const report = monthlyEconomicReport(nationalState.economy, currentDay);

    addEvent(dayEvents, {
      dayNumber: currentDay,
      type: "monthly_report",
      actor: "system",
      title: `Monthly Economic Report — Day ${currentDay}`,
      description: report,
    });

    console.log(`  [Cycle] Monthly report — Day ${currentDay}`);
  }

  // 11d. Budget cycle (annual, or user-injected)
  if (isBudgetDay(currentDay) || injections.triggerBudget) {
    const cycleNumber = Math.floor(currentDay / TIME_CONFIG.BUDGET_INTERVAL);
    const coalitionParties = allParties.filter(p => nationalState.coalitionParties.includes(p.id));
    const allocations = generateBudgetAllocations(coalitionParties);
    const { votes: budgetVotes, yesSeats, noSeats, passed: budgetPassed } =
      tallyBudgetVote(allParties, nationalState.coalitionParties, nationalState.publicSentiment);

    let economicEffect: Record<string, number> | null = null;
    if (budgetPassed) {
      const budgetResult = applyBudgetEconomicEffect(nationalState.economy, allocations);
      nationalState.economy = budgetResult.economy;
      nationalState.publicSentiment = Math.max(5, Math.min(75, nationalState.publicSentiment + 0.5));
      economicEffect = budgetResult.effect;
      nationalState.provisionalBudget = false;
      // Clear any pending retry
      db.update(schema.simulationMeta)
        .set({ budgetRetryDay: null } as any)
        .where(eq(schema.simulationMeta.id, meta.id)).run();
    } else {
      // First rejection: provisional budget + schedule retry
      nationalState.provisionalBudget = true;
      const retryDay = currentDay + 7;
      db.update(schema.simulationMeta)
        .set({ budgetRetryDay: retryDay } as any)
        .where(eq(schema.simulationMeta.id, meta.id)).run();

      // Asymmetric penalties: leader −0.5, junior partners −1.0, opposition +0.3
      const sortedCoalition = [...coalitionParties].sort((a, b) => b.seatCount - a.seatCount);
      for (let i = 0; i < sortedCoalition.length; i++) {
        const penalty = i === 0 ? -0.5 : -1.0;
        sortedCoalition[i].approvalRating = Math.round((sortedCoalition[i].approvalRating + penalty) * 10) / 10;
      }
      const oppositionParties = allParties.filter(p => !nationalState.coalitionParties.includes(p.id));
      for (const p of oppositionParties) {
        p.approvalRating = Math.round((p.approvalRating + 0.3) * 10) / 10;
      }

      addEvent(dayEvents, {
        dayNumber: currentDay, type: "provisional_budget_started", actor: "system",
        title: `Budget Cycle ${cycleNumber} REJECTED — Provisional Budget Activated`,
        description: `Parliament rejected the budget (Yes: ${yesSeats}, No: ${noSeats}). Operating under vorläufige Haushaltsführung (Art. 111 GG). Revised vote scheduled for Day ${retryDay}.`,
        data: { cycleNumber, yesSeats, noSeats, retryDay },
      });
    }

    const budgetId = `budget-${cycleNumber}-${generateId()}`;
    db.insert(schema.budgets).values({
      id: budgetId,
      cycleNumber,
      status: budgetPassed ? "passed" : "rejected",
      allocations: allocations as any,
      totalAmount: BUDGET_TOTAL,
      proposedOnDay: currentDay,
      votedOnDay: currentDay,
      votes: budgetVotes as any,
      yesSeats,
      noSeats,
      economicEffect: economicEffect as any,
      revisionAttempt: 0,
    }).run();

    addEvent(dayEvents, {
      dayNumber: currentDay,
      type: budgetPassed ? "budget_passed" : "budget_rejected",
      actor: "system",
      title: `Budget Cycle ${cycleNumber} ${budgetPassed ? "PASSED" : "REJECTED"}`,
      description: `${budgetPassed ? "Approved" : "Rejected"} by parliament. Yes: ${yesSeats} seats, No: ${noSeats} seats.`,
      data: { budgetId, cycleNumber, yesSeats, noSeats },
    });

    console.log(`  [Budget] Cycle ${cycleNumber}: ${budgetPassed ? "PASSED" : "REJECTED"} (${yesSeats} vs ${noSeats})`);
  }

  // 11e. Budget revision retry (7 days after rejection)
  if (budgetRetryDay !== null && currentDay === budgetRetryDay) {
    const coalitionParties = allParties.filter(p => nationalState.coalitionParties.includes(p.id));
    const allocations = generateRevisedAllocations(coalitionParties);
    const { votes: budgetVotes, yesSeats, noSeats, passed: budgetPassed } =
      tallyBudgetVote(allParties, nationalState.coalitionParties, nationalState.publicSentiment, true);

    const lastBudget = db.select().from(schema.budgets)
      .orderBy(desc(schema.budgets.proposedOnDay)).limit(1).all()[0];
    const cycleNumber = lastBudget?.cycleNumber ?? Math.floor(currentDay / TIME_CONFIG.BUDGET_INTERVAL);

    let economicEffect: Record<string, number> | null = null;
    if (budgetPassed) {
      const budgetResult = applyBudgetEconomicEffect(nationalState.economy, allocations);
      nationalState.economy = budgetResult.economy;
      nationalState.publicSentiment = Math.max(5, Math.min(75, nationalState.publicSentiment + 0.3));
      nationalState.provisionalBudget = false;
      economicEffect = budgetResult.effect;
    } else {
      nationalState.publicSentiment = Math.max(5, Math.min(75, nationalState.publicSentiment - 2.0));
      const sortedCoalition = [...coalitionParties].sort((a, b) => b.seatCount - a.seatCount);
      for (const p of sortedCoalition) {
        p.approvalRating = Math.round((p.approvalRating - 1.5) * 10) / 10;
      }

      addEvent(dayEvents, {
        dayNumber: currentDay, type: "budget_revision_rejected", actor: "system",
        title: `Revised Budget Cycle ${cycleNumber} REJECTED — Coalition Crisis`,
        description: `Revised budget failed: ${yesSeats} yes vs ${noSeats} no. Government dissolved, snap election triggered.`,
        data: { cycleNumber, yesSeats, noSeats },
      });

      // Escalate: dissolve government + snap election
      const activeElection = db.select().from(schema.elections)
        .where(ne(schema.elections.status, "completed")).all()[0];
      const govNow = db.select().from(schema.government).where(eq(schema.government.active, true)).all()[0];
      if (!activeElection && govNow) {
        dissolveGovernment(currentDay);
        addEvent(dayEvents, {
          dayNumber: currentDay, type: "government_dissolved", actor: "system",
          title: "Government dissolved — Budget crisis",
          description: "Coalition failed to pass a revised budget. Snap election triggered.",
          data: { governmentId: govNow.id },
        });
        nextElectionDay = currentDay;
        db.update(schema.simulationMeta).set({ nextElectionDay: currentDay }).where(eq(schema.simulationMeta.id, meta.id)).run();
      }
    }

    db.update(schema.simulationMeta)
      .set({ budgetRetryDay: null } as any)
      .where(eq(schema.simulationMeta.id, meta.id)).run();

    const budgetId = `budget-${cycleNumber}-r-${generateId()}`;
    db.insert(schema.budgets).values({
      id: budgetId, cycleNumber,
      status: budgetPassed ? "passed" : "rejected",
      allocations: allocations as any, totalAmount: BUDGET_TOTAL,
      proposedOnDay: currentDay, votedOnDay: currentDay,
      votes: budgetVotes as any, yesSeats, noSeats,
      economicEffect: economicEffect as any,
      revisionAttempt: 1,
    }).run();

    addEvent(dayEvents, {
      dayNumber: currentDay,
      type: budgetPassed ? "budget_passed" : "budget_rejected", actor: "system",
      title: `Revised Budget Cycle ${cycleNumber} ${budgetPassed ? "PASSED" : "REJECTED"}`,
      description: `Revision vote: Yes: ${yesSeats}, No: ${noSeats}.`,
      data: { budgetId, cycleNumber, yesSeats, noSeats, revisionAttempt: 1 },
    });

    console.log(`  [Budget] Revision ${cycleNumber}: ${budgetPassed ? "PASSED" : "REJECTED"} (${yesSeats} vs ${noSeats})`);
  }

  // Save party approval ratings
  for (const party of allParties) {
    db.update(schema.parties)
      .set({ approvalRating: party.approvalRating })
      .where(eq(schema.parties.id, party.id))
      .run();
  }

  // 11d. Record party history snapshot
  for (const party of allParties) {
    db.insert(schema.partyHistory).values({
      partyId: party.id,
      dayNumber: currentDay,
      approvalRating: party.approvalRating,
      seatCount: party.seatCount,
    }).run();
  }

  // 12. Save updated national state
  db.update(schema.nationalState)
    .set({
      coalitionParties: nationalState.coalitionParties as any,
      oppositionParties: nationalState.oppositionParties as any,
      budget: nationalState.economy.budget,
      unemployment: nationalState.economy.unemployment,
      inflation: nationalState.economy.inflation,
      gdpGrowth: nationalState.economy.gdpGrowth,
      publicSentiment: nationalState.publicSentiment,
      provisionalBudget: nationalState.provisionalBudget,
    } as any)
    .where(eq(schema.nationalState.id, state.id))
    .run();

  // 12b. Generate media articles from today's events
  await generateDailyMedia(dayEvents, allParties, currentDay);

  // 12c. Apply media sentiment influence
  const todaysMedia = getRecentMedia(3).filter(a => a.dayNumber === currentDay);
  if (todaysMedia.length > 0) {
    const mediaDelta = mediaSentimentImpact(todaysMedia);
    if (mediaDelta !== 0) {
      nationalState.publicSentiment = Math.max(5, Math.min(75,
        Math.round((nationalState.publicSentiment + mediaDelta) * 10) / 10,
      ));
      // Re-save national state with media-adjusted sentiment
      db.update(schema.nationalState)
        .set({ publicSentiment: nationalState.publicSentiment })
        .where(eq(schema.nationalState.id, state.id))
        .run();
      console.log(`  [Media] Sentiment impact: ${mediaDelta > 0 ? "+" : ""}${mediaDelta}`);
    }
  }

  // 12d. Generate daily narrative summary
  const summaryResult = await generateDailySummary(
    dayEvents,
    allParties,
    currentDay,
    nationalState.publicSentiment,
    nationalState.coalitionParties,
  );
  const dailySummaryStr = summaryResult ? JSON.stringify(summaryResult) : null;
  if (dailySummaryStr) {
    console.log(`  [Summary] Generated daily narrative`);
  }

  // 13. Save all day events
  const now = new Date().toISOString();
  for (const ev of dayEvents) {
    db.insert(schema.simulationEvents).values({
      id: generateId(),
      ...ev,
      data: ev.data as any ?? null,
      createdAt: now,
    }).run();
  }

  // 14. Update simulation meta
  db.update(schema.simulationMeta)
    .set({
      currentDay,
      lastRunAt: new Date().toISOString(),
      lowSentimentStreak,
      dailySummary: dailySummaryStr,
    } as any)
    .where(eq(schema.simulationMeta.id, meta.id))
    .run();

  console.log(`=== DAY ${currentDay} COMPLETE ===\n`);
  return currentDay;
}

function mapConstitutionalChallenge(row: typeof schema.constitutionalChallenges.$inferSelect): ConstitutionalChallenge {
  return {
    id: row.id,
    billId: row.billId,
    billTitle: row.billTitle,
    filedByPartyId: row.filedByPartyId,
    arguments: row.arguments,
    decision: row.decision as ConstitutionalChallenge["decision"],
    reasoning: row.reasoning ?? null,
    status: row.status as ConstitutionalChallenge["status"],
    dayNumber: row.dayNumber,
    ruledOnDay: row.ruledOnDay ?? null,
    sentimentImpact: row.sentimentImpact ?? null,
  };
}

function mapElection(row: typeof schema.elections.$inferSelect): Election {
  return {
    id: row.id,
    triggerReason: row.triggerReason,
    announcedOnDay: row.announcedOnDay,
    campaignStartDay: row.campaignStartDay,
    electionDay: row.electionDay,
    status: row.status as Election["status"],
    results: row.results as unknown as Election["results"],
    newCoalition: row.newCoalition as unknown as string[] | null,
    newOpposition: row.newOpposition as unknown as string[] | null,
    negotiationRounds: row.negotiationRounds as unknown as NegotiationRound[][] | null,
    coalitionAgreement: row.coalitionAgreement as unknown as CoalitionAgreement | null,
  };
}

function mapMotion(row: typeof schema.motions.$inferSelect): Motion {
  return {
    id: row.id,
    type: row.type as Motion["type"],
    title: row.title,
    description: row.description,
    proposedBy: row.proposedBy,
    status: row.status as Motion["status"],
    votes: row.votes as unknown as import("@ki-bundestag/types").BillVote[],
    dayNumber: row.dayNumber,
    sentimentImpact: row.sentimentImpact ?? undefined,
  };
}

function mapInterpellation(row: typeof schema.interpellations.$inferSelect): Interpellation {
  return {
    id: row.id,
    type: row.type as Interpellation["type"],
    title: row.title,
    question: row.question,
    filedByPartyId: row.filedByPartyId,
    targetMinistry: row.targetMinistry as Interpellation["targetMinistry"],
    targetMinisterName: row.targetMinisterName,
    targetPartyId: row.targetPartyId,
    response: row.response ?? null,
    status: row.status as Interpellation["status"],
    dayNumber: row.dayNumber,
    respondedOnDay: row.respondedOnDay ?? null,
    sentimentImpact: row.sentimentImpact ?? null,
  };
}

function mapConfidenceVote(row: typeof schema.confidenceVotes.$inferSelect): ConfidenceVote {
  return {
    id: row.id,
    type: row.type as ConfidenceVote["type"],
    governmentId: row.governmentId,
    initiatedByPartyId: row.initiatedByPartyId,
    chancellorName: row.chancellorName,
    proposedChancellor: row.proposedChancellor ?? null,
    proposedChancellorPartyId: row.proposedChancellorPartyId ?? null,
    title: row.title,
    description: row.description,
    status: row.status as ConfidenceVote["status"],
    votes: row.votes as unknown as import("@ki-bundestag/types").BillVote[],
    dayNumber: row.dayNumber,
    sentimentImpact: row.sentimentImpact ?? null,
  };
}

function mapCrisis(row: typeof schema.crises.$inferSelect): Crisis {
  return {
    id: row.id,
    templateId: row.templateId,
    name: row.name,
    description: row.description,
    category: row.category as Crisis["category"],
    severity: row.severity as Crisis["severity"],
    startDay: row.startDay,
    endDay: row.endDay,
    dailyImpact: row.dailyImpact as unknown as import("@ki-bundestag/types").BillImpact,
    resolved: row.resolved,
  };
}
