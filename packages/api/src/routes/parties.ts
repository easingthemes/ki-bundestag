import { Router } from "express";
import { randomUUID } from "crypto";
import { getDb, getUserDb, schema, logUserAction, logger } from "@ki-bundestag/engine";
import { eq, gte, asc, and, inArray } from "drizzle-orm";
import type { Bill, BillVote, PartyHistoryEntry, SimulationEvent } from "@ki-bundestag/types";
import { mapParty, getMemberCounts, mapBill, buildPartyLookup } from "../mappers/index.js";
import { getUserToken, requireParticipatory } from "../middleware/index.js";
import { checkUserDailyLimit, quotaSnapshot } from "../middleware/rate-limit.js";

const router = Router();

// ── mapProposal helper ──────────────────────────────────────────────────────

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

// ── GET /api/parties ────────────────────────────────────────────────────────

router.get("/api/parties", (_req, res) => {
  const db = getDb();
  const rows = db.select().from(schema.parties).all();

  // Fetch recent approval history for all parties — cover at least current sim month + 14 days
  const metaRow = db.select({ day: schema.simulationMeta.currentDay, startDate: schema.simulationMeta.startDate }).from(schema.simulationMeta).limit(1).all()[0];
  const currentDay = metaRow?.day ?? 0;
  const startDateStr = metaRow?.startDate as string | null;
  // Compute first sim day of current calendar month (or fallback to 30 days back)
  let monthStartDay = Math.max(0, currentDay - 30);
  if (startDateStr) {
    const startMs = new Date(startDateStr).getTime();
    const currentSimDate = new Date(startMs + currentDay * 86400000);
    const firstOfMonth = new Date(currentSimDate.getFullYear(), currentSimDate.getMonth(), 1);
    monthStartDay = Math.max(0, Math.floor((firstOfMonth.getTime() - startMs) / 86400000));
  }
  const minDay = Math.min(monthStartDay, Math.max(0, currentDay - 13));
  const histRows = db.select().from(schema.partyHistory)
    .where(gte(schema.partyHistory.dayNumber, minDay))
    .orderBy(asc(schema.partyHistory.dayNumber))
    .all();
  const histByParty = new Map<string, { day: number; approval: number }[]>();
  for (const row of histRows) {
    if (!histByParty.has(row.partyId)) histByParty.set(row.partyId, []);
    histByParty.get(row.partyId)!.push({ day: row.dayNumber, approval: Number(row.approvalRating) });
  }

  const memberCounts = getMemberCounts();
  const parties = rows.map(r => ({ ...mapParty(r, memberCounts.get(r.id) ?? 0), recentApprovals: histByParty.get(r.id) ?? [] }));
  res.json(parties);
});

// ── GET /api/parties/alignment ──────────────────────────────────────────────

router.get("/api/parties/alignment", (_req, res) => {
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

// ── GET /api/parties/:id ────────────────────────────────────────────────────

router.get("/api/parties/:id", (req, res) => {
  const db = getDb();
  const rows = db.select().from(schema.parties).where(eq(schema.parties.id, req.params.id)).all();
  if (rows.length === 0) {
    res.status(404).json({ error: "Party not found" });
    return;
  }
  const memberCounts = getMemberCounts();
  res.json(mapParty(rows[0], memberCounts.get(req.params.id) ?? 0));
});

// ── GET /api/parties/:id/history ────────────────────────────────────────────

router.get("/api/parties/:id/history", (req, res) => {
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

// ── GET /api/parties/:id/bills ──────────────────────────────────────────────

router.get("/api/parties/:id/bills", (req, res) => {
  const db = getDb();
  const rows = db.select().from(schema.bills)
    .where(eq(schema.bills.proposedBy, req.params.id))
    .all();
  const partiesMap = buildPartyLookup(db.select().from(schema.parties).all());
  res.json(rows.map(r => mapBill(r, partiesMap)));
});

// ── GET /api/parties/:id/votes ──────────────────────────────────────────────

router.get("/api/parties/:id/votes", (req, res) => {
  const db = getDb();
  const partyId = req.params.id;
  const allBills = db.select().from(schema.bills).all();
  const partiesMap = buildPartyLookup(db.select().from(schema.parties).all());
  const result: Array<{ bill: Bill; vote: BillVote }> = [];

  for (const row of allBills) {
    const bill = mapBill(row, partiesMap);
    const vote = bill.votes.find(v => v.partyId === partyId);
    if (vote) {
      result.push({ bill, vote });
    }
  }

  result.sort((a, b) => b.bill.proposedOnDay - a.bill.proposedOnDay);
  res.json(result);
});

// ── GET /api/parties/:id/statements ─────────────────────────────────────────

router.get("/api/parties/:id/statements", (req, res) => {
  const db = getDb();
  const partyId = req.params.id;
  const allEvents = db.select().from(schema.simulationEvents).all() as unknown as SimulationEvent[];
  const statements = allEvents.filter(
    e => e.actor === partyId && (e.type === "statement" || e.type === "election_campaign"),
  );
  statements.sort((a, b) => b.dayNumber - a.dayNumber);
  res.json(statements);
});

// ── GET /api/parties/:id/proposals ──────────────────────────────────────────

router.get("/api/parties/:id/proposals", (req, res) => {
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

// ── POST /api/parties/:id/proposals ─────────────────────────────────────────

router.post("/api/parties/:id/proposals", (req, res) => {
  if (requireParticipatory(req, res, "internal_proposals")) return;
  const token = getUserToken(req);
  if (!token) { res.status(401).json({ error: "Not authenticated" }); return; }

  const { allowed, limit, used } = checkUserDailyLimit(token, "submit_proposal");
  if (!allowed) { res.status(429).json({ error: `Daily limit reached (${used}/${limit} proposals). Try again later.` }); return; }

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
  try { logUserAction(token, "submit_proposal", currentDay, id, "proposal", { partyId: req.params.id, category }); } catch (err) { logger.error("[parties] Failed to log action:", err); }
  const row = userDb.select().from(schema.internalProposals).where(eq(schema.internalProposals.id, id)).all()[0];
  res.status(201).json({ ...mapProposal(row), quota: quotaSnapshot("submit_proposal", used, limit) });
});

// ── GET /api/proposals/:id ──────────────────────────────────────────────────

router.get("/api/proposals/:id", (req, res) => {
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

// ── POST /api/proposals/:id/vote ────────────────────────────────────────────

router.post("/api/proposals/:id/vote", (req, res) => {
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
  try { const db2 = getDb(); const md = db2.select({ day: schema.simulationMeta.currentDay }).from(schema.simulationMeta).limit(1).all()[0]; logUserAction(token, "vote_proposal", md?.day ?? 0, req.params.id, "proposal", { vote }); } catch (err) { logger.error("[parties] Failed to log action:", err); }
  const updated = userDb.select().from(schema.internalProposals).where(eq(schema.internalProposals.id, req.params.id)).all()[0];
  res.json(mapProposal(updated, vote as 1 | -1));
});

// ── DELETE /api/proposals/:id/vote ──────────────────────────────────────────

router.delete("/api/proposals/:id/vote", (req, res) => {
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

export default router;
