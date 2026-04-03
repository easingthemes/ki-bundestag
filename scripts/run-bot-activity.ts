/**
 * run-bot-activity.ts — Simulate user activity from bot users
 *
 * Runs a single tick of bot activity: picks bots that should act this tick,
 * generates actions (some with AI, some DB-only), and logs everything.
 *
 * Activity levels control probability per tick (designed for ~4h intervals):
 *   high:   30% chance/tick → ~2 actions/day
 *   medium: 15% chance/tick → ~1 action/day
 *   low:     5% chance/tick → ~1 action/3 days
 *   lurker:  2% chance/tick → ~1 action/week
 *
 * Usage:
 *   npx tsx scripts/run-bot-activity.ts           # one tick
 *   npx tsx scripts/run-bot-activity.ts --dry-run  # preview without writing
 *
 * Run: npm run bot:activity
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

const DRY_RUN = process.argv.includes("--dry-run");

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
  ask_question: number;      // needs AI
  submit_proposal: number;   // needs AI
  vote_poll: number;
}

const STYLE_WEIGHTS: Record<string, ActionWeights> = {
  questioner: { vote_question: 2, vote_proposal: 1, signal_bill: 1, ask_question: 5, submit_proposal: 1, vote_poll: 1 },
  voter:      { vote_question: 4, vote_proposal: 4, signal_bill: 3, ask_question: 1, submit_proposal: 0, vote_poll: 3 },
  proposer:   { vote_question: 1, vote_proposal: 2, signal_bill: 2, ask_question: 1, submit_proposal: 5, vote_poll: 1 },
  observer:   { vote_question: 3, vote_proposal: 2, signal_bill: 2, ask_question: 1, submit_proposal: 0, vote_poll: 2 },
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function uuid(): string { return crypto.randomUUID(); }
function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

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

// ── Static question/proposal templates ──────────────────────────────────────
// Used when ANTHROPIC_API_KEY is not available; AI generation is preferred

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

// ── AI question generation (optional) ───────────────────────────────────────

async function generateAIQuestion(
  partyName: string,
  topic: string,
  recentBills: string[],
): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    const prompt = `Du bist ein engagierter deutscher Bürger. Stelle eine kurze, spezifische Frage (1-2 Sätze, max 200 Zeichen) an die Partei "${partyName}" zum Thema "${topic}".${recentBills.length > 0 ? ` Aktuelle Gesetzentwürfe: ${recentBills.slice(0, 3).join(", ")}.` : ""} Antworte NUR mit der Frage, ohne Anführungszeichen.`;

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
): Promise<{ title: string; description: string; rationale: string } | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    const prompt = `Du bist Mitglied der Partei "${partyName}". Erstelle einen kurzen Parteiinternen Vorschlag zum Thema "${topic}". Antworte als JSON: {"title": "...", "description": "...", "rationale": "..."}. Titel max 60 Zeichen, Beschreibung max 200 Zeichen, Begründung max 150 Zeichen. Nur JSON, kein Markdown.`;

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

    // Strip code fences if present
    const cleaned = text.replace(/```json\n?/g, "").replace(/```/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const userDb = new Database(USER_DB_PATH);
  userDb.pragma("journal_mode = WAL");
  userDb.pragma("foreign_keys = ON");

  const simDb = new Database(SIM_DB_PATH);
  simDb.pragma("journal_mode = WAL");
  simDb.pragma("foreign_keys = ON");

  // Get current simulation state
  const meta = simDb.prepare("SELECT current_day FROM simulation_meta LIMIT 1").get() as
    | { current_day: number }
    | undefined;
  const currentDay = meta?.current_day ?? 0;

  // Get all bot users
  const bots = userDb.prepare(
    "SELECT id, display_name, party_id, bot_profile, last_active FROM users WHERE is_bot = 1",
  ).all() as Array<{
    id: string;
    display_name: string;
    party_id: string | null;
    bot_profile: string | null;
    last_active: number;
  }>;

  if (bots.length === 0) {
    console.log("No bot users found. Run: npm run seed:demo-users");
    userDb.close();
    simDb.close();
    return;
  }

  // Get parties for context
  const parties = simDb.prepare("SELECT id, name FROM parties").all() as Array<{ id: string; name: string }>;
  const partyNameMap: Record<string, string> = {};
  for (const p of parties) partyNameMap[p.id] = p.name;

  // Get recent bills for AI context
  const recentBills = simDb.prepare(
    "SELECT title FROM bills ORDER BY proposed_on_day DESC LIMIT 10",
  ).all() as Array<{ title: string }>;
  const billTitles = recentBills.map(b => b.title);

  // Get open proposals, pending questions, active polls for voting
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

  // Filter bots by activity chance
  const activeBots = bots.filter(bot => {
    const profile = bot.bot_profile ? JSON.parse(bot.bot_profile) : { activityLevel: "low" };
    const chance = ACTIVITY_CHANCE[profile.activityLevel] ?? 0.05;
    return Math.random() < chance;
  });

  console.log(`[bot-activity] Day ${currentDay} | ${bots.length} bots total, ${activeBots.length} active this tick`);
  if (DRY_RUN) console.log("  (dry-run mode — no changes will be written)");

  if (activeBots.length === 0) {
    userDb.close();
    simDb.close();
    return;
  }

  // Stats
  let actions = 0;
  let aiCalls = 0;
  const actionCounts: Record<string, number> = {};

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

  // Check if user already voted/signaled (to avoid conflicts)
  const hasQuestionVote = userDb.prepare(
    "SELECT 1 FROM question_votes WHERE question_id = ? AND user_id = ?",
  );
  const hasInternalVote = userDb.prepare(
    "SELECT 1 FROM internal_votes WHERE proposal_id = ? AND user_id = ?",
  );
  const hasSignal = userDb.prepare(
    "SELECT 1 FROM member_signals WHERE bill_id = ? AND user_id = ?",
  );

  const now = Date.now();
  const isoNow = new Date(now).toISOString();

  for (const bot of activeBots) {
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
          if (!DRY_RUN) {
            insertQuestionVote.run(uuid(), q.id, bot.id, vote, now);
            insertAction.run(uuid(), bot.id, "vote_question", q.id, "question", JSON.stringify({ vote }), currentDay, isoNow);
          }
          actions++;
          actionCounts.vote_question = (actionCounts.vote_question ?? 0) + 1;
          break;
        }

        case "vote_proposal": {
          if (!bot.party_id) break;
          const partyProposals = openProposals.filter(p => p.party_id === bot.party_id);
          if (partyProposals.length === 0) break;
          const p = pick(partyProposals);
          if (hasInternalVote.get(p.id, bot.id)) break;
          const vote = Math.random() < 0.75 ? 1 : -1;
          if (!DRY_RUN) {
            insertInternalVote.run(uuid(), p.id, bot.id, vote, now);
            // Update vote score
            userDb.prepare(
              "UPDATE internal_proposals SET vote_score = vote_score + ?, total_votes = total_votes + 1 WHERE id = ?",
            ).run(vote, p.id);
            insertAction.run(uuid(), bot.id, "vote_on_proposal", p.id, "proposal", JSON.stringify({ vote }), currentDay, isoNow);
          }
          actions++;
          actionCounts.vote_proposal = (actionCounts.vote_proposal ?? 0) + 1;
          break;
        }

        case "signal_bill": {
          if (!bot.party_id || activeBills.length === 0) break;
          const bill = pick(activeBills);
          if (hasSignal.get(bill.id, bot.id)) break;
          const signal = Math.random() < 0.6 ? "yes" : "no";
          if (!DRY_RUN) {
            insertSignal.run(uuid(), bill.id, bot.id, signal, now);
            insertAction.run(uuid(), bot.id, "signal_bill", bill.id, "bill", JSON.stringify({ signal }), currentDay, isoNow);
          }
          actions++;
          actionCounts.signal_bill = (actionCounts.signal_bill ?? 0) + 1;
          break;
        }

        case "ask_question": {
          const targetParty = pick(parties);
          const topic = pick(TOPICS);

          // Try AI generation first, fall back to template
          let questionText: string;
          const aiQuestion = await generateAIQuestion(targetParty.name, topic, billTitles);
          if (aiQuestion) {
            questionText = aiQuestion;
            aiCalls++;
          } else {
            const template = pick(QUESTION_TEMPLATES);
            questionText = template.replace("{topic}", topic);
          }

          const qId = `q-bot-${uuid().slice(0, 12)}`;
          if (!DRY_RUN) {
            insertQuestion.run(qId, questionText, targetParty.id, currentDay, bot.id, topic);
            insertAction.run(uuid(), bot.id, "submit_question", qId, "question", JSON.stringify({ targetPartyId: targetParty.id, topic }), currentDay, isoNow);
          }
          actions++;
          actionCounts.ask_question = (actionCounts.ask_question ?? 0) + 1;
          console.log(`  ${bot.display_name} asked ${targetParty.name}: "${questionText.slice(0, 60)}..."`);
          break;
        }

        case "submit_proposal": {
          if (!bot.party_id) break;
          const topic = pick(TOPICS);
          const partyName = partyNameMap[bot.party_id] ?? bot.party_id;

          let title: string, description: string, rationale: string;
          const aiProposal = await generateAIProposal(partyName, topic);
          if (aiProposal) {
            title = aiProposal.title;
            description = aiProposal.description;
            rationale = aiProposal.rationale;
            aiCalls++;
          } else {
            const template = pick(PROPOSAL_TEMPLATES);
            title = template.title.replace("{topic}", topic);
            description = template.desc.replace("{topic}", topic);
            rationale = `Stärkung im Bereich ${topic} gemäß Parteiprogramm.`;
          }

          const pId = uuid();
          const category = pick(CATEGORIES);
          if (!DRY_RUN) {
            insertProposal.run(
              pId, bot.party_id, bot.id, bot.display_name,
              title, description, category, rationale,
              currentDay, currentDay + 7,
            );
            insertAction.run(uuid(), bot.id, "submit_proposal", pId, "proposal", JSON.stringify({ partyId: bot.party_id, topic }), currentDay, isoNow);
          }
          actions++;
          actionCounts.submit_proposal = (actionCounts.submit_proposal ?? 0) + 1;
          console.log(`  ${bot.display_name} proposed: "${title}"`);
          break;
        }

        case "vote_poll": {
          if (activePolls.length === 0) break;
          const poll = pick(activePolls);
          const options = JSON.parse(poll.options) as string[];
          if (options.length === 0) break;
          const chosen = pick(options);

          // Update poll votes (JSON object with option → count)
          if (!DRY_RUN) {
            const currentVotes = simDb.prepare("SELECT votes FROM polls WHERE id = ?").get(poll.id) as { votes: string } | undefined;
            const votesObj = currentVotes ? JSON.parse(currentVotes.votes) as Record<string, number> : {};
            votesObj[chosen] = (votesObj[chosen] ?? 0) + 1;
            simDb.prepare("UPDATE polls SET votes = ? WHERE id = ?").run(JSON.stringify(votesObj), poll.id);
            insertAction.run(uuid(), bot.id, "vote_poll", poll.id, "poll", JSON.stringify({ option: chosen }), currentDay, isoNow);
          }
          actions++;
          actionCounts.vote_poll = (actionCounts.vote_poll ?? 0) + 1;
          break;
        }
      }

      // Update last active
      if (!DRY_RUN) {
        updateLastActive.run(now, bot.id);
      }
    } catch (err) {
      console.error(`  Error for bot ${bot.display_name}:`, err);
    }
  }

  userDb.close();
  simDb.close();

  console.log(`\n[bot-activity] Results: ${actions} actions, ${aiCalls} AI calls`);
  console.log(`  Breakdown:`, actionCounts);
}

main().catch(err => {
  console.error("Bot activity failed:", err);
  process.exit(1);
});
