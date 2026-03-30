import type { Party } from "@ki-bundestag/types";
import { eq } from "drizzle-orm";
import { logAICall, parseAIJson } from "../agent/ai-json.js";
import { submitBatch, chunkItems, type BatchResult } from "../agent/batch-client.js";
import { buildQuestionBatchPrompt, preFilterQuestions, type QuestionItem, type PartyContext } from "../agent/group-prompts.js";
import { getDb, getUserDb, schema } from "../db/index.js";
import { createNotification } from "./event-queue.js";

const MAX_ANSWERS_PER_DAY = 50;
const QUESTION_EXPIRY_DAYS = 14;

/**
 * Answer pending citizen questions and expire old ones.
 *
 * Groups questions by target party and answers up to 50 per party
 * in a single batch AI call.
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

  // Get pending questions with vote scores
  const userDb = getUserDb();
  const allVotes = userDb.select().from(schema.questionVotes).all();
  const scoreMap: Record<string, number> = {};
  for (const v of allVotes) {
    scoreMap[v.questionId] = (scoreMap[v.questionId] ?? 0) + v.vote;
  }

  const pending = db.select().from(schema.citizenQuestions)
    .where(eq(schema.citizenQuestions.status, "pending"))
    .all()
    .sort((a, b) => (scoreMap[b.id] ?? 0) - (scoreMap[a.id] ?? 0) || a.createdOnDay - b.createdOnDay);

  if (pending.length === 0) return;

  await answerQuestionsBatch(pending, allParties, scoreMap, currentDay);
}

/**
 * Batch mode: group questions by target party, answer in bulk.
 */
async function answerQuestionsBatch(
  pending: Array<{ id: string; question: string; targetPartyId: string; createdOnDay: number; userId?: string | null }>,
  allParties: Party[],
  scoreMap: Record<string, number>,
  currentDay: number,
): Promise<void> {
  const db = getDb();

  // Group by target party
  const byParty = new Map<string, typeof pending>();
  for (const q of pending) {
    const partyQs = byParty.get(q.targetPartyId) ?? [];
    partyQs.push(q);
    byParty.set(q.targetPartyId, partyQs);
  }

  const batchRequests: Array<{
    req: ReturnType<typeof buildQuestionBatchPrompt>;
    partyId: string;
    questionIds: string[];
  }> = [];

  for (const [partyId, partyQuestions] of byParty) {
    const party = allParties.find(p => p.id === partyId);
    if (!party) continue;

    const partyCtx: PartyContext = { id: partyId, name: party.name, ideology: (party as any).ideology ?? "" };

    // Pre-filter and limit
    const items: QuestionItem[] = partyQuestions.map(q => ({
      id: q.id,
      question: q.question,
      voteScore: scoreMap[q.id] ?? 0,
    }));
    const filtered = preFilterQuestions(items, MAX_ANSWERS_PER_DAY);

    for (const chunk of chunkItems(filtered, 180, 160_000)) {
      const req = buildQuestionBatchPrompt(partyCtx, chunk, currentDay);
      batchRequests.push({ req, partyId, questionIds: chunk.map(q => q.id) });
    }
  }

  if (batchRequests.length === 0) return;

  const t0 = Date.now();
  const results = await submitBatch(batchRequests.map(b => b.req));
  logAICall({ task: "questions-batch", latencyMs: Date.now() - t0, parseOk: true, validationOk: true });

  // Process results
  const questionMap = new Map(pending.map(q => [q.id, q]));

  for (const { req, partyId } of batchRequests) {
    const result = results.find(r => r.customId === req.customId);
    if (!result || !result.text) continue;

    const parsed = parseAIJson<{ answers: Array<{ id: string; answer: string }> }>(
      result.text,
      (v: unknown) => {
        const o = v as Record<string, unknown>;
        if (!Array.isArray(o.answers)) return null;
        const answers = (o.answers as unknown[]).filter((a: unknown) => {
          const item = a as Record<string, unknown>;
          return typeof item.id === "string" && typeof item.answer === "string";
        }) as Array<{ id: string; answer: string }>;
        return { answers };
      },
      "QuestionBatch",
    );

    if (!parsed) continue;

    const party = allParties.find(p => p.id === partyId);

    for (const { id, answer } of parsed.answers) {
      const q = questionMap.get(id);
      if (!q) continue;

      db.update(schema.citizenQuestions)
        .set({
          status: "answered",
          response: answer.trim(),
          respondedOnDay: currentDay,
        })
        .where(eq(schema.citizenQuestions.id, q.id))
        .run();

      const questionUserId = (q as any).userId as string | null;
      if (questionUserId && party) {
        try {
          createNotification(
            questionUserId,
            "question_answered",
            `${party.name} answered your question`,
            `Your question "${q.question.substring(0, 80)}..." was answered by ${party.name}.`,
            { questionId: q.id, partyId: party.id },
            currentDay,
          );
        } catch {}
      }
    }
  }
}
