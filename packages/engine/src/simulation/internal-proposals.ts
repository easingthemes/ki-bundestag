import { randomUUID } from "crypto";
import { eq, and, lte, gte } from "drizzle-orm";
import { parseAIJson, logAICall } from "../agent/ai-json.js";
import { submitBatch, type BatchResult } from "../agent/batch-client.js";
import { buildProposalRankPrompt, type ProposalItem, type PartyContext } from "../agent/group-prompts.js";
import { getDb, getUserDb, schema } from "../db/index.js";
import { createNotification } from "./event-queue.js";
import { PROPOSAL_INPUT_CAP_PER_PARTY } from "../config/index.js";

/** Max proposals a party can accept per review cycle in batch mode. */
const MAX_ACCEPT_PER_PARTY = 2;

/**
 * Review internal party proposals each sim day.
 *
 * Sends ALL ready proposals per party in one batch prompt,
 * asking AI to rank and select the top N. Remaining are declined.
 *
 * Expired proposals (past reviewByDay, < 3 votes) are always marked "expired".
 */
export async function reviewInternalProposals(currentDay: number): Promise<void> {
  const db = getDb();
  const userDb = getUserDb();

  // First: expire proposals past their review day with < 3 votes
  const overdueOpen = userDb.select().from(schema.internalProposals)
    .where(and(
      eq(schema.internalProposals.status, "open"),
      lte(schema.internalProposals.reviewByDay, currentDay),
    ))
    .all()
    .filter(p => p.totalVotes < 3);

  for (const p of overdueOpen) {
    userDb.update(schema.internalProposals)
      .set({ status: "expired", reviewedOnDay: currentDay })
      .where(eq(schema.internalProposals.id, p.id))
      .run();

    if (p.proposedBy !== "ai") {
      try {
        createNotification(
          p.proposedBy,
          "proposal_expired",
          `Proposal expired: "${p.title}"`,
          `Your proposal "${p.title}" expired — it didn't receive enough votes before the review deadline.`,
          { proposalId: p.id, partyId: p.partyId },
          currentDay,
        );
      } catch {}
    }
  }

  // Find all parties with ready proposals
  const allParties = db.select().from(schema.parties).all();

  interface PartyBatch {
    party: PartyContext;
    proposals: Array<typeof readyProposals[0]>;
  }
  // Type reference
  const readyProposals = userDb.select().from(schema.internalProposals).all();
  void readyProposals;

  const partyBatches: PartyBatch[] = [];

  for (const party of allParties) {
    const proposals = userDb.select().from(schema.internalProposals)
      .where(and(
        eq(schema.internalProposals.partyId, party.id as string),
        eq(schema.internalProposals.status, "open"),
        lte(schema.internalProposals.reviewByDay, currentDay),
        gte(schema.internalProposals.totalVotes, 3),
      ))
      .all()
      .sort((a, b) => b.voteScore - a.voteScore)
      .slice(0, PROPOSAL_INPUT_CAP_PER_PARTY);

    if (proposals.length === 0) continue;

    const partyCtx: PartyContext = { id: party.id as string, name: party.name, ideology: party.ideology ?? "" };
    partyBatches.push({ party: partyCtx, proposals });
  }

  if (partyBatches.length === 0) return;

  await reviewProposalsBatch(partyBatches, currentDay);
}

/**
 * Batch mode: rank-and-select prompts for all parties.
 */
async function reviewProposalsBatch(
  partyBatches: Array<{ party: PartyContext; proposals: any[] }>,
  currentDay: number,
): Promise<void> {
  const db = getDb();
  const userDb = getUserDb();

  const batchRequests = partyBatches.map(b => {
    const items: ProposalItem[] = b.proposals.map(p => ({
      id: p.id,
      title: p.title,
      description: p.description,
      category: p.category,
      voteScore: p.voteScore,
      totalVotes: p.totalVotes,
      proposerName: p.proposerName ?? "Unknown",
    }));
    return {
      req: buildProposalRankPrompt(b.party, items, MAX_ACCEPT_PER_PARTY, currentDay),
      batch: b,
    };
  });

  const t0 = Date.now();
  const results = await submitBatch(batchRequests.map(r => r.req));
  logAICall({ task: "proposals-batch", latencyMs: Date.now() - t0, parseOk: true, validationOk: true });

  for (const { req, batch } of batchRequests) {
    const result = results.find(r => r.customId === req.customId);
    if (!result || !result.text) {
      console.warn(`  [InternalProposals] No result for ${batch.party.name}, skipping`);
      continue;
    }

    const parsed = parseAIJson<{ accepted: Array<{ id: string; reason: string }>; declineReason: string }>(
      result.text,
      (v: unknown) => {
        const o = v as Record<string, unknown>;
        if (!Array.isArray(o.accepted)) return null;
        const accepted = (o.accepted as unknown[]).filter((a: unknown) => {
          const item = a as Record<string, unknown>;
          return typeof item.id === "string" && typeof item.reason === "string";
        }) as Array<{ id: string; reason: string }>;
        const declineReason = typeof o.declineReason === "string" ? o.declineReason : "Does not align with current party priorities.";
        return { accepted, declineReason };
      },
      "ProposalRank",
    );

    if (!parsed) {
      console.warn(`  [InternalProposals] Parse failed for ${batch.party.name}, skipping`);
      continue;
    }

    const acceptedIds = new Set(parsed.accepted.map(a => a.id));
    const proposalMap = new Map(batch.proposals.map(p => [p.id, p]));

    // Accept selected proposals
    for (const selection of parsed.accepted) {
      const proposal = proposalMap.get(selection.id);
      if (!proposal) continue;

      const billId = `bill-${randomUUID().slice(0, 8)}`;
      db.insert(schema.bills).values({
        id: billId,
        title: proposal.title,
        description: proposal.description,
        category: proposal.category,
        proposedBy: batch.party.id,
        status: "proposed",
        impact: { budget: 0, unemployment: 0, inflation: 0, gdpGrowth: 0, publicSentiment: 0 },
        votes: [],
        proposedOnDay: currentDay,
        memberInitiative: true,
        proposerDisplayName: proposal.proposerName,
      }).run();

      userDb.update(schema.internalProposals).set({
        status: "accepted",
        reviewedOnDay: currentDay,
        bundestag_bill_id: billId,
      }).where(eq(schema.internalProposals.id, proposal.id)).run();

      db.insert(schema.simulationEvents).values({
        id: `evt-${randomUUID().slice(0, 8)}`,
        type: "member_proposal_accepted",
        title: `${batch.party.name}: Mitgliederinitiative "${proposal.title}" im Bundestag eingereicht`,
        description: `Mitgliedervorschlag angenommen von ${batch.party.name}: "${proposal.title}". ${selection.reason}`,
        dayNumber: currentDay,
        actor: batch.party.id,
      }).run();

      if (proposal.proposedBy !== "ai") {
        try {
          createNotification(
            proposal.proposedBy,
            "proposal_accepted",
            `Proposal accepted: "${proposal.title}"`,
            `${batch.party.name} has accepted your proposal "${proposal.title}" and submitted it to the Bundestag as Bill ${billId}.`,
            { proposalId: proposal.id, billId, partyId: batch.party.id },
            currentDay,
          );
        } catch {}
      }
    }

    // Decline non-selected proposals
    for (const proposal of batch.proposals) {
      if (acceptedIds.has(proposal.id)) continue;

      userDb.update(schema.internalProposals).set({
        status: "declined",
        reviewedOnDay: currentDay,
        declineReason: parsed.declineReason,
      }).where(eq(schema.internalProposals.id, proposal.id)).run();

      db.insert(schema.simulationEvents).values({
        id: `evt-${randomUUID().slice(0, 8)}`,
        type: "member_proposal_declined",
        title: `${batch.party.name}: Mitgliedervorschlag "${proposal.title}" abgelehnt`,
        description: `${batch.party.name} Parteiführung hat abgelehnt zu unterstützen: "${proposal.title}". ${parsed.declineReason}`,
        dayNumber: currentDay,
        actor: batch.party.id,
      }).run();

      if (proposal.proposedBy !== "ai") {
        try {
          createNotification(
            proposal.proposedBy,
            "proposal_declined",
            `Proposal declined: "${proposal.title}"`,
            `${batch.party.name} declined your proposal "${proposal.title}". Reason: ${parsed.declineReason}`,
            { proposalId: proposal.id, partyId: batch.party.id },
            currentDay,
          );
        } catch {}
      }
    }
  }
}
