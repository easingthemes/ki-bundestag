import { Router } from "express";
import {
  getDb,
  schema,
  getCrisisTemplates,
  getQueuedEvents,
  getSqlite,
  isParticipatoryPreset,
  FEATURE_AVAILABILITY,
  dayToDate,
  isRealisticSessionDay,
  getHolidaysInRange,
  isPollDay,
  isMonthlyDay,
  isBudgetDay,
  snapToNextSunday,
  getCostOverview,
  getCostByDay,
  getCostByTask,
  getCostByModel,
} from "@ki-bundestag/engine";
import type { TimingPreset, ContextDepth } from "@ki-bundestag/engine";
import { DEPTH_CONFIGS, isValidContextDepth } from "@ki-bundestag/engine";
import { and, inArray, gte } from "drizzle-orm";
import type { NationalState, SimulationEvent } from "@ki-bundestag/types";
import { getTimingPreset, requireAdmin } from "../middleware/index.js";

const router = Router();

// Health check
router.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// GET /api/state
router.get("/api/state", (_req, res) => {
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
router.get("/api/simulation/status", (_req, res) => {
  const db = getDb();
  const metaRows = db.select().from(schema.simulationMeta).all();
  if (metaRows.length === 0) {
    res.json({ currentDay: 0, lastRunAt: null, budgetRetryDay: null, provisionalBudget: false });
    return;
  }
  const meta = metaRows[0];
  const stateRows = db.select().from(schema.nationalState).all();
  const stateRow = stateRows[0];
  // Fetch current + previous day summaries from day_summaries table
  const currentDaySummary = getSqlite().prepare(
    "SELECT narrative, mood, preview FROM day_summaries WHERE day_number = ?"
  ).get(meta.currentDay) as { narrative: string | null; mood: string | null; preview: string | null } | undefined;

  const previousDaySummary = meta.currentDay > 1
    ? getSqlite().prepare(
        "SELECT day_number, narrative, mood FROM day_summaries WHERE day_number = ?"
      ).get(meta.currentDay - 1) as { day_number: number; narrative: string | null; mood: string | null } | undefined
    : undefined;

  res.json({
    currentDay: meta.currentDay,
    lastRunAt: meta.lastRunAt,
    dayStartedAt: (meta as any).dayStartedAt ?? null,
    heartbeatAt: (meta as any).heartbeatAt ?? null,
    dayProgress: (meta as any).dayProgress ?? 0,
    nextElectionDay: meta.nextElectionDay,
    budgetRetryDay: (meta as any).budgetRetryDay ?? null,
    provisionalBudget: (stateRow as any)?.provisionalBudget ?? false,
    dailySummary: (meta as any).dailySummary ?? null,
    timingPreset: (meta as any).timingPreset ?? "normal",
    contextDepth: (meta as any).contextDepth ?? "normal",
    startDate: (meta as any).startDate ?? null,
    dayPreview: currentDaySummary?.preview ?? null,
    previousDaySummary: previousDaySummary?.narrative ? {
      dayNumber: previousDaySummary.day_number,
      narrative: previousDaySummary.narrative,
      mood: previousDaySummary.mood,
    } : null,
  });
});

// GET /api/simulation/preset
router.get("/api/simulation/preset", (_req, res) => {
  const preset = getTimingPreset();
  const participatory = isParticipatoryPreset(preset);
  const features = FEATURE_AVAILABILITY[preset] ?? {};
  const labels: Record<TimingPreset, string> = { "ultra-fast": "Ultra-Fast", fast: "Fast", normal: "Normal", slow: "Slow" };
  res.json({ preset, participatory, features, label: labels[preset] });
});

// GET /api/simulation/context-depth
router.get("/api/simulation/context-depth", (_req, res) => {
  const db = getDb();
  const meta = db.select().from(schema.simulationMeta).limit(1).all()[0];
  const raw = ((meta as any)?.contextDepth ?? "normal") as string;
  const depth: ContextDepth = isValidContextDepth(raw) ? raw : "normal";
  const config = DEPTH_CONFIGS[depth];
  const labels: Record<ContextDepth, string> = { low: "Low", normal: "Normal", high: "High" };
  res.json({ contextDepth: depth, label: labels[depth], config });
});

// GET /api/simulation/days
router.get("/api/simulation/days", (_req, res) => {
  const db = getDb();
  const rows = db.select().from(schema.simulationEvents).all();

  // Group by day
  const dayMap = new Map<number, { dayNumber: number; eventCount: number; summary: string; simulatedAt: string | null; narrative: string | null; mood: string | null; preview: string | null }>();
  for (const row of rows) {
    if (!dayMap.has(row.dayNumber)) {
      dayMap.set(row.dayNumber, { dayNumber: row.dayNumber, eventCount: 0, summary: "", simulatedAt: row.createdAt ?? null, narrative: null, mood: null, preview: null });
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

  // Enrich with day_summaries narratives
  const summaryRows = getSqlite().prepare(
    "SELECT day_number, narrative, mood, preview FROM day_summaries"
  ).all() as { day_number: number; narrative: string | null; mood: string | null; preview: string | null }[];
  for (const sr of summaryRows) {
    const day = dayMap.get(sr.day_number);
    if (day) {
      day.narrative = sr.narrative;
      day.mood = sr.mood;
      day.preview = sr.preview;
    }
  }

  const days = Array.from(dayMap.values()).sort((a, b) => a.dayNumber - b.dayNumber);
  res.json(days);
});

// GET /api/simulation/days/:dayNumber
router.get("/api/simulation/days/:dayNumber", (req, res) => {
  const db = getDb();
  const dayNumber = parseInt(req.params.dayNumber, 10);
  const events = db.select().from(schema.simulationEvents).all() as unknown as SimulationEvent[];
  const dayEvents = events.filter(e => e.dayNumber === dayNumber);
  res.json(dayEvents);
});

// GET /api/calendar — events grouped by day with real calendar dates
router.get("/api/calendar", (req, res) => {
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

  // Load day_summaries for the date range
  const summaryRows = getSqlite().prepare(
    "SELECT day_number, narrative, mood, preview FROM day_summaries WHERE day_number >= ? AND day_number <= ?"
  ).all(minDay, maxDay) as { day_number: number; narrative: string | null; mood: string | null; preview: string | null }[];
  const summaryMap = new Map(summaryRows.map(r => [r.day_number, r]));

  // Build response: top 3 important events per day + count + narrative
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

    const summary = summaryMap.get(dayNumber);

    return {
      dayNumber, date, topEvents, totalCount: sorted.length,
      narrative: summary?.narrative ?? null,
      mood: summary?.mood ?? null,
      preview: summary?.preview ?? null,
    };
  }).filter(d => d.totalCount > 0).sort((a, b) => a.dayNumber - b.dayNumber);

  res.json({
    startDate: startDate.toISOString(),
    currentDay,
    days,
  });
});

// GET /api/calendar/upcoming — future scheduled events computed from cycle math + DB state
router.get("/api/calendar/upcoming", (_req, res) => {
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
router.get("/api/simulation/events", (req, res) => {
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

// POST /api/simulate/inject
router.post("/api/simulate/inject", requireAdmin, (req, res) => {
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
router.get("/api/simulate/injections", requireAdmin, (_req, res) => {
  const db = getDb();
  const rows = db.select().from(schema.pendingInjections).all();
  res.json(rows.map(r => ({
    id: r.id,
    type: r.type,
    data: r.data,
    consumed: r.consumed,
  })));
});

// GET /api/simulation/queue
router.get("/api/simulation/queue", requireAdmin, (_req, res) => {
  const events = getQueuedEvents();
  res.json(events);
});

// GET /api/simulation/events/latest (A9)
router.get("/api/simulation/events/latest", (req, res) => {
  const since = req.query.since as string | undefined;
  const simRaw = getSqlite();

  if (since) {
    // Get events newer than the given event id, ordered newest first, limit 5
    const rows = simRaw.prepare(
      `SELECT e.id, e.day_number, e.type, e.actor, e.title, e.description, e.data
       FROM simulation_events e
       WHERE e.rowid > (SELECT rowid FROM simulation_events WHERE id = ?)
       ORDER BY e.rowid DESC
       LIMIT 5`
    ).all(since) as { id: string; day_number: number; type: string; actor: string; title: string; description: string; data: string | null }[];

    const events = rows.map(r => ({
      id: r.id,
      dayNumber: r.day_number,
      type: r.type,
      actor: r.actor,
      title: r.title,
      description: r.description,
      data: r.data ? JSON.parse(r.data) : undefined,
    }));
    res.json(events);
  } else {
    // Return latest 5 events
    const rows = simRaw.prepare(
      `SELECT id, day_number, type, actor, title, description, data
       FROM simulation_events
       ORDER BY rowid DESC
       LIMIT 5`
    ).all() as { id: string; day_number: number; type: string; actor: string; title: string; description: string; data: string | null }[];

    const events = rows.map(r => ({
      id: r.id,
      dayNumber: r.day_number,
      type: r.type,
      actor: r.actor,
      title: r.title,
      description: r.description,
      data: r.data ? JSON.parse(r.data) : undefined,
    }));
    res.json(events);
  }
});

// GET /api/simulation/costs — public AI cost summary
router.get("/api/simulation/costs", (_req, res) => {
  try {
    const overview = getCostOverview();
    const byDay = getCostByDay();
    const byTask = getCostByTask();
    const byModel = getCostByModel();
    res.json({ overview, byDay, byTask, byModel });
  } catch {
    res.json({ overview: null, byDay: [], byTask: [], byModel: [] });
  }
});

export default router;
