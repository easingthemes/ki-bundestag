import { and, desc, eq, ne, gte, inArray } from "drizzle-orm";
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
import { getDb, getSqlite, getUserDb, getUserSqlite, schema, migrateDatabase } from "../db/index.js";
import { runPartyAgent, buildPartyAgentRequests, processPartyAgentResult } from "../agent/index.js";
import { submitBatch, findResult, type BatchRequest } from "../agent/batch-client.js";
import { AIProviderLimitError } from "../agent/client.js";
import { applyEconomicDrift, applyBillImpact, reverseBillImpact } from "./economy.js";
import { tallyVotes } from "./voting.js";
import { applyDailyApprovalDrift, approvalFromBillOutcome, updateSentiment, applySentimentDrift, normalizeApprovalChanges, clampApproval } from "./opinion.js";
import { maybeTriggerCrisis, applyCrisisImpacts, resolveExpiredCrises } from "./crises.js";
import { isPollDay, isMonthlyDay, isBudgetDay, weeklyOpinionRecalc, monthlyEconomicReport } from "./cycles.js";
import { shouldTriggerElection, announceElection, advanceElectionPhase, calculateResults, formGovernment, ELECTION_COOLDOWN_DAYS } from "./elections.js";
import { TIME_CONFIG } from "./timing.js";
import { dayToDate, snapToNextWorkday, snapToNextSunday } from "./calendar.js";
import { runNegotiationRound, synthesizeAgreement, buildNegotiationEvents, getMaxNegotiationRounds } from "./negotiations.js";
import { generateWeeklyPolls, resolveExpiredPolls, buildContextPollBatchRequest, processContextPollBatchResult } from "./polls.js";
import { getRecentMedia, applyMediaSentiment, applyMediaSentimentFromArticles, buildMediaBatchRequest, processMediaBatchResult } from "./media.js";
import { answerPendingQuestions } from "./questions.js";
import { maybeGenerateBotQuestionPool } from "./bot-question-pool.js";
import { maybeGenerateReferendum, resolveExpiredReferendums, buildReferendumBatchRequest, processReferendumBatchResult } from "./referendums.js";
import { processInjections } from "./injections.js";
import { updateFraktionen, getActiveFraktionen } from "./fraktionen.js";
import { tallyMotionVotes, motionSentimentImpact } from "./motions.js";
import { formCabinet, getActiveGovernment, dissolveGovernment, isGovernmentBill as checkIsGovernmentBill } from "./government.js";
import { answerPendingInterpellations } from "./interpellations.js";
import { tallyVertrauensfrage, tallyMisstrauensvotum, confidenceVoteSentimentImpact } from "./confidence-votes.js";
import { adjudicateChallenge, constitutionalCourtApprovalImpact } from "./constitutional-court.js";
import { generateBudgetAllocations, generateRevisedAllocations, tallyBudgetVote, applyBudgetEconomicEffect, BUDGET_TOTAL } from "./budget.js";
import { advanceBillPipeline } from "./bill-pipeline.js";
import { seedCommittees, shouldSeedCommittees, assignCommitteeMemberships } from "./committees.js";
import { checkPresidentialVeto } from "./veto.js";
import { buildSummaryBatchRequest, processSummaryBatchResult } from "./summary.js";
import { reviewInternalProposals } from "./internal-proposals.js";
import { createNotification, createNotificationForAll } from "./event-queue.js";
import { resetAllSeats, allocateSeats, reviewMdbApplications } from "./seats.js";
import { processDaySpeeches } from "./speeches.js";
import { processMdbActions } from "./mdb-actions.js";
import { reviewPartyDiscipline } from "./discipline.js";
import { buildBriefingBatchRequest, processBriefingResult, getPartyRecentActions } from "../agent/briefing.js";
import { shouldGenerateEraSummary, buildEraSummaryBatchRequest, processEraSummaryResult, getEraSummaries, extractCaseFacts, getLastEraSummaryEnd } from "./era-summary.js";
import { shouldGenerateSidejobs, buildSidejobBatchRequest, processSidejobResult, applySidejobScandalImpact } from "./sidejobs.js";
import {
  shouldFetchKnowledge, fetchAllSources, buildKnowledgeDigestRequest,
  processKnowledgeDigestResult, getActiveShocks, buildRealWorldContext, getPartyPositions,
} from "./knowledge-fetch.js";
import { setTrackingDay } from "../agent/cost-tracker.js";
import type { TimingPreset } from "./timing.js";
import type { ContextDepth } from "../agent/context-depth.js";
import { getDepthConfig, isValidContextDepth } from "../agent/context-depth.js";

/** Update heartbeat timestamp so the frontend knows the sim process is alive */
function heartbeat(): void {
  try {
    getSqlite().prepare("UPDATE simulation_meta SET heartbeat_at = ?").run(new Date().toISOString());
  } catch { /* best-effort */ }
}

/** Track day progress (0-100) so the frontend shows real phase completion */
class DayProgress {
  /** Set progress to a specific percentage and write to DB.
   *  Also updates heartbeat_at, so standalone heartbeat() calls are not needed alongside set(). */
  set(pct: number): void {
    try {
      getSqlite().prepare("UPDATE simulation_meta SET day_progress = ?, heartbeat_at = ?")
        .run(Math.min(pct, 99), new Date().toISOString());
    } catch { /* best-effort */ }
  }

  complete(): void {
    try {
      getSqlite().prepare("UPDATE simulation_meta SET day_progress = 100").run();
    } catch { /* best-effort */ }
  }
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}

function addEvent(
  events: Array<Omit<SimulationEvent, "id">>,
  ev: Omit<SimulationEvent, "id">,
) {
  events.push(ev);
}

/**
 * Clean up leftover data from a previous failed attempt at the same day.
 * When a day fails mid-way (e.g. API rate limit), events/bills/etc are already
 * committed but currentDay is never advanced. Retrying would create duplicates.
 */
function cleanupPartialDay(dayNumber: number): void {
  const sqlite = getSqlite();
  const userSqlite = getUserSqlite();

  // Tables in simulation.db with day_number column
  const simDayNumberTables = [
    "simulation_events",
    "motions",
    "interpellations",
    "confidence_votes",
    "constitutional_challenges",
    "party_history",
    "media_articles",
  ];

  // Tables in simulation.db with other day columns
  const simOtherDayTables: Array<{ table: string; column: string }> = [
    { table: "bills", column: "proposed_on_day" },
    { table: "polls", column: "created_on_day" },
    { table: "referendums", column: "created_on_day" },
    { table: "budgets", column: "proposed_on_day" },
    { table: "crises", column: "start_day" },
    { table: "elections", column: "announced_on_day" },
  ];

  let cleaned = 0;
  for (const table of simDayNumberTables) {
    try {
      const result = sqlite.prepare(`DELETE FROM ${table} WHERE day_number = ?`).run(dayNumber);
      cleaned += result.changes;
    } catch { /* table may not exist yet */ }
  }
  for (const { table, column } of simOtherDayTables) {
    try {
      const result = sqlite.prepare(`DELETE FROM ${table} WHERE ${column} = ?`).run(dayNumber);
      cleaned += result.changes;
    } catch { /* table may not exist yet */ }
  }

  // Tables in users.db
  try {
    const result = userSqlite.prepare("DELETE FROM internal_proposals WHERE created_on_day = ?").run(dayNumber);
    cleaned += result.changes;
  } catch { /* table may not exist yet */ }

  if (cleaned > 0) {
    console.log(`  [Cleanup] Removed ${cleaned} leftover rows from failed day ${dayNumber}`);
  }
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

  // Clean up any leftover data from a previous failed attempt at this day
  cleanupPartialDay(currentDay);
  setTrackingDay(currentDay);
  const startDateStr = (meta as any).startDate as string | null;
  const startDate: Date | undefined = startDateStr ? new Date(startDateStr) : undefined;

  if (startDate) {
    const calDate = dayToDate(currentDay, startDate);
    const weekdays = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
    console.log(`\n=== DAY ${currentDay} — ${calDate.toISOString().split("T")[0]} (${weekdays[calDate.getDay()]}) ===`);
  } else {
    console.log(`\n=== DAY ${currentDay} ===`);
  }

  // Read context depth setting
  const rawDepth = ((meta as any).contextDepth as string) ?? "normal";
  const contextDepth: ContextDepth = isValidContextDepth(rawDepth) ? rawDepth : "normal";
  const depthConfig = getDepthConfig(contextDepth);

  // Mark day as started (for frontend status), but do NOT commit currentDay yet.
  // currentDay is only committed at the end of a successful day to prevent
  // advancing the counter when AI calls fail mid-day.
  const now = new Date().toISOString();
  const progress = new DayProgress();
  db.update(schema.simulationMeta)
    .set({ dayStartedAt: now, heartbeatAt: now, dayProgress: 5 } as any)
    .where(eq(schema.simulationMeta.id, meta.id))
    .run();

  // 2. Load all data
  const allParties = db.select().from(schema.parties).all() as unknown as Party[];
  // Snapshot starting approvals for zero-sum normalization at end of day
  const startingApprovals = new Map(allParties.map(p => [p.id, p.approvalRating]));
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

  // Bounded event query: last 7 days, limited by depth config, chronological order
  const eventLookbackDay = Math.max(1, currentDay - 7);
  const recentForContext = (db.select().from(schema.simulationEvents)
    .where(gte(schema.simulationEvents.dayNumber, eventLookbackDay))
    .orderBy(desc(schema.simulationEvents.id))
    .limit(depthConfig.recentEventsMax)
    .all() as unknown as SimulationEvent[])
    .reverse();

  const dayEvents: Array<Omit<SimulationEvent, "id">> = [];

  // Day start event — flush immediately so frontend can see the day is processing
  const dayStartEvent: Omit<SimulationEvent, "id"> = {
    dayNumber: currentDay,
    type: "day_start",
    actor: "system",
    title: `Tag ${currentDay} beginnt`,
    description: `Ein neuer Tag im Bundestag. Haushalt: ${nationalState.economy.budget} Mrd., Arbeitslosigkeit: ${nationalState.economy.unemployment}%, Inflation: ${nationalState.economy.inflation}%, BIP-Wachstum: ${nationalState.economy.gdpGrowth}%`,
  };
  addEvent(dayEvents, dayStartEvent);
  db.insert(schema.simulationEvents).values({
    id: generateId(),
    ...dayStartEvent,
    data: null,
    createdAt: new Date().toISOString(),
  }).run();

  // 2b. Generate and persist start-of-day preview
  const previewParts: string[] = [];
  if (pendingBills.filter(b => b.status === "third_reading").length > 0) {
    const count = pendingBills.filter(b => b.status === "third_reading").length;
    previewParts.push(`${count} Gesetz${count > 1 ? "e" : ""} stehen zur dritten Lesung`);
  }
  if (pendingBills.filter(b => b.status === "committee").length > 0) {
    const count = pendingBills.filter(b => b.status === "committee").length;
    previewParts.push(`${count} Gesetz${count > 1 ? "e" : ""} im Ausschuss`);
  }
  const previewCrises = db.select().from(schema.crises).all()
    .filter((c: any) => !c.resolved && c.endDay >= currentDay);
  if (previewCrises.length > 0) {
    previewParts.push(`${previewCrises.length} aktive Krise${previewCrises.length > 1 ? "n" : ""}`);
  }
  const previewElection = db.select().from(schema.elections).all()
    .find((e: any) => e.status !== "completed" && e.status !== "invalidated");
  if (previewElection) {
    previewParts.push(`Wahl: ${(previewElection as any).status}`);
  }
  if (nationalState.provisionalBudget) {
    previewParts.push("Vorläufige Haushaltsführung");
  }
  const dayPreview = previewParts.length > 0
    ? previewParts.join(" · ")
    : "Regulärer Sitzungstag";

  // Upsert the day_summaries row with preview (narrative/mood filled later)
  getSqlite().prepare(
    `INSERT INTO day_summaries (day_number, preview, created_at) VALUES (?, ?, ?)
     ON CONFLICT(day_number) DO UPDATE SET preview = excluded.preview`
  ).run(currentDay, dayPreview, new Date().toISOString());

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
    title: "Wirtschaftsindikatoren aktualisiert",
    description: `Haushalt: ${driftedEconomy.budget} Mrd., Arbeitslosigkeit: ${driftedEconomy.unemployment}%, Inflation: ${driftedEconomy.inflation}%, BIP-Wachstum: ${driftedEconomy.gdpGrowth}%`,
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
      title: "Wahl durch Gerichtsbeschluss annulliert",
      description: "Die letzte Wahl wurde annulliert. Sitzverteilung vor der Wahl wiederhergestellt. Eine Neuwahl wird sofort angesetzt.",
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
      title: `Krise beendet: ${crisis.name}`,
      description: `Die Krise ${crisis.name} (${crisis.severity}) wurde nach ${currentDay - crisis.startDay} Tagen gelöst.`,
      data: { crisisId: crisis.id, templateId: crisis.templateId },
    });

    console.log(`  [Crisis] Ended: ${crisis.name}`);
  }

  // Filter to only still-active after resolution
  activeCrises = activeCrises.filter(c => !c.resolved);

  // Maybe trigger new crisis
  const monthly = isMonthlyDay(currentDay, startDate);
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
      title: `Krise: ${newCrisis.name}`,
      description: newCrisis.description,
      data: { crisisId: newCrisis.id, severity: newCrisis.severity, category: newCrisis.category, endDay: newCrisis.endDay },
    });

    try { createNotificationForAll("crisis_alert", `Krise: ${newCrisis.name}`, `${newCrisis.description} (Schweregrad: ${newCrisis.severity})`, { crisisId: newCrisis.id, severity: newCrisis.severity }, currentDay); } catch {}

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
      : shouldTriggerElection(currentDay, nextElectionDay, lowSentimentStreak, null, meta.electionCooldownUntil ?? 0);
    if (trigger.trigger) {
      const newElection = announceElection(currentDay, trigger.reason, startDate);
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
        title: `Wahl angekündigt: ${trigger.reason}`,
        description: `Eine Bundestagswahl wurde angesetzt. Wahlkampf beginnt Tag ${newElection.campaignStartDay}, Wahltag ${newElection.electionDay}.`,
        data: { electionId: newElection.id, reason: trigger.reason },
      });

      try { createNotificationForAll("election_started", "Wahl angekündigt!", `Eine Bundestagswahl wurde angesetzt. Wahltag: ${newElection.electionDay}.`, { electionId: newElection.id }, currentDay); } catch {}

      console.log(`  [Election] Announced: ${trigger.reason} (election day: ${newElection.electionDay})`);
    }
  }

  // Handle negotiation phase
  let skipPartyAgents = false;
  let briefingText: string | null = null;

  if (activeElection && activeElection.status === "negotiation") {
    skipPartyAgents = true;

    const previousRounds = (activeElection.negotiationRounds || []) as NegotiationRound[][];
    const roundNumber = previousRounds.length + 1;
    const daysSinceElection = currentDay - activeElection.electionDay;

    // Safety: if negotiations are stuck for too many days (e.g. API errors preventing
    // round progression), force-complete with algorithmic coalition
    const MAX_NEGOTIATION_DAYS = getMaxNegotiationRounds() + 5;
    if (daysSinceElection > MAX_NEGOTIATION_DAYS && roundNumber <= getMaxNegotiationRounds()) {
      console.warn(`  [Negotiation] Stuck for ${daysSinceElection} days (still round ${roundNumber}), force-completing...`);

      const govResult = formGovernment(activeElection.results!, allParties);
      const coalition = govResult.coalition;
      const opposition = govResult.opposition;

      db.update(schema.elections)
        .set({
          status: "completed",
          negotiationRounds: previousRounds as any,
          coalitionAgreement: null,
          newCoalition: coalition as any,
          newOpposition: opposition as any,
        })
        .where(eq(schema.elections.id, activeElection.id))
        .run();

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

      nationalState.coalitionParties = coalition;
      nationalState.oppositionParties = opposition;

      lowSentimentStreak = 0;
      // Honeymoon period: boost sentiment and set cooldown to prevent immediate re-election
      nationalState.publicSentiment = Math.min(75, Math.max(nationalState.publicSentiment, 30) + 5);
      let nextElDay = currentDay + TIME_CONFIG.TERM_DAYS;
      if (startDate) nextElDay = snapToNextSunday(nextElDay, startDate);
      const cooldownUntil = currentDay + ELECTION_COOLDOWN_DAYS;
      db.update(schema.simulationMeta)
        .set({ nextElectionDay: nextElDay, lowSentimentStreak: 0, electionCooldownUntil: cooldownUntil } as any)
        .where(eq(schema.simulationMeta.id, meta.id))
        .run();

      const coalitionNames = coalition.map(id => allParties.find(p => p.id === id)?.name ?? id).join(", ");
      addEvent(dayEvents, {
        dayNumber: currentDay,
        type: "government_formed",
        actor: "system",
        title: "Regierung gebildet (Notfall-Rückfalloption)",
        description: `Verhandlungen gescheitert — Koalition algorithmisch gebildet: ${coalitionNames}`,
        data: { electionId: activeElection.id, coalition, opposition, fallback: true },
      });

      const fraktionResult = updateFraktionen(currentDay, allParties);
      for (const ev of fraktionResult.events) addEvent(dayEvents, ev);

      const cabinet = formCabinet(coalition, allParties, activeElection.id, currentDay);
      addEvent(dayEvents, {
        dayNumber: currentDay,
        type: "government_cabinet_formed",
        actor: "system",
        title: `Kanzler/in ${cabinet.chancellorName} bildet Kabinett`,
        description: `Kanzler/in: ${cabinet.chancellorName} (${cabinet.chancellorPartyId}). Minister: ${cabinet.ministers.map(m => `${m.name} (${m.partyId}) — ${m.portfolio}`).join(", ")}`,
        data: { governmentId: cabinet.id, chancellorName: cabinet.chancellorName, ministers: cabinet.ministers },
      });

      const timingPreset = (meta.timingPreset ?? "normal") as TimingPreset;
      resetAllSeats();
      for (const result of activeElection.results!) {
        allocateSeats(result.partyId, result.seatsWon, activeElection.id, currentDay, timingPreset);
      }

      try {
        const userSqlite = (await import("../db/index.js")).getUserSqlite();
        userSqlite.prepare("UPDATE mdb_applications SET status = 'expired' WHERE status = 'pending'").run();
      } catch { /* table may not exist yet */ }

      // Seed committees if needed and assign memberships
      try {
        if (shouldSeedCommittees()) seedCommittees(currentDay);
        assignCommitteeMemberships(currentDay);
        console.log(`  [Committees] Assigned memberships after emergency election`);
      } catch (err) { console.warn(`  [Committees] Assignment failed:`, (err as Error).message); }

      console.log(`  [Election] Emergency fallback coalition: ${coalitionNames}`);
      activeElection = null;
    }

    if (activeElection && activeElection.status === "negotiation") {
      console.log(`  [Negotiation] Day ${currentDay}: Running negotiation round ${roundNumber}...`);
      progress.set(15); // Negotiation round starting

    const roundResults = await runNegotiationRound(
      activeElection.results!,
      allParties,
      previousRounds,
      roundNumber,
      currentDay,
    );

    progress.set(50); // Negotiation round complete
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

      // Reset streak and schedule next election (snap to Sunday if calendar-aware)
      // Honeymoon period: boost sentiment and set cooldown to prevent immediate re-election
      lowSentimentStreak = 0;
      nationalState.publicSentiment = Math.min(75, Math.max(nationalState.publicSentiment, 30) + 5);
      let nextElDay = currentDay + TIME_CONFIG.TERM_DAYS;
      if (startDate) nextElDay = snapToNextSunday(nextElDay, startDate);
      const cooldownUntil = currentDay + ELECTION_COOLDOWN_DAYS;
      db.update(schema.simulationMeta)
        .set({
          nextElectionDay: nextElDay,
          lowSentimentStreak: 0,
          electionCooldownUntil: cooldownUntil,
        } as any)
        .where(eq(schema.simulationMeta.id, meta.id))
        .run();

      addEvent(dayEvents, {
        dayNumber: currentDay,
        type: "negotiation_complete",
        actor: "system",
        title: "Koalitionsverhandlungen abgeschlossen",
        description: agreement
          ? `Einigung erzielt: ${agreement.summary}`
          : "Keine Einigung — Koalition algorithmisch gebildet.",
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
        title: "Neue Regierung gebildet",
        description: `Koalition: ${coalitionNames}`,
        data: { electionId: activeElection.id, coalition, opposition },
      });

      try { createNotificationForAll("government_formed", "Neue Regierung gebildet", `Koalition: ${coalitionNames}`, { coalition, opposition }, currentDay); } catch {}

      // Form cabinet (Chancellor + Ministers)
      const cabinet = formCabinet(coalition, allParties, activeElection.id, currentDay);
      const ministerList = cabinet.ministers.map(m => `${m.name} (${m.partyId}) — ${m.portfolio}`).join(", ");
      addEvent(dayEvents, {
        dayNumber: currentDay,
        type: "government_cabinet_formed",
        actor: "system",
        title: `Kanzler/in ${cabinet.chancellorName} bildet Kabinett`,
        description: `Kanzler/in: ${cabinet.chancellorName} (${cabinet.chancellorPartyId}). Minister: ${ministerList}`,
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

      // Seed committees if needed and assign memberships
      try {
        if (shouldSeedCommittees()) seedCommittees(currentDay);
        assignCommitteeMemberships(currentDay);
        console.log(`  [Committees] Assigned memberships after election`);
      } catch (err) { console.warn(`  [Committees] Assignment failed:`, (err as Error).message); }

      console.log(`  [Election] New coalition: ${coalitionNames}`);
      activeElection = null;
    } else {
      // Save intermediate rounds
      db.update(schema.elections)
        .set({ negotiationRounds: allRounds as any })
        .where(eq(schema.elections.id, activeElection.id))
        .run();
    }
    } // end inner negotiation guard
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
          return `${p.name}: ${r.votesPercent}% (${r.seatsWon} Sitze, ${delta})`;
        })
        .join(", ");

      addEvent(dayEvents, {
        dayNumber: currentDay,
        type: "election_result",
        actor: "system",
        title: "Bundestagswahlergebnis",
        description: resultsStr,
        data: { electionId: activeElection.id, results },
      });

      try { createNotificationForAll("election_result", "Wahlergebnis steht fest!", resultsStr, { electionId: activeElection.id }, currentDay); } catch {}

      console.log(`  [Election] Results: ${resultsStr}`);
      console.log(`  [Election] Entering negotiation phase...`);
    }
  }

  progress.set(10); // Init + elections phase done

  // Hoisted so inactivity tracking can read it after the if-block
  const partyActions = new Map<string, import("@ki-bundestag/types").AgentAction[]>();

  if (!skipPartyAgents) {
    // === BILL PIPELINE — multi-stage lifecycle ===
    const pipelineEvents = advanceBillPipeline(currentDay, allBills, allParties, nationalState.coalitionParties);
    for (const ev of pipelineEvents) {
      addEvent(dayEvents, ev);
    }

    // Collect bills for agent calls — fresh DB queries so the validator and prompt
    // always agree on the exact set of votable bills, even if the in-memory allBills
    // snapshot is stale from a prior aborted run or mid-step pipeline mutation.
    const thirdReadingBills = db.select().from(schema.bills)
      .where(eq(schema.bills.status, "third_reading"))
      .all() as unknown as Bill[];
    const secondReadingBills = db.select().from(schema.bills)
      .where(eq(schema.bills.status, "second_reading"))
      .all() as unknown as Bill[];

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

    // Real-world knowledge grounding (fetch + digest weekly)
    if (depthConfig.enableKnowledgeGrounding && shouldFetchKnowledge()) {
      try {
        const rawData = await fetchAllSources();
        if (rawData.newsItems.length > 0 || rawData.parliamentaryItems.length > 0) {
          const activeShocks = getActiveShocks();
          const digestReq = buildKnowledgeDigestRequest(rawData, activeShocks);
          const digestResults = await submitBatch([digestReq]);
          processKnowledgeDigestResult(findResult(digestResults, digestReq.customId));
        }
      } catch (err) {
        if (err instanceof AIProviderLimitError) {
          console.warn(`  [Knowledge] Skipped — ${err.message}`);
        } else {
          console.warn(`  [Knowledge] Failed, continuing without grounding:`, (err as Error).message);
        }
      }
    }

    // Seed committees if table is empty (first run or after knowledge fetch)
    try {
      if (shouldSeedCommittees()) {
        seedCommittees(currentDay);
        console.log(`  [Committees] Seeded committee table`);
      }
    } catch (err) { console.warn(`  [Committees] Seed failed:`, (err as Error).message); }

    // Build real-world context for prompts (reads from DB, applies decay)
    const realWorldCtx = depthConfig.enableKnowledgeGrounding ? buildRealWorldContext(currentDay) : null;

    // Generate era summary if interval has elapsed (compressed historical narrative)
    let eraSummaryList = getEraSummaries();
    if (shouldGenerateEraSummary(currentDay, depthConfig)) {
      // Extract case facts before building request (used in both prompt and storage)
      const lastEnd = getLastEraSummaryEnd();
      const eraStartDay = lastEnd + 1;
      const eraEndDay = currentDay - 1;
      const caseFacts = extractCaseFacts(eraStartDay, eraEndDay);

      const eraSummaryReq = buildEraSummaryBatchRequest(currentDay, depthConfig, caseFacts);
      if (eraSummaryReq) {
        try {
          const eraResults = await submitBatch([eraSummaryReq]);
          processEraSummaryResult(findResult(eraResults, eraSummaryReq.customId), currentDay, caseFacts);
          eraSummaryList = getEraSummaries(); // Refresh after insert
        } catch (err) {
          if (err instanceof AIProviderLimitError) {
            console.warn(`  [EraSummary] Skipped — ${err.message}`);
          } else {
            console.warn(`  [EraSummary] Failed, continuing without era summary:`, (err as Error).message);
          }
        }
      }
    }
    const hasEraSummaries = eraSummaryList.length > 0;

    // Generate daily briefing (cross-day narrative context, shared across all parties)
    const briefingReq = buildBriefingBatchRequest(currentDay, allParties, nationalState.coalitionParties, depthConfig, hasEraSummaries);
    if (briefingReq) {
      try {
        const briefingResults = await submitBatch([briefingReq]);
        briefingText = processBriefingResult(findResult(briefingResults, briefingReq.customId));
        if (briefingText) {
          console.log(`  [Briefing] Generated daily political briefing`);
        }
      } catch (err) {
        if (err instanceof AIProviderLimitError) {
          console.warn(`  [Briefing] Skipped — ${err.message}`);
        } else {
          console.warn(`  [Briefing] Failed, continuing without briefing:`, (err as Error).message);
        }
        // briefingText stays null — parties proceed without the context document
      }
    }

    // Build agent contexts for all parties
    const agentContexts: AgentContext[] = [];
    for (const party of allParties) {
      const fraktion = fraktionByParty.get(party.id);

      agentContexts.push({
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
        briefing: briefingText ?? undefined,
        recentOwnActions: getPartyRecentActions(party.id, currentDay, depthConfig),
        realWorldContext: realWorldCtx ?? undefined,
        realPartyPositions: depthConfig.enableKnowledgeGrounding ? (getPartyPositions(party.id) ?? undefined) : undefined,
        eraSummaries: hasEraSummaries ? eraSummaryList : undefined,
      });
    }

    // Submit all 6 party agent calls as one batch (50% cost savings)
    const agentRequests = buildPartyAgentRequests(agentContexts, currentDay, depthConfig);
    console.log(`  [Batch] Submitting ${agentRequests.length} party agent requests...`);
    let agentResults: import("../agent/batch-client.js").BatchResult[] = [];
    try {
      agentResults = await submitBatch(agentRequests);
    } catch (err) {
      if (err instanceof AIProviderLimitError) {
        console.error(`[Loop] *** Party agent batch blocked — ${err.message} — all parties abstain this day ***`);
      } else {
        console.error(`[Loop] Party agent batch failed (${(err as Error).message}) — all parties abstain this day`);
      }
      // agentResults stays [] — processPartyAgentResult(undefined, ...) auto-abstains on all bills
    }
    progress.set(50); // Party agents batch complete

    for (const ctx of agentContexts) {
      const result = findResult(agentResults, `agent-${ctx.party.id}-day${currentDay}`);
      const actions = await processPartyAgentResult(result, ctx, thirdReadingBills, secondReadingBills);
      partyActions.set(ctx.party.id, actions);
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
          title: `${party.name} beantragt: "${action.title}"${govBill ? " [Regierungsentwurf]" : ""}`,
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
          title: `${party.name} beantragt Änderung zu "${targetBill.title}"`,
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
            title: `${party.name} stimmt ${voteAction.vote} über "${bill.title}"`,
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
          // Count human + bot seats per party (for proxy calculation)
          // Both human and bot users vote individually, so both types count
          const userSeats = db.select().from(schema.bundestagSeats)
            .where(eq(schema.bundestagSeats.active, true))
            .all()
            .filter(s => s.controller === "human" || s.controller === "bot");
          for (const s of userSeats) {
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
        title: `"${bill.title}" ${result.passed ? "ANGENOMMEN" : "ABGELEHNT"}`,
        description: `Ja: ${result.yesSeats} Sitze, Nein: ${result.noSeats} Sitze, Enthaltung: ${result.abstainSeats} Sitze`,
        data: { billId: bill.id, ...result },
      });

      // Notify users who signaled on this bill
      try {
        const signals = getUserDb().select().from(schema.memberSignals)
          .where(eq(schema.memberSignals.billId, bill.id))
          .all();
        for (const sig of signals) {
          createNotification(
            sig.userId,
            "bill_outcome",
            `Bill ${result.passed ? "passed" : "rejected"}: "${bill.title}"`,
            `You signaled ${sig.signal.toUpperCase()} — the bill was ${result.passed ? "PASSED" : "REJECTED"} (Yes: ${result.yesSeats}, No: ${result.noSeats}).`,
            { billId: bill.id, passed: result.passed, yesSeats: result.yesSeats, noSeats: result.noSeats },
            currentDay,
          );
        }
      } catch {}

      console.log(`  [Vote] "${bill.title}": ${newStatus} (Yes: ${result.yesSeats}, No: ${result.noSeats})`);

      // 9. Apply passed bill impacts (with presidential veto check)
      if (result.passed) {
        const { vetoed, events: vetoEvents } = checkPresidentialVeto(bill, allParties, currentDay);
        for (const ev of vetoEvents) {
          addEvent(dayEvents, ev);
        }
        if (!vetoed) {
          const impact = bill.impact as BillImpact;
          nationalState.economy = applyBillImpact(nationalState.economy, impact);
          nationalState.publicSentiment = updateSentiment(nationalState.publicSentiment, impact);
        }
      }

      // Update proposer approval
      for (const party of allParties) {
        const delta = approvalFromBillOutcome(result.passed, party.id === bill.proposedBy);
        if (delta !== 0) {
          party.approvalRating = clampApproval(party.approvalRating + delta);
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
            title: `${party.name} Wahlkampf: ${action.title}`,
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
          title: `${party.name} reicht ${typeLabel} ein: "${motion.title}"`,
          description: motion.description,
          data: { motionId, motionType: motion.type },
        });

        addEvent(dayEvents, {
          dayNumber: currentDay,
          type: passed ? "motion_passed" : "motion_rejected",
          actor: "system",
          title: `${typeLabel} "${motion.title}" ${passed ? "ANGENOMMEN" : "ABGELEHNT"}`,
          description: `Stimmen: ${votes.filter(v => v.vote === "yes").length} Ja, ${votes.filter(v => v.vote === "no").length} Nein`,
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
          title: `${party.name} reicht ${typeLabel} ein: "${action.title}"`,
          description: `${typeLabel} an ${minister.name} (${action.targetMinistry}): ${action.question}`,
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
            title: `${party.name} stellt Vertrauensfrage: "${action.title}"`,
            description: action.description,
            data: { confidenceVoteId: cvId, type: "vertrauensfrage" },
          });

          addEvent(dayEvents, {
            dayNumber: currentDay,
            type: tally.passed ? "confidence_vote_passed" : "confidence_vote_failed",
            actor: "system",
            title: `Vertrauensfrage "${action.title}" — ${tally.passed ? "BESTANDEN" : "GESCHEITERT"}`,
            description: `Ja: ${tally.yesSeats} Sitze, Nein: ${tally.noSeats} Sitze. ${tally.passed ? "Regierung überlebt." : "Regierung gestürzt — Neuwahl ausgelöst."}`,
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
              title: `Regierung aufgelöst — Vertrauensfrage gescheitert`,
              description: `Die Regierung von Kanzler/in ${govNow.chancellorName} hat das Vertrauen des Bundestags verloren. Neuwahlen werden angesetzt.`,
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
            title: `${party.name} reicht Misstrauensvotum ein: "${action.title}"`,
            description: `${action.description} Vorgeschlagener Kanzler: ${action.proposedChancellor} (${action.proposedChancellorPartyId})`,
            data: { confidenceVoteId: cvId, type: "misstrauensvotum", proposedChancellor: action.proposedChancellor },
          });

          addEvent(dayEvents, {
            dayNumber: currentDay,
            type: tally.passed ? "confidence_vote_passed" : "confidence_vote_failed",
            actor: "system",
            title: `Misstrauensvotum "${action.title}" — ${tally.passed ? "ANGENOMMEN" : "GESCHEITERT"}`,
            description: `Ja: ${tally.yesSeats} Sitze, Nein: ${tally.noSeats} Sitze. ${tally.passed ? `Neuer Kanzler: ${action.proposedChancellor}.` : "Regierung überlebt."}`,
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
              title: `Regierung aufgelöst — Misstrauensvotum angenommen`,
              description: `Die Regierung von Kanzler/in ${govNow.chancellorName} wurde abgewählt. ${action.proposedChancellor} (${action.proposedChancellorPartyId}) übernimmt.`,
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
              title: `Neue Regierung durch Misstrauensvotum gebildet`,
              description: `Koalition: ${coalitionNames}. Kanzler/in: ${newCabinet.chancellorName}.`,
              data: { coalition: newCoalition, opposition: newOpposition, confidenceVoteId: cvId },
            });

            addEvent(dayEvents, {
              dayNumber: currentDay,
              type: "government_cabinet_formed",
              actor: "system",
              title: `Kanzler/in ${newCabinet.chancellorName} bildet Kabinett`,
              description: `Neues Kabinett nach Konstruktivem Misstrauensvotum gebildet. ${newCabinet.ministers.length} Minister ernannt.`,
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
          title: `${party.name} klagt gegen "${targetBill.title}" vor dem Bundesverfassungsgericht`,
          description: action.arguments,
          data: { challengeId, billId: targetBill.id },
        });

        addEvent(dayEvents, {
          dayNumber: currentDay,
          type: "constitutional_court_ruled",
          actor: "system",
          title: `Bundesverfassungsgericht: "${targetBill.title}" — ${struckDown ? "VERFASSUNGSWIDRIG" : "BESTÄTIGT"}`,
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

  progress.set(60); // Actions processed (proposals, votes, motions, confidence votes)

  // 10a2. Process MdB speeches (AI-evaluated: +0.1 / 0 / -0.1)
  try {
    const speechSentimentDelta = await processDaySpeeches(currentDay);
    if (speechSentimentDelta !== 0) {
      nationalState.publicSentiment = Math.max(5, Math.min(75,
        Math.round((nationalState.publicSentiment + speechSentimentDelta) * 10) / 10,
      ));
    }
  } catch (err) {
    console.error("[Loop] Error processing MdB speeches:", err);
  }

  // 10b. Answer pending citizen questions
  await answerPendingQuestions(allParties, currentDay, depthConfig.enrichSecondaryCalls ? (briefingText ?? undefined) : undefined);

  // 10b2. Refresh bot question pool (demand-driven — generates tagged questions for bots to pick from)
  try {
    await maybeGenerateBotQuestionPool(allParties, currentDay);
  } catch (err) {
    console.error("[Loop] Error generating bot question pool:", err);
  }

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
  const interpResult = await answerPendingInterpellations(allParties, govForInterpellations, currentDay, depthConfig.enrichSecondaryCalls ? (briefingText ?? undefined) : undefined);

  for (const answered of interpResult.answered) {
    const filingParty = allParties.find(p => p.id === answered.filedByPartyId);
    if (filingParty && answered.sentimentImpact) {
      filingParty.approvalRating = clampApproval(filingParty.approvalRating + answered.sentimentImpact);
    }

    addEvent(dayEvents, {
      dayNumber: currentDay,
      type: "interpellation_answered",
      actor: answered.targetPartyId,
      title: `${answered.targetMinisterName} antwortet: "${answered.title}"`,
      description: answered.response ?? "Keine Antwort erfasst.",
      data: { interpellationId: answered.id, filedBy: answered.filedByPartyId, targetMinistry: answered.targetMinistry },
    });
  }

  for (const expired of interpResult.expired) {
    const targetParty = allParties.find(p => p.id === expired.targetPartyId);
    if (targetParty && expired.sentimentImpact) {
      targetParty.approvalRating = clampApproval(targetParty.approvalRating + expired.sentimentImpact);
    }

    addEvent(dayEvents, {
      dayNumber: currentDay,
      type: "interpellation_expired",
      actor: "system",
      title: `Unbeantwortet: "${expired.title}" — Blamage für ${targetParty?.name ?? expired.targetPartyId}`,
      description: `Die ${expired.type === "große" ? "Große Anfrage" : "Kleine Anfrage"} von ${expired.filedByPartyId} blieb 14 Tage unbeantwortet.`,
      data: { interpellationId: expired.id, targetPartyId: expired.targetPartyId },
    });
  }

  progress.set(75); // Interpellations + user-driven batches done

  // 11. Apply approval drift to all parties + sentiment drift + inactivity tracking
  // Only track inactivity when party agents actually ran (skip on election/negotiation days)
  applyDailyApprovalDrift(allParties, skipPartyAgents ? undefined : partyActions);
  nationalState.publicSentiment = applySentimentDrift(nationalState.publicSentiment);

  // 11b. Resolve expired polls and referendums (daily)
  resolveExpiredPolls(currentDay, allParties, nationalState.publicSentiment);
  resolveExpiredReferendums(currentDay, dayEvents);

  // 11c. Weekly opinion recalculation + batch polls + referendums
  {
    const midCycleRequests: BatchRequest[] = [];
    const isWeekly = isPollDay(currentDay, startDate);
    const recentBillTitles = allBills
      .filter(b => b.proposedOnDay >= currentDay - 7)
      .map(b => b.title);

    if (isWeekly) {
      weeklyOpinionRecalc(allParties, allBills, nationalState.publicSentiment, currentDay);

      // Create party preference poll (deterministic, no AI)
      const db = getDb();
      const prefPollId = `poll-pref-${generateId()}`;
      db.insert(schema.polls).values({
        id: prefPollId,
        question: "Welcher Partei vertrauen Sie am meisten, Deutschland zu führen?",
        options: allParties.map(p => p.name) as any,
        votes: Object.fromEntries(allParties.map(p => [p.name, 0])) as any,
        createdOnDay: currentDay,
        expiresOnDay: currentDay + 14,
        active: true,
        category: "party_preference",
      }).run();
      console.log(`  [Polls] Created party preference poll`);

      // Build context poll batch request (AI)
      const pollReq = buildContextPollBatchRequest(allParties, activeCrises, recentBillTitles, currentDay);
      if (pollReq) midCycleRequests.push(pollReq);
    }

    // Build referendum batch request (AI, every 30 days)
    const recentBillsForRef = allBills
      .filter(b => b.proposedOnDay >= currentDay - TIME_CONFIG.ECONOMY_INTERVAL)
      .map(b => b.title);
    const refReq = buildReferendumBatchRequest(currentDay, allParties, activeCrises, recentBillsForRef);
    if (refReq) midCycleRequests.push(refReq);

    // Submit batched poll + referendum requests
    if (midCycleRequests.length > 0) {
      console.log(`  [Batch] Submitting ${midCycleRequests.length} mid-cycle requests (polls+referendums)...`);
      let midCycleResults: import("../agent/batch-client.js").BatchResult[] = [];
      try {
        midCycleResults = await submitBatch(midCycleRequests);
      } catch (err) {
        if (err instanceof AIProviderLimitError) {
          console.warn(`  [Mid-cycle] Skipped polls/referendums — ${err.message}`);
        } else {
          console.warn(`  [Mid-cycle] Batch failed, skipping polls/referendums:`, (err as Error).message);
        }
      }

      // Process context poll result
      if (isWeekly) {
        const pollResult = findResult(midCycleResults, `poll-ctx-day${currentDay}`);
        const ctxPoll = processContextPollBatchResult(pollResult, currentDay);
        if (ctxPoll) {
          const db = getDb();
          db.insert(schema.polls).values({
            id: ctxPoll.id,
            question: ctxPoll.question,
            options: ctxPoll.options as any,
            votes: ctxPoll.votes as any,
            createdOnDay: ctxPoll.createdOnDay,
            expiresOnDay: ctxPoll.expiresOnDay,
            active: ctxPoll.active,
            category: ctxPoll.category,
          }).run();
          console.log(`  [Polls] Created context poll: "${ctxPoll.question}"`);
        }
      }

      // Process referendum result
      if (refReq) {
        processReferendumBatchResult(findResult(midCycleResults, refReq.customId), currentDay);
      }
    }

    if (isWeekly) {
      addEvent(dayEvents, {
        dayNumber: currentDay,
        type: "weekly_report",
        actor: "system",
        title: `Wochenbericht — Tag ${currentDay}`,
        description: `Wöchentliche Meinungsberechnung abgeschlossen. Stimmung: ${nationalState.publicSentiment}/100. Aktive Krisen: ${activeCrises.length}.`,
      });
      console.log(`  [Cycle] Weekly report — Day ${currentDay}`);
    }
  }

  // 11c. Monthly economic report
  if (monthly) {
    const report = monthlyEconomicReport(nationalState.economy, currentDay);

    addEvent(dayEvents, {
      dayNumber: currentDay,
      type: "monthly_report",
      actor: "system",
      title: `Monatlicher Wirtschaftsbericht — Tag ${currentDay}`,
      description: report,
    });

    console.log(`  [Cycle] Monthly report — Day ${currentDay}`);
  }

  // 11d. Budget cycle (annual, or user-injected)
  if (isBudgetDay(currentDay, startDate) || injections.triggerBudget) {
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
      // First rejection: provisional budget + schedule retry (snap to workday)
      nationalState.provisionalBudget = true;
      let retryDay = currentDay + 7;
      if (startDate) retryDay = snapToNextWorkday(retryDay, startDate);
      db.update(schema.simulationMeta)
        .set({ budgetRetryDay: retryDay } as any)
        .where(eq(schema.simulationMeta.id, meta.id)).run();

      // Asymmetric penalties: leader −0.5, junior partners −1.0, opposition +0.3
      const sortedCoalition = [...coalitionParties].sort((a, b) => b.seatCount - a.seatCount);
      for (let i = 0; i < sortedCoalition.length; i++) {
        const penalty = i === 0 ? -0.5 : -1.0;
        sortedCoalition[i].approvalRating = clampApproval(sortedCoalition[i].approvalRating + penalty);
      }
      const oppositionParties = allParties.filter(p => !nationalState.coalitionParties.includes(p.id));
      for (const p of oppositionParties) {
        p.approvalRating = clampApproval(p.approvalRating + 0.3);
      }

      addEvent(dayEvents, {
        dayNumber: currentDay, type: "provisional_budget_started", actor: "system",
        title: `Haushaltszyklus ${cycleNumber} ABGELEHNT — Vorläufiger Haushalt aktiviert`,
        description: `Parlament hat den Haushalt abgelehnt (Ja: ${yesSeats}, Nein: ${noSeats}). Vorläufige Haushaltsführung gemäß Art. 111 GG. Erneute Abstimmung geplant für Tag ${retryDay}.`,
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
      title: `Haushaltszyklus ${cycleNumber} ${budgetPassed ? "ANGENOMMEN" : "ABGELEHNT"}`,
      description: `${budgetPassed ? "Vom Parlament angenommen" : "Vom Parlament abgelehnt"}. Ja: ${yesSeats} Sitze, Nein: ${noSeats} Sitze.`,
      data: { budgetId, cycleNumber, yesSeats, noSeats },
    });

    try { createNotificationForAll("budget_outcome", `Haushalt ${budgetPassed ? "angenommen" : "abgelehnt"}`, `Haushaltszyklus ${cycleNumber}: ${budgetPassed ? "Angenommen" : "Abgelehnt"} (${yesSeats} gegen ${noSeats}).`, { budgetPassed, cycleNumber }, currentDay); } catch {}

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
        p.approvalRating = clampApproval(p.approvalRating - 1.5);
      }

      addEvent(dayEvents, {
        dayNumber: currentDay, type: "budget_revision_rejected", actor: "system",
        title: `Überarbeiteter Haushaltszyklus ${cycleNumber} ABGELEHNT — Koalitionskrise`,
        description: `Überarbeiteter Haushalt gescheitert: ${yesSeats} Ja gegen ${noSeats} Nein. Regierung aufgelöst, Neuwahl ausgelöst.`,
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
          title: "Regierung aufgelöst — Haushaltskrise",
          description: "Koalition konnte keinen überarbeiteten Haushalt verabschieden. Neuwahl ausgelöst.",
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
      title: `Überarbeiteter Haushaltszyklus ${cycleNumber} ${budgetPassed ? "ANGENOMMEN" : "ABGELEHNT"}`,
      description: `Nachtragsabstimmung: Ja: ${yesSeats}, Nein: ${noSeats}.`,
      data: { budgetId, cycleNumber, yesSeats, noSeats, revisionAttempt: 1 },
    });

    console.log(`  [Budget] Revision ${cycleNumber}: ${budgetPassed ? "PASSED" : "REJECTED"} (${yesSeats} vs ${noSeats})`);
  }

  // Zero-sum normalization: redistribute 80% of net approval gain/loss
  // so that approval doesn't trend upward for all parties simultaneously
  normalizeApprovalChanges(allParties, startingApprovals);

  // Save party approval ratings + inactivity tracking
  for (const party of allParties) {
    db.update(schema.parties)
      .set({ approvalRating: party.approvalRating, inactiveDays: party.inactiveDays ?? 0 })
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

  // 11e. Sidejob generation (every ~30 days)
  if (shouldGenerateSidejobs(currentDay)) {
    const aiSeats = db.select().from(schema.bundestagSeats)
      .where(and(eq(schema.bundestagSeats.active, true), eq(schema.bundestagSeats.controller, "ai")))
      .all();
    if (aiSeats.length > 0) {
      const { request: sjReq, candidates: sjCandidates } = buildSidejobBatchRequest(currentDay, allParties, aiSeats);
      try {
        const sjResults = await submitBatch([sjReq]);
        const sjEvents = processSidejobResult(findResult(sjResults, sjReq.customId), sjCandidates, currentDay);
        applySidejobScandalImpact(sjEvents, allParties);
        dayEvents.push(...sjEvents);
      } catch (err) {
        if (err instanceof AIProviderLimitError) {
          console.warn(`  [Sidejobs] Skipped — ${err.message}`);
        } else {
          console.warn(`  [Sidejobs] Batch failed:`, (err as Error).message);
        }
      }
      heartbeat();
    }
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

  // 12b+12d. Batch media + summary together (2 calls → 1 batch)
  const endOfDayRequests: BatchRequest[] = [];
  const mediaReq = buildMediaBatchRequest(dayEvents, allParties, currentDay, depthConfig.enrichSecondaryCalls ? (briefingText ?? undefined) : undefined);
  if (mediaReq) endOfDayRequests.push(mediaReq);
  const summaryReq = buildSummaryBatchRequest(
    dayEvents, allParties, currentDay,
    nationalState.publicSentiment, nationalState.coalitionParties,
  );
  endOfDayRequests.push(summaryReq);

  progress.set(80); // Starting media + summary batch

  console.log(`  [Batch] Submitting ${endOfDayRequests.length} end-of-day requests (media+summary)...`);
  let endOfDayResults: import("../agent/batch-client.js").BatchResult[] = [];
  try {
    endOfDayResults = await submitBatch(endOfDayRequests);
  } catch (err) {
    if (err instanceof AIProviderLimitError) {
      console.warn(`  [End-of-day] Skipped media+summary — ${err.message}`);
    } else {
      console.warn(`  [End-of-day] Batch failed, skipping media+summary:`, (err as Error).message);
    }
    // endOfDayResults stays [] — media and summary steps are silently skipped
  }
  progress.set(95); // Media + summary complete

  // Process media results
  let mediaArticles: Array<{ category: string; sentiment?: number }> = [];
  if (mediaReq) {
    mediaArticles = processMediaBatchResult(findResult(endOfDayResults, mediaReq.customId), currentDay);
  }

  // 12c. Apply media sentiment influence (use AI-provided sentiment when available)
  if (mediaArticles.length > 0) {
    nationalState.publicSentiment = applyMediaSentimentFromArticles(mediaArticles, currentDay, nationalState.publicSentiment, state.id);
  } else {
    nationalState.publicSentiment = applyMediaSentiment(currentDay, nationalState.publicSentiment, state.id);
  }

  // Process summary results
  const summaryResult = processSummaryBatchResult(findResult(endOfDayResults, summaryReq.customId));
  const dailySummaryStr = summaryResult ? JSON.stringify(summaryResult) : null;
  if (dailySummaryStr) {
    console.log(`  [Summary] Generated daily narrative`);
  }

  // Persist narrative + mood into day_summaries table (preview already saved at day start)
  if (summaryResult) {
    getSqlite().prepare(
      `UPDATE day_summaries SET narrative = ?, mood = ? WHERE day_number = ?`
    ).run(summaryResult.narrative, summaryResult.mood, currentDay);
  }

  // 13. Check that the day produced meaningful content (not just system events)
  const SYSTEM_ONLY_TYPES = new Set(["day_start", "economy_update", "crisis_start", "crisis_end", "crisis_active"]);
  const meaningfulEvents = dayEvents.filter(e => !SYSTEM_ONLY_TYPES.has(e.type));
  if (meaningfulEvents.length === 0 && !skipPartyAgents) {
    console.warn(`  [WARNING] Day ${currentDay} produced 0 meaningful events — AI calls may have failed silently`);
  }

  // 14. Save all day events (skip day_start — already flushed early for frontend visibility)
  const endNow = new Date().toISOString();
  let skippedFirst = false;
  for (const ev of dayEvents) {
    if (!skippedFirst && ev === dayStartEvent) {
      skippedFirst = true;
      continue;
    }
    db.insert(schema.simulationEvents).values({
      id: generateId(),
      ...ev,
      data: ev.data as any ?? null,
      createdAt: endNow,
    }).run();
  }

  // 15. Update simulation meta — currentDay is committed HERE (not at the start)
  // so that failed days don't advance the counter
  db.update(schema.simulationMeta)
    .set({
      currentDay,
      lastRunAt: new Date().toISOString(),
      lowSentimentStreak,
      dailySummary: dailySummaryStr,
      dayProgress: 100,
    } as any)
    .where(eq(schema.simulationMeta.id, meta.id))
    .run();
  progress.complete();

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
