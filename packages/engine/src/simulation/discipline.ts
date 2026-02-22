/**
 * Party discipline — progressive review system.
 *
 * Runs every 7 sim days. Per party: load active human seats,
 * gather recent voting behavior, calculate disloyalty score,
 * apply deterministic escalation/de-escalation, use AI for reasoning text.
 *
 * Levels: 0 (good) → 1 (warning) → 2 (restricted) → 3 (whipped) → expel
 */

import { and, eq, gte } from "drizzle-orm";
import { getDb, getUserDb, schema } from "../db/index.js";
import { callAI, AIProviderLimitError } from "../agent/client.js";
import { createNotification } from "./event-queue.js";

const LEVEL_LABELS = ["Gut", "Verwarnung", "Eingeschränkt", "Fraktionszwang"];

/**
 * Review party discipline for all active human MdBs.
 * Deterministic scoring + AI reasoning text.
 */
export async function reviewPartyDiscipline(currentDay: number): Promise<void> {
  const db = getDb();
  const userDb = getUserDb();

  const allParties = db.select().from(schema.parties).all();

  for (const party of allParties) {
    // Active human seats with assigned users
    const humanSeats = db.select().from(schema.bundestagSeats)
      .where(and(
        eq(schema.bundestagSeats.partyId, party.id as string),
        eq(schema.bundestagSeats.controller, "human"),
        eq(schema.bundestagSeats.active, true),
      ))
      .all()
      .filter(s => s.userId);

    if (humanSeats.length === 0) continue;

    // Bills voted on in the last 7 days (passed or rejected)
    const recentBills = db.select().from(schema.bills)
      .where(gte(schema.bills.statusChangedOnDay, currentDay - 7))
      .all()
      .filter(b => b.status === "passed" || b.status === "rejected" || b.status === "struck_down");

    // Build party vote map: billId → party's AI vote
    const partyVoteMap = new Map<string, string>();
    for (const bill of recentBills) {
      const votes = (bill.votes as unknown as Array<{ partyId: string; vote: string }>) ?? [];
      const partyVote = votes.find(v => v.partyId === party.id);
      if (partyVote) {
        partyVoteMap.set(bill.id as string, partyVote.vote);
      }
    }

    // Calculate disloyalty per seat
    const flaggedMembers: Array<{
      seat: typeof humanSeats[0];
      disloyaltyScore: number;
      votesAgainst: number;
      totalVotes: number;
    }> = [];

    const recentBillIds = recentBills.map(b => b.id as string);

    for (const seat of humanSeats) {
      // User's MdB votes on recent bills
      let userVotes: Array<{ billId: string; vote: string }> = [];
      try {
        userVotes = userDb.select().from(schema.mdbVotes)
          .where(eq(schema.mdbVotes.userId, seat.userId!))
          .all()
          .filter(v => recentBillIds.includes(v.billId));
      } catch { /* table may not exist */ }

      let votesAgainst = 0;
      for (const uv of userVotes) {
        const partyLine = partyVoteMap.get(uv.billId);
        if (partyLine && uv.vote !== partyLine) {
          votesAgainst++;
        }
      }

      // Disloyalty score: votesAgainst * 2
      // (speeches and actions deferred to v2 for content analysis)
      const disloyaltyScore = votesAgainst * 2;

      flaggedMembers.push({
        seat,
        disloyaltyScore,
        votesAgainst,
        totalVotes: userVotes.length,
      });
    }

    // Determine level changes (deterministic thresholds)
    const membersToUpdate: Array<{
      seat: typeof humanSeats[0];
      newLevel: number;
      disloyaltyScore: number;
      votesAgainst: number;
    }> = [];

    for (const m of flaggedMembers) {
      const currentLevel = m.seat.disciplineLevel;
      let newLevel = currentLevel;

      if (m.disloyaltyScore >= 6) {
        // Severe: >3 opposing votes → escalate by 2
        newLevel = Math.min(currentLevel + 2, 4); // 4 = expel
      } else if (m.disloyaltyScore >= 4) {
        // Moderate: 2-3 opposing votes → escalate by 1
        newLevel = Math.min(currentLevel + 1, 4);
      } else if (m.disloyaltyScore === 0 && m.totalVotes > 0) {
        // Loyal with activity → de-escalate by 1
        newLevel = Math.max(currentLevel - 1, 0);
      }
      // disloyaltyScore 1-3 (1 opposing vote): maintain current level

      if (newLevel !== currentLevel) {
        membersToUpdate.push({
          seat: m.seat,
          newLevel,
          disloyaltyScore: m.disloyaltyScore,
          votesAgainst: m.votesAgainst,
        });
      }
    }

    if (membersToUpdate.length === 0) continue;

    // AI call for reasoning text (1 call per party, batch all updates)
    let reasonings: Record<string, string> = {};
    try {
      const memberSummaries = membersToUpdate.map(m => {
        const user = userDb.select().from(schema.users)
          .where(eq(schema.users.id, m.seat.userId!)).get();
        const name = user?.displayName ?? "MdB";
        const direction = m.newLevel > m.seat.disciplineLevel ? "Verschärfung" : "Verbesserung";
        return `- ${name} (${m.seat.userId}): ${m.votesAgainst} Gegenstimmen, Stufe ${m.seat.disciplineLevel}→${m.newLevel} (${direction})`;
      }).join("\n");

      const raw = await callAI({
        system: `Du bist die Fraktionsführung der ${party.name}. Gib kurze Begründungen für Disziplinarentscheidungen über Fraktionsmitglieder im Bundestag. Antworte NUR mit validem JSON: {"reasonings": {"<userId>": "<1-2 Sätze Begründung auf Deutsch>"}}`,
        prompt: `Fraktionsdisziplin-Überprüfung:\n${memberSummaries}\n\nStufen: 0=Gut, 1=Verwarnung, 2=Eingeschränkt (kein Rederecht-Priorität), 3=Fraktionszwang (Stimmabgabe wird erzwungen), 4=Ausschluss.\n\nBegründe jede Änderung.`,
        maxTokens: 512,
        partyId: party.id as string,
      });

      try {
        const parsed = JSON.parse(raw) as { reasonings: Record<string, string> };
        if (parsed.reasonings && typeof parsed.reasonings === "object") {
          reasonings = parsed.reasonings;
        }
      } catch { /* use defaults */ }
    } catch (err) {
      if (err instanceof AIProviderLimitError) {
        console.warn(`  [Discipline] Skipped AI reasoning for ${party.name} (${(err as Error).message})`);
      } else {
        console.error(`  [Discipline] AI reasoning error for ${party.name}:`, err);
      }
    }

    // Apply updates
    for (const m of membersToUpdate) {
      const defaultReason = m.newLevel > m.seat.disciplineLevel
        ? `${m.votesAgainst} Abstimmungen gegen die Parteilinie in den letzten 7 Tagen.`
        : "Loyales Abstimmungsverhalten in den letzten 7 Tagen.";
      const reasoning = reasonings[m.seat.userId!] ?? defaultReason;

      if (m.newLevel >= 4) {
        // Expel: deactivate seat, revert to AI control
        db.update(schema.bundestagSeats)
          .set({
            active: false,
            disciplineLevel: 3,
            disciplineReason: `Ausgeschlossen: ${reasoning}`,
            controller: "ai",
            userId: null,
          })
          .where(eq(schema.bundestagSeats.id, m.seat.id))
          .run();

        createNotification(
          m.seat.userId!,
          "mdb_expelled",
          `Fraktionsausschluss — ${party.name}`,
          `Sie wurden aus der ${party.name}-Fraktion ausgeschlossen und verlieren Ihren Bundestag-Sitz. ${reasoning}`,
          { seatId: m.seat.id, partyId: party.id },
          currentDay,
        );

        console.log(`  [Discipline] ${m.seat.userId} EXPELLED from ${party.name}`);
      } else {
        db.update(schema.bundestagSeats)
          .set({
            disciplineLevel: m.newLevel,
            disciplineReason: reasoning,
          })
          .where(eq(schema.bundestagSeats.id, m.seat.id))
          .run();

        const direction = m.newLevel > m.seat.disciplineLevel ? "escalated" : "de-escalated";
        const notifTitle = m.newLevel > m.seat.disciplineLevel
          ? `Fraktionsdisziplin: ${LEVEL_LABELS[m.newLevel]}`
          : `Fraktionsdisziplin verbessert: ${LEVEL_LABELS[m.newLevel]}`;

        const recoveryHint = m.newLevel > 0
          ? " Stimmen Sie im Einklang mit der Parteilinie ab, um Ihre Disziplinstufe zu verbessern."
          : "";

        createNotification(
          m.seat.userId!,
          "mdb_discipline",
          notifTitle,
          `${reasoning}${recoveryHint}`,
          { seatId: m.seat.id, partyId: party.id, level: m.newLevel, previousLevel: m.seat.disciplineLevel },
          currentDay,
        );

        console.log(`  [Discipline] ${m.seat.userId} ${direction} to level ${m.newLevel} in ${party.name}`);
      }
    }
  }
}
