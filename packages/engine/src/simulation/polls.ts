import type { Crisis, Party, Poll } from "@ki-bundestag/types";
import { callAI, AIProviderLimitError } from "../agent/client.js";
import { parseAIJson, logAICall } from "../agent/ai-json.js";
import { getDb, schema } from "../db/index.js";
import { eq, and } from "drizzle-orm";
import type { BatchRequest, BatchResult } from "../agent/batch-client.js";
import type { Provider } from "../agent/model-config.js";
import { POLL_ACTIVE_DAYS, POLL_WINNER_APPROVAL_BOOST, CONTEXT_POLL_SYSTEM } from "../config/index.js";

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
    expiresOnDay: currentDay + POLL_ACTIVE_DAYS,
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
  const context = [];
  if (activeCrises.length > 0) {
    context.push(`Active crises: ${activeCrises.map(c => `${c.name} (${c.severity})`).join(", ")}`);
  }
  if (recentBillTitles.length > 0) {
    context.push(`Recent bills: ${recentBillTitles.slice(0, 5).join(", ")}`);
  }

  if (context.length === 0) return null;

  const t0 = Date.now();
  try {
    const { text, model, provider } = await callAI({
      system: CONTEXT_POLL_SYSTEM,
      prompt: `Current political context:\n${context.join("\n")}\n\nGenerate an opinion poll question.`,
      maxTokens: 512,
      roleKey: "daily",
    });

    const parsed = parseAIJson<{ question: string; options: string[]; category: string }>(
      text,
      (v: unknown) => {
        const o = v as Record<string, unknown>;
        if (typeof o.question !== "string") return null;
        if (!Array.isArray(o.options) || o.options.length < 2) return null;
        if (!o.options.every((opt: unknown) => typeof opt === "string")) return null;
        return {
          question: o.question,
          options: o.options as string[],
          category: typeof o.category === "string" ? o.category : "general",
        };
      },
      "Polls",
    );

    if (!parsed) {
      logAICall({ task: "polls", model, provider, latencyMs: Date.now() - t0, parseOk: false, validationOk: false, fallback: "skip" });
      return null;
    }

    logAICall({ task: "polls", model, provider, latencyMs: Date.now() - t0, parseOk: true, validationOk: true });

    return {
      id: `poll-ctx-${generateId()}`,
      question: parsed.question,
      options: parsed.options,
      votes: Object.fromEntries(parsed.options.map((o: string) => [o, 0])),
      createdOnDay: currentDay,
      expiresOnDay: currentDay + POLL_ACTIVE_DAYS,
      active: true,
      category: parsed.category,
    };
  } catch (error) {
    if (error instanceof AIProviderLimitError) {
      console.warn(`  [Polls] Skipped (${error.message})`);
    } else {
      console.error("  [Polls] Error generating context poll:", error);
    }
    logAICall({ task: "polls", latencyMs: Date.now() - t0, parseOk: false, validationOk: false, fallback: "skip" });
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
          topParty.approvalRating = Math.min(60, Math.round((topParty.approvalRating + POLL_WINNER_APPROVAL_BOOST) * 10) / 10);
          console.log(`  [Polls] ${topParty.name} gets +${POLL_WINNER_APPROVAL_BOOST} approval from poll results`);
        }
      }

      console.log(`  [Polls] Closed poll: "${row.question}" (${totalVotes} votes)`);
    }
  }

  return sentimentDelta;
}

// ---------------------------------------------------------------------------
// Batch variants
// ---------------------------------------------------------------------------

// CONTEXT_POLL_SYSTEM imported from config

/**
 * Build a BatchRequest for a context poll, or null if no context.
 */
export function buildContextPollBatchRequest(
  parties: Party[],
  activeCrises: Crisis[],
  recentBillTitles: string[],
  currentDay: number,
): BatchRequest | null {
  const context = [];
  if (activeCrises.length > 0) {
    context.push(`Active crises: ${activeCrises.map(c => `${c.name} (${c.severity})`).join(", ")}`);
  }
  if (recentBillTitles.length > 0) {
    context.push(`Recent bills: ${recentBillTitles.slice(0, 5).join(", ")}`);
  }
  if (context.length === 0) return null;

  return {
    customId: `poll-ctx-day${currentDay}`,
    system: CONTEXT_POLL_SYSTEM,
    prompt: `Current political context:\n${context.join("\n")}\n\nGenerate an opinion poll question.`,
    maxTokens: 512,
    roleKey: "daily",
  };
}

/**
 * Process a context poll batch result and return a Poll or null.
 */
export function processContextPollBatchResult(
  result: BatchResult | undefined,
  currentDay: number,
): Poll | null {
  if (!result || !result.text) {
    logAICall({ task: "polls", model: result?.model ?? "unknown", provider: (result?.provider ?? "anthropic") as Provider, latencyMs: 0, parseOk: false, validationOk: false, fallback: "skip" });
    return null;
  }

  const parsed = parseAIJson<{ question: string; options: string[]; category: string }>(
    result.text,
    (v: unknown) => {
      const o = v as Record<string, unknown>;
      if (typeof o.question !== "string") return null;
      if (!Array.isArray(o.options) || o.options.length < 2) return null;
      if (!o.options.every((opt: unknown) => typeof opt === "string")) return null;
      return {
        question: o.question,
        options: o.options as string[],
        category: typeof o.category === "string" ? o.category : "general",
      };
    },
    "Polls",
  );

  if (!parsed) {
    logAICall({ task: "polls", model: result.model, provider: result.provider as Provider, latencyMs: 0, parseOk: false, validationOk: false, fallback: "skip" });
    return null;
  }

  logAICall({ task: "polls", model: result.model, provider: result.provider as Provider, latencyMs: 0, parseOk: true, validationOk: true });

  return {
    id: `poll-ctx-${generateId()}`,
    question: parsed.question,
    options: parsed.options,
    votes: Object.fromEntries(parsed.options.map((o: string) => [o, 0])),
    createdOnDay: currentDay,
    expiresOnDay: currentDay + POLL_ACTIVE_DAYS,
    active: true,
    category: parsed.category,
  };
}
