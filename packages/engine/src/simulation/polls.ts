import type { Crisis, Party, Poll } from "@ki-bundestag/types";
import { getClient, MODELS, MAX_TOKENS } from "../agent/client.js";
import { getDb, schema } from "../db/index.js";
import { eq, and } from "drizzle-orm";

function generateId(): string {
  return Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}

/**
 * Generate a weekly party preference poll.
 */
function createPartyPreferencePoll(parties: Party[], currentDay: number): Poll {
  return {
    id: `poll-pref-${generateId()}`,
    question: "Which party do you trust most to lead Germany?",
    options: parties.map(p => p.name),
    votes: Object.fromEntries(parties.map(p => [p.name, 0])),
    createdOnDay: currentDay,
    expiresOnDay: currentDay + 7,
    active: true,
    category: "party_preference",
  };
}

/**
 * Generate a context-driven poll based on current events.
 */
async function createContextPoll(
  parties: Party[],
  activeCrises: Crisis[],
  recentBillTitles: string[],
  currentDay: number,
): Promise<Poll | null> {
  const client = getClient();

  const context = [];
  if (activeCrises.length > 0) {
    context.push(`Active crises: ${activeCrises.map(c => `${c.name} (${c.severity})`).join(", ")}`);
  }
  if (recentBillTitles.length > 0) {
    context.push(`Recent bills: ${recentBillTitles.slice(0, 5).join(", ")}`);
  }

  if (context.length === 0) return null;

  try {
    const response = await client.messages.create({
      model: MODELS.daily,
      max_tokens: 512,
      system: `You create opinion poll questions for a German political simulation. Respond with ONLY valid JSON.

RESPONSE SCHEMA:
{
  "question": "<poll question about current political topic>",
  "options": ["<option 1>", "<option 2>", "<option 3>"],
  "category": "policy" | "crisis" | "general"
}

Rules:
- Question should be relevant to the current political context
- Provide 3 clear, distinct options
- Keep it concise and politically neutral`,
      messages: [{
        role: "user",
        content: `Current political context:\n${context.join("\n")}\n\nGenerate an opinion poll question.`,
      }],
    });

    const text = response.content
      .filter(block => block.type === "text")
      .map(block => block.text)
      .join("");

    let jsonStr = text.trim();
    const match = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) jsonStr = match[1].trim();

    const parsed = JSON.parse(jsonStr);

    if (!parsed.question || !Array.isArray(parsed.options) || parsed.options.length < 2) {
      return null;
    }

    return {
      id: `poll-ctx-${generateId()}`,
      question: parsed.question,
      options: parsed.options,
      votes: Object.fromEntries(parsed.options.map((o: string) => [o, 0])),
      createdOnDay: currentDay,
      expiresOnDay: currentDay + 7,
      active: true,
      category: parsed.category || "general",
    };
  } catch (error) {
    console.error("  [Polls] Error generating context poll:", error);
    return null;
  }
}

/**
 * Run weekly poll generation: create party preference poll + optionally a context poll.
 */
export async function generateWeeklyPolls(
  parties: Party[],
  activeCrises: Crisis[],
  recentBillTitles: string[],
  currentDay: number,
): Promise<void> {
  const db = getDb();

  // Always create party preference poll
  const prefPoll = createPartyPreferencePoll(parties, currentDay);
  db.insert(schema.polls).values({
    id: prefPoll.id,
    question: prefPoll.question,
    options: prefPoll.options as any,
    votes: prefPoll.votes as any,
    createdOnDay: prefPoll.createdOnDay,
    expiresOnDay: prefPoll.expiresOnDay,
    active: prefPoll.active,
    category: prefPoll.category,
  }).run();
  console.log(`  [Polls] Created party preference poll`);

  // Try to create a context poll
  const ctxPoll = await createContextPoll(parties, activeCrises, recentBillTitles, currentDay);
  if (ctxPoll) {
    db.insert(schema.polls).values({
      id: ctxPoll.id,
      question: ctxPoll.question,
      options: ctxPoll.options as any,
      votes: ctxPoll.votes as any,
      createdOnDay: ctxPoll.createdOnDay,
      expiresOnDay: ctxPoll.expiresOnDay,
      active: ctxPoll.active,
      category: ctxPoll.category,
    }).run();
    console.log(`  [Polls] Created context poll: "${ctxPoll.question}"`);
  }
}

/**
 * Close expired polls and apply their effects.
 */
export function resolveExpiredPolls(
  currentDay: number,
  parties: Party[],
  publicSentiment: number,
): number {
  const db = getDb();
  let sentimentDelta = 0;

  const activePolls = db.select().from(schema.polls).all()
    .filter((p: any) => p.active);

  for (const row of activePolls) {
    if (row.expiresOnDay != null && row.expiresOnDay <= currentDay) {
      // Close the poll
      db.update(schema.polls)
        .set({ active: false })
        .where(eq(schema.polls.id, row.id))
        .run();

      const votes = row.votes as unknown as Record<string, number>;
      const totalVotes = Object.values(votes).reduce((s, v) => s + v, 0);

      if (totalVotes > 0 && row.category === "party_preference") {
        // Top-voted party gets a small approval boost
        const entries = Object.entries(votes).sort((a, b) => b[1] - a[1]);
        const topOption = entries[0][0];
        const topParty = parties.find(p => p.name === topOption);
        if (topParty) {
          topParty.approvalRating = Math.min(60, Math.round((topParty.approvalRating + 0.3) * 10) / 10);
          console.log(`  [Polls] ${topParty.name} gets +0.3 approval from poll results`);
        }
      }

      console.log(`  [Polls] Closed poll: "${row.question}" (${totalVotes} votes)`);
    }
  }

  return sentimentDelta;
}
