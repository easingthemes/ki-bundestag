import type { Party } from "@ki-bundestag/types";
import { eq } from "drizzle-orm";
import { callAI, AIProviderLimitError } from "../agent/client.js";
import { getDb, getUserDb, schema } from "../db/index.js";

const MAX_ANSWERS_PER_DAY = 3;
const QUESTION_EXPIRY_DAYS = 14;

/**
 * Answer pending citizen questions (max 3 per day) and expire old ones.
 */
export async function answerPendingQuestions(
  allParties: Party[],
  currentDay: number,
): Promise<void> {
  const db = getDb();

  // Expire old unanswered questions
  const allPending = db.select().from(schema.citizenQuestions)
    .where(eq(schema.citizenQuestions.status, "pending"))
    .all();

  for (const q of allPending) {
    if (currentDay - q.createdOnDay > QUESTION_EXPIRY_DAYS) {
      db.update(schema.citizenQuestions)
        .set({ status: "answered", response: "This question was not answered in time." })
        .where(eq(schema.citizenQuestions.id, q.id))
        .run();
    }
  }

  // Get pending questions sorted by vote score (highest first), then oldest
  const userDb = getUserDb();
  const allVotes = userDb.select().from(schema.questionVotes).all();
  const scoreMap: Record<string, number> = {};
  for (const v of allVotes) {
    scoreMap[v.questionId] = (scoreMap[v.questionId] ?? 0) + v.vote;
  }

  const pending = db.select().from(schema.citizenQuestions)
    .where(eq(schema.citizenQuestions.status, "pending"))
    .all()
    .sort((a, b) => (scoreMap[b.id] ?? 0) - (scoreMap[a.id] ?? 0) || a.createdOnDay - b.createdOnDay)
    .slice(0, MAX_ANSWERS_PER_DAY);

  if (pending.length === 0) return;

  for (const q of pending) {
    const party = allParties.find(p => p.id === q.targetPartyId);
    if (!party) continue;

    try {
      const text = await callAI({
        system: `You are the spokesperson for ${party.name}, a ${party.ideology} party in the German Bundestag. Answer the citizen's question in character, reflecting your party's values and positions. Keep your response to 2-3 sentences. Be direct and politically authentic.`,
        prompt: `A citizen asks ${party.name}: "${q.question}"`,
        maxTokens: 512,
        partyId: party.id,
      });

      db.update(schema.citizenQuestions)
        .set({
          status: "answered",
          response: text.trim(),
          respondedOnDay: currentDay,
        })
        .where(eq(schema.citizenQuestions.id, q.id))
        .run();

      console.log(`  [Questions] ${party.name} answered: "${q.question.substring(0, 50)}..."`);
    } catch (error) {
      if (error instanceof AIProviderLimitError) {
        console.warn(`  [Questions] Skipped (${error.message})`);
        break;
      }
      console.error(`  [Questions] Error answering question for ${party.name}:`, error);
    }
  }
}
