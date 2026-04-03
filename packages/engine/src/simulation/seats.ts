/**
 * MdB seat system — allocation, reset, and query helpers.
 *
 * `bundestag_seats` lives in simulation.db (engine reads during voting).
 * Seat split ratio is preset-configurable via timing.ts.
 */

import { randomUUID } from "node:crypto";
import { eq, and } from "drizzle-orm";
import { getDb, getSqlite, getUserDb, getUserSqlite, schema } from "../db/index.js";
import { parseAIJson, logAICall } from "../agent/ai-json.js";
import { submitBatch, chunkItems, type BatchResult } from "../agent/batch-client.js";
import { buildApplicationSelectPrompt, preFilterApplications, type ApplicationItem, type PartyContext } from "../agent/group-prompts.js";
import { createNotification } from "./event-queue.js";
import { getHumanSeatRatio, getBotSeatRatio, type TimingPreset } from "./timing.js";

/**
 * Allocate seats for a party after an election.
 * Creates `seatCount` rows split three ways:
 *   - "human" seats (filled via human user applications)
 *   - "bot" seats (filled via bot user applications)
 *   - "ai" seats (controlled by AI party agents)
 */
export function allocateSeats(
  partyId: string,
  seatCount: number,
  electionId: string,
  currentDay: number,
  preset: TimingPreset,
): void {
  const db = getDb();
  const humanRatio = getHumanSeatRatio(preset);
  const botRatio = getBotSeatRatio(preset);
  const humanCount = Math.round(seatCount * humanRatio);
  const botCount = Math.max(1, Math.round(seatCount * botRatio));
  const aiCount = Math.max(0, seatCount - humanCount - botCount);

  let seatNumber = 1;

  // Human-available seats (no userId yet — filled via applications)
  for (let i = 0; i < humanCount; i++) {
    db.insert(schema.bundestagSeats).values({
      id: randomUUID(),
      seatNumber: seatNumber++,
      partyId,
      controller: "human",
      userId: null,
      electionId,
      active: true,
      proxyDefault: "party_line",
      disciplineLevel: 0,
      disciplineReason: null,
      allocatedOnDay: currentDay,
    }).run();
  }

  // Bot-available seats (no userId yet — filled via bot applications)
  for (let i = 0; i < botCount; i++) {
    db.insert(schema.bundestagSeats).values({
      id: randomUUID(),
      seatNumber: seatNumber++,
      partyId,
      controller: "bot",
      userId: null,
      electionId,
      active: true,
      proxyDefault: "party_line",
      disciplineLevel: 0,
      disciplineReason: null,
      allocatedOnDay: currentDay,
    }).run();
  }

  // AI-controlled seats
  for (let i = 0; i < aiCount; i++) {
    db.insert(schema.bundestagSeats).values({
      id: randomUUID(),
      seatNumber: seatNumber++,
      partyId,
      controller: "ai",
      userId: null,
      electionId,
      active: true,
      proxyDefault: "party_line",
      disciplineLevel: 0,
      disciplineReason: null,
      allocatedOnDay: currentDay,
    }).run();
  }

  console.log(`  [Seats] ${partyId}: ${seatCount} seats (${humanCount} human, ${botCount} bot, ${aiCount} AI)`);
}

/**
 * Deactivate all seats from the previous term.
 * Called before allocating new seats after an election.
 */
export function resetAllSeats(): void {
  const sqlite = getSqlite();
  sqlite.prepare("UPDATE bundestag_seats SET active = 0").run();
  console.log("  [Seats] All previous seats deactivated");
}

/**
 * Get all active seats, optionally filtered by party.
 */
export function getActiveSeats(partyId?: string) {
  const db = getDb();
  if (partyId) {
    return db.select()
      .from(schema.bundestagSeats)
      .where(and(eq(schema.bundestagSeats.active, true), eq(schema.bundestagSeats.partyId, partyId)))
      .all();
  }
  return db.select()
    .from(schema.bundestagSeats)
    .where(eq(schema.bundestagSeats.active, true))
    .all();
}

/**
 * Get a user's current active seat (if any).
 */
export function getUserSeat(userId: string) {
  const db = getDb();
  return db.select()
    .from(schema.bundestagSeats)
    .where(and(eq(schema.bundestagSeats.active, true), eq(schema.bundestagSeats.userId, userId)))
    .get() ?? null;
}

/**
 * Get counts of open (unoccupied human + bot) seats per party.
 * Optionally filter by controller type.
 */
export function getOpenSeatCounts(controllerFilter?: "human" | "bot"): Record<string, number> {
  const sqlite = getSqlite();
  let sql: string;
  if (controllerFilter) {
    sql = `SELECT party_id, COUNT(*) as cnt FROM bundestag_seats WHERE active = 1 AND controller = '${controllerFilter}' AND user_id IS NULL GROUP BY party_id`;
  } else {
    sql = "SELECT party_id, COUNT(*) as cnt FROM bundestag_seats WHERE active = 1 AND controller IN ('human', 'bot') AND user_id IS NULL GROUP BY party_id";
  }
  const rows = sqlite.prepare(sql).all() as Array<{ party_id: string; cnt: number }>;
  const result: Record<string, number> = {};
  for (const row of rows) {
    result[row.party_id] = row.cnt;
  }
  return result;
}

/**
 * Deactivate a user's active seat (e.g. when leaving party or being expelled).
 * Returns true if a seat was deactivated.
 */
export function deactivateUserSeat(userId: string): boolean {
  const sqlite = getSqlite();
  const result = sqlite.prepare(
    "UPDATE bundestag_seats SET active = 0, user_id = NULL WHERE active = 1 AND user_id = ?"
  ).run(userId);
  return result.changes > 0;
}

/**
 * Calculate activity score for a user's engagement history.
 */
function calcActivityScore(userId: string): number {
  const userSqlite = getUserSqlite();
  const questionCount = userSqlite.prepare(
    "SELECT COUNT(*) as cnt FROM question_votes WHERE user_id = ?"
  ).get(userId) as { cnt: number };
  const proposalCount = userSqlite.prepare(
    "SELECT COUNT(*) as cnt FROM internal_proposals WHERE proposed_by = ?"
  ).get(userId) as { cnt: number };
  const signalCount = userSqlite.prepare(
    "SELECT COUNT(*) as cnt FROM member_signals WHERE user_id = ?"
  ).get(userId) as { cnt: number };

  return Math.min(5, (questionCount.cnt * 0.5) + (proposalCount.cnt * 1) + (signalCount.cnt * 0.3));
}

/**
 * Review pending MdB applications each sim day.
 *
 * Uses selection-style AI prompts: one call per party asks the AI to
 * "select the top N applicants" from the pool, instead of reviewing
 * each application individually. This scales from 18 calls/day to 6,
 * and removes the artificial 3/party/day cap.
 *
 * All party prompts are submitted as a single Anthropic batch
 * (50% cost discount).
 */
export async function reviewMdbApplications(currentDay: number): Promise<void> {
  const db = getDb();
  const userDb = getUserDb();

  const allParties = db.select().from(schema.parties).all();
  const openCounts = getOpenSeatCounts();

  // --- Phase 1: Collect all party prompts ---

  interface AppEntry {
    app: { id: string; userId: string; applicationText: string; policyFocus: unknown; cooldownUntilDay: number | null };
    score: number;
    displayName: string;
    isBot: boolean;
  }

  interface PartyBatch {
    party: PartyContext;
    partyId: string;
    openSeats: number;
    applications: ApplicationItem[];
    appMap: Map<string, AppEntry>;
  }

  const batches: PartyBatch[] = [];

  for (const party of allParties) {
    const partyId = party.id as string;
    const openSeats = openCounts[partyId] ?? 0;
    if (openSeats === 0) continue;

    const pendingApps = userDb.select().from(schema.mdbApplications)
      .where(and(
        eq(schema.mdbApplications.partyId, partyId),
        eq(schema.mdbApplications.status, "pending"),
      ))
      .all();

    if (pendingApps.length === 0) continue;

    // Build ApplicationItems with activity scores and display names
    const appMap = new Map<string, { app: typeof pendingApps[0]; score: number; displayName: string; isBot: boolean }>();
    const items: ApplicationItem[] = [];

    for (const app of pendingApps) {
      const activityScore = calcActivityScore(app.userId);
      const cooldownBonus = (app.cooldownUntilDay == null || currentDay >= app.cooldownUntilDay) ? 1 : 0;
      const lottery = Math.random();
      const score = activityScore + cooldownBonus + lottery;

      const user = userDb.select().from(schema.users)
        .where(eq(schema.users.id, app.userId))
        .get();
      const displayName = user?.displayName ?? "Unknown";
      const isBot = user?.isBot ?? false;

      // Update priority score
      userDb.update(schema.mdbApplications)
        .set({ priorityScore: Math.round(score * 100) / 100 })
        .where(eq(schema.mdbApplications.id, app.id))
        .run();

      appMap.set(app.id, { app, score, displayName, isBot });
      items.push({
        id: app.id,
        userId: app.userId,
        displayName,
        applicationText: app.applicationText,
        policyFocus: app.policyFocus as string[] | null,
        activityScore: score,
      });
    }

    const partyCtx: PartyContext = { id: partyId, name: party.name, ideology: (party as any).ideology ?? "" };
    const filtered = preFilterApplications(items, openSeats);

    batches.push({ party: partyCtx, partyId, openSeats, applications: filtered, appMap });
  }

  if (batches.length === 0) return;

  // --- Phase 2: Build and submit prompts ---

  const batchRequests = batches.flatMap(b => {
    const chunks = chunkItems(b.applications, 200, 160_000);
    return chunks.map((chunk, i) => {
      const req = buildApplicationSelectPrompt(b.party, chunk, b.openSeats, currentDay);
      if (chunks.length > 1) req.customId += `-chunk${i}`;
      return { req, batch: b };
    });
  });

  const t0 = Date.now();
  const results = await submitBatch(batchRequests.map(r => r.req));
  logAICall({ task: "mdb-batch", latencyMs: Date.now() - t0, parseOk: true, validationOk: true });

  // --- Phase 3: Process results ---

  for (const { req, batch } of batchRequests) {
    const result = results.find(r => r.customId === req.customId);
    if (!result || !result.text) {
      console.warn(`  [MdB] No result for ${req.customId}, skipping`);
      continue;
    }

    const parsed = parseAIJson<{ selected: Array<{ id: string; reasoning: string }> }>(
      result.text,
      (v: unknown) => {
        const o = v as Record<string, unknown>;
        if (!Array.isArray(o.selected)) return null;
        const selected = (o.selected as unknown[]).filter((s: unknown) => {
          const item = s as Record<string, unknown>;
          return typeof item.id === "string" && typeof item.reasoning === "string";
        }) as Array<{ id: string; reasoning: string }>;
        return { selected };
      },
      "MdB-Select",
    );

    if (!parsed) {
      console.warn(`  [MdB] Failed to parse selection for ${batch.party.name}, skipping`);
      continue;
    }

    const selectedIds = new Set(parsed.selected.map(s => s.id));

    // Approve selected applicants
    for (const selection of parsed.selected) {
      const entry = batch.appMap.get(selection.id);
      if (!entry) continue;

      const { app, score, displayName, isBot } = entry;
      const reasoning = selection.reasoning.slice(0, 300);

      // Assign seat atomically — match bot users to "bot" seats, humans to "human" seats
      const targetController = isBot ? "bot" : "human";
      const sqlite = getSqlite();
      const assignSeat = sqlite.transaction(() => {
        const openSeat = db.select().from(schema.bundestagSeats)
          .where(and(
            eq(schema.bundestagSeats.partyId, batch.partyId),
            eq(schema.bundestagSeats.active, true),
            eq(schema.bundestagSeats.controller, targetController),
          ))
          .all()
          .find(s => s.userId === null);

        if (!openSeat) return null;

        db.update(schema.bundestagSeats)
          .set({ userId: app.userId })
          .where(eq(schema.bundestagSeats.id, openSeat.id))
          .run();

        return openSeat;
      });

      const openSeat = assignSeat();

      if (openSeat) {
        userDb.update(schema.mdbApplications).set({
          status: "approved",
          aiReasoning: reasoning,
          priorityScore: Math.round(score * 100) / 100,
          reviewedOnDay: currentDay,
        }).where(eq(schema.mdbApplications.id, app.id)).run();

        createNotification(
          app.userId,
          "mdb_approved",
          `MdB-Sitz genehmigt — ${batch.party.name}`,
          `Ihre Bewerbung für einen Bundestag-Sitz bei ${batch.party.name} wurde genehmigt! Sitz #${openSeat.seatNumber}. ${reasoning}`,
          { seatId: openSeat.id, partyId: batch.partyId },
          currentDay,
        );

        console.log(`  [MdB] ${displayName} approved for ${batch.partyId} seat #${openSeat.seatNumber}`);
      }
    }

    // Reject non-selected applicants from the filtered set
    for (const item of batch.applications) {
      if (selectedIds.has(item.id)) continue;
      const entry = batch.appMap.get(item.id);
      if (!entry) continue;

      const { app, score } = entry;
      const defaultReasoning = "Stärkere Bewerbungen hatten Vorrang in dieser Runde.";

      userDb.update(schema.mdbApplications).set({
        status: "rejected",
        aiReasoning: defaultReasoning,
        priorityScore: Math.round(score * 100) / 100,
        reviewedOnDay: currentDay,
        cooldownUntilDay: currentDay + 7,
      }).where(eq(schema.mdbApplications.id, app.id)).run();

      createNotification(
        app.userId,
        "mdb_rejected",
        `MdB-Bewerbung abgelehnt — ${batch.party.name}`,
        `Ihre Bewerbung wurde leider abgelehnt. ${defaultReasoning}\n\nTipps für eine erfolgreiche Bewerbung:\n• Zeigen Sie Verständnis für die Positionen von ${batch.party.name}\n• Nennen Sie konkrete politische Ziele\n• Steigern Sie Ihre Aktivität (Fragen, Vorschläge, Signale)\n\nSie können sich in 7 Tagen erneut bewerben.`,
        { partyId: batch.partyId },
        currentDay,
      );
    }
  }
}
