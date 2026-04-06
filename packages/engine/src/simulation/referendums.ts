import type { BillImpact, Crisis, Party, Referendum, SimulationEvent } from "@ki-bundestag/types";
import { callAI, AIProviderLimitError } from "../agent/client.js";
import { parseAIJson, logAICall } from "../agent/ai-json.js";
import { getDb, schema } from "../db/index.js";
import { eq } from "drizzle-orm";
import { TIME_CONFIG } from "./timing.js";
import type { BatchRequest, BatchResult } from "../agent/batch-client.js";
import type { Provider } from "../agent/model-config.js";
import {
  REFERENDUM_ACTIVE_DAYS, REFERENDUM_MIN_VOTES,
  REFERENDUM_SYSTEM, REFERENDUM_VALID_CATEGORIES as VALID_CATEGORIES,
} from "../config/index.js";

function generateId(): string {
  return Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}

/**
 * Auto-generate a referendum every 30 days based on current political context.
 */
export async function maybeGenerateReferendum(
  currentDay: number,
  allParties: Party[],
  activeCrises: Crisis[],
  recentBillTitles: string[],
): Promise<void> {
  // Only generate on days divisible by ECONOMY_INTERVAL (30)
  if (currentDay % TIME_CONFIG.ECONOMY_INTERVAL !== 0 || currentDay === 0) return;

  // Don't generate if there's already an active referendum
  const db = getDb();
  const activeRows = db.select().from(schema.referendums).all()
    .filter((r: any) => r.status === "active");
  if (activeRows.length > 0) return;

  const context: string[] = [];
  if (activeCrises.length > 0) {
    context.push(`Active crises: ${activeCrises.map(c => `${c.name} (${c.severity})`).join(", ")}`);
  }
  if (recentBillTitles.length > 0) {
    context.push(`Recent bills: ${recentBillTitles.slice(0, 5).join(", ")}`);
  }
  const partyContext = allParties.map(p =>
    `${p.name} (${p.coalitionRole}, ${p.approvalRating}% approval)`,
  ).join(", ");
  context.push(`Parties: ${partyContext}`);

  const t0 = Date.now();
  try {
    const { text, model, provider } = await callAI({
      system: REFERENDUM_SYSTEM,
      prompt: `Current political context:\n${context.join("\n")}\n\nGenerate a referendum topic for day ${currentDay}.`,
      maxTokens: 512,
      roleKey: "daily",
    });

    const parsed = parseAIJson<{ title: string; description: string; category: string; impact: BillImpact | null }>(
      text,
      (v: unknown) => {
        const o = v as Record<string, unknown>;
        if (typeof o.title !== "string" || typeof o.description !== "string") return null;
        const category = typeof o.category === "string" && VALID_CATEGORIES.includes(o.category)
          ? o.category
          : "economy";
        return {
          title: o.title,
          description: o.description,
          category,
          impact: (o.impact && typeof o.impact === "object") ? o.impact as BillImpact : null,
        };
      },
      "Referendums",
    );

    if (!parsed) {
      logAICall({ task: "referendums", model, provider, latencyMs: Date.now() - t0, parseOk: false, validationOk: false, fallback: "skip" });
      return;
    }

    const referendum: Referendum = {
      id: `ref-${generateId()}`,
      title: parsed.title,
      description: parsed.description,
      options: ["Yes", "No"],
      votes: { Yes: 0, No: 0 },
      createdOnDay: currentDay,
      closesOnDay: currentDay + REFERENDUM_ACTIVE_DAYS,
      status: "active",
      result: null,
      impact: parsed.impact || null,
      category: parsed.category,
    };

    db.insert(schema.referendums).values({
      id: referendum.id,
      title: referendum.title,
      description: referendum.description,
      options: referendum.options as any,
      votes: referendum.votes as any,
      createdOnDay: referendum.createdOnDay,
      closesOnDay: referendum.closesOnDay,
      status: referendum.status,
      result: null,
      impact: referendum.impact as any,
      category: referendum.category,
    }).run();

    logAICall({ task: "referendums", model, provider, latencyMs: Date.now() - t0, parseOk: true, validationOk: true });
  } catch (error) {
    if (error instanceof AIProviderLimitError) {
      console.warn(`  [Referendums] Skipped (${error.message})`);
    } else {
      console.error("  [Referendums] Error generating referendum:", error);
    }
    logAICall({ task: "referendums", latencyMs: Date.now() - t0, parseOk: false, validationOk: false, fallback: "skip" });
  }
}

/**
 * Resolve expired referendums: tally votes, apply impact, create events.
 */
export function resolveExpiredReferendums(
  currentDay: number,
  dayEvents: Array<Omit<SimulationEvent, "id">>,
): void {
  const db = getDb();
  const activeRows = db.select().from(schema.referendums).all()
    .filter((r: any) => r.status === "active");

  for (const row of activeRows) {
    if (row.closesOnDay > currentDay) continue;

    const votes = row.votes as unknown as Record<string, number>;
    const totalVotes = Object.values(votes).reduce((s, v) => s + v, 0);

    let status: "passed" | "rejected" | "expired";
    let result: string | null = null;

    if (totalVotes < REFERENDUM_MIN_VOTES) {
      // Not enough votes — expired
      status = "expired";
      console.log(`  [Referendums] Expired (insufficient votes): "${row.title}" (${totalVotes} votes)`);
    } else {
      // Majority wins
      const yesVotes = votes["Yes"] || 0;
      const noVotes = votes["No"] || 0;

      if (yesVotes > noVotes) {
        status = "passed";
        result = "Yes";
      } else {
        status = "rejected";
        result = "No";
      }

      console.log(`  [Referendums] ${status}: "${row.title}" (Yes: ${yesVotes}, No: ${noVotes})`);
    }

    db.update(schema.referendums)
      .set({ status, result })
      .where(eq(schema.referendums.id, row.id))
      .run();

    // If passed, apply impact to national state
    if (status === "passed" && row.impact) {
      const impact = row.impact as unknown as BillImpact;
      const stateRows = db.select().from(schema.nationalState).all();
      if (stateRows.length > 0) {
        const s = stateRows[0];
        const updates: Record<string, number> = {};
        if (impact.budget) updates.budget = Math.round((s.budget + impact.budget) * 10) / 10;
        if (impact.unemployment) updates.unemployment = Math.max(0, Math.round((s.unemployment + impact.unemployment) * 10) / 10);
        if (impact.inflation) updates.inflation = Math.max(0, Math.round((s.inflation + impact.inflation) * 10) / 10);
        if (impact.gdpGrowth) updates.gdpGrowth = Math.round((s.gdpGrowth + impact.gdpGrowth) * 10) / 10;
        if (impact.publicSentiment) updates.publicSentiment = Math.max(5, Math.min(75, Math.round((s.publicSentiment + impact.publicSentiment) * 10) / 10));

        if (Object.keys(updates).length > 0) {
          db.update(schema.nationalState)
            .set(updates)
            .where(eq(schema.nationalState.id, s.id))
            .run();
        }
      }
    }

    dayEvents.push({
      dayNumber: currentDay,
      type: "day_start", // reuse existing type for referendum events
      actor: "system",
      title: `Referendum ${status}: "${row.title}"`,
      description: status === "expired"
        ? `The referendum did not receive enough votes (${totalVotes}/10 minimum).`
        : `Result: ${result} (${votes["Yes"] || 0} Yes, ${votes["No"] || 0} No). ${status === "passed" ? "The measure will be implemented." : "The measure was rejected."}`,
      data: { referendumId: row.id, status, result, totalVotes },
    });
  }
}

// ---------------------------------------------------------------------------
// Batch variants
// ---------------------------------------------------------------------------

// REFERENDUM_SYSTEM imported from config

/**
 * Build a BatchRequest for referendum generation, or null if not applicable.
 */
export function buildReferendumBatchRequest(
  currentDay: number,
  allParties: Party[],
  activeCrises: Crisis[],
  recentBillTitles: string[],
): BatchRequest | null {
  if (currentDay % TIME_CONFIG.ECONOMY_INTERVAL !== 0 || currentDay === 0) return null;

  const db = getDb();
  const activeRows = db.select().from(schema.referendums).all()
    .filter((r: any) => r.status === "active");
  if (activeRows.length > 0) return null;

  const context: string[] = [];
  if (activeCrises.length > 0) {
    context.push(`Active crises: ${activeCrises.map(c => `${c.name} (${c.severity})`).join(", ")}`);
  }
  if (recentBillTitles.length > 0) {
    context.push(`Recent bills: ${recentBillTitles.slice(0, 5).join(", ")}`);
  }
  const partyContext = allParties.map(p =>
    `${p.name} (${p.coalitionRole}, ${p.approvalRating}% approval)`,
  ).join(", ");
  context.push(`Parties: ${partyContext}`);

  return {
    customId: `referendum-day${currentDay}`,
    system: REFERENDUM_SYSTEM,
    prompt: `Current political context:\n${context.join("\n")}\n\nGenerate a referendum topic for day ${currentDay}.`,
    maxTokens: 512,
    roleKey: "daily",
  };
}

/**
 * Process a referendum batch result — parse and insert into DB.
 */
export function processReferendumBatchResult(
  result: BatchResult | undefined,
  currentDay: number,
): void {
  if (!result || !result.text) {
    logAICall({ task: "referendums", model: result?.model ?? "unknown", provider: (result?.provider ?? "anthropic") as Provider, latencyMs: 0, parseOk: false, validationOk: false, fallback: "skip" });
    return;
  }

  const parsed = parseAIJson<{ title: string; description: string; category: string; impact: BillImpact | null }>(
    result.text,
    (v: unknown) => {
      const o = v as Record<string, unknown>;
      if (typeof o.title !== "string" || typeof o.description !== "string") return null;
      const category = typeof o.category === "string" && VALID_CATEGORIES.includes(o.category)
        ? o.category
        : "economy";
      return {
        title: o.title,
        description: o.description,
        category,
        impact: (o.impact && typeof o.impact === "object") ? o.impact as BillImpact : null,
      };
    },
    "Referendums",
  );

  if (!parsed) {
    logAICall({ task: "referendums", model: result.model, provider: result.provider as Provider, latencyMs: 0, parseOk: false, validationOk: false, fallback: "skip" });
    return;
  }

  const db = getDb();
  const referendum: Referendum = {
    id: `ref-${generateId()}`,
    title: parsed.title,
    description: parsed.description,
    options: ["Yes", "No"],
    votes: { Yes: 0, No: 0 },
    createdOnDay: currentDay,
    closesOnDay: currentDay + REFERENDUM_ACTIVE_DAYS,
    status: "active",
    result: null,
    impact: parsed.impact || null,
    category: parsed.category,
  };

  db.insert(schema.referendums).values({
    id: referendum.id,
    title: referendum.title,
    description: referendum.description,
    options: referendum.options as any,
    votes: referendum.votes as any,
    createdOnDay: referendum.createdOnDay,
    closesOnDay: referendum.closesOnDay,
    status: referendum.status,
    result: null,
    impact: referendum.impact as any,
    category: referendum.category,
  }).run();

  logAICall({ task: "referendums", model: result.model, provider: result.provider as Provider, latencyMs: 0, parseOk: true, validationOk: true });
  console.log(`  [Referendums] Created: "${parsed.title}"`);
}
