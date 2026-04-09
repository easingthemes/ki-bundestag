/**
 * run-bot-activity.ts — Simulate user activity from bot users
 *
 * Exports `runBotTick()` for use by runner-bot.ts (PM2 loop).
 * Also runs standalone: `npx tsx scripts/run-bot-activity.ts [--dry-run]`
 *
 * Activity levels control probability per tick (designed for ~4h intervals):
 *   high:   30% chance/tick → ~2 actions/day
 *   medium: 15% chance/tick → ~1 action/day
 *   low:     5% chance/tick → ~1 action/3 days
 *   lurker:  2% chance/tick → ~1 action/week
 */

import Database from "better-sqlite3";
import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function findMonorepoRoot(): string {
  let dir = __dirname;
  for (let i = 0; i < 10; i++) {
    const pkgPath = path.join(dir, "package.json");
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
        if (pkg.workspaces) return dir;
      } catch {}
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

const ROOT = findMonorepoRoot();
const USER_DB_PATH = process.env.USER_DATABASE_PATH
  ? path.resolve(process.env.USER_DATABASE_PATH)
  : path.join(ROOT, "data", "users.db");
const SIM_DB_PATH = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.join(ROOT, "data", "simulation.db");

// ── Activity probabilities per tick ─────────────────────────────────────────

const ACTIVITY_CHANCE: Record<string, number> = {
  high: 0.30,
  medium: 0.15,
  low: 0.05,
  lurker: 0.02,
};

// ── Action weights by engagement style ──────────────────────────────────────

interface ActionWeights {
  vote_question: number;
  vote_proposal: number;
  signal_bill: number;
  ask_question: number;
  submit_proposal: number;
  submit_speech: number;
  vote_poll: number;
  apply_mdb: number;
}

const STYLE_WEIGHTS: Record<string, ActionWeights> = {
  questioner: { vote_question: 2, vote_proposal: 1, signal_bill: 1, ask_question: 5, submit_proposal: 1, submit_speech: 1, vote_poll: 1, apply_mdb: 1 },
  voter:      { vote_question: 4, vote_proposal: 4, signal_bill: 3, ask_question: 1, submit_proposal: 0, submit_speech: 2, vote_poll: 3, apply_mdb: 2 },
  proposer:   { vote_question: 1, vote_proposal: 2, signal_bill: 2, ask_question: 1, submit_proposal: 5, submit_speech: 3, vote_poll: 1, apply_mdb: 3 },
  observer:   { vote_question: 3, vote_proposal: 2, signal_bill: 2, ask_question: 1, submit_proposal: 0, submit_speech: 1, vote_poll: 2, apply_mdb: 1 },
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function uuid(): string { return crypto.randomUUID(); }
function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

/** Normalise text for duplicate comparison (lowercase, collapse whitespace, strip trailing punctuation). */
function normalizeText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim().replace(/[?.!]+$/, "").trim();
}

function weightedPick(weights: ActionWeights): keyof ActionWeights {
  const entries = Object.entries(weights) as [keyof ActionWeights, number][];
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [action, weight] of entries) {
    r -= weight;
    if (r <= 0) return action;
  }
  return entries[entries.length - 1][0];
}

// ── Bot question pool picker ────────────────────────────────────────────────

interface PoolRow {
  id: string;
  question: string;
  topic: string;
  target_party_id: string;
  tags: string;
  relevant_for_parties: string;
}

/**
 * Pick the best matching unused question from the bot_question_pool.
 *
 * Matching priority:
 * 1. Questions tagged as relevant for the bot's party
 * 2. Questions with matching context tags (opposition bot → opposition tags)
 * 3. Any unused question
 *
 * Also checks that the question hasn't already been submitted (dedup).
 */
function pickFromPool(
  simDb: Database.Database,
  bot: { id: string; party_id: string | null },
): PoolRow | null {
  // Check if the table exists (might not on first run before migration)
  try {
    simDb.prepare("SELECT 1 FROM bot_question_pool LIMIT 1").get();
  } catch {
    return null;
  }

  const unused = simDb.prepare(
    "SELECT id, question, topic, target_party_id, tags, relevant_for_parties FROM bot_question_pool WHERE used_by_bot_id IS NULL",
  ).all() as PoolRow[];

  if (unused.length === 0) return null;

  // Load existing questions for dedup check
  const existingQuestions = simDb.prepare(
    "SELECT question, target_party_id FROM citizen_questions",
  ).all() as Array<{ question: string; target_party_id: string }>;
  const existingSet = new Set(
    existingQuestions.map(q => `${q.target_party_id}::${normalizeText(q.question)}`),
  );

  // Filter out questions that already exist as citizen questions
  const candidates = unused.filter(
    q => !existingSet.has(`${q.target_party_id}::${normalizeText(q.question)}`),
  );

  if (candidates.length === 0) return null;

  // Score each candidate based on bot profile relevance
  const scored = candidates.map(q => {
    let score = 0;
    const relevantParties: string[] = JSON.parse(q.relevant_for_parties);
    const tags: string[] = JSON.parse(q.tags);

    // Boost if this question is relevant for the bot's party
    if (bot.party_id && relevantParties.includes(bot.party_id)) {
      score += 10;
    }

    // Small random factor for variety
    score += Math.random() * 3;

    return { ...q, score };
  });

  // Sort by score descending, pick top
  scored.sort((a, b) => b.score - a.score);
  return scored[0];
}

// ── Static templates (fallback when no API key) ─────────────────────────────

const QUESTION_TEMPLATES = [
  "Wie steht Ihre Partei zur aktuellen {topic}-Politik?",
  "Welche konkreten Maßnahmen planen Sie im Bereich {topic}?",
  "Wie bewerten Sie die aktuelle Lage bei {topic}?",
  "Was unterscheidet Ihren Ansatz bei {topic} von den anderen Parteien?",
  "Welche Prioritäten setzen Sie bei {topic} für die nächsten Monate?",
  "Wie wollen Sie die Herausforderungen bei {topic} bewältigen?",
  "Was sagen Sie zu den Kritikern Ihrer {topic}-Politik?",
  "Planen Sie Gesetzesinitiativen im Bereich {topic}?",
  "Wie stehen Sie zur europäischen Zusammenarbeit bei {topic}?",
  "Welche Erfolge können Sie bei {topic} vorweisen?",
];

const TOPICS = [
  "Klimaschutz", "Migration", "Bildung", "Wirtschaft", "Soziales",
  "Gesundheit", "Innere Sicherheit", "Verteidigung", "Digitalisierung",
  "Verkehr", "Finanzen", "Arbeit", "Wohnen", "Außenpolitik",
];

const PROPOSAL_TEMPLATES = [
  { title: "Förderung von {topic} in Kommunen", desc: "Ein Programm zur Stärkung von {topic} auf kommunaler Ebene mit gezielter Förderung und Beratungsangeboten." },
  { title: "Modernisierung der {topic}-Infrastruktur", desc: "Investitionen in die Modernisierung bestehender Infrastruktur im Bereich {topic} für eine zukunftsfähige Gesellschaft." },
  { title: "Bürgerbeteiligung bei {topic}-Entscheidungen", desc: "Einführung verbindlicher Bürgerbeteiligungsverfahren bei wichtigen Entscheidungen im Bereich {topic}." },
  { title: "{topic}-Offensive 2027", desc: "Ein umfassendes Maßnahmenpaket zur Verbesserung der Situation im Bereich {topic} bis 2027." },
  { title: "Transparenz in der {topic}-Politik", desc: "Mehr Transparenz und Rechenschaftspflicht bei politischen Entscheidungen zum Thema {topic}." },
];

const CATEGORIES = [
  "Wirtschaft", "Soziales", "Umwelt", "Bildung", "Gesundheit",
  "Infrastruktur", "Sicherheit", "Digitalisierung", "Justiz", "Außenpolitik",
];

const MDB_APPLICATION_TEMPLATES = [
  "Als engagierter Bürger möchte ich mich für einen Sitz im Bundestag bewerben. Mein Schwerpunkt liegt auf {topic}. Ich bringe langjährige Erfahrung in der politischen Arbeit mit und möchte die Interessen meiner Wähler vertreten.",
  "Ich bewerbe mich um einen Bundestagssitz, weil ich überzeugt bin, dass wir im Bereich {topic} dringend neue Impulse brauchen. Mit frischen Ideen und Bürgernähe will ich die Politik unserer Partei aktiv mitgestalten.",
  "Meine Motivation für den Bundestag: Die aktuellen Herausforderungen im Bereich {topic} erfordern kompetente Vertreter. Ich habe mich intensiv mit den Themen auseinandergesetzt und möchte konstruktiv zur Gesetzgebung beitragen.",
  "Als langjähriges Parteimitglied und Experte für {topic} möchte ich nun den nächsten Schritt gehen und mich als MdB für unsere gemeinsamen Ziele einsetzen. Transparenz und Bürgerbeteiligung stehen für mich an erster Stelle.",
  "Ich kandidiere für den Bundestag, weil ich glaube, dass {topic} in der aktuellen Debatte zu kurz kommt. Mit meiner Expertise und meinem Engagement möchte ich dafür sorgen, dass diese Themen die nötige Aufmerksamkeit bekommen.",
];

const SPEECH_TEMPLATES = [
  "Als Vertreter unserer Fraktion möchte ich betonen, dass dieses Gesetz im Bereich {topic} einen wichtigen Schritt darstellt. Wir müssen sicherstellen, dass die vorgeschlagenen Maßnahmen auch in der Praxis umsetzbar sind und den Bürgern zugutekommen.",
  "Meine Damen und Herren, der vorliegende Gesetzentwurf zu {topic} greift zentrale Herausforderungen auf, denen sich unser Land stellen muss. Allerdings sehen wir Nachbesserungsbedarf bei der konkreten Ausgestaltung.",
  "Ich spreche heute zum Thema {topic}, weil es die Menschen in unserem Land unmittelbar betrifft. Dieses Gesetz muss praxisnah und sozial ausgewogen gestaltet werden. Unsere Fraktion wird sich dafür einsetzen.",
  "Die Debatte über {topic} ist längst überfällig. Dieser Gesetzentwurf bietet eine solide Grundlage, auf der wir aufbauen können. Wir unterstützen die Richtung, fordern aber eine stärkere Berücksichtigung der betroffenen Interessengruppen.",
  "Zum vorliegenden Entwurf im Bereich {topic}: Die Ziele sind begrüßenswert, doch die vorgeschlagenen Mittel reichen unserer Einschätzung nach nicht aus. Wir schlagen vor, die Umsetzungsfristen anzupassen und die Finanzierung nachhaltiger zu gestalten.",
];

const SPEECH_READING_LABELS: Record<number, string> = {
  1: "erste Lesung",
  2: "zweite Lesung",
  3: "dritte Lesung",
};

// ── AI generation (optional) ────────────────────────────────────────────────

async function generateAIQuestion(
  partyName: string,
  topic: string,
  recentBills: string[],
  existingQuestions?: Set<string>,
): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  // Build a sample of existing questions to tell the AI what to avoid
  const avoidList = existingQuestions && existingQuestions.size > 0
    ? `\n\nDiese Fragen wurden bereits gestellt — stelle eine ANDERE Frage:\n${[...existingQuestions].slice(0, 15).join("\n")}`
    : "";

  try {
    const prompt = `Du bist ein engagierter deutscher Bürger. Stelle eine kurze, spezifische Frage (1-2 Sätze, max 200 Zeichen) an die Partei "${partyName}" zum Thema "${topic}".${recentBills.length > 0 ? ` Aktuelle Gesetzentwürfe: ${recentBills.slice(0, 3).join(", ")}.` : ""}${avoidList} Antworte NUR mit der Frage, ohne Anführungszeichen.`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 150,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      console.error(`  AI question generation failed: ${res.status}`);
      return null;
    }

    const data = await res.json() as any;
    return data.content?.[0]?.text?.trim() ?? null;
  } catch (err) {
    console.error("  AI question generation error:", err);
    return null;
  }
}

async function generateAIProposal(
  partyName: string,
  topic: string,
  existingTitles?: Set<string>,
): Promise<{ title: string; description: string; rationale: string } | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  // Build a sample of existing proposal titles to tell the AI what to avoid
  const avoidList = existingTitles && existingTitles.size > 0
    ? ` Bereits existierende Vorschläge (vermeide ähnliche Titel): ${[...existingTitles].slice(0, 10).join(", ")}.`
    : "";

  try {
    const prompt = `Du bist Mitglied der Partei "${partyName}". Erstelle einen kurzen Parteiinternen Vorschlag zum Thema "${topic}".${avoidList} Antworte als JSON: {"title": "...", "description": "...", "rationale": "..."}. Titel max 60 Zeichen, Beschreibung max 200 Zeichen, Begründung max 150 Zeichen. Nur JSON, kein Markdown.`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) return null;

    const data = await res.json() as any;
    const text = data.content?.[0]?.text?.trim();
    if (!text) return null;

    const cleaned = text.replace(/```json\n?/g, "").replace(/```/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

async function generateAISpeech(
  partyName: string,
  billTitle: string,
  reading: number,
): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    const prompt = `Du bist MdB der Partei "${partyName}" im Deutschen Bundestag. Halte eine kurze Rede (2-4 Sätze, 100-300 Zeichen) zum Gesetzentwurf "${billTitle}" in der ${SPEECH_READING_LABELS[reading] ?? `${reading}. Lesung`}. Sprich sachlich und parteilich. Antworte NUR mit der Rede, ohne Anführungszeichen.`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      console.error(`  AI speech generation failed: ${res.status}`);
      return null;
    }

    const data = await res.json() as any;
    return data.content?.[0]?.text?.trim() ?? null;
  } catch (err) {
    console.error("  AI speech generation error:", err);
    return null;
  }
}

// ── Tick result type ────────────────────────────────────────────────────────

export interface TickResult {
  totalBots: number;
  activeBots: number;
  actions: number;
  aiCalls: number;
  breakdown: Record<string, number>;
}

// ── Main tick function ──────────────────────────────────────────────────────

export async function runBotTick(options?: { dryRun?: boolean }): Promise<TickResult> {
  const dryRun = options?.dryRun ?? false;

  const userDb = new Database(USER_DB_PATH);
  userDb.pragma("journal_mode = WAL");
  userDb.pragma("foreign_keys = ON");

  const simDb = new Database(SIM_DB_PATH);
  simDb.pragma("journal_mode = WAL");
  simDb.pragma("foreign_keys = ON");

  try {
    return await executeTick(userDb, simDb, dryRun);
  } finally {
    userDb.close();
    simDb.close();
  }
}

// ── Per-user daily limits (same as real users) ─────────────────────────────

const BOT_DAILY_LIMITS: Record<string, number> = {
  submit_question: 5,
  submit_proposal: 2,
  submit_speech: 3,
};

function checkBotDailyLimit(userDb: Database.Database, userId: string, actionType: string): boolean {
  const limit = BOT_DAILY_LIMITS[actionType];
  if (limit == null) return true; // no limit for this action
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const row = userDb.prepare(
    "SELECT COUNT(*) as cnt FROM user_actions WHERE user_id = ? AND action_type = ? AND created_at >= ?",
  ).get(userId, actionType, cutoff) as { cnt: number };
  return row.cnt < limit;
}

async function executeTick(
  userDb: Database.Database,
  simDb: Database.Database,
  dryRun: boolean,
): Promise<TickResult> {
  const meta = simDb.prepare("SELECT current_day FROM simulation_meta LIMIT 1").get() as
    | { current_day: number }
    | undefined;
  const currentDay = meta?.current_day ?? 0;

  const bots = userDb.prepare(
    "SELECT id, display_name, party_id, bot_profile, last_active FROM users WHERE is_bot = 1",
  ).all() as Array<{
    id: string;
    display_name: string;
    party_id: string | null;
    bot_profile: string | null;
    last_active: number;
  }>;

  const result: TickResult = { totalBots: bots.length, activeBots: 0, actions: 0, aiCalls: 0, breakdown: {} };

  if (bots.length === 0) return result;

  const parties = simDb.prepare("SELECT id, name FROM parties").all() as Array<{ id: string; name: string }>;
  const partyNameMap: Record<string, string> = {};
  for (const p of parties) partyNameMap[p.id] = p.name;

  const recentBills = simDb.prepare(
    "SELECT title FROM bills ORDER BY proposed_on_day DESC LIMIT 10",
  ).all() as Array<{ title: string }>;
  const billTitles = recentBills.map(b => b.title);

  const openProposals = userDb.prepare(
    "SELECT id, party_id FROM internal_proposals WHERE status = 'open'",
  ).all() as Array<{ id: string; party_id: string }>;

  const pendingQuestions = simDb.prepare(
    "SELECT id FROM citizen_questions WHERE status = 'pending'",
  ).all() as Array<{ id: string }>;

  const activeBills = simDb.prepare(
    "SELECT id FROM bills WHERE status IN ('proposed', 'first_reading', 'committee', 'second_reading')",
  ).all() as Array<{ id: string }>;

  const activePolls = simDb.prepare(
    "SELECT id, options FROM polls WHERE active = 1",
  ).all() as Array<{ id: string; options: string }>;

  const billsInReading = simDb.prepare(
    "SELECT id, title, status, category FROM bills WHERE status IN ('first_reading', 'second_reading', 'third_reading')",
  ).all() as Array<{ id: string; title: string; status: string; category: string }>;

  // Filter bots by activity chance
  const activeBotList = bots.filter(bot => {
    const profile = bot.bot_profile ? JSON.parse(bot.bot_profile) : { activityLevel: "low" };
    const chance = ACTIVITY_CHANCE[profile.activityLevel] ?? 0.05;
    return Math.random() < chance;
  });

  result.activeBots = activeBotList.length;

  console.log(`[bot-activity] Day ${currentDay} | ${bots.length} bots, ${activeBotList.length} active this tick`);
  if (dryRun) console.log("  (dry-run mode)");
  if (activeBotList.length === 0) return result;

  // Prepared statements
  const insertQuestionVote = userDb.prepare(
    "INSERT OR IGNORE INTO question_votes (id, question_id, user_id, vote, created_at) VALUES (?, ?, ?, ?, ?)",
  );
  const insertInternalVote = userDb.prepare(
    "INSERT OR IGNORE INTO internal_votes (id, proposal_id, user_id, vote, created_at) VALUES (?, ?, ?, ?, ?)",
  );
  const insertSignal = userDb.prepare(
    "INSERT OR IGNORE INTO member_signals (id, bill_id, user_id, signal, created_at) VALUES (?, ?, ?, ?, ?)",
  );
  const insertAction = userDb.prepare(
    "INSERT INTO user_actions (id, user_id, action_type, entity_id, entity_type, metadata, sim_day, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  );
  const insertQuestion = simDb.prepare(
    "INSERT INTO citizen_questions (id, question, target_party_id, created_on_day, status, user_id, topic) VALUES (?, ?, ?, ?, 'pending', ?, ?)",
  );
  const insertProposal = userDb.prepare(
    "INSERT INTO internal_proposals (id, party_id, proposed_by, proposer_name, title, description, category, rationale, status, vote_score, total_votes, created_on_day, review_by_day) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', 0, 0, ?, ?)",
  );
  const updateLastActive = userDb.prepare(
    "UPDATE users SET last_active = ? WHERE id = ?",
  );
  const hasQuestionVote = userDb.prepare(
    "SELECT 1 FROM question_votes WHERE question_id = ? AND user_id = ?",
  );
  const hasInternalVote = userDb.prepare(
    "SELECT 1 FROM internal_votes WHERE proposal_id = ? AND user_id = ?",
  );
  const hasSignal = userDb.prepare(
    "SELECT 1 FROM member_signals WHERE bill_id = ? AND user_id = ?",
  );
  const insertSpeech = userDb.prepare(
    "INSERT INTO mdb_speeches (id, user_id, bill_id, reading, content, sentiment_impact, day_number, created_at) VALUES (?, ?, ?, ?, ?, NULL, ?, ?)",
  );
  const hasSpeech = userDb.prepare(
    "SELECT 1 FROM mdb_speeches WHERE bill_id = ? AND user_id = ? AND reading = ?",
  );

  const now = Date.now();
  const isoNow = new Date(now).toISOString();

  for (const bot of activeBotList) {
    const profile = bot.bot_profile ? JSON.parse(bot.bot_profile) : { activityLevel: "low", engagementStyle: "observer" };
    const weights = STYLE_WEIGHTS[profile.engagementStyle] ?? STYLE_WEIGHTS.observer;
    const action = weightedPick(weights);

    try {
      switch (action) {
        case "vote_question": {
          if (pendingQuestions.length === 0) break;
          const q = pick(pendingQuestions);
          if (hasQuestionVote.get(q.id, bot.id)) break;
          const vote = Math.random() < 0.7 ? 1 : -1;
          if (!dryRun) {
            insertQuestionVote.run(uuid(), q.id, bot.id, vote, now);
            insertAction.run(uuid(), bot.id, "vote_question", q.id, "question", JSON.stringify({ vote }), currentDay, isoNow);
          }
          result.actions++;
          result.breakdown.vote_question = (result.breakdown.vote_question ?? 0) + 1;
          break;
        }

        case "vote_proposal": {
          if (!bot.party_id) break;
          const partyProposals = openProposals.filter(p => p.party_id === bot.party_id);
          if (partyProposals.length === 0) break;
          const p = pick(partyProposals);
          if (hasInternalVote.get(p.id, bot.id)) break;
          const vote = Math.random() < 0.75 ? 1 : -1;
          if (!dryRun) {
            insertInternalVote.run(uuid(), p.id, bot.id, vote, now);
            userDb.prepare(
              "UPDATE internal_proposals SET vote_score = vote_score + ?, total_votes = total_votes + 1 WHERE id = ?",
            ).run(vote, p.id);
            insertAction.run(uuid(), bot.id, "vote_on_proposal", p.id, "proposal", JSON.stringify({ vote }), currentDay, isoNow);
          }
          result.actions++;
          result.breakdown.vote_proposal = (result.breakdown.vote_proposal ?? 0) + 1;
          break;
        }

        case "signal_bill": {
          if (!bot.party_id || activeBills.length === 0) break;
          const bill = pick(activeBills);
          if (hasSignal.get(bill.id, bot.id)) break;
          const signal = Math.random() < 0.6 ? "yes" : "no";
          if (!dryRun) {
            insertSignal.run(uuid(), bill.id, bot.id, signal, now);
            insertAction.run(uuid(), bot.id, "signal_bill", bill.id, "bill", JSON.stringify({ signal }), currentDay, isoNow);
          }
          result.actions++;
          result.breakdown.signal_bill = (result.breakdown.signal_bill ?? 0) + 1;
          break;
        }

        case "ask_question": {
          if (!checkBotDailyLimit(userDb, bot.id, "submit_question")) break;

          // ── Primary: pick from pre-generated bot question pool ──────────
          const poolQuestion = pickFromPool(simDb, bot);
          if (poolQuestion) {
            const qId = `q-bot-${uuid().slice(0, 12)}`;
            if (!dryRun) {
              insertQuestion.run(qId, poolQuestion.question, poolQuestion.target_party_id, currentDay, bot.id, poolQuestion.topic);
              // Mark pool question as used
              simDb.prepare("UPDATE bot_question_pool SET used_by_bot_id = ?, used_on_day = ? WHERE id = ?")
                .run(bot.id, currentDay, poolQuestion.id);
              insertAction.run(uuid(), bot.id, "submit_question", qId, "question", JSON.stringify({ targetPartyId: poolQuestion.target_party_id, topic: poolQuestion.topic, fromPool: true }), currentDay, isoNow);
            }
            result.actions++;
            result.breakdown.ask_question = (result.breakdown.ask_question ?? 0) + 1;
            const partyName = partyNameMap[poolQuestion.target_party_id] ?? poolQuestion.target_party_id;
            console.log(`  ${bot.display_name} asked ${partyName} (from pool): "${poolQuestion.question.slice(0, 60)}..."`);
            break;
          }

          // ── Fallback: generate on-the-fly (pool empty) ─────────────────
          const targetParty = pick(parties);
          const topic = pick(TOPICS);

          // Load existing questions for this party to avoid duplicates
          const existingQuestions = simDb.prepare(
            "SELECT question FROM citizen_questions WHERE target_party_id = ?",
          ).all(targetParty.id) as Array<{ question: string }>;
          const existingNormalized = new Set(existingQuestions.map(q => normalizeText(q.question)));

          let questionText: string;
          const aiQuestion = await generateAIQuestion(targetParty.name, topic, billTitles, existingNormalized);
          if (aiQuestion) {
            questionText = aiQuestion;
            result.aiCalls++;
          } else {
            // Template fallback: try templates until we find a non-duplicate
            const shuffled = [...QUESTION_TEMPLATES].sort(() => Math.random() - 0.5);
            let found = false;
            questionText = "";
            for (const template of shuffled) {
              const candidate = template.replace("{topic}", topic);
              if (!existingNormalized.has(normalizeText(candidate))) {
                questionText = candidate;
                found = true;
                break;
              }
            }
            if (!found) break;
          }

          // Final duplicate check
          if (existingNormalized.has(normalizeText(questionText))) break;

          const qId = `q-bot-${uuid().slice(0, 12)}`;
          if (!dryRun) {
            insertQuestion.run(qId, questionText, targetParty.id, currentDay, bot.id, topic);
            insertAction.run(uuid(), bot.id, "submit_question", qId, "question", JSON.stringify({ targetPartyId: targetParty.id, topic }), currentDay, isoNow);
          }
          result.actions++;
          result.breakdown.ask_question = (result.breakdown.ask_question ?? 0) + 1;
          console.log(`  ${bot.display_name} asked ${targetParty.name} (fallback): "${questionText.slice(0, 60)}..."`);
          break;
        }

        case "submit_proposal": {
          if (!bot.party_id) break;
          if (!checkBotDailyLimit(userDb, bot.id, "submit_proposal")) break;
          const topic = pick(TOPICS);
          const partyName = partyNameMap[bot.party_id] ?? bot.party_id;

          // Load existing proposal titles for this party to avoid duplicates
          const existingProposals = userDb.prepare(
            "SELECT title FROM internal_proposals WHERE party_id = ?",
          ).all(bot.party_id) as Array<{ title: string }>;
          const existingTitles = new Set(existingProposals.map(p => normalizeText(p.title)));

          let title: string, description: string, rationale: string;
          const aiProposal = await generateAIProposal(partyName, topic, existingTitles);
          if (aiProposal) {
            title = aiProposal.title;
            description = aiProposal.description;
            rationale = aiProposal.rationale;
            result.aiCalls++;
          } else {
            // Template fallback: try templates until we find a non-duplicate
            const shuffled = [...PROPOSAL_TEMPLATES].sort(() => Math.random() - 0.5);
            let found = false;
            title = ""; description = ""; rationale = "";
            for (const template of shuffled) {
              const candidateTitle = template.title.replace("{topic}", topic);
              if (!existingTitles.has(normalizeText(candidateTitle))) {
                title = candidateTitle;
                description = template.desc.replace("{topic}", topic);
                rationale = `Stärkung im Bereich ${topic} gemäß Parteiprogramm.`;
                found = true;
                break;
              }
            }
            if (!found) break; // All templates for this topic already exist — skip
          }

          // Final duplicate check (AI-generated title might still match)
          if (existingTitles.has(normalizeText(title))) break;

          const pId = uuid();
          const category = pick(CATEGORIES);
          if (!dryRun) {
            insertProposal.run(pId, bot.party_id, bot.id, bot.display_name, title, description, category, rationale, currentDay, currentDay + 7);
            insertAction.run(uuid(), bot.id, "submit_proposal", pId, "proposal", JSON.stringify({ partyId: bot.party_id, topic }), currentDay, isoNow);
          }
          result.actions++;
          result.breakdown.submit_proposal = (result.breakdown.submit_proposal ?? 0) + 1;
          console.log(`  ${bot.display_name} proposed: "${title}"`);
          break;
        }

        case "vote_poll": {
          if (activePolls.length === 0) break;
          const poll = pick(activePolls);
          const options = JSON.parse(poll.options) as string[];
          if (options.length === 0) break;
          const chosen = pick(options);
          if (!dryRun) {
            const currentVotes = simDb.prepare("SELECT votes FROM polls WHERE id = ?").get(poll.id) as { votes: string } | undefined;
            const votesObj = currentVotes ? JSON.parse(currentVotes.votes) as Record<string, number> : {};
            votesObj[chosen] = (votesObj[chosen] ?? 0) + 1;
            simDb.prepare("UPDATE polls SET votes = ? WHERE id = ?").run(JSON.stringify(votesObj), poll.id);
            insertAction.run(uuid(), bot.id, "vote_poll", poll.id, "poll", JSON.stringify({ option: chosen }), currentDay, isoNow);
          }
          result.actions++;
          result.breakdown.vote_poll = (result.breakdown.vote_poll ?? 0) + 1;
          break;
        }

        case "apply_mdb": {
          if (!bot.party_id) break;
          // Check: no existing active seat
          const existingSeat = simDb.prepare(
            "SELECT 1 FROM bundestag_seats WHERE active = 1 AND user_id = ?",
          ).get(bot.id);
          if (existingSeat) break;
          // Check: no pending application
          const pendingApp = userDb.prepare(
            "SELECT 1 FROM mdb_applications WHERE user_id = ? AND status = 'pending'",
          ).get(bot.id);
          if (pendingApp) break;
          // Check: no cooldown
          const recentRejected = userDb.prepare(
            "SELECT cooldown_until_day FROM mdb_applications WHERE user_id = ? AND status = 'rejected' AND cooldown_until_day > ?",
          ).get(bot.id, currentDay);
          if (recentRejected) break;
          // Check: open bot seats exist for party
          const openBotSeats = simDb.prepare(
            "SELECT COUNT(*) as cnt FROM bundestag_seats WHERE active = 1 AND controller = 'bot' AND user_id IS NULL AND party_id = ?",
          ).get(bot.party_id) as { cnt: number };
          if (openBotSeats.cnt === 0) break;

          const topic = pick(TOPICS);
          const template = pick(MDB_APPLICATION_TEMPLATES);
          const applicationText = template.replace("{topic}", topic);
          const policyFocus = [topic, pick(TOPICS.filter(t => t !== topic))];
          const appId = uuid();

          if (!dryRun) {
            userDb.prepare(
              "INSERT INTO mdb_applications (id, user_id, party_id, application_text, policy_focus, status, created_on_day) VALUES (?, ?, ?, ?, ?, 'pending', ?)",
            ).run(appId, bot.id, bot.party_id, applicationText, JSON.stringify(policyFocus), currentDay);
            insertAction.run(uuid(), bot.id, "apply_mdb", appId, "application", JSON.stringify({ partyId: bot.party_id, topic }), currentDay, isoNow);
          }
          result.actions++;
          result.breakdown.apply_mdb = (result.breakdown.apply_mdb ?? 0) + 1;
          console.log(`  ${bot.display_name} applied for MdB seat at ${partyNameMap[bot.party_id] ?? bot.party_id}`);
          break;
        }

        case "submit_speech": {
          if (!bot.party_id) break;
          if (!checkBotDailyLimit(userDb, bot.id, "submit_speech")) break;
          if (billsInReading.length === 0) break;

          // Bot must have an active MdB seat
          const seat = simDb.prepare(
            "SELECT 1 FROM bundestag_seats WHERE active = 1 AND user_id = ?",
          ).get(bot.id);
          if (!seat) break;

          const bill = pick(billsInReading);
          const statusToReading: Record<string, number> = { first_reading: 1, second_reading: 2, third_reading: 3 };
          const reading = statusToReading[bill.status];
          if (!reading) break;

          // Check hasn't already spoken on this bill+reading
          if (hasSpeech.get(bill.id, bot.id, reading)) break;

          const partyName = partyNameMap[bot.party_id] ?? bot.party_id;
          let speechContent: string;
          const aiSpeech = await generateAISpeech(partyName, bill.title, reading);
          if (aiSpeech && aiSpeech.length >= 20) {
            speechContent = aiSpeech;
            result.aiCalls++;
          } else {
            const topic = bill.category || pick(TOPICS);
            speechContent = pick(SPEECH_TEMPLATES).replace("{topic}", topic);
          }

          const speechId = uuid();
          if (!dryRun) {
            insertSpeech.run(speechId, bot.id, bill.id, reading, speechContent, currentDay, now);
            insertAction.run(uuid(), bot.id, "submit_speech", speechId, "bill", JSON.stringify({ billId: bill.id, reading }), currentDay, isoNow);
          }
          result.actions++;
          result.breakdown.submit_speech = (result.breakdown.submit_speech ?? 0) + 1;
          console.log(`  ${bot.display_name} spoke on "${bill.title}" (${reading}. Lesung)`);
          break;
        }
      }

      if (!dryRun) updateLastActive.run(now, bot.id);
    } catch (err) {
      console.error(`  Error for bot ${bot.display_name}:`, err);
    }
  }

  console.log(`[bot-activity] Done: ${result.actions} actions, ${result.aiCalls} AI calls`);
  if (Object.keys(result.breakdown).length > 0) console.log(`  Breakdown:`, result.breakdown);

  return result;
}

// ── Standalone execution ────────────────────────────────────────────────────

const isMain = process.argv[1]?.endsWith("run-bot-activity.ts") ||
               process.argv[1]?.endsWith("run-bot-activity");

if (isMain) {
  const dryRun = process.argv.includes("--dry-run");
  runBotTick({ dryRun }).catch(err => {
    console.error("Bot activity failed:", err);
    process.exit(1);
  });
}
