/**
 * Bot question pool — weekly AI-generated batch of tagged questions.
 *
 * Every 7 simulation days, generates a pool of ~30 contextual questions based
 * on recent simulation events (bills, crises, media, party positions). Each
 * question is tagged with topic, target party, and which parties' members
 * would naturally ask it. Bots then pick from this pool instead of generating
 * questions on-the-fly.
 */

import type { Party } from "@ki-bundestag/types";
import { isNull } from "drizzle-orm";
import { logAICall, parseAIJson } from "../agent/ai-json.js";
import { submitBatch } from "../agent/batch-client.js";
import type { BatchRequest } from "../agent/batch-client.js";
import { getDb, schema } from "../db/index.js";
import { logger } from "../logger.js";
import { QUESTION_TOPICS, type QuestionTopic } from "./questions.js";

const POOL_GENERATION_INTERVAL = 7; // every 7 simulation days
const TARGET_POOL_SIZE = 30;        // questions per generation batch
const MIN_POOL_BEFORE_REGEN = 5;    // regenerate when unused pool drops below this

/**
 * Generate a fresh pool of bot questions if needed.
 * Called from the simulation loop; runs weekly.
 */
export async function maybeGenerateBotQuestionPool(
  allParties: Party[],
  currentDay: number,
): Promise<void> {
  // Only run on weekly boundaries
  if (currentDay % POOL_GENERATION_INTERVAL !== 0) return;

  const db = getDb();

  // Check how many unused questions remain in the pool
  const unusedCount = db.select().from(schema.botQuestionPool)
    .where(isNull(schema.botQuestionPool.usedByBotId))
    .all().length;

  if (unusedCount >= MIN_POOL_BEFORE_REGEN) {
    logger.info(`[bot-pool] ${unusedCount} unused questions in pool — skipping generation`);
    return;
  }

  await generateBotQuestionPool(allParties, currentDay);
}

async function generateBotQuestionPool(
  allParties: Party[],
  currentDay: number,
): Promise<void> {
  const db = getDb();

  // ── Gather simulation context ──────────────────────────────────────────

  // Recent events (last 7 days)
  const recentEvents = db.select().from(schema.simulationEvents)
    .all()
    .filter(e => e.dayNumber >= currentDay - 7)
    .slice(0, 20)
    .map(e => `[Tag ${e.dayNumber}] ${e.type}: ${e.title}`);

  // Recent bills
  const recentBills = db.select().from(schema.bills)
    .all()
    .filter(b => b.proposedOnDay >= currentDay - 14)
    .slice(0, 10)
    .map(b => `"${b.title}" (${b.status}, von ${b.proposedBy})`);

  // Active crises
  const activeCrises = db.select().from(schema.crises)
    .all()
    .filter((c: any) => c.active || c.status === "active")
    .slice(0, 5)
    .map((c: any) => c.title || c.name || c.description || "");

  // Recent media headlines
  const recentMedia = db.select().from(schema.mediaArticles)
    .all()
    .filter(m => m.dayNumber >= currentDay - 7)
    .slice(0, 10)
    .map(m => `${m.outlet}: "${m.headline}"`);

  // Party positions (name, ideology, coalition role)
  const partyContext = allParties.map(p =>
    `${p.id}: ${p.name} (${(p as any).ideology}, ${(p as any).coalitionRole})`,
  ).join("\n");

  // Existing questions to avoid duplicates
  const existingQuestions = db.select({ question: schema.citizenQuestions.question })
    .from(schema.citizenQuestions)
    .all()
    .slice(-50)
    .map(q => q.question);

  const existingPoolQuestions = db.select({ question: schema.botQuestionPool.question })
    .from(schema.botQuestionPool)
    .all()
    .map(q => q.question);

  const allExisting = [...existingQuestions, ...existingPoolQuestions];
  const avoidList = allExisting.length > 0
    ? `\n\nBereits existierende Fragen (NICHT wiederholen):\n${allExisting.slice(-30).map(q => `- ${q}`).join("\n")}`
    : "";

  if (recentEvents.length === 0 && recentBills.length === 0 && recentMedia.length === 0) {
    logger.info("[bot-pool] No recent context available — skipping generation");
    return;
  }

  // ── Build the prompt ───────────────────────────────────────────────────

  const coalitionParties = allParties.filter((p: any) => p.coalitionRole !== "opposition").map(p => p.id);
  const oppositionParties = allParties.filter((p: any) => p.coalitionRole === "opposition").map(p => p.id);
  const topics = [...QUESTION_TOPICS].filter(t => t !== "Sonstiges");

  const req: BatchRequest = {
    customId: `bot-question-pool-day${currentDay}`,
    system: `Du bist ein Redakteur für eine Parlamentssimulation. Generiere ${TARGET_POOL_SIZE} diverse Bürgerfragen auf Deutsch für eine Woche Simulation.

PARTEIEN:
${partyContext}

Koalitionsparteien: ${coalitionParties.join(", ")}
Oppositionsparteien: ${oppositionParties.join(", ")}

REGELN:
- Jede Frage muss eine konkrete, spezifische Frage sein (20-250 Zeichen)
- Verteile Fragen auf verschiedene Parteien und Themen
- Beziehe dich auf aktuelle Ereignisse in der Simulation
- Formuliere authentisch und bürgernah
- Jede Frage braucht Tags und relevante Parteien

TAGS (verwende 2-4 pro Frage):
- Themen-Tags: klimaschutz, migration, bildung, wirtschaft, soziales, gesundheit, sicherheit, verteidigung, digitalisierung, verkehr, finanzen, arbeit, wohnen, außenpolitik
- Kontext-Tags: aktuell (bezieht sich auf aktuelle Ereignisse), kritisch (kritische/konfrontative Frage), konstruktiv (lösungsorientiert), koalition (Koalitionsthema), opposition (Oppositionsthema)

"relevantForParties" = Parteien, deren MITGLIEDER diese Frage wahrscheinlich stellen würden (nicht die Zielpartei!). Z.B. eine kritische Frage an die Regierung würde von Oppositionsmitgliedern gestellt.

Verfügbare Themen: ${topics.join(", ")}
Verfügbare Partei-IDs: ${allParties.map(p => p.id).join(", ")}

Antworte NUR mit validem JSON:
{"questions": [{"question": "<Frage>", "topic": "<Thema>", "targetPartyId": "<Zielpartei-ID>", "tags": ["tag1", "tag2"], "relevantForParties": ["partyId1", "partyId2"]}]}

Generiere genau ${TARGET_POOL_SIZE} Fragen. Keine Duplikate!`,
    prompt: `Generiere ${TARGET_POOL_SIZE} Bürgerfragen basierend auf der aktuellen Simulationswoche:

AKTUELLE EREIGNISSE:
${recentEvents.length > 0 ? recentEvents.join("\n") : "(keine)"}

AKTUELLE GESETZENTWÜRFE:
${recentBills.length > 0 ? recentBills.join("\n") : "(keine)"}

AKTUELLE KRISEN:
${activeCrises.length > 0 ? activeCrises.join("\n") : "(keine)"}

MEDIENBERICHTE:
${recentMedia.length > 0 ? recentMedia.join("\n") : "(keine)"}${avoidList}

Erstelle die Fragen:`,
    maxTokens: Math.max(2000, TARGET_POOL_SIZE * 80),
    roleKey: "daily" as const,
  };

  // ── Submit and process ─────────────────────────────────────────────────

  try {
    const t0 = Date.now();
    const results = await submitBatch([req]);
    logAICall({ task: "bot-question-pool", latencyMs: Date.now() - t0, parseOk: true, validationOk: true });

    const result = results.find(r => r.customId === req.customId);
    if (!result?.text) {
      logger.warn("[bot-pool] No response from AI");
      return;
    }

    interface PoolQuestion {
      question: string;
      topic: string;
      targetPartyId: string;
      tags: string[];
      relevantForParties: string[];
    }

    const parsed = parseAIJson<{ questions: PoolQuestion[] }>(
      result.text,
      (v: unknown) => {
        const o = v as Record<string, unknown>;
        if (!Array.isArray(o.questions)) return null;
        const questions = (o.questions as unknown[]).filter((q: unknown) => {
          const item = q as Record<string, unknown>;
          return (
            typeof item.question === "string" &&
            typeof item.topic === "string" &&
            typeof item.targetPartyId === "string" &&
            Array.isArray(item.tags) &&
            Array.isArray(item.relevantForParties)
          );
        }) as PoolQuestion[];
        return { questions };
      },
      "BotQuestionPool",
    );

    if (!parsed || parsed.questions.length === 0) {
      logger.warn("[bot-pool] Failed to parse AI response");
      return;
    }

    const validPartyIds = new Set(allParties.map(p => p.id));
    let inserted = 0;

    for (const q of parsed.questions) {
      // Validate party IDs
      if (!validPartyIds.has(q.targetPartyId)) continue;
      const validRelevant = q.relevantForParties.filter(id => validPartyIds.has(id));

      // Validate topic
      const topic = QUESTION_TOPICS.includes(q.topic as QuestionTopic) ? q.topic : "Sonstiges";

      const id = `bqp-${Math.random().toString(36).substring(2, 10)}${Date.now().toString(36)}`;
      db.insert(schema.botQuestionPool).values({
        id,
        question: q.question.slice(0, 500),
        topic,
        targetPartyId: q.targetPartyId,
        tags: JSON.stringify(q.tags.slice(0, 5)),
        relevantForParties: JSON.stringify(validRelevant),
        generatedOnDay: currentDay,
        usedByBotId: null,
        usedOnDay: null,
      }).run();
      inserted++;
    }

    logger.info(`[bot-pool] Generated ${inserted} questions for bot pool on day ${currentDay}`);
  } catch (err) {
    logger.error("[bot-pool] Failed to generate question pool:", err);
  }
}
