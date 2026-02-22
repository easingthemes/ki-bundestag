import "dotenv/config";
import { randomUUID } from "crypto";
import express from "express";
import cors from "cors";
import { getDb, getUserDb, schema, closeDb, getCrisisTemplates, getActiveFraktionen, getActiveGovernment, getNotifications, getUnreadCount, markNotificationRead, markAllNotificationsRead, getQueuedEvents, isFeatureEnabled, isParticipatoryPreset, FEATURE_AVAILABILITY, getActiveSeats, getUserSeat, getOpenSeatCounts, deactivateUserSeat, getSqlite, getUserSqlite, dayToDate, isRealisticSessionDay, getHolidaysInRange, isPollDay, isMonthlyDay, isBudgetDay, snapToNextSunday } from "@ki-bundestag/engine";
import type { TimingPreset } from "@ki-bundestag/engine";
import { eq, desc, gte, asc, and, inArray, count, sql } from "drizzle-orm";
import type {
  Party,
  Bill,
  BillVote,
  Budget,
  BudgetAllocations,
  BudgetVote,
  ConfidenceVote,
  ConstitutionalChallenge,
  Crisis,
  Election,
  ElectionResult,
  NationalState,
  SimulationEvent,
  BillImpact,
  PolicyPriorities,
  NegotiationRound,
  CoalitionAgreement,
  Poll,
  PartyHistoryEntry,
  MediaArticle,
  CitizenQuestion,
  Referendum,
  Fraktion,
  Motion,
  Government,
  Minister,
  Interpellation,
} from "@ki-bundestag/types";

const app = express();
const PORT = parseInt(process.env.API_PORT || "3001", 10);

app.use(cors());
app.use(express.json());

// ── Preset cache (10s TTL) ───────────────────────────────────────────────────
let cachedPreset: { value: TimingPreset; expiresAt: number } | null = null;

function getTimingPreset(): TimingPreset {
  const now = Date.now();
  if (cachedPreset && now < cachedPreset.expiresAt) return cachedPreset.value;
  const db = getDb();
  const meta = db.select().from(schema.simulationMeta).limit(1).all()[0];
  const preset = ((meta as any)?.timingPreset ?? "normal") as TimingPreset;
  cachedPreset = { value: preset, expiresAt: now + 10_000 };
  return preset;
}

/**
 * Guard for participatory endpoints. Returns true (and sends 403) if blocked.
 */
function requireParticipatory(_req: express.Request, res: express.Response, feature?: string): boolean {
  const preset = getTimingPreset();
  if (!isParticipatoryPreset(preset)) {
    res.status(403).json({
      error: "Watch-only mode",
      preset,
      message: `Simulation is in ${preset} mode. Switch to Normal or Slow to interact.`,
    });
    return true;
  }
  if (feature && !isFeatureEnabled(preset, feature)) {
    res.status(403).json({
      error: "Feature not available",
      preset,
      feature,
      message: `"${feature}" is not enabled in ${preset} mode.`,
    });
    return true;
  }
  return false;
}

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// GET /api/parties
app.get("/api/parties", (_req, res) => {
  const db = getDb();
  const rows = db.select().from(schema.parties).all();

  // Fetch recent approval history (last 14 days) for all parties in one query
  const metaRow = db.select({ day: schema.simulationMeta.currentDay }).from(schema.simulationMeta).limit(1).all()[0];
  const minDay = Math.max(0, (metaRow?.day ?? 0) - 13);
  const histRows = db.select().from(schema.partyHistory)
    .where(gte(schema.partyHistory.dayNumber, minDay))
    .orderBy(asc(schema.partyHistory.dayNumber))
    .all();
  const histByParty = new Map<string, number[]>();
  for (const row of histRows) {
    if (!histByParty.has(row.partyId)) histByParty.set(row.partyId, []);
    histByParty.get(row.partyId)!.push(Number(row.approvalRating));
  }

  const memberCounts = getMemberCounts();
  const parties = rows.map(r => ({ ...mapParty(r, memberCounts.get(r.id) ?? 0), recentApprovals: histByParty.get(r.id) ?? [] }));
  res.json(parties);
});

// GET /api/parties/alignment
app.get("/api/parties/alignment", (_req, res) => {
  const db = getDb();
  const allParties = db.select().from(schema.parties).all();
  const allBills = db.select().from(schema.bills).all();

  const partyIds = allParties.map(p => p.id as string);
  const matrix: Record<string, Record<string, number | null>> = {};

  for (const a of partyIds) {
    matrix[a] = {};
    for (const b of partyIds) {
      if (a === b) { matrix[a][b] = 100; continue; }
      let shared = 0, agreed = 0;
      for (const bill of allBills) {
        const votes = (bill.votes as any) as Array<{ partyId: string; vote: string }>;
        if (!Array.isArray(votes)) continue;
        const vA = votes.find(v => v.partyId === a);
        const vB = votes.find(v => v.partyId === b);
        if (!vA || !vB) continue;
        shared++;
        if (vA.vote === vB.vote) agreed++;
      }
      matrix[a][b] = shared >= 3 ? Math.round((agreed / shared) * 100) : null;
    }
  }

  res.json({
    parties: allParties.map(p => ({ id: p.id, name: p.name, color: p.color })),
    matrix,
  });
});

// GET /api/parties/:id
app.get("/api/parties/:id", (req, res) => {
  const db = getDb();
  const rows = db.select().from(schema.parties).where(eq(schema.parties.id, req.params.id)).all();
  if (rows.length === 0) {
    res.status(404).json({ error: "Party not found" });
    return;
  }
  const memberCounts = getMemberCounts();
  res.json(mapParty(rows[0], memberCounts.get(req.params.id) ?? 0));
});

// GET /api/parties/:id/history
app.get("/api/parties/:id/history", (req, res) => {
  const db = getDb();
  const rows = db.select().from(schema.partyHistory)
    .where(eq(schema.partyHistory.partyId, req.params.id))
    .all();
  const history: PartyHistoryEntry[] = rows.map(r => ({
    id: r.id,
    partyId: r.partyId,
    dayNumber: r.dayNumber,
    approvalRating: r.approvalRating,
    seatCount: r.seatCount,
  }));
  history.sort((a, b) => a.dayNumber - b.dayNumber);
  res.json(history);
});

// GET /api/parties/:id/bills
app.get("/api/parties/:id/bills", (req, res) => {
  const db = getDb();
  const rows = db.select().from(schema.bills)
    .where(eq(schema.bills.proposedBy, req.params.id))
    .all();
  res.json(rows.map(mapBill));
});

// GET /api/parties/:id/votes
app.get("/api/parties/:id/votes", (req, res) => {
  const db = getDb();
  const partyId = req.params.id;
  const allBills = db.select().from(schema.bills).all();
  const result: Array<{ bill: Bill; vote: BillVote }> = [];

  for (const row of allBills) {
    const bill = mapBill(row);
    const vote = bill.votes.find(v => v.partyId === partyId);
    if (vote) {
      result.push({ bill, vote });
    }
  }

  result.sort((a, b) => b.bill.proposedOnDay - a.bill.proposedOnDay);
  res.json(result);
});

// GET /api/parties/:id/statements
app.get("/api/parties/:id/statements", (req, res) => {
  const db = getDb();
  const partyId = req.params.id;
  const allEvents = db.select().from(schema.simulationEvents).all() as unknown as SimulationEvent[];
  const statements = allEvents.filter(
    e => e.actor === partyId && (e.type === "statement" || e.type === "election_campaign"),
  );
  statements.sort((a, b) => b.dayNumber - a.dayNumber);
  res.json(statements);
});

// GET /api/bills
app.get("/api/bills", (req, res) => {
  const db = getDb();
  const allRows = db.select().from(schema.bills).all();
  const status = req.query.status as string | undefined;
  const rows = status ? allRows.filter((b: { status: string }) => b.status === status) : allRows;
  const bills: Bill[] = rows.map(mapBill);
  res.json(bills);
});

// GET /api/bills/:id
app.get("/api/bills/:id", (req, res) => {
  const db = getDb();
  const rows = db.select().from(schema.bills).where(eq(schema.bills.id, req.params.id)).all();
  if (rows.length === 0) {
    res.status(404).json({ error: "Bill not found" });
    return;
  }
  res.json(mapBill(rows[0]));
});

// GET /api/bills/:id/signal
app.get("/api/bills/:id/signal", (req, res) => {
  const userDb = getUserDb();
  const token = getUserToken(req);
  const signals = userDb.select().from(schema.memberSignals).where(eq(schema.memberSignals.billId, req.params.id)).all();
  const yes = signals.filter(s => s.signal === "yes").length;
  const no = signals.filter(s => s.signal === "no").length;
  const userSignal = token ? (signals.find(s => s.userId === token)?.signal ?? null) : null;
  res.json({ yes, no, userSignal });
});

// POST /api/bills/:id/signal (auth)
app.post("/api/bills/:id/signal", (req, res) => {
  if (requireParticipatory(req, res, "bill_signals")) return;
  const token = getUserToken(req);
  if (!token) { res.status(401).json({ error: "Not authenticated" }); return; }
  const userDb = getUserDb();
  const users = userDb.select().from(schema.users).where(eq(schema.users.id, token)).all();
  if (users.length === 0) { res.status(401).json({ error: "User not found" }); return; }
  const db = getDb();
  const bill = db.select().from(schema.bills).where(eq(schema.bills.id, req.params.id)).all()[0];
  if (!bill) { res.status(404).json({ error: "Bill not found" }); return; }
  if (!["second_reading", "third_reading"].includes(bill.status)) {
    res.status(400).json({ error: "Bill is not in second or third reading" }); return;
  }

  const { signal } = req.body as { signal?: string };
  if (signal !== "yes" && signal !== "no") { res.status(400).json({ error: "signal must be 'yes' or 'no'" }); return; }

  const existing = userDb.select().from(schema.memberSignals)
    .where(and(eq(schema.memberSignals.billId, req.params.id), eq(schema.memberSignals.userId, token)))
    .all();

  if (existing.length > 0) {
    userDb.update(schema.memberSignals).set({ signal, createdAt: Date.now() }).where(eq(schema.memberSignals.id, existing[0].id)).run();
  } else {
    userDb.insert(schema.memberSignals).values({ id: `sig-${randomUUID().slice(0, 8)}`, billId: req.params.id, userId: token, signal, createdAt: Date.now() }).run();
  }

  userDb.update(schema.users).set({ lastActive: Date.now() }).where(eq(schema.users.id, token)).run();
  const allSignals = userDb.select().from(schema.memberSignals).where(eq(schema.memberSignals.billId, req.params.id)).all();
  res.json({ yes: allSignals.filter(s => s.signal === "yes").length, no: allSignals.filter(s => s.signal === "no").length, userSignal: signal });
});

// GET /api/state
app.get("/api/state", (_req, res) => {
  const db = getDb();
  const rows = db.select().from(schema.nationalState).all();
  if (rows.length === 0) {
    res.status(404).json({ error: "No state found" });
    return;
  }
  const s = rows[0];
  const state: NationalState = {
    coalitionParties: s.coalitionParties as unknown as string[],
    oppositionParties: s.oppositionParties as unknown as string[],
    economy: {
      budget: s.budget,
      unemployment: s.unemployment,
      inflation: s.inflation,
      gdpGrowth: s.gdpGrowth,
    },
    publicSentiment: s.publicSentiment,
    provisionalBudget: (s as any).provisionalBudget ?? false,
  };

  // compute coalition cohesion: % of third-reading votes in last 14 days where
  // ALL coalition partners voted the same way
  const metaForCohesion = db.select().from(schema.simulationMeta).all();
  const currentDayForCohesion = metaForCohesion[0]?.currentDay ?? 0;
  const recentBills = db.select().from(schema.bills)
    .where(
      and(
        inArray(schema.bills.status, ["passed", "rejected", "struck_down"]),
        gte(schema.bills.statusChangedOnDay, currentDayForCohesion - 14),
      )
    ).all();

  const coalitionIds: string[] = s.coalitionParties as unknown as string[];
  let cohesionNumerator = 0;
  let cohesionDenominator = 0;

  for (const bill of recentBills) {
    const votes: Array<{ partyId: string; vote: string }> = (bill.votes as any) ?? [];
    const coalitionVotes = votes.filter(v => coalitionIds.includes(v.partyId));
    if (coalitionVotes.length < 2) continue;
    const voteValues = new Set(coalitionVotes.map(v => v.vote));
    cohesionDenominator++;
    if (voteValues.size === 1) cohesionNumerator++;
  }

  const coalitionCohesion = cohesionDenominator >= 3
    ? Math.round((cohesionNumerator / cohesionDenominator) * 100)
    : null;

  state.coalitionCohesion = coalitionCohesion;

  res.json(state);
});

// GET /api/simulation/status
app.get("/api/simulation/status", (_req, res) => {
  const db = getDb();
  const metaRows = db.select().from(schema.simulationMeta).all();
  if (metaRows.length === 0) {
    res.json({ currentDay: 0, lastRunAt: null, budgetRetryDay: null, provisionalBudget: false });
    return;
  }
  const meta = metaRows[0];
  const stateRows = db.select().from(schema.nationalState).all();
  const stateRow = stateRows[0];
  res.json({
    currentDay: meta.currentDay,
    lastRunAt: meta.lastRunAt,
    dayStartedAt: (meta as any).dayStartedAt ?? null,
    nextElectionDay: meta.nextElectionDay,
    budgetRetryDay: (meta as any).budgetRetryDay ?? null,
    provisionalBudget: (stateRow as any)?.provisionalBudget ?? false,
    dailySummary: (meta as any).dailySummary ?? null,
    timingPreset: (meta as any).timingPreset ?? "normal",
    startDate: (meta as any).startDate ?? null,
  });
});

// GET /api/simulation/preset
app.get("/api/simulation/preset", (_req, res) => {
  const preset = getTimingPreset();
  const participatory = isParticipatoryPreset(preset);
  const features = FEATURE_AVAILABILITY[preset] ?? {};
  const labels: Record<TimingPreset, string> = { "ultra-fast": "Ultra-Fast", fast: "Fast", normal: "Normal", slow: "Slow" };
  res.json({ preset, participatory, features, label: labels[preset] });
});

// POST /api/simulation/preset (admin: change preset)
app.post("/api/simulation/preset", (req, res) => {
  const { preset } = req.body as { preset?: string };
  const valid: TimingPreset[] = ["ultra-fast", "fast", "normal", "slow"];
  if (!preset || !valid.includes(preset as TimingPreset)) {
    res.status(400).json({ error: "Invalid preset. Must be one of: ultra-fast, fast, normal, slow" });
    return;
  }
  const db = getDb();
  db.update(schema.simulationMeta).set({ timingPreset: preset }).run();
  cachedPreset = null; // invalidate cache
  res.json({ success: true, preset });
});

// GET /api/simulation/days
app.get("/api/simulation/days", (_req, res) => {
  const db = getDb();
  const rows = db.select().from(schema.simulationEvents).all();

  // Group by day
  const dayMap = new Map<number, { dayNumber: number; eventCount: number; summary: string; simulatedAt: string | null }>();
  for (const row of rows) {
    if (!dayMap.has(row.dayNumber)) {
      dayMap.set(row.dayNumber, { dayNumber: row.dayNumber, eventCount: 0, summary: "", simulatedAt: row.createdAt ?? null });
    }
    const day = dayMap.get(row.dayNumber)!;
    day.eventCount++;
    if (row.type === "bill_passed" || row.type === "bill_rejected") {
      day.summary += (day.summary ? "; " : "") + row.title;
    }
    // Use earliest timestamp for the day
    if (row.createdAt && (!day.simulatedAt || row.createdAt < day.simulatedAt)) {
      day.simulatedAt = row.createdAt;
    }
  }

  const days = Array.from(dayMap.values()).sort((a, b) => a.dayNumber - b.dayNumber);
  res.json(days);
});

// GET /api/simulation/days/:dayNumber
app.get("/api/simulation/days/:dayNumber", (req, res) => {
  const db = getDb();
  const dayNumber = parseInt(req.params.dayNumber, 10);
  const events = db.select().from(schema.simulationEvents).all() as unknown as SimulationEvent[];
  const dayEvents = events.filter(e => e.dayNumber === dayNumber);
  res.json(dayEvents);
});

// GET /api/calendar — events grouped by day with real calendar dates
app.get("/api/calendar", (req, res) => {
  const db = getDb();
  const metaRows = db.select().from(schema.simulationMeta).all();
  const meta = metaRows[0];
  const currentDay = meta?.currentDay ?? 0;
  const startDateStr = (meta as any)?.startDate as string | null;
  const startDate = startDateStr ? new Date(startDateStr) : new Date();

  // Event importance tiers (lower = more important)
  const EVENT_TIER: Record<string, number> = {
    election_result: 1, government_formed: 1, government_dissolved: 1,
    crisis_start: 1, constitutional_court_ruled: 1, vertrauensfrage: 1, misstrauensvotum: 1,
    bill_proposed: 2, bill_third_reading: 2, presidential_veto: 2,
    budget_proposed: 2, interpellation_filed: 2, election_announced: 2,
    motion_submitted: 3, statement: 3, amendment_proposed: 3,
    fraktion_formed: 3, fraktion_dissolved: 3, member_proposal_accepted: 3,
    crisis_end: 3, negotiation_complete: 3, government_cabinet_formed: 3,
  };
  // Tier 4 (routine) events not listed above get tier 99

  const allEvents = db.select().from(schema.simulationEvents).all() as unknown as SimulationEvent[];

  // Optional month filter: ?month=YYYY-MM
  const monthFilter = req.query.month as string | undefined;
  let minDay = 0;
  let maxDay = currentDay;
  if (monthFilter && /^\d{4}-\d{2}$/.test(monthFilter)) {
    const [year, month] = monthFilter.split("-").map(Number);
    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 0); // last day of month
    minDay = Math.max(0, Math.floor((monthStart.getTime() - startDate.getTime()) / 86400000));
    maxDay = Math.floor((monthEnd.getTime() - startDate.getTime()) / 86400000);
  }

  // Group events by day
  const dayMap = new Map<number, SimulationEvent[]>();
  for (const evt of allEvents) {
    if (evt.dayNumber < minDay || evt.dayNumber > maxDay) continue;
    if (!dayMap.has(evt.dayNumber)) dayMap.set(evt.dayNumber, []);
    dayMap.get(evt.dayNumber)!.push(evt);
  }

  // Build response: top 3 important events per day + count
  const days = Array.from(dayMap.entries()).map(([dayNumber, evts]) => {
    const dateObj = new Date(startDate.getTime() + dayNumber * 86400000);
    const date = dateObj.toISOString().split("T")[0];

    // Sort by importance tier, then by creation order
    const sorted = evts
      .filter(e => (EVENT_TIER[e.type] ?? 99) < 99) // exclude routine
      .sort((a, b) => (EVENT_TIER[a.type] ?? 99) - (EVENT_TIER[b.type] ?? 99));

    const topEvents = sorted.slice(0, 3).map(e => ({
      id: e.id, type: e.type, title: e.title, actor: e.actor,
    }));

    return { dayNumber, date, topEvents, totalCount: sorted.length };
  }).filter(d => d.totalCount > 0).sort((a, b) => a.dayNumber - b.dayNumber);

  res.json({
    startDate: startDate.toISOString(),
    currentDay,
    days,
  });
});

// GET /api/calendar/upcoming — future scheduled events computed from cycle math + DB state
app.get("/api/calendar/upcoming", (_req, res) => {
  const db = getDb();
  const metaRows = db.select().from(schema.simulationMeta).all();
  const meta = metaRows[0];
  const currentDay = meta?.currentDay ?? 0;
  const startDateStr = (meta as any)?.startDate as string | null;
  const startDate = startDateStr ? new Date(startDateStr) : new Date();
  const calendarAware = !!startDateStr;
  const nextElectionDay = (meta as any)?.nextElectionDay as number | null;
  const budgetRetryDay = (meta as any)?.budgetRetryDay as number | null;

  interface UpcomingEvent {
    dayNumber: number;
    date: string;
    category: string;
    label: string;
    detail?: string;
    link?: string;
  }

  const events: UpcomingEvent[] = [];
  const fmtDate = (d: number) => dayToDate(d, startDate).toISOString().split("T")[0];

  // Election timeline events (always show, even beyond 90d)
  if (nextElectionDay && nextElectionDay > currentDay) {
    // Snap election day display to Sunday when calendar-aware
    const elDay = calendarAware ? snapToNextSunday(nextElectionDay, startDate) : nextElectionDay;
    const announcementDay = elDay - 21;
    const campaignDay = elDay - 14;
    if (announcementDay > currentDay) {
      events.push({ dayNumber: announcementDay, date: fmtDate(announcementDay), category: "election_announcement", label: "Wahlankündigung", link: "/elections" });
    }
    if (campaignDay > currentDay) {
      events.push({ dayNumber: campaignDay, date: fmtDate(campaignDay), category: "election_campaign", label: "Wahlkampf beginnt", link: "/elections" });
    }
    events.push({ dayNumber: elDay, date: fmtDate(elDay), category: "election_voting", label: "Wahltag", link: "/elections" });
  }

  // Budget retry day
  if (budgetRetryDay && budgetRetryDay > currentDay) {
    events.push({ dayNumber: budgetRetryDay, date: fmtDate(budgetRetryDay), category: "budget_retry", label: "Haushalts-Nachverhandlung", link: "/budget" });
  }

  // Cycle-based events: loop currentDay+1 to currentDay+90
  const horizon = currentDay + 90;
  const cycleStartDate = calendarAware ? startDate : undefined;
  for (let d = currentDay + 1; d <= horizon; d++) {
    if (isBudgetDay(d, cycleStartDate)) {
      events.push({ dayNumber: d, date: fmtDate(d), category: "budget_cycle", label: "Haushaltszyklus", link: "/budget" });
    }
    if (isPollDay(d, cycleStartDate)) {
      events.push({ dayNumber: d, date: fmtDate(d), category: "poll_day", label: "Umfrage", link: "/polls" });
    }
    if (isMonthlyDay(d, cycleStartDate)) {
      events.push({ dayNumber: d, date: fmtDate(d), category: "economy_report", label: "Wirtschaftsbericht" });
    }
    // Session days: realistic (Wed–Fri, no holidays/recess) when calendar-aware
    if (calendarAware) {
      if (isRealisticSessionDay(d, startDate)) {
        events.push({ dayNumber: d, date: fmtDate(d), category: "session_day", label: "Plenarsitzung" });
      }
    } else {
      if (d % 5 === 0) {
        events.push({ dayNumber: d, date: fmtDate(d), category: "session_day", label: "Plenarsitzung" });
      }
    }
  }

  // Public holidays in range (calendar-aware only)
  if (calendarAware) {
    const holidays = getHolidaysInRange(currentDay + 1, horizon, startDate);
    for (const { day, holiday } of holidays) {
      events.push({ dayNumber: day, date: fmtDate(day), category: "public_holiday", label: holiday.nameDE });
    }
  }

  // Active polls with expiry dates
  const activePolls = db.select().from(schema.polls).all() as any[];
  for (const poll of activePolls) {
    if (poll.active && poll.expiresOnDay && poll.expiresOnDay > currentDay) {
      events.push({ dayNumber: poll.expiresOnDay, date: fmtDate(poll.expiresOnDay), category: "poll_expiry", label: "Umfrage endet", detail: poll.question, link: "/polls" });
    }
  }

  // Active referendums with closing dates
  const activeRefs = db.select().from(schema.referendums).all() as any[];
  for (const ref of activeRefs) {
    if (ref.status === "active" && ref.closesOnDay > currentDay) {
      events.push({ dayNumber: ref.closesOnDay, date: fmtDate(ref.closesOnDay), category: "referendum_expiry", label: "Volksentscheid endet", detail: ref.title, link: "/votes" });
    }
  }

  // Pending interpellations with deadlines (dayNumber + 14)
  const pendingInterps = db.select().from(schema.interpellations).all() as any[];
  for (const interp of pendingInterps) {
    if (interp.status === "pending") {
      const deadline = interp.dayNumber + 14;
      if (deadline > currentDay) {
        events.push({ dayNumber: deadline, date: fmtDate(deadline), category: "interpellation_deadline", label: "Anfrage-Frist", detail: interp.title, link: "/interpellations" });
      }
    }
  }

  // Sort by day number
  events.sort((a, b) => a.dayNumber - b.dayNumber);

  res.json({ startDate: startDate.toISOString(), currentDay, events });
});

// GET /api/simulation/events
app.get("/api/simulation/events", (req, res) => {
  const db = getDb();
  const limit = Math.min(parseInt(req.query.limit as string || "50", 10), 200);
  const offset = parseInt(req.query.offset as string || "0", 10);
  let events = db.select().from(schema.simulationEvents).all() as unknown as SimulationEvent[];

  // Filter by type (comma-separated)
  const typeFilter = req.query.type as string | undefined;
  if (typeFilter) {
    const types = typeFilter.split(",").map(t => t.trim());
    events = events.filter(e => types.includes(e.type));
  }

  // Filter by actor
  const actorFilter = req.query.actor as string | undefined;
  if (actorFilter) {
    events = events.filter(e => e.actor === actorFilter);
  }

  // Sort by day descending, then return slice
  events.sort((a, b) => b.dayNumber - a.dayNumber);
  const page = events.slice(offset, offset + limit);
  res.json({ events: page, total: events.length });
});

// GET /api/elections
app.get("/api/elections", (req, res) => {
  const db = getDb();
  const allRows = db.select().from(schema.elections).all();
  const status = req.query.status as string | undefined;
  const rows = status ? allRows.filter((e: any) => e.status === status) : allRows;
  const elections: Election[] = rows.map(mapElection);
  res.json(elections);
});

// GET /api/elections/active
app.get("/api/elections/active", (_req, res) => {
  const db = getDb();
  const allRows = db.select().from(schema.elections).all();
  const active = allRows.find((e: any) => e.status !== "completed" && e.status !== "invalidated");
  res.json(active ? mapElection(active) : null);
});

// GET /api/elections/:id
app.get("/api/elections/:id", (req, res) => {
  const db = getDb();
  const rows = db.select().from(schema.elections).where(eq(schema.elections.id, req.params.id)).all();
  if (rows.length === 0) {
    res.status(404).json({ error: "Election not found" });
    return;
  }
  res.json(mapElection(rows[0]));
});

// GET /api/crises
app.get("/api/crises", (req, res) => {
  const db = getDb();
  const allRows = db.select().from(schema.crises).all();
  const activeOnly = req.query.active === "true";
  const rows = activeOnly ? allRows.filter((c: any) => !c.resolved) : allRows;
  const crises: Crisis[] = rows.map(mapCrisis);
  res.json(crises);
});

// GET /api/crises/:id
app.get("/api/crises/:id", (req, res) => {
  const db = getDb();
  const rows = db.select().from(schema.crises).where(eq(schema.crises.id, req.params.id)).all();
  if (rows.length === 0) {
    res.status(404).json({ error: "Crisis not found" });
    return;
  }
  res.json(mapCrisis(rows[0]));
});

// GET /api/fraktionen
app.get("/api/fraktionen", (req, res) => {
  const db = getDb();
  const allRows = db.select().from(schema.fraktionen).all();
  const statusFilter = req.query.status as string | undefined;
  const rows = statusFilter ? allRows.filter((f: any) => f.status === statusFilter) : allRows;
  const fraktionen: Fraktion[] = rows.map(mapFraktionRow);
  res.json(fraktionen);
});

// GET /api/fraktionen/:id
app.get("/api/fraktionen/:id", (req, res) => {
  const db = getDb();
  const rows = db.select().from(schema.fraktionen).where(eq(schema.fraktionen.id, req.params.id)).all();
  if (rows.length === 0) {
    res.status(404).json({ error: "Fraktion not found" });
    return;
  }
  res.json(mapFraktionRow(rows[0]));
});

// GET /api/motions
app.get("/api/motions", (req, res) => {
  const db = getDb();
  const allRows = db.select().from(schema.motions).all();
  const statusFilter = req.query.status as string | undefined;
  const typeFilter = req.query.type as string | undefined;
  let rows = allRows;
  if (statusFilter) rows = rows.filter((m: any) => m.status === statusFilter);
  if (typeFilter) rows = rows.filter((m: any) => m.type === typeFilter);
  const motions: Motion[] = rows.map(mapMotionRow);
  motions.sort((a, b) => b.dayNumber - a.dayNumber);
  res.json(motions);
});

// GET /api/motions/:id
app.get("/api/motions/:id", (req, res) => {
  const db = getDb();
  const rows = db.select().from(schema.motions).where(eq(schema.motions.id, req.params.id)).all();
  if (rows.length === 0) {
    res.status(404).json({ error: "Motion not found" });
    return;
  }
  res.json(mapMotionRow(rows[0]));
});

// GET /api/interpellations
app.get("/api/interpellations", (req, res) => {
  const db = getDb();
  const allRows = db.select().from(schema.interpellations).all();
  const statusFilter = req.query.status as string | undefined;
  const partyFilter = req.query.partyId as string | undefined;
  const ministryFilter = req.query.targetMinistry as string | undefined;
  let rows = allRows;
  if (statusFilter) rows = rows.filter((i: any) => i.status === statusFilter);
  if (partyFilter) rows = rows.filter((i: any) => i.filedByPartyId === partyFilter);
  if (ministryFilter) rows = rows.filter((i: any) => i.targetMinistry === ministryFilter);
  const interpellations: Interpellation[] = rows.map(mapInterpellationRow);
  interpellations.sort((a, b) => b.dayNumber - a.dayNumber);
  res.json(interpellations);
});

// GET /api/interpellations/:id
app.get("/api/interpellations/:id", (req, res) => {
  const db = getDb();
  const rows = db.select().from(schema.interpellations).where(eq(schema.interpellations.id, req.params.id)).all();
  if (rows.length === 0) {
    res.status(404).json({ error: "Interpellation not found" });
    return;
  }
  res.json(mapInterpellationRow(rows[0]));
});

// GET /api/confidence-votes
app.get("/api/confidence-votes", (req, res) => {
  const db = getDb();
  const allRows = db.select().from(schema.confidenceVotes).all();
  const statusFilter = req.query.status as string | undefined;
  const typeFilter = req.query.type as string | undefined;
  let rows = allRows;
  if (statusFilter) rows = rows.filter((v: any) => v.status === statusFilter);
  if (typeFilter) rows = rows.filter((v: any) => v.type === typeFilter);
  const votes: ConfidenceVote[] = rows.map(mapConfidenceVoteRow);
  votes.sort((a, b) => b.dayNumber - a.dayNumber);
  res.json(votes);
});

// GET /api/confidence-votes/:id
app.get("/api/confidence-votes/:id", (req, res) => {
  const db = getDb();
  const rows = db.select().from(schema.confidenceVotes).where(eq(schema.confidenceVotes.id, req.params.id)).all();
  if (rows.length === 0) {
    res.status(404).json({ error: "Confidence vote not found" });
    return;
  }
  res.json(mapConfidenceVoteRow(rows[0]));
});

// GET /api/polls
app.get("/api/polls", (req, res) => {
  const db = getDb();
  const allRows = db.select().from(schema.polls).all();
  const activeOnly = req.query.active === "true";
  const rows = activeOnly ? allRows.filter((p: any) => p.active) : allRows;
  const polls: Poll[] = rows.map(mapPoll);
  polls.sort((a, b) => b.createdOnDay - a.createdOnDay);
  res.json(polls);
});

// GET /api/polls/:id
app.get("/api/polls/:id", (req, res) => {
  const db = getDb();
  const rows = db.select().from(schema.polls).where(eq(schema.polls.id, req.params.id)).all();
  if (rows.length === 0) {
    res.status(404).json({ error: "Poll not found" });
    return;
  }
  res.json(mapPoll(rows[0]));
});

// POST /api/polls/:id/vote
app.post("/api/polls/:id/vote", (req, res) => {
  if (requireParticipatory(req, res, "vote_polls")) return;
  const db = getDb();
  const rows = db.select().from(schema.polls).where(eq(schema.polls.id, req.params.id)).all();
  if (rows.length === 0) {
    res.status(404).json({ error: "Poll not found" });
    return;
  }

  const poll = mapPoll(rows[0]);
  if (!poll.active) {
    res.status(400).json({ error: "Poll is no longer active" });
    return;
  }

  const { option } = req.body;
  if (!option || !poll.options.includes(option)) {
    res.status(400).json({ error: "Invalid option" });
    return;
  }

  const votes = { ...poll.votes };
  votes[option] = (votes[option] || 0) + 1;

  db.update(schema.polls)
    .set({ votes: votes as any })
    .where(eq(schema.polls.id, poll.id))
    .run();

  res.json({ ...poll, votes });
});

// GET /api/media
app.get("/api/media", (req, res) => {
  const db = getDb();
  const allRows = db.select().from(schema.mediaArticles).all();
  const dayFilter = req.query.day as string | undefined;
  const rows = dayFilter ? allRows.filter((a: any) => a.dayNumber === parseInt(dayFilter, 10)) : allRows;
  const articles: MediaArticle[] = rows.map(mapMediaArticle);
  articles.sort((a, b) => b.dayNumber - a.dayNumber);
  res.json(articles);
});

// GET /api/media/:id
app.get("/api/media/:id", (req, res) => {
  const db = getDb();
  const rows = db.select().from(schema.mediaArticles).where(eq(schema.mediaArticles.id, req.params.id)).all();
  if (rows.length === 0) {
    res.status(404).json({ error: "Article not found" });
    return;
  }
  res.json(mapMediaArticle(rows[0]));
});

// GET /api/questions
app.get("/api/questions", (req, res) => {
  const db = getDb();
  const userDb = getUserDb();
  const allRows = db.select().from(schema.citizenQuestions).all();
  const partyFilter = req.query.partyId as string | undefined;
  const statusFilter = req.query.status as string | undefined;
  let rows = allRows;
  if (partyFilter) rows = rows.filter((q: any) => q.targetPartyId === partyFilter);
  if (statusFilter) rows = rows.filter((q: any) => q.status === statusFilter);

  // Aggregate vote scores from user DB
  const allVotes = userDb.select().from(schema.questionVotes).all();
  const scoreMap: Record<string, { score: number; total: number }> = {};
  for (const v of allVotes) {
    if (!scoreMap[v.questionId]) scoreMap[v.questionId] = { score: 0, total: 0 };
    scoreMap[v.questionId].score += v.vote;
    scoreMap[v.questionId].total += 1;
  }

  // Check user vote if authenticated
  const token = getUserToken(req);
  const userVoteMap: Record<string, 1 | -1> = {};
  if (token) {
    const userVotes = userDb.select().from(schema.questionVotes)
      .where(eq(schema.questionVotes.userId, token)).all();
    for (const v of userVotes) userVoteMap[v.questionId] = v.vote as 1 | -1;
  }

  const questions: CitizenQuestion[] = rows.map(r =>
    mapQuestion(r, scoreMap[r.id]?.score ?? 0, scoreMap[r.id]?.total ?? 0, userVoteMap[r.id] ?? null),
  );
  // Pending: by voteScore desc, then oldest first; Answered: by respondedOnDay desc
  questions.sort((a, b) => {
    if (a.status === "pending" && b.status === "pending") {
      return (b.voteScore - a.voteScore) || (a.createdOnDay - b.createdOnDay);
    }
    if (a.status === "pending") return -1;
    if (b.status === "pending") return 1;
    return (b.respondedOnDay ?? 0) - (a.respondedOnDay ?? 0);
  });
  res.json(questions);
});

// GET /api/questions/:id
app.get("/api/questions/:id", (req, res) => {
  const db = getDb();
  const userDb = getUserDb();
  const rows = db.select().from(schema.citizenQuestions).where(eq(schema.citizenQuestions.id, req.params.id)).all();
  if (rows.length === 0) {
    res.status(404).json({ error: "Question not found" });
    return;
  }
  const votes = userDb.select().from(schema.questionVotes).where(eq(schema.questionVotes.questionId, req.params.id)).all();
  const score = votes.reduce((s, v) => s + v.vote, 0);
  const token = getUserToken(req);
  const uv = token ? votes.find(v => v.userId === token) : undefined;
  res.json(mapQuestion(rows[0], score, votes.length, uv ? (uv.vote as 1 | -1) : null));
});

// POST /api/questions
app.post("/api/questions", (req, res) => {
  if (requireParticipatory(req, res, "ask_questions")) return;
  const db = getDb();
  const { question, targetPartyId } = req.body;

  if (!question || typeof question !== "string" || question.trim().length < 5) {
    res.status(400).json({ error: "Question must be at least 5 characters" });
    return;
  }
  if (!targetPartyId || typeof targetPartyId !== "string") {
    res.status(400).json({ error: "targetPartyId is required" });
    return;
  }

  // Validate party exists
  const partyRows = db.select().from(schema.parties).where(eq(schema.parties.id, targetPartyId)).all();
  if (partyRows.length === 0) {
    res.status(400).json({ error: "Party not found" });
    return;
  }

  // Rate limit: max 5 pending questions total
  const pendingCount = db.select().from(schema.citizenQuestions).all()
    .filter((q: any) => q.status === "pending").length;
  if (pendingCount >= 5) {
    res.status(429).json({ error: "Too many pending questions. Please wait for some to be answered." });
    return;
  }

  // Get current day
  const metaRows = db.select().from(schema.simulationMeta).all();
  const currentDay = metaRows[0]?.currentDay ?? 0;

  const id = `q-${Math.random().toString(36).substring(2, 10)}${Date.now().toString(36)}`;
  db.insert(schema.citizenQuestions).values({
    id,
    question: question.trim().substring(0, 500),
    targetPartyId,
    response: null,
    respondedOnDay: null,
    createdOnDay: currentDay,
    status: "pending",
  }).run();

  const created = db.select().from(schema.citizenQuestions).where(eq(schema.citizenQuestions.id, id)).all()[0];
  res.status(201).json(mapQuestion(created, 0, 0, null));
});

// POST /api/questions/:id/vote (auth)
app.post("/api/questions/:id/vote", (req, res) => {
  if (requireParticipatory(req, res, "upvote_downvote")) return;
  const token = getUserToken(req);
  if (!token) { res.status(401).json({ error: "Not authenticated" }); return; }
  const userDb = getUserDb();
  const users = userDb.select().from(schema.users).where(eq(schema.users.id, token)).all();
  if (users.length === 0) { res.status(401).json({ error: "User not found" }); return; }

  const db = getDb();
  const question = db.select().from(schema.citizenQuestions).where(eq(schema.citizenQuestions.id, req.params.id)).all()[0];
  if (!question) { res.status(404).json({ error: "Question not found" }); return; }

  const { vote } = req.body as { vote?: number };
  if (vote !== 1 && vote !== -1) { res.status(400).json({ error: "vote must be 1 or -1" }); return; }

  const existing = userDb.select().from(schema.questionVotes)
    .where(and(eq(schema.questionVotes.questionId, req.params.id), eq(schema.questionVotes.userId, token)))
    .all();

  if (existing.length > 0) {
    if (existing[0].vote === vote) {
      // No change — return current state
    } else {
      userDb.update(schema.questionVotes).set({ vote, createdAt: Date.now() })
        .where(eq(schema.questionVotes.id, existing[0].id)).run();
    }
  } else {
    const voteId = `qvote-${randomUUID().slice(0, 8)}`;
    userDb.insert(schema.questionVotes).values({
      id: voteId, questionId: req.params.id, userId: token, vote, createdAt: Date.now(),
    }).run();
  }

  userDb.update(schema.users).set({ lastActive: Date.now() }).where(eq(schema.users.id, token)).run();

  // Recompute scores
  const allVotes = userDb.select().from(schema.questionVotes).where(eq(schema.questionVotes.questionId, req.params.id)).all();
  const score = allVotes.reduce((s, v) => s + v.vote, 0);
  res.json(mapQuestion(question, score, allVotes.length, vote as 1 | -1));
});

// DELETE /api/questions/:id/vote (auth)
app.delete("/api/questions/:id/vote", (req, res) => {
  if (requireParticipatory(req, res, "upvote_downvote")) return;
  const token = getUserToken(req);
  if (!token) { res.status(401).json({ error: "Not authenticated" }); return; }
  const userDb = getUserDb();

  const db = getDb();
  const question = db.select().from(schema.citizenQuestions).where(eq(schema.citizenQuestions.id, req.params.id)).all()[0];
  if (!question) { res.status(404).json({ error: "Question not found" }); return; }

  const existing = userDb.select().from(schema.questionVotes)
    .where(and(eq(schema.questionVotes.questionId, req.params.id), eq(schema.questionVotes.userId, token)))
    .all();

  if (existing.length > 0) {
    userDb.delete(schema.questionVotes).where(eq(schema.questionVotes.id, existing[0].id)).run();
  }

  // Recompute scores
  const allVotes = userDb.select().from(schema.questionVotes).where(eq(schema.questionVotes.questionId, req.params.id)).all();
  const score = allVotes.reduce((s, v) => s + v.vote, 0);
  res.json(mapQuestion(question, score, allVotes.length, null));
});

// GET /api/referendums
app.get("/api/referendums", (req, res) => {
  const db = getDb();
  const userDb = getUserDb();
  const allRows = db.select().from(schema.referendums).all();
  const statusFilter = req.query.status as string | undefined;
  const rows = statusFilter ? allRows.filter((r: any) => r.status === statusFilter) : allRows;

  const token = getUserToken(req);
  const votedSet = new Set<string>();
  if (token) {
    const userVotes = userDb.select().from(schema.referendumVotes)
      .where(eq(schema.referendumVotes.userId, token)).all();
    for (const v of userVotes) votedSet.add(v.referendumId);
  }

  const referendums = rows.map(r => ({ ...mapReferendum(r), userVoted: votedSet.has(r.id) }));
  referendums.sort((a, b) => b.createdOnDay - a.createdOnDay);
  res.json(referendums);
});

// GET /api/referendums/:id
app.get("/api/referendums/:id", (req, res) => {
  const db = getDb();
  const userDb = getUserDb();
  const rows = db.select().from(schema.referendums).where(eq(schema.referendums.id, req.params.id)).all();
  if (rows.length === 0) {
    res.status(404).json({ error: "Referendum not found" });
    return;
  }
  const token = getUserToken(req);
  let userVoted = false;
  if (token) {
    const existing = userDb.select().from(schema.referendumVotes)
      .where(and(eq(schema.referendumVotes.referendumId, req.params.id), eq(schema.referendumVotes.userId, token))).all();
    userVoted = existing.length > 0;
  }
  res.json({ ...mapReferendum(rows[0]), userVoted });
});

// POST /api/referendums/:id/vote
app.post("/api/referendums/:id/vote", (req, res) => {
  if (requireParticipatory(req, res, "vote_referendums")) return;
  const token = getUserToken(req);
  if (!token) { res.status(401).json({ error: "Login required to vote" }); return; }

  const db = getDb();
  const userDb = getUserDb();
  const rows = db.select().from(schema.referendums).where(eq(schema.referendums.id, req.params.id)).all();
  if (rows.length === 0) {
    res.status(404).json({ error: "Referendum not found" });
    return;
  }

  const referendum = mapReferendum(rows[0]);
  if (referendum.status !== "active") {
    res.status(400).json({ error: "Referendum is no longer active" });
    return;
  }

  const { option } = req.body;
  if (!option || !referendum.options.includes(option)) {
    res.status(400).json({ error: "Invalid option" });
    return;
  }

  // Check for existing vote
  const existing = userDb.select().from(schema.referendumVotes)
    .where(and(eq(schema.referendumVotes.referendumId, referendum.id), eq(schema.referendumVotes.userId, token))).all();
  if (existing.length > 0) {
    res.status(400).json({ error: "Already voted on this referendum" });
    return;
  }

  // Record user vote
  const voteId = `rvote-${randomUUID().slice(0, 8)}`;
  userDb.insert(schema.referendumVotes).values({
    id: voteId, referendumId: referendum.id, userId: token, option, createdAt: Date.now(),
  }).run();

  const votes = { ...referendum.votes };
  votes[option] = (votes[option] || 0) + 1;

  db.update(schema.referendums)
    .set({ votes: votes as any })
    .where(eq(schema.referendums.id, referendum.id))
    .run();

  res.json({ ...referendum, votes, userVoted: true });
});

// GET /api/government
app.get("/api/government", (_req, res) => {
  const gov = getActiveGovernment();
  res.json(gov);
});

// GET /api/government/history
app.get("/api/government/history", (_req, res) => {
  const db = getDb();
  const rows = db.select().from(schema.government).all();
  const govs: Government[] = rows.map(mapGovernmentRow);
  govs.sort((a, b) => b.formedOnDay - a.formedOnDay);
  res.json(govs);
});

// GET /api/constitutional-court
app.get("/api/constitutional-court", (req, res) => {
  const db = getDb();
  const allRows = db.select().from(schema.constitutionalChallenges).all();
  const statusFilter = req.query.status as string | undefined;
  const billIdFilter = req.query.billId as string | undefined;
  let rows = allRows;
  if (statusFilter) rows = rows.filter((c: any) => c.status === statusFilter);
  if (billIdFilter) rows = rows.filter((c: any) => c.billId === billIdFilter);
  const challenges: ConstitutionalChallenge[] = rows.map(mapConstitutionalChallengeRow);
  challenges.sort((a, b) => b.dayNumber - a.dayNumber);
  res.json(challenges);
});

// GET /api/constitutional-court/:id
app.get("/api/constitutional-court/:id", (req, res) => {
  const db = getDb();
  const rows = db.select().from(schema.constitutionalChallenges)
    .where(eq(schema.constitutionalChallenges.id, req.params.id)).all();
  if (rows.length === 0) {
    res.status(404).json({ error: "Constitutional challenge not found" });
    return;
  }
  res.json(mapConstitutionalChallengeRow(rows[0]));
});

// GET /api/crisis-templates
app.get("/api/crisis-templates", (_req, res) => {
  const templates = getCrisisTemplates();
  res.json(templates.map(t => ({ id: t.id, name: t.name, severity: t.severity, category: t.category })));
});

// POST /api/simulate/inject
app.post("/api/simulate/inject", (req, res) => {
  const db = getDb();
  const { type, data } = req.body;

  if (!type || !["crisis", "election", "economic_shock", "invalidate_election"].includes(type)) {
    res.status(400).json({ error: "Invalid type. Must be: crisis, election, economic_shock, or invalidate_election" });
    return;
  }

  if (type === "crisis") {
    const templateId = data?.templateId;
    if (!templateId || typeof templateId !== "string") {
      res.status(400).json({ error: "crisis injection requires data.templateId" });
      return;
    }
    const templates = getCrisisTemplates();
    if (!templates.some(t => t.id === templateId)) {
      res.status(400).json({ error: "Unknown crisis template ID" });
      return;
    }
  }

  if (type === "economic_shock") {
    const impact = data?.impact;
    if (!impact || typeof impact !== "object") {
      res.status(400).json({ error: "economic_shock injection requires data.impact" });
      return;
    }
  }

  const id = `inj-${Math.random().toString(36).substring(2, 10)}${Date.now().toString(36)}`;
  db.insert(schema.pendingInjections).values({
    id,
    type,
    data: (data || {}) as any,
    consumed: false,
  }).run();

  res.status(201).json({ id, type, data: data || {}, consumed: false });
});

// GET /api/simulate/injections
app.get("/api/simulate/injections", (_req, res) => {
  const db = getDb();
  const rows = db.select().from(schema.pendingInjections).all();
  res.json(rows.map(r => ({
    id: r.id,
    type: r.type,
    data: r.data,
    consumed: r.consumed,
  })));
});

function mapConstitutionalChallengeRow(row: typeof schema.constitutionalChallenges.$inferSelect): ConstitutionalChallenge {
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

function mapReferendum(row: typeof schema.referendums.$inferSelect): Referendum {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    options: row.options as unknown as string[],
    votes: row.votes as unknown as Record<string, number>,
    createdOnDay: row.createdOnDay,
    closesOnDay: row.closesOnDay,
    status: row.status as Referendum["status"],
    result: row.result,
    impact: row.impact as unknown as BillImpact | null,
    category: row.category,
  };
}

function mapQuestion(
  row: typeof schema.citizenQuestions.$inferSelect,
  voteScore = 0,
  totalVotes = 0,
  userVote?: 1 | -1 | null,
): CitizenQuestion {
  return {
    id: row.id,
    question: row.question,
    targetPartyId: row.targetPartyId,
    response: row.response,
    respondedOnDay: row.respondedOnDay,
    createdOnDay: row.createdOnDay,
    status: row.status as CitizenQuestion["status"],
    voteScore,
    totalVotes,
    userVote: userVote ?? null,
  };
}

function mapMediaArticle(row: typeof schema.mediaArticles.$inferSelect): MediaArticle {
  return {
    id: row.id,
    headline: row.headline,
    summary: row.summary,
    content: row.content,
    outlet: row.outlet,
    bias: row.bias,
    category: row.category,
    dayNumber: row.dayNumber,
  };
}

function mapParty(row: typeof schema.parties.$inferSelect, memberCount = 0): Party {
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

function getMemberCounts(): Map<string, number> {
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

function mapBill(row: typeof schema.bills.$inferSelect): Bill {
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

function mapElection(row: typeof schema.elections.$inferSelect): Election {
  return {
    id: row.id,
    triggerReason: row.triggerReason,
    announcedOnDay: row.announcedOnDay,
    campaignStartDay: row.campaignStartDay,
    electionDay: row.electionDay,
    status: row.status as Election["status"],
    results: row.results as unknown as ElectionResult[] | null,
    newCoalition: row.newCoalition as unknown as string[] | null,
    newOpposition: row.newOpposition as unknown as string[] | null,
    negotiationRounds: row.negotiationRounds as unknown as NegotiationRound[][] | null,
    coalitionAgreement: row.coalitionAgreement as unknown as CoalitionAgreement | null,
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
    dailyImpact: row.dailyImpact as unknown as BillImpact,
    resolved: row.resolved,
  };
}

function mapMotionRow(row: typeof schema.motions.$inferSelect): Motion {
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

function mapInterpellationRow(row: typeof schema.interpellations.$inferSelect): Interpellation {
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

function mapConfidenceVoteRow(row: typeof schema.confidenceVotes.$inferSelect): ConfidenceVote {
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

function mapFraktionRow(row: typeof schema.fraktionen.$inferSelect): Fraktion {
  return {
    id: row.id,
    partyId: row.partyId,
    leaderName: row.leaderName,
    status: row.status as Fraktion["status"],
    formedOnDay: row.formedOnDay,
    dissolvedOnDay: row.dissolvedOnDay,
  };
}

function mapGovernmentRow(row: typeof schema.government.$inferSelect): Government {
  return {
    id: row.id,
    electionId: row.electionId,
    chancellorName: row.chancellorName,
    chancellorPartyId: row.chancellorPartyId,
    ministers: row.ministers as unknown as Minister[],
    formedOnDay: row.formedOnDay,
    dissolvedOnDay: row.dissolvedOnDay,
    active: row.active,
  };
}

function mapPoll(row: typeof schema.polls.$inferSelect): Poll {
  return {
    id: row.id,
    question: row.question,
    options: row.options as unknown as string[],
    votes: row.votes as unknown as Record<string, number>,
    createdOnDay: row.createdOnDay,
    expiresOnDay: row.expiresOnDay,
    active: row.active,
    category: row.category,
  };
}

function mapBudgetRow(row: typeof schema.budgets.$inferSelect): Budget {
  return {
    id: row.id,
    cycleNumber: row.cycleNumber,
    status: row.status as Budget["status"],
    allocations: row.allocations as unknown as BudgetAllocations,
    totalAmount: row.totalAmount,
    proposedOnDay: row.proposedOnDay,
    votedOnDay: row.votedOnDay ?? null,
    votes: (row.votes as unknown as BudgetVote[]) ?? [],
    yesSeats: row.yesSeats ?? null,
    noSeats: row.noSeats ?? null,
    economicEffect: row.economicEffect as unknown as Record<string, number> | null,
    revisionAttempt: (row as any).revisionAttempt ?? 0,
  };
}

// GET /api/budgets(?status=)
app.get("/api/budgets", (req, res) => {
  const db = getDb();
  const allRows = db.select().from(schema.budgets).all();
  const statusFilter = req.query.status as string | undefined;
  let rows = allRows;
  if (statusFilter) rows = rows.filter((r: any) => r.status === statusFilter);
  const budgets: Budget[] = rows.map(mapBudgetRow);
  budgets.sort((a, b) => b.proposedOnDay - a.proposedOnDay);
  res.json(budgets);
});

// GET /api/budgets/:id
app.get("/api/budgets/:id", (req, res) => {
  const db = getDb();
  const rows = db.select().from(schema.budgets)
    .where(eq(schema.budgets.id, req.params.id)).all();
  if (rows.length === 0) {
    res.status(404).json({ error: "Budget not found" });
    return;
  }
  res.json(mapBudgetRow(rows[0]));
});

// ── Internal Proposals endpoints ─────────────────────────────────────────────

function mapProposal(row: typeof schema.internalProposals.$inferSelect, userVote?: 1 | -1 | null) {
  return {
    id: row.id,
    partyId: row.partyId,
    proposedBy: row.proposedBy,
    proposerName: row.proposerName,
    title: row.title,
    description: row.description,
    category: row.category,
    rationale: row.rationale,
    status: row.status,
    voteScore: row.voteScore,
    totalVotes: row.totalVotes,
    createdOnDay: row.createdOnDay,
    reviewByDay: row.reviewByDay,
    reviewedOnDay: row.reviewedOnDay,
    declineReason: row.declineReason,
    bundestagBillId: row.bundestag_bill_id,
    userVote: userVote ?? null,
  };
}

// GET /api/parties/:id/proposals
app.get("/api/parties/:id/proposals", (req, res) => {
  const userDb = getUserDb();
  const token = getUserToken(req);
  const statusFilter = req.query.status as string | undefined;
  let rows = userDb.select().from(schema.internalProposals)
    .where(eq(schema.internalProposals.partyId, req.params.id))
    .all();
  if (statusFilter) rows = rows.filter(r => r.status === statusFilter);
  rows.sort((a, b) => b.voteScore - a.voteScore || b.createdOnDay - a.createdOnDay);

  // Include userVote if authenticated
  let userVoteMap: Record<string, 1 | -1> = {};
  if (token) {
    const proposalIds = rows.map(r => r.id);
    if (proposalIds.length > 0) {
      const votes = userDb.select().from(schema.internalVotes)
        .where(and(eq(schema.internalVotes.userId, token), inArray(schema.internalVotes.proposalId, proposalIds)))
        .all();
      for (const v of votes) userVoteMap[v.proposalId] = v.vote as 1 | -1;
    }
  }
  res.json(rows.map(r => mapProposal(r, userVoteMap[r.id] ?? null)));
});

// POST /api/parties/:id/proposals
app.post("/api/parties/:id/proposals", (req, res) => {
  if (requireParticipatory(req, res, "internal_proposals")) return;
  const token = getUserToken(req);
  if (!token) { res.status(401).json({ error: "Not authenticated" }); return; }
  const userDb = getUserDb();
  const users = userDb.select().from(schema.users).where(eq(schema.users.id, token)).all();
  if (users.length === 0) { res.status(401).json({ error: "User not found" }); return; }
  const user = users[0];
  if (user.partyId !== req.params.id) { res.status(403).json({ error: "Not a member of this party" }); return; }

  const { title, description, category, rationale } = req.body as Record<string, string>;
  if (!title?.trim() || title.trim().length > 80) { res.status(400).json({ error: "Title required (max 80 chars)" }); return; }
  if (!description?.trim() || description.trim().length > 500) { res.status(400).json({ error: "Description required (max 500 chars)" }); return; }
  if (!category) { res.status(400).json({ error: "Category required" }); return; }

  // Check: one active proposal per member
  const existing = userDb.select().from(schema.internalProposals)
    .where(and(eq(schema.internalProposals.proposedBy, token), eq(schema.internalProposals.partyId, req.params.id)))
    .all()
    .filter(r => r.status === "open" || r.status === "reviewing");
  if (existing.length > 0) { res.status(400).json({ error: "You already have an active proposal" }); return; }

  // Check: max 5 open proposals per party
  const openCount = userDb.select().from(schema.internalProposals)
    .where(and(eq(schema.internalProposals.partyId, req.params.id), eq(schema.internalProposals.status, "open")))
    .all().length;
  if (openCount >= 5) { res.status(400).json({ error: "Party already has 5 open proposals" }); return; }

  const db = getDb();
  const metaRow = db.select({ day: schema.simulationMeta.currentDay }).from(schema.simulationMeta).limit(1).all()[0];
  const currentDay = metaRow?.day ?? 0;

  const id = `iprop-${randomUUID().slice(0, 8)}`;
  userDb.insert(schema.internalProposals).values({
    id,
    partyId: req.params.id,
    proposedBy: token,
    proposerName: user.displayName,
    title: title.trim(),
    description: description.trim(),
    category,
    rationale: rationale?.trim() || null,
    status: "open",
    voteScore: 0,
    totalVotes: 0,
    createdOnDay: currentDay,
    reviewByDay: currentDay + 5,
  }).run();

  userDb.update(schema.users).set({ lastActive: Date.now() }).where(eq(schema.users.id, token)).run();
  const row = userDb.select().from(schema.internalProposals).where(eq(schema.internalProposals.id, id)).all()[0];
  res.status(201).json(mapProposal(row));
});

// GET /api/proposals/:id
app.get("/api/proposals/:id", (req, res) => {
  const userDb = getUserDb();
  const token = getUserToken(req);
  const rows = userDb.select().from(schema.internalProposals).where(eq(schema.internalProposals.id, req.params.id)).all();
  if (rows.length === 0) { res.status(404).json({ error: "Proposal not found" }); return; }
  let userVote: 1 | -1 | null = null;
  if (token) {
    const vr = userDb.select().from(schema.internalVotes)
      .where(and(eq(schema.internalVotes.proposalId, req.params.id), eq(schema.internalVotes.userId, token)))
      .all();
    if (vr.length > 0) userVote = vr[0].vote as 1 | -1;
  }
  res.json(mapProposal(rows[0], userVote));
});

// POST /api/proposals/:id/vote (auth)
app.post("/api/proposals/:id/vote", (req, res) => {
  if (requireParticipatory(req, res, "internal_proposals")) return;
  const token = getUserToken(req);
  if (!token) { res.status(401).json({ error: "Not authenticated" }); return; }
  const userDb = getUserDb();
  const users = userDb.select().from(schema.users).where(eq(schema.users.id, token)).all();
  if (users.length === 0) { res.status(401).json({ error: "User not found" }); return; }
  const proposal = userDb.select().from(schema.internalProposals).where(eq(schema.internalProposals.id, req.params.id)).all()[0];
  if (!proposal) { res.status(404).json({ error: "Proposal not found" }); return; }
  if (proposal.status !== "open") { res.status(400).json({ error: "Proposal is not open for voting" }); return; }

  const { vote } = req.body as { vote?: number };
  if (vote !== 1 && vote !== -1) { res.status(400).json({ error: "vote must be 1 or -1" }); return; }

  const existing = userDb.select().from(schema.internalVotes)
    .where(and(eq(schema.internalVotes.proposalId, req.params.id), eq(schema.internalVotes.userId, token)))
    .all();

  if (existing.length > 0) {
    const oldVote = existing[0].vote;
    if (oldVote === vote) { res.json(mapProposal(proposal, vote as 1 | -1)); return; } // no change
    // Update existing vote: adjust score by (new - old)
    userDb.update(schema.internalVotes).set({ vote, createdAt: Date.now() }).where(eq(schema.internalVotes.id, existing[0].id)).run();
    userDb.update(schema.internalProposals).set({
      voteScore: proposal.voteScore - oldVote + vote,
    }).where(eq(schema.internalProposals.id, req.params.id)).run();
  } else {
    const voteId = `ivote-${randomUUID().slice(0, 8)}`;
    userDb.insert(schema.internalVotes).values({ id: voteId, proposalId: req.params.id, userId: token, vote, createdAt: Date.now() }).run();
    userDb.update(schema.internalProposals).set({
      voteScore: proposal.voteScore + vote,
      totalVotes: proposal.totalVotes + 1,
    }).where(eq(schema.internalProposals.id, req.params.id)).run();
  }

  userDb.update(schema.users).set({ lastActive: Date.now() }).where(eq(schema.users.id, token)).run();
  const updated = userDb.select().from(schema.internalProposals).where(eq(schema.internalProposals.id, req.params.id)).all()[0];
  res.json(mapProposal(updated, vote as 1 | -1));
});

// DELETE /api/proposals/:id/vote (auth)
app.delete("/api/proposals/:id/vote", (req, res) => {
  if (requireParticipatory(req, res, "internal_proposals")) return;
  const token = getUserToken(req);
  if (!token) { res.status(401).json({ error: "Not authenticated" }); return; }
  const userDb = getUserDb();
  const proposal = userDb.select().from(schema.internalProposals).where(eq(schema.internalProposals.id, req.params.id)).all()[0];
  if (!proposal) { res.status(404).json({ error: "Proposal not found" }); return; }

  const existing = userDb.select().from(schema.internalVotes)
    .where(and(eq(schema.internalVotes.proposalId, req.params.id), eq(schema.internalVotes.userId, token)))
    .all();
  if (existing.length === 0) { res.json(mapProposal(proposal, null)); return; }

  const oldVote = existing[0].vote;
  userDb.delete(schema.internalVotes).where(eq(schema.internalVotes.id, existing[0].id)).run();
  userDb.update(schema.internalProposals).set({
    voteScore: proposal.voteScore - oldVote,
    totalVotes: Math.max(0, proposal.totalVotes - 1),
  }).where(eq(schema.internalProposals.id, req.params.id)).run();

  const updated = userDb.select().from(schema.internalProposals).where(eq(schema.internalProposals.id, req.params.id)).all()[0];
  res.json(mapProposal(updated, null));
});

// ── User / Membership endpoints ──────────────────────────────────────────────

function getUserToken(req: express.Request): string | null {
  const h = req.headers["x-user-token"];
  return typeof h === "string" && h.length > 0 ? h : null;
}

// POST /api/users/login
app.post("/api/users/login", (req, res) => {
  const { displayName } = req.body as { displayName?: string };
  if (!displayName || displayName.trim().length < 2) {
    res.status(400).json({ error: "displayName must be at least 2 characters" });
    return;
  }
  const userDb = getUserDb();
  const rows = userDb.select().from(schema.users).where(eq(schema.users.displayName, displayName.trim())).all();
  if (rows.length === 0) { res.status(404).json({ error: "User not found" }); return; }
  const u = rows[0];
  userDb.update(schema.users).set({ lastActive: Date.now() }).where(eq(schema.users.id, u.id)).run();
  res.json({ id: u.id, displayName: u.displayName, partyId: u.partyId, createdAt: u.createdAt, lastActive: Date.now(), switchCooldownUntil: u.switchCooldownUntil });
});

// POST /api/users/register
app.post("/api/users/register", (req, res) => {
  const { displayName, partyId } = req.body as { displayName?: string; partyId?: string };
  if (!displayName || displayName.trim().length < 2 || displayName.trim().length > 30) {
    res.status(400).json({ error: "displayName must be 2–30 characters" });
    return;
  }
  if (partyId) {
    const db = getDb();
    const party = db.select().from(schema.parties).where(eq(schema.parties.id, partyId)).all();
    if (party.length === 0) { res.status(400).json({ error: "Party not found" }); return; }
  }
  const userDb = getUserDb();
  const id: string = randomUUID();
  const now = Date.now();
  try {
    userDb.insert(schema.users).values({
      id,
      displayName: displayName.trim(),
      partyId: partyId ?? null,
      createdAt: now,
      lastActive: now,
      switchCooldownUntil: null,
    }).run();
  } catch (err: any) {
    if (err.message?.includes("UNIQUE constraint failed")) {
      res.status(409).json({ error: "Nickname already taken" });
      return;
    }
    throw err;
  }
  res.json({ id, displayName: displayName.trim(), partyId: partyId ?? null, createdAt: now, lastActive: now, switchCooldownUntil: null });
});

// GET /api/users/me
app.get("/api/users/me", (req, res) => {
  const token = getUserToken(req);
  if (!token) { res.status(401).json({ error: "Missing X-User-Token header" }); return; }
  const userDb = getUserDb();
  const rows = userDb.select().from(schema.users).where(eq(schema.users.id, token)).all();
  if (rows.length === 0) { res.status(404).json({ error: "User not found" }); return; }
  const u = rows[0];
  res.json({ id: u.id, displayName: u.displayName, partyId: u.partyId, createdAt: u.createdAt, lastActive: u.lastActive, switchCooldownUntil: u.switchCooldownUntil });
});

// POST /api/users/me/join/:partyId
app.post("/api/users/me/join/:partyId", (req, res) => {
  const token = getUserToken(req);
  if (!token) { res.status(401).json({ error: "Missing X-User-Token header" }); return; }
  const userDb = getUserDb();
  const rows = userDb.select().from(schema.users).where(eq(schema.users.id, token)).all();
  if (rows.length === 0) { res.status(404).json({ error: "User not found" }); return; }
  const user = rows[0];

  const db = getDb();
  const metaRow = db.select({ day: schema.simulationMeta.currentDay }).from(schema.simulationMeta).limit(1).all()[0];
  const currentDay = metaRow?.day ?? 0;

  if (user.switchCooldownUntil != null && currentDay < user.switchCooldownUntil) {
    res.status(403).json({ error: `Cooldown active until Day ${user.switchCooldownUntil}` });
    return;
  }
  const party = db.select().from(schema.parties).where(eq(schema.parties.id, req.params.partyId)).all();
  if (party.length === 0) { res.status(404).json({ error: "Party not found" }); return; }

  // If switching parties, deactivate seat and expire applications
  if (user.partyId != null && user.partyId !== req.params.partyId) {
    deactivateUserSeat(token);
    userDb.update(schema.mdbApplications)
      .set({ status: "expired" as const })
      .where(and(eq(schema.mdbApplications.userId, token), eq(schema.mdbApplications.status, "pending")))
      .run();
  }
  const cooldown = user.partyId != null ? currentDay + 7 : null;
  userDb.update(schema.users)
    .set({ partyId: req.params.partyId, lastActive: Date.now(), switchCooldownUntil: cooldown })
    .where(eq(schema.users.id, token))
    .run();
  const updated = userDb.select().from(schema.users).where(eq(schema.users.id, token)).all()[0];
  res.json({ id: updated.id, displayName: updated.displayName, partyId: updated.partyId, createdAt: updated.createdAt, lastActive: updated.lastActive, switchCooldownUntil: updated.switchCooldownUntil });
});

// POST /api/users/me/leave
app.post("/api/users/me/leave", (req, res) => {
  const token = getUserToken(req);
  if (!token) { res.status(401).json({ error: "Missing X-User-Token header" }); return; }
  const userDb = getUserDb();
  const rows = userDb.select().from(schema.users).where(eq(schema.users.id, token)).all();
  if (rows.length === 0) { res.status(404).json({ error: "User not found" }); return; }
  const db = getDb();
  const metaRow = db.select({ day: schema.simulationMeta.currentDay }).from(schema.simulationMeta).limit(1).all()[0];
  const currentDay = metaRow?.day ?? 0;
  // Deactivate any active Bundestag seat
  deactivateUserSeat(token);
  // Expire pending MdB applications
  userDb.update(schema.mdbApplications)
    .set({ status: "expired" as const })
    .where(and(eq(schema.mdbApplications.userId, token), eq(schema.mdbApplications.status, "pending")))
    .run();
  userDb.update(schema.users)
    .set({ partyId: null, lastActive: Date.now(), switchCooldownUntil: currentDay + 7 })
    .where(eq(schema.users.id, token))
    .run();
  const updated = userDb.select().from(schema.users).where(eq(schema.users.id, token)).all()[0];
  res.json({ id: updated.id, displayName: updated.displayName, partyId: updated.partyId, createdAt: updated.createdAt, lastActive: updated.lastActive, switchCooldownUntil: updated.switchCooldownUntil });
});

// ── MdB Seats ────────────────────────────────────────────────────────────────

// POST /api/seats/apply — apply for a Bundestag seat
app.post("/api/seats/apply", (req, res) => {
  if (requireParticipatory(req, res, "mdb_apply")) return;
  const token = getUserToken(req);
  if (!token) { res.status(401).json({ error: "Missing X-User-Token header" }); return; }

  const userDb = getUserDb();
  const user = userDb.select().from(schema.users).where(eq(schema.users.id, token)).all()[0];
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  if (!user.partyId) { res.status(400).json({ error: "You must join a party first" }); return; }

  // Check no active seat
  const existingSeat = getUserSeat(token);
  if (existingSeat) { res.status(400).json({ error: "You already have an active seat" }); return; }

  // Check no pending application
  const pendingApp = userDb.select().from(schema.mdbApplications)
    .where(and(
      eq(schema.mdbApplications.userId, token),
      eq(schema.mdbApplications.status, "pending"),
    )).all();
  if (pendingApp.length > 0) { res.status(400).json({ error: "You already have a pending application" }); return; }

  // Check cooldown from rejected application
  const db = getDb();
  const metaRow = db.select({ day: schema.simulationMeta.currentDay }).from(schema.simulationMeta).limit(1).all()[0];
  const currentDay = metaRow?.day ?? 0;
  const recentRejected = userDb.select().from(schema.mdbApplications)
    .where(and(
      eq(schema.mdbApplications.userId, token),
      eq(schema.mdbApplications.status, "rejected"),
    )).all()
    .filter(a => a.cooldownUntilDay != null && currentDay < a.cooldownUntilDay);
  if (recentRejected.length > 0) {
    res.status(403).json({ error: `Cooldown active until Day ${recentRejected[0].cooldownUntilDay}` });
    return;
  }

  // Check open seats exist for party
  const openCounts = getOpenSeatCounts();
  if ((openCounts[user.partyId] ?? 0) === 0) {
    res.status(400).json({ error: "No open seats available for your party" });
    return;
  }

  const { applicationText, policyFocus } = req.body as { applicationText?: string; policyFocus?: string[] };
  if (!applicationText || applicationText.trim().length < 10 || applicationText.trim().length > 500) {
    res.status(400).json({ error: "applicationText must be 10–500 characters" });
    return;
  }

  const appId = randomUUID();
  userDb.insert(schema.mdbApplications).values({
    id: appId,
    userId: token,
    partyId: user.partyId,
    applicationText: applicationText.trim(),
    policyFocus: policyFocus ?? null,
    status: "pending",
    createdOnDay: currentDay,
  }).run();

  res.json({
    id: appId,
    userId: token,
    partyId: user.partyId,
    applicationText: applicationText.trim(),
    policyFocus: policyFocus ?? null,
    status: "pending",
    createdOnDay: currentDay,
  });
});

// GET /api/seats/my-seat — get user's active seat + application status
app.get("/api/seats/my-seat", (req, res) => {
  const token = getUserToken(req);
  if (!token) { res.json({ seat: null, applications: [] }); return; }

  const seat = getUserSeat(token);
  const userDb = getUserDb();
  const applications = userDb.select().from(schema.mdbApplications)
    .where(eq(schema.mdbApplications.userId, token))
    .all()
    .sort((a, b) => b.createdOnDay - a.createdOnDay);

  res.json({ seat, applications });
});

// GET /api/seats/party/:partyId — all active seats for a party (public roster)
app.get("/api/seats/party/:partyId", (req, res) => {
  const seats = getActiveSeats(req.params.partyId);

  // Enrich with user display names
  const userDb = getUserDb();
  const enriched = seats.map(seat => {
    let displayName: string | null = null;
    if (seat.userId) {
      const user = userDb.select().from(schema.users)
        .where(eq(schema.users.id, seat.userId))
        .all()[0];
      displayName = user?.displayName ?? null;
    }
    return { ...seat, displayName };
  });

  res.json(enriched);
});

// GET /api/seats/available — open seat counts per party
app.get("/api/seats/available", (_req, res) => {
  const openCounts = getOpenSeatCounts();

  // Also include total active seats per party for context
  const sqlite = getSqlite();
  const totalRows = sqlite.prepare(
    "SELECT party_id, COUNT(*) as total, SUM(CASE WHEN controller = 'human' THEN 1 ELSE 0 END) as human_total FROM bundestag_seats WHERE active = 1 GROUP BY party_id"
  ).all() as Array<{ party_id: string; total: number; human_total: number }>;

  const result: Record<string, { open: number; humanTotal: number; total: number }> = {};
  for (const row of totalRows) {
    result[row.party_id] = {
      open: openCounts[row.party_id] ?? 0,
      humanTotal: row.human_total,
      total: row.total,
    };
  }

  res.json(result);
});

// ── MdB Parliamentary Actions ─────────────────────────────────────────────────

// POST /api/motions/submit — user files a motion
app.post("/api/motions/submit", (req, res) => {
  if (requireParticipatory(req, res, "vote_bills")) return;
  const token = getUserToken(req);
  if (!token) { res.status(401).json({ error: "Missing X-User-Token header" }); return; }

  const seat = getUserSeat(token);
  if (!seat) { res.status(403).json({ error: "You don't have an active Bundestag seat" }); return; }

  // Check Fraktion
  const db = getDb();
  const fraktion = db.select().from(schema.fraktionen)
    .where(and(eq(schema.fraktionen.partyId, seat.partyId), eq(schema.fraktionen.status, "active")))
    .all()[0];
  if (!fraktion) { res.status(403).json({ error: "Your party has no Fraktion — cannot submit motions" }); return; }

  const { motionType, title, description } = req.body as { motionType?: string; title?: string; description?: string };
  if (!motionType || !["motion", "resolution"].includes(motionType)) {
    res.status(400).json({ error: "motionType must be 'motion' or 'resolution'" }); return;
  }
  if (!title || title.trim().length < 5 || title.trim().length > 100) {
    res.status(400).json({ error: "title must be 5–100 characters" }); return;
  }
  if (!description || description.trim().length < 10 || description.trim().length > 300) {
    res.status(400).json({ error: "description must be 10–300 characters" }); return;
  }

  // Cooldown: max 1 pending motion at a time per user
  const sqlite = getSqlite();
  // Check user-filed motions via pending_injections
  const recentUserMotion = sqlite.prepare(
    "SELECT COUNT(*) as cnt FROM pending_injections WHERE type = 'mdb_motion' AND json_extract(data, '$.userId') = ?"
  ).get(token) as { cnt: number };
  if (recentUserMotion.cnt > 0) {
    // Count how many were filed in last 7 days (from motions table, attributed to this party by user)
    // Simpler: just limit to 1 pending at a time
    const unconsumed = sqlite.prepare(
      "SELECT COUNT(*) as cnt FROM pending_injections WHERE type = 'mdb_motion' AND consumed = 0 AND json_extract(data, '$.userId') = ?"
    ).get(token) as { cnt: number };
    if (unconsumed.cnt > 0) {
      res.status(429).json({ error: "You already have a pending motion" }); return;
    }
  }

  // Get user display name
  const userDb = getUserDb();
  const user = userDb.select().from(schema.users).where(eq(schema.users.id, token)).all()[0];

  db.insert(schema.pendingInjections).values({
    id: randomUUID(),
    type: "mdb_motion",
    data: {
      motionType,
      title: title.trim(),
      description: description.trim(),
      partyId: seat.partyId,
      userId: token,
      proposerName: user?.displayName ?? "MdB",
    } as any,
    consumed: false,
  }).run();

  res.json({ status: "queued", message: "Motion will be processed on next simulation day" });
});

// POST /api/interpellations/submit — user files an interpellation
app.post("/api/interpellations/submit", (req, res) => {
  if (requireParticipatory(req, res, "vote_bills")) return;
  const token = getUserToken(req);
  if (!token) { res.status(401).json({ error: "Missing X-User-Token header" }); return; }

  const seat = getUserSeat(token);
  if (!seat) { res.status(403).json({ error: "You don't have an active Bundestag seat" }); return; }

  const db = getDb();
  // Must be opposition
  const party = db.select().from(schema.parties).where(eq(schema.parties.id, seat.partyId)).all()[0];
  if (!party || (party.coalitionRole as string) !== "opposition") {
    res.status(403).json({ error: "Only opposition parties can file interpellations" }); return;
  }
  // Must have Fraktion
  const fraktion = db.select().from(schema.fraktionen)
    .where(and(eq(schema.fraktionen.partyId, seat.partyId), eq(schema.fraktionen.status, "active")))
    .all()[0];
  if (!fraktion) { res.status(403).json({ error: "Your party has no Fraktion" }); return; }

  const { interpellationType, title, question, targetMinistry } = req.body as {
    interpellationType?: string; title?: string; question?: string; targetMinistry?: string;
  };
  if (!interpellationType || !["kleine", "große"].includes(interpellationType)) {
    res.status(400).json({ error: "interpellationType must be 'kleine' or 'große'" }); return;
  }
  if (!title || title.trim().length < 5 || title.trim().length > 100) {
    res.status(400).json({ error: "title must be 5–100 characters" }); return;
  }
  if (!question || question.trim().length < 10 || question.trim().length > 500) {
    res.status(400).json({ error: "question must be 10–500 characters" }); return;
  }
  const validMinistries = ["finance", "labour", "environment", "interior", "defence", "education", "health", "infrastructure"];
  if (!targetMinistry || !validMinistries.includes(targetMinistry)) {
    res.status(400).json({ error: `targetMinistry must be one of: ${validMinistries.join(", ")}` }); return;
  }

  // Cooldown: 1 pending at a time
  const sqlite = getSqlite();
  const unconsumed = sqlite.prepare(
    "SELECT COUNT(*) as cnt FROM pending_injections WHERE type = 'mdb_interpellation' AND consumed = 0 AND json_extract(data, '$.userId') = ?"
  ).get(token) as { cnt: number };
  if (unconsumed.cnt > 0) {
    res.status(429).json({ error: "You already have a pending interpellation" }); return;
  }

  const userDb = getUserDb();
  const user = userDb.select().from(schema.users).where(eq(schema.users.id, token)).all()[0];

  db.insert(schema.pendingInjections).values({
    id: randomUUID(),
    type: "mdb_interpellation",
    data: {
      interpellationType,
      title: title.trim(),
      question: question.trim(),
      targetMinistry,
      partyId: seat.partyId,
      userId: token,
      proposerName: user?.displayName ?? "MdB",
    } as any,
    consumed: false,
  }).run();

  res.json({ status: "queued", message: "Interpellation will be processed on next simulation day" });
});

// POST /api/bills/:id/amendment — user proposes an amendment
app.post("/api/bills/:id/amendment", (req, res) => {
  if (requireParticipatory(req, res, "propose_amendments")) return;
  const token = getUserToken(req);
  if (!token) { res.status(401).json({ error: "Missing X-User-Token header" }); return; }

  const seat = getUserSeat(token);
  if (!seat) { res.status(403).json({ error: "You don't have an active Bundestag seat" }); return; }

  const db = getDb();
  const bill = db.select().from(schema.bills).where(eq(schema.bills.id, req.params.id)).all()[0];
  if (!bill) { res.status(404).json({ error: "Bill not found" }); return; }
  if (bill.status !== "second_reading") { res.status(400).json({ error: "Bill is not in second reading" }); return; }

  const { title, description, impactChange } = req.body as {
    title?: string; description?: string; impactChange?: Record<string, number>;
  };
  if (!title || title.trim().length < 5 || title.trim().length > 100) {
    res.status(400).json({ error: "title must be 5–100 characters" }); return;
  }
  if (!description || description.trim().length < 10 || description.trim().length > 300) {
    res.status(400).json({ error: "description must be 10–300 characters" }); return;
  }
  if (!impactChange || typeof impactChange !== "object") {
    res.status(400).json({ error: "impactChange must be an object" }); return;
  }
  // Validate impact bounds (±0.3)
  for (const [key, val] of Object.entries(impactChange)) {
    if (!["budget", "unemployment", "inflation", "gdpGrowth", "publicSentiment"].includes(key)) {
      res.status(400).json({ error: `Invalid impact key: ${key}` }); return;
    }
    if (typeof val !== "number" || val < -0.3 || val > 0.3) {
      res.status(400).json({ error: `${key} must be between -0.3 and 0.3` }); return;
    }
  }

  // 1 amendment per user per bill
  const sqlite = getSqlite();
  const existingAmend = sqlite.prepare(
    "SELECT COUNT(*) as cnt FROM pending_injections WHERE type = 'mdb_amendment' AND consumed = 0 AND json_extract(data, '$.userId') = ? AND json_extract(data, '$.billId') = ?"
  ).get(token, req.params.id) as { cnt: number };
  if (existingAmend.cnt > 0) {
    res.status(400).json({ error: "You already have a pending amendment for this bill" }); return;
  }
  // Check via pending_injections that were already consumed for this bill+user
  const consumedAmend = sqlite.prepare(
    "SELECT COUNT(*) as cnt FROM pending_injections WHERE type = 'mdb_amendment' AND consumed = 1 AND json_extract(data, '$.userId') = ? AND json_extract(data, '$.billId') = ?"
  ).get(token, req.params.id) as { cnt: number };
  if (consumedAmend.cnt > 0) {
    res.status(400).json({ error: "You have already proposed an amendment for this bill" }); return;
  }

  const userDb = getUserDb();
  const user = userDb.select().from(schema.users).where(eq(schema.users.id, token)).all()[0];

  db.insert(schema.pendingInjections).values({
    id: randomUUID(),
    type: "mdb_amendment",
    data: {
      billId: req.params.id,
      title: title.trim(),
      description: description.trim(),
      impactChange,
      partyId: seat.partyId,
      userId: token,
      proposerName: user?.displayName ?? "MdB",
    } as any,
    consumed: false,
  }).run();

  res.json({ status: "queued", message: "Amendment will be processed on next simulation day" });
});

// ── MdB Speeches ─────────────────────────────────────────────────────────────

// POST /api/bills/:id/speech — submit a speech on a bill
app.post("/api/bills/:id/speech", (req, res) => {
  if (requireParticipatory(req, res, "give_speech")) return;
  const token = getUserToken(req);
  if (!token) { res.status(401).json({ error: "Missing X-User-Token header" }); return; }

  const seat = getUserSeat(token);
  if (!seat) { res.status(403).json({ error: "You don't have an active Bundestag seat" }); return; }

  const db = getDb();
  const bill = db.select().from(schema.bills).where(eq(schema.bills.id, req.params.id)).all()[0];
  if (!bill) { res.status(404).json({ error: "Bill not found" }); return; }

  const { content, reading } = req.body as { content?: string; reading?: number };
  if (!content || content.trim().length < 20 || content.trim().length > 500) {
    res.status(400).json({ error: "content must be 20–500 characters" });
    return;
  }
  if (!reading || ![1, 2, 3].includes(reading)) {
    res.status(400).json({ error: "reading must be 1, 2, or 3" });
    return;
  }

  // Validate bill is in matching reading stage
  const readingStatusMap: Record<number, string> = { 1: "first_reading", 2: "second_reading", 3: "third_reading" };
  if (bill.status !== readingStatusMap[reading]) {
    res.status(400).json({ error: `Bill is in ${bill.status}, not ${readingStatusMap[reading]}` });
    return;
  }

  // Check user hasn't already spoken on this bill+reading
  const userDb = getUserDb();
  const existing = userDb.select().from(schema.mdbSpeeches)
    .where(and(
      eq(schema.mdbSpeeches.billId, req.params.id),
      eq(schema.mdbSpeeches.userId, token),
      eq(schema.mdbSpeeches.reading, reading),
    )).all();
  if (existing.length > 0) {
    res.status(400).json({ error: "You have already spoken on this bill in this reading" });
    return;
  }

  const metaRow = db.select({ day: schema.simulationMeta.currentDay }).from(schema.simulationMeta).limit(1).all()[0];
  const currentDay = metaRow?.day ?? 0;

  const speechId = randomUUID();
  userDb.insert(schema.mdbSpeeches).values({
    id: speechId,
    userId: token,
    billId: req.params.id,
    reading,
    content: content.trim(),
    sentimentImpact: null,
    dayNumber: currentDay,
    createdAt: Date.now(),
  }).run();

  res.json({ id: speechId, billId: req.params.id, reading, content: content.trim(), dayNumber: currentDay });
});

// GET /api/bills/:id/speeches — all speeches for a bill, grouped by reading
app.get("/api/bills/:id/speeches", (req, res) => {
  const userDb = getUserDb();
  const speeches = userDb.select().from(schema.mdbSpeeches)
    .where(eq(schema.mdbSpeeches.billId, req.params.id))
    .all();

  // Enrich with display names
  const userIds = [...new Set(speeches.map(s => s.userId))];
  const nameMap = new Map<string, string>();
  for (const uid of userIds) {
    const user = userDb.select().from(schema.users).where(eq(schema.users.id, uid)).all()[0];
    if (user) nameMap.set(uid, user.displayName);
  }

  const enriched = speeches.map(s => ({
    ...s,
    displayName: nameMap.get(s.userId) ?? "Unknown",
  }));

  // Group by reading
  const byReading: Record<number, typeof enriched> = {};
  for (const s of enriched) {
    if (!byReading[s.reading]) byReading[s.reading] = [];
    byReading[s.reading].push(s);
  }

  res.json({ speeches: enriched, byReading });
});

// ── MdB Voting ───────────────────────────────────────────────────────────────

// POST /api/bills/:id/mdb-vote — cast a direct MdB vote on a third_reading bill
app.post("/api/bills/:id/mdb-vote", (req, res) => {
  if (requireParticipatory(req, res, "vote_bills")) return;
  const token = getUserToken(req);
  if (!token) { res.status(401).json({ error: "Missing X-User-Token header" }); return; }

  const seat = getUserSeat(token);
  if (!seat) { res.status(403).json({ error: "You don't have an active Bundestag seat" }); return; }

  const db = getDb();
  const bill = db.select().from(schema.bills).where(eq(schema.bills.id, req.params.id)).all()[0];
  if (!bill) { res.status(404).json({ error: "Bill not found" }); return; }
  if (bill.status !== "third_reading") { res.status(400).json({ error: "Bill is not in third reading" }); return; }

  const { vote } = req.body as { vote?: string };
  if (!vote || !["yes", "no", "abstain"].includes(vote)) {
    res.status(400).json({ error: "vote must be 'yes', 'no', or 'abstain'" });
    return;
  }

  const userDb = getUserDb();
  // Check for existing vote (upsert)
  const existing = userDb.select().from(schema.mdbVotes)
    .where(and(eq(schema.mdbVotes.billId, req.params.id), eq(schema.mdbVotes.userId, token)))
    .all()[0];

  if (existing) {
    userDb.update(schema.mdbVotes)
      .set({ vote, createdAt: Date.now() })
      .where(eq(schema.mdbVotes.id, existing.id))
      .run();
  } else {
    userDb.insert(schema.mdbVotes).values({
      id: randomUUID(),
      seatId: seat.id,
      billId: req.params.id,
      userId: token,
      vote,
      createdAt: Date.now(),
    }).run();
  }

  // Return aggregated MdB votes
  const allVotes = userDb.select().from(schema.mdbVotes)
    .where(eq(schema.mdbVotes.billId, req.params.id))
    .all();
  const summary = { yes: 0, no: 0, abstain: 0, total: allVotes.length };
  for (const v of allVotes) {
    if (v.vote === "yes") summary.yes++;
    else if (v.vote === "no") summary.no++;
    else summary.abstain++;
  }

  res.json({ userVote: vote, summary });
});

// GET /api/bills/:id/mdb-votes — aggregated MdB votes + user's own vote
app.get("/api/bills/:id/mdb-votes", (req, res) => {
  const userDb = getUserDb();
  const allVotes = userDb.select().from(schema.mdbVotes)
    .where(eq(schema.mdbVotes.billId, req.params.id))
    .all();

  const summary = { yes: 0, no: 0, abstain: 0, total: allVotes.length };
  // Also break down by party
  const byParty: Record<string, { yes: number; no: number; abstain: number }> = {};
  for (const v of allVotes) {
    // Get party from the seat
    const seat = getDb().select().from(schema.bundestagSeats)
      .where(eq(schema.bundestagSeats.id, v.seatId))
      .all()[0];
    const partyId = seat?.partyId ?? "unknown";
    if (!byParty[partyId]) byParty[partyId] = { yes: 0, no: 0, abstain: 0 };

    if (v.vote === "yes") { summary.yes++; byParty[partyId].yes++; }
    else if (v.vote === "no") { summary.no++; byParty[partyId].no++; }
    else { summary.abstain++; byParty[partyId].abstain++; }
  }

  // User's own vote
  const token = getUserToken(req);
  let userVote: string | null = null;
  if (token) {
    const own = allVotes.find(v => v.userId === token);
    userVote = own?.vote ?? null;
  }

  res.json({ summary, byParty, userVote });
});

// ── Notifications ────────────────────────────────────────────────────────────

// GET /api/notifications
app.get("/api/notifications", (req, res) => {
  const token = getUserToken(req);
  if (!token) { res.status(401).json({ error: "Not authenticated" }); return; }
  const unreadOnly = req.query.unread === "true";
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
  const notifications = getNotifications(token, { unreadOnly, limit });
  res.json(notifications);
});

// GET /api/notifications/unread-count
app.get("/api/notifications/unread-count", (req, res) => {
  const token = getUserToken(req);
  if (!token) { res.status(401).json({ error: "Not authenticated" }); return; }
  res.json({ count: getUnreadCount(token) });
});

// POST /api/notifications/:id/read
app.post("/api/notifications/:id/read", (req, res) => {
  const token = getUserToken(req);
  if (!token) { res.status(401).json({ error: "Not authenticated" }); return; }
  const ok = markNotificationRead(req.params.id, token);
  if (!ok) { res.status(404).json({ error: "Notification not found" }); return; }
  res.json({ success: true });
});

// POST /api/notifications/read-all
app.post("/api/notifications/read-all", (req, res) => {
  const token = getUserToken(req);
  if (!token) { res.status(401).json({ error: "Not authenticated" }); return; }
  const count = markAllNotificationsRead(token);
  res.json({ marked: count });
});

// GET /api/simulation/queue (admin info: pending queued events)
app.get("/api/simulation/queue", (_req, res) => {
  const events = getQueuedEvents();
  res.json(events);
});

const server = app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`);
});

process.on("SIGINT", () => {
  server.close();
  closeDb();
  process.exit(0);
});
