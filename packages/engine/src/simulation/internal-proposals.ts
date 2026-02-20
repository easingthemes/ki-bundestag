import { randomUUID } from "crypto";
import { eq, and, lte, gte } from "drizzle-orm";
import { getClient, MODELS } from "../agent/client.js";
import { getDb, schema } from "../db/index.js";

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

  // First: expire proposals past their review day with < 3 votes
  const overdueOpen = db.select().from(schema.internalProposals)
    .where(and(
      eq(schema.internalProposals.status, "open"),
      lte(schema.internalProposals.reviewByDay, currentDay),
    ))
    .all()
    .filter(p => p.totalVotes < 3);

  for (const p of overdueOpen) {
    db.update(schema.internalProposals)
      .set({ status: "expired", reviewedOnDay: currentDay })
      .where(eq(schema.internalProposals.id, p.id))
      .run();
  }

  // Find all parties that have a ready proposal
  const allParties = db.select().from(schema.parties).all();
  const client = getClient();

  for (const party of allParties) {
    const readyProposals = db.select().from(schema.internalProposals)
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

    try {
      const response = await client.messages.create({
        model: MODELS.daily,
        max_tokens: 256,
        system: `You are the party leadership of ${party.name} (ideology: ${party.ideology}). A party member has submitted a bill proposal for your consideration. Decide whether to officially sponsor it. Respond with ONLY valid JSON: {"decision": "accept" | "decline", "reason": "<1 sentence>"}`,
        messages: [{
          role: "user",
          content: `Member proposal: "${top.title}" (${top.category})\n${top.description}\n\nVote score: ${top.voteScore >= 0 ? "+" : ""}${top.voteScore} (${top.totalVotes} votes)\n\nShould ${party.name} sponsor this bill in the Bundestag?`,
        }],
      });

      const raw = response.content[0].type === "text" ? response.content[0].text : "";
      let decision: "accept" | "decline" = "decline";
      let reason = "Does not align with current party priorities.";
      try {
        const parsed = JSON.parse(raw) as { decision: string; reason: string };
        if (parsed.decision === "accept" || parsed.decision === "decline") {
          decision = parsed.decision;
          reason = parsed.reason?.slice(0, 200) || reason;
        }
      } catch { /* keep defaults */ }

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

        db.update(schema.internalProposals).set({
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
      } else {
        db.update(schema.internalProposals).set({
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
      }
    } catch (err) {
      console.error(`[InternalProposals] Error reviewing proposal ${top.id}:`, err);
    }
  }
}
