/**
 * Bot question pool — AI-generated batch of tagged questions.
 *
 * Runs daily; generates questions when the pool runs low. Pool size scales
 * with bot count so 100 bots get enough questions for ~3 days. Each question
 * is tagged with topic, target party, and which parties' members would
 * naturally ask it. Bots pick from this pool instead of generating questions
 * on-the-fly.
 *
 * For large pools we split into multiple batch requests (max 20 questions per
 * request) to keep AI output quality high.
 */

import type { Party } from "@ki-bundestag/types";
import { isNull } from "drizzle-orm";
import { logAICall, parseAIJson } from "../agent/ai-json.js";
import { submitBatch } from "../agent/batch-client.js";
import type { BatchRequest } from "../agent/batch-client.js";
import { getDb, getUserDb, schema } from "../db/index.js";
import { logger } from "../logger.js";
import { QUESTION_TOPICS, type QuestionTopic } from "./questions.js";

/** Max questions to request per single AI call (keeps output quality high). */
const MAX_PER_BATCH = 20;

/** Pool should cover roughly this many days of bot activity. */
const DAYS_BUFFER = 3;

// ---------------------------------------------------------------------------
// Estimation helpers
// ---------------------------------------------------------------------------

interface BotProfile {
  activityLevel: string;
  engagementStyle: string;
}

const ACTIVITY_CHANCE: Record<string, number> = {
  high: 0.30,
  medium: 0.15,
  low: 0.05,
  lurker: 0.02,
};

const ASK_QUESTION_WEIGHT: Record<string, number> = {
  questioner: 5 / 12,  // 5 out of sum(2+1+1+5+1+1+1)
  voter: 1 / 17,
  proposer: 1 / 13,
  observer: 1 / 11,
};

const TICKS_PER_DAY = 6; // 24h / 4h interval

/**
 * Estimate how many questions bots will consume per day.
 * Reads actual bot profiles from users.db for an accurate count.
 */
function estimateDailyQuestionDemand(): number {
  try {
    const userDb = getUserDb();
    const bots = userDb.select({
      botProfile: schema.users.botProfile,
    }).from(schema.users)
      .all()
      .filter((u: any) => u.isBot || u.is_bot);

    if (bots.length === 0) return 10; // sensible default

    let expectedPerTick = 0;
    for (const bot of bots) {
      let profile: BotProfile = { activityLevel: "low", engagementStyle: "observer" };
      try {
        if (bot.botProfile) profile = JSON.parse(bot.botProfile as string);
      } catch {}

      const activationChance = ACTIVITY_CHANCE[profile.activityLevel] ?? 0.05;
      const questionChance = ASK_QUESTION_WEIGHT[profile.engagementStyle] ?? 0.08;
      expectedPerTick += activationChance * questionChance;
    }

    // Round up, apply daily limit ceiling (5/bot but most bots act rarely)
    const dailyEstimate = Math.ceil(expectedPerTick * TICKS_PER_DAY * 1.2); // 20% buffer
    return Math.max(5, dailyEstimate);
  } catch {
    return 10; // fallback if user DB not available
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a fresh pool of bot questions if the pool is running low.
 * Called daily from the simulation loop. Respects BOTS_ENABLED flag.
 */
export async function maybeGenerateBotQuestionPool(
  allParties: Party[],
  currentDay: number,
): Promise<void> {
  // Skip pool generation when bots are disabled
  if (process.env.BOTS_ENABLED?.toLowerCase() === "false") return;

  const db = getDb();

  // Count unused questions in the pool
  const unusedCount = db.select().from(schema.botQuestionPool)
    .where(isNull(schema.botQuestionPool.usedByBotId))
    .all().length;

  const dailyDemand = estimateDailyQuestionDemand();
  const targetSize = dailyDemand * DAYS_BUFFER;

  // Only regenerate when pool drops below one day of supply
  if (unusedCount >= dailyDemand) {
    logger.info(`[bot-pool] ${unusedCount} unused questions (need ${dailyDemand}/day) — pool sufficient`);
    return;
  }

  const questionsNeeded = targetSize - unusedCount;
  logger.info(`[bot-pool] Pool low: ${unusedCount} left, need ${questionsNeeded} more (${dailyDemand}/day × ${DAYS_BUFFER} days buffer)`);

  await generateBotQuestionPool(allParties, currentDay, questionsNeeded);
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

async function generateBotQuestionPool(
  allParties: Party[],
  currentDay: number,
  totalQuestions: number,
): Promise<void> {
  const db = getDb();

  // ── Gather simulation context ──────────────────────────────────────────

  const recentEvents = db.select().from(schema.simulationEvents)
    .all()
    .filter(e => e.dayNumber >= currentDay - 7)
    .slice(0, 20)
    .map(e => `[Tag ${e.dayNumber}] ${e.type}: ${e.title}`);

  const recentBills = db.select().from(schema.bills)
    .all()
    .filter(b => b.proposedOnDay >= currentDay - 14)
    .slice(0, 10)
    .map(b => `"${b.title}" (${b.status}, von ${b.proposedBy})`);

  const activeCrises = db.select().from(schema.crises)
    .all()
    .filter((c: any) => c.active || c.status === "active")
    .slice(0, 5)
    .map((c: any) => c.title || c.name || c.description || "");

  const recentMedia = db.select().from(schema.mediaArticles)
    .all()
    .filter(m => m.dayNumber >= currentDay - 7)
    .slice(0, 10)
    .map(m => `${m.outlet}: "${m.headline}"`);

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

  // ── Build batch requests (split into chunks of MAX_PER_BATCH) ──────────

  const coalitionParties = allParties.filter((p: any) => p.coalitionRole !== "opposition").map(p => p.id);
  const oppositionParties = allParties.filter((p: any) => p.coalitionRole === "opposition").map(p => p.id);
  const topics = [...QUESTION_TOPICS].filter(t => t !== "Sonstiges");

  const numBatches = Math.ceil(totalQuestions / MAX_PER_BATCH);
  const requests: BatchRequest[] = [];

  for (let i = 0; i < numBatches; i++) {
    const batchSize = Math.min(MAX_PER_BATCH, totalQuestions - i * MAX_PER_BATCH);

    // Vary focus per batch to increase diversity
    const focusHint = i === 0
      ? "Fokussiere auf aktuelle Ereignisse und Krisen."
      : i === 1
        ? "Fokussiere auf Gesetzentwürfe und Abstimmungen."
        : "Fokussiere auf langfristige Themen und Grundsatzfragen.";

    requests.push({
      customId: `bot-question-pool-day${currentDay}-batch${i}`,
      system: `Du bist ein Redakteur für eine Parlamentssimulation. Generiere ${batchSize} diverse Bürgerfragen auf Deutsch.

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
- ${focusHint}

TAGS (verwende 2-4 pro Frage):
- Themen-Tags: klimaschutz, migration, bildung, wirtschaft, soziales, gesundheit, sicherheit, verteidigung, digitalisierung, verkehr, finanzen, arbeit, wohnen, außenpolitik
- Kontext-Tags: aktuell (bezieht sich auf aktuelle Ereignisse), kritisch (kritische/konfrontative Frage), konstruktiv (lösungsorientiert), koalition (Koalitionsthema), opposition (Oppositionsthema)

"relevantForParties" = Parteien, deren MITGLIEDER diese Frage wahrscheinlich stellen würden (nicht die Zielpartei!). Z.B. eine kritische Frage an die Regierung würde von Oppositionsmitgliedern gestellt.

Verfügbare Themen: ${topics.join(", ")}
Verfügbare Partei-IDs: ${allParties.map(p => p.id).join(", ")}

Antworte NUR mit validem JSON:
{"questions": [{"question": "<Frage>", "topic": "<Thema>", "targetPartyId": "<Zielpartei-ID>", "tags": ["tag1", "tag2"], "relevantForParties": ["partyId1", "partyId2"]}]}

Generiere genau ${batchSize} Fragen. Keine Duplikate!`,
      prompt: `Generiere ${batchSize} Bürgerfragen basierend auf der aktuellen Simulationslage:

AKTUELLE EREIGNISSE:
${recentEvents.length > 0 ? recentEvents.join("\n") : "(keine)"}

AKTUELLE GESETZENTWÜRFE:
${recentBills.length > 0 ? recentBills.join("\n") : "(keine)"}

AKTUELLE KRISEN:
${activeCrises.length > 0 ? activeCrises.join("\n") : "(keine)"}

MEDIENBERICHTE:
${recentMedia.length > 0 ? recentMedia.join("\n") : "(keine)"}${avoidList}

Erstelle die Fragen:`,
      maxTokens: Math.max(1500, batchSize * 80),
      roleKey: "daily" as const,
    });
  }

  // ── Submit all batch requests at once ──────────────────────────────────

  try {
    const t0 = Date.now();
    const results = await submitBatch(requests);
    logAICall({ task: "bot-question-pool", latencyMs: Date.now() - t0, parseOk: true, validationOk: true });

    const validPartyIds = new Set(allParties.map(p => p.id));
    let totalInserted = 0;

    for (const req of requests) {
      const result = results.find(r => r.customId === req.customId);
      if (!result?.text) continue;

      const parsed = parseAIJson<{ questions: PoolQuestion[] }>(
        result.text,
        validatePoolResponse,
        "BotQuestionPool",
      );

      if (!parsed || parsed.questions.length === 0) continue;

      for (const q of parsed.questions) {
        if (!validPartyIds.has(q.targetPartyId)) continue;
        const validRelevant = q.relevantForParties.filter(id => validPartyIds.has(id));
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
        totalInserted++;
      }
    }

    logger.info(`[bot-pool] Generated ${totalInserted} questions across ${requests.length} batch(es) on day ${currentDay}`);
  } catch (err) {
    logger.error("[bot-pool] Failed to generate question pool:", err);
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

interface PoolQuestion {
  question: string;
  topic: string;
  targetPartyId: string;
  tags: string[];
  relevantForParties: string[];
}

function validatePoolResponse(v: unknown): { questions: PoolQuestion[] } | null {
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
}
