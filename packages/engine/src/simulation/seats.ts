/**
 * MdB seat system — allocation, reset, and query helpers.
 *
 * `bundestag_seats` lives in simulation.db (engine reads during voting).
 * Seat split ratio is preset-configurable via timing.ts.
 */

import { randomUUID } from "node:crypto";
import { eq, and } from "drizzle-orm";
import { getDb, getSqlite, getUserDb, getUserSqlite, schema } from "../db/index.js";
import { callAI, AIProviderLimitError } from "../agent/client.js";
import { createNotification } from "./event-queue.js";
import { getHumanSeatRatio, type TimingPreset } from "./timing.js";

/**
 * Allocate seats for a party after an election.
 * Creates `seatCount` rows: a percentage as human-available (controller="human", userId=null),
 * the rest as AI-controlled.
 */
export function allocateSeats(
  partyId: string,
  seatCount: number,
  electionId: string,
  currentDay: number,
  preset: TimingPreset,
): void {
  const db = getDb();
  const humanRatio = getHumanSeatRatio(preset);
  const humanCount = Math.round(seatCount * humanRatio);
  const aiCount = seatCount - humanCount;

  let seatNumber = 1;

  // Human-available seats (no userId yet — filled via applications)
  for (let i = 0; i < humanCount; i++) {
    db.insert(schema.bundestagSeats).values({
      id: randomUUID(),
      seatNumber: seatNumber++,
      partyId,
      controller: "human",
      userId: null,
      electionId,
      active: true,
      proxyDefault: "party_line",
      disciplineLevel: 0,
      disciplineReason: null,
      allocatedOnDay: currentDay,
    }).run();
  }

  // AI-controlled seats
  for (let i = 0; i < aiCount; i++) {
    db.insert(schema.bundestagSeats).values({
      id: randomUUID(),
      seatNumber: seatNumber++,
      partyId,
      controller: "ai",
      userId: null,
      electionId,
      active: true,
      proxyDefault: "party_line",
      disciplineLevel: 0,
      disciplineReason: null,
      allocatedOnDay: currentDay,
    }).run();
  }

  console.log(`  [Seats] ${partyId}: ${seatCount} seats (${humanCount} human, ${aiCount} AI)`);
}

/**
 * Deactivate all seats from the previous term.
 * Called before allocating new seats after an election.
 */
export function resetAllSeats(): void {
  const sqlite = getSqlite();
  sqlite.prepare("UPDATE bundestag_seats SET active = 0").run();
  console.log("  [Seats] All previous seats deactivated");
}

/**
 * Get all active seats, optionally filtered by party.
 */
export function getActiveSeats(partyId?: string) {
  const db = getDb();
  if (partyId) {
    return db.select()
      .from(schema.bundestagSeats)
      .where(and(eq(schema.bundestagSeats.active, true), eq(schema.bundestagSeats.partyId, partyId)))
      .all();
  }
  return db.select()
    .from(schema.bundestagSeats)
    .where(eq(schema.bundestagSeats.active, true))
    .all();
}

/**
 * Get a user's current active seat (if any).
 */
export function getUserSeat(userId: string) {
  const db = getDb();
  return db.select()
    .from(schema.bundestagSeats)
    .where(and(eq(schema.bundestagSeats.active, true), eq(schema.bundestagSeats.userId, userId)))
    .get() ?? null;
}

/**
 * Get counts of open (unoccupied human) seats per party.
 */
export function getOpenSeatCounts(): Record<string, number> {
  const sqlite = getSqlite();
  const rows = sqlite.prepare(
    "SELECT party_id, COUNT(*) as cnt FROM bundestag_seats WHERE active = 1 AND controller = 'human' AND user_id IS NULL GROUP BY party_id"
  ).all() as Array<{ party_id: string; cnt: number }>;
  const result: Record<string, number> = {};
  for (const row of rows) {
    result[row.party_id] = row.cnt;
  }
  return result;
}

/**
 * Deactivate a user's active seat (e.g. when leaving party or being expelled).
 * Returns true if a seat was deactivated.
 */
export function deactivateUserSeat(userId: string): boolean {
  const sqlite = getSqlite();
  const result = sqlite.prepare(
    "UPDATE bundestag_seats SET active = 0, user_id = NULL WHERE active = 1 AND user_id = ?"
  ).run(userId);
  return result.changes > 0;
}

/**
 * Review pending MdB applications each sim day.
 * Per party: find pending applications, skip if no open human seats.
 * Calculate priority score, send top applicants to AI for evaluation.
 * Max 3 applications per party per day to limit API calls.
 */
export async function reviewMdbApplications(currentDay: number): Promise<void> {
  const db = getDb();
  const userDb = getUserDb();
  const userSqlite = getUserSqlite();

  const allParties = db.select().from(schema.parties).all();
  const openCounts = getOpenSeatCounts();

  for (const party of allParties) {
    const partyId = party.id as string;
    const openSeats = openCounts[partyId] ?? 0;
    if (openSeats === 0) continue;

    // Find pending applications for this party
    const pending = userDb.select().from(schema.mdbApplications)
      .where(and(
        eq(schema.mdbApplications.partyId, partyId),
        eq(schema.mdbApplications.status, "pending"),
      ))
      .all();

    if (pending.length === 0) continue;

    // Calculate priority score for each application
    const scored = pending.map(app => {
      // Activity score: questions asked, proposals made, signals given
      const questionCount = userSqlite.prepare(
        "SELECT COUNT(*) as cnt FROM question_votes WHERE user_id = ?"
      ).get(app.userId) as { cnt: number };
      const proposalCount = userSqlite.prepare(
        "SELECT COUNT(*) as cnt FROM internal_proposals WHERE proposed_by = ?"
      ).get(app.userId) as { cnt: number };
      const signalCount = userSqlite.prepare(
        "SELECT COUNT(*) as cnt FROM member_signals WHERE user_id = ?"
      ).get(app.userId) as { cnt: number };

      const activityScore = Math.min(5, (questionCount.cnt * 0.5) + (proposalCount.cnt * 1) + (signalCount.cnt * 0.3));

      // Cooldown bonus: hasn't held a seat recently
      const cooldownBonus = (app.cooldownUntilDay == null || currentDay >= app.cooldownUntilDay) ? 1 : 0;

      // Lottery component for fairness
      const lottery = Math.random();

      const score = activityScore + cooldownBonus + lottery;
      return { app, score };
    });

    // Sort by score descending, take top N (min of open seats and 3 per day)
    scored.sort((a, b) => b.score - a.score);
    const toReview = scored.slice(0, Math.min(openSeats, 3));

    for (const { app, score } of toReview) {
      // Update priority score
      userDb.update(schema.mdbApplications)
        .set({ priorityScore: Math.round(score * 100) / 100 })
        .where(eq(schema.mdbApplications.id, app.id))
        .run();

      // Get user display name
      const user = userDb.select().from(schema.users)
        .where(eq(schema.users.id, app.userId))
        .get();
      const displayName = user?.displayName ?? "Unknown";

      try {
        const raw = await callAI({
          system: `You are the party leadership of ${party.name} (ideology: ${(party as any).ideology}). A citizen is applying for a Bundestag seat in your party.

Evaluate their application based on these criteria:
1. Ideological alignment: Does the application show understanding of and alignment with ${party.name}'s core positions?
2. Policy substance: Does the applicant articulate concrete policy goals (not just generic statements)?
3. Engagement: The applicant's activity score reflects their prior participation (questions, proposals, signals). Higher scores indicate more engaged members.

Be generous — this is a simulation. Approve applicants who show genuine interest in the party's direction, even if their application is brief. Only reject if the application is clearly off-topic, contradicts the party's core ideology, or shows no effort.

Respond with ONLY valid JSON: {"decision": "approve" | "reject", "reasoning": "<1–2 sentences explaining what was good or what was missing>"}`,
          prompt: `Applicant: ${displayName}\nApplication: "${app.applicationText}"${app.policyFocus ? `\nPolicy focus: ${JSON.stringify(app.policyFocus)}` : ""}\nActivity score: ${score.toFixed(1)}/6\n\nShould ${party.name} grant this member a Bundestag seat?`,
          maxTokens: 256,
          partyId,
        });

        let decision: "approve" | "reject" = "reject";
        let reasoning = "Does not meet current requirements.";
        try {
          const parsed = JSON.parse(raw) as { decision: string; reasoning: string };
          if (parsed.decision === "approve" || parsed.decision === "reject") {
            decision = parsed.decision;
            reasoning = parsed.reasoning?.slice(0, 300) || reasoning;
          }
        } catch { /* keep defaults */ }

        if (decision === "approve") {
          // Find an open seat and assign it
          const openSeat = db.select().from(schema.bundestagSeats)
            .where(and(
              eq(schema.bundestagSeats.partyId, partyId),
              eq(schema.bundestagSeats.active, true),
              eq(schema.bundestagSeats.controller, "human"),
            ))
            .all()
            .find(s => s.userId === null);

          if (openSeat) {
            db.update(schema.bundestagSeats)
              .set({ userId: app.userId })
              .where(eq(schema.bundestagSeats.id, openSeat.id))
              .run();

            userDb.update(schema.mdbApplications).set({
              status: "approved",
              aiReasoning: reasoning,
              priorityScore: Math.round(score * 100) / 100,
              reviewedOnDay: currentDay,
            }).where(eq(schema.mdbApplications.id, app.id)).run();

            createNotification(
              app.userId,
              "mdb_approved",
              `MdB-Sitz genehmigt — ${party.name}`,
              `Ihre Bewerbung für einen Bundestag-Sitz bei ${party.name} wurde genehmigt! Sitz #${openSeat.seatNumber}. ${reasoning}`,
              { seatId: openSeat.id, partyId },
              currentDay,
            );

            console.log(`  [MdB] ${displayName} approved for ${partyId} seat #${openSeat.seatNumber}`);
          }
        } else {
          userDb.update(schema.mdbApplications).set({
            status: "rejected",
            aiReasoning: reasoning,
            priorityScore: Math.round(score * 100) / 100,
            reviewedOnDay: currentDay,
            cooldownUntilDay: currentDay + 7, // 7-day cooldown before re-applying
          }).where(eq(schema.mdbApplications.id, app.id)).run();

          createNotification(
            app.userId,
            "mdb_rejected",
            `MdB-Bewerbung abgelehnt — ${party.name}`,
            `Ihre Bewerbung wurde leider abgelehnt. ${reasoning}\n\nTipps für eine erfolgreiche Bewerbung:\n• Zeigen Sie Verständnis für die Positionen von ${party.name}\n• Nennen Sie konkrete politische Ziele\n• Steigern Sie Ihre Aktivität (Fragen, Vorschläge, Signale)\n\nSie können sich in 7 Tagen erneut bewerben.`,
            { partyId },
            currentDay,
          );

          console.log(`  [MdB] ${displayName} rejected for ${partyId}: ${reasoning}`);
        }
      } catch (err) {
        if (err instanceof AIProviderLimitError) {
          console.warn(`  [MdB] Skipped application review (${err.message})`);
          break;
        }
        console.error(`[MdB] Error reviewing application ${app.id}:`, err);
      }
    }
  }
}
