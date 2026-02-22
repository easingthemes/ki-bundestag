import { randomUUID } from "crypto";
import { eq, and, lte, gte } from "drizzle-orm";
import { callAI, AIProviderLimitError } from "../agent/client.js";
import { parseAIJson, logAICall } from "../agent/ai-json.js";
import { getDb, getUserDb, schema } from "../db/index.js";
import { createNotification } from "./event-queue.js";

/**
 * Review internal party proposals each sim day.
 * - Proposals ready for review: status="open", currentDay >= reviewByDay, totalVotes >= 3
 * - Take the top-scored ready proposal per party
 * - Ask Haiku whether to accept or decline
 * - Accepted → create a bill in the Bundestag pipeline (member_initiative=true)
 * - Declined → mark with decline_reason
 * - Expired proposals (past reviewByDay, < 3 votes) → mark "expired"
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

    // Notify proposer (if human)
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

  // Find all parties that have a ready proposal
  const allParties = db.select().from(schema.parties).all();

  for (const party of allParties) {
    const readyProposals = userDb.select().from(schema.internalProposals)
      .where(and(
        eq(schema.internalProposals.partyId, party.id as string),
        eq(schema.internalProposals.status, "open"),
        lte(schema.internalProposals.reviewByDay, currentDay),
        gte(schema.internalProposals.totalVotes, 3),
      ))
      .all()
      .sort((a, b) => b.voteScore - a.voteScore);

    if (readyProposals.length === 0) continue;

    const top = readyProposals[0];

    const t0 = Date.now();
    try {
      const { text: raw, model, provider } = await callAI({
        system: `You are the party leadership of ${party.name} (ideology: ${party.ideology}). A party member has submitted a bill proposal for your consideration. Decide whether to officially sponsor it. Respond with ONLY valid JSON: {"decision": "accept" | "decline", "reason": "<1 sentence>"}`,
        prompt: `Member proposal: "${top.title}" (${top.category})\n${top.description}\n\nVote score: ${top.voteScore >= 0 ? "+" : ""}${top.voteScore} (${top.totalVotes} votes)\n\nShould ${party.name} sponsor this bill in the Bundestag?`,
        maxTokens: 256,
        partyId: party.id as string,
      });
      const defaultReason = "Does not align with current party priorities.";
      const parsed = parseAIJson<{ decision: "accept" | "decline"; reason: string }>(
        raw,
        (v: unknown) => {
          const o = v as Record<string, unknown>;
          if (o.decision !== "accept" && o.decision !== "decline") return null;
          return { decision: o.decision, reason: typeof o.reason === "string" ? o.reason.slice(0, 200) : defaultReason };
        },
        "InternalProposals",
      );
      const decision = parsed?.decision ?? "decline";
      const reason = parsed?.reason ?? defaultReason;
      logAICall({ task: `proposals:${party.id}`, model, provider, latencyMs: Date.now() - t0, parseOk: parsed !== null, validationOk: parsed !== null, fallback: parsed ? undefined : "decline" });

      if (decision === "accept") {
        // Create bill in Bundestag pipeline
        const billId = `bill-${randomUUID().slice(0, 8)}`;
        db.insert(schema.bills).values({
          id: billId,
          title: top.title,
          description: top.description,
          category: top.category,
          proposedBy: party.id as string,
          status: "proposed",
          impact: { budget: 0, unemployment: 0, inflation: 0, gdpGrowth: 0, publicSentiment: 0 },
          votes: [],
          proposedOnDay: currentDay,
          memberInitiative: true,
          proposerDisplayName: top.proposerName,
        }).run();

        userDb.update(schema.internalProposals).set({
          status: "accepted",
          reviewedOnDay: currentDay,
          bundestag_bill_id: billId,
        }).where(eq(schema.internalProposals.id, top.id)).run();

        // Emit event
        db.insert(schema.simulationEvents).values({
          id: `evt-${randomUUID().slice(0, 8)}`,
          type: "member_proposal_accepted",
          title: `${party.name}: Member initiative "${top.title}" submitted to Bundestag`,
          description: `Party member proposal accepted by ${party.name}: "${top.title}". ${reason}`,
          dayNumber: currentDay,
          actor: party.id as string,
        }).run();

        // Notify proposer
        if (top.proposedBy !== "ai") {
          try {
            createNotification(
              top.proposedBy,
              "proposal_accepted",
              `Proposal accepted: "${top.title}"`,
              `${party.name} has accepted your proposal "${top.title}" and submitted it to the Bundestag as Bill ${billId}.`,
              { proposalId: top.id, billId, partyId: party.id },
              currentDay,
            );
          } catch {}
        }
      } else {
        userDb.update(schema.internalProposals).set({
          status: "declined",
          reviewedOnDay: currentDay,
          declineReason: reason,
        }).where(eq(schema.internalProposals.id, top.id)).run();

        db.insert(schema.simulationEvents).values({
          id: `evt-${randomUUID().slice(0, 8)}`,
          type: "member_proposal_declined",
          title: `${party.name}: Member proposal "${top.title}" declined`,
          description: `${party.name} leadership declined to sponsor "${top.title}". ${reason}`,
          dayNumber: currentDay,
          actor: party.id as string,
        }).run();

        // Notify proposer
        if (top.proposedBy !== "ai") {
          try {
            createNotification(
              top.proposedBy,
              "proposal_declined",
              `Proposal declined: "${top.title}"`,
              `${party.name} declined your proposal "${top.title}". Reason: ${reason}`,
              { proposalId: top.id, partyId: party.id },
              currentDay,
            );
          } catch {}
        }
      }
    } catch (err) {
      if (err instanceof AIProviderLimitError) {
        console.warn(`  [InternalProposals] Skipped (${err.message})`);
      } else {
        console.error(`[InternalProposals] Error reviewing proposal ${top.id}:`, err);
      }
      logAICall({ task: `proposals:${party.id}`, latencyMs: Date.now() - t0, parseOk: false, validationOk: false, fallback: "decline" });
      if (err instanceof AIProviderLimitError) break;
    }
  }
}
