import type { Party, SimulationEvent } from "@ki-bundestag/types";
import { getDb, schema } from "../db/index.js";
import { eq } from "drizzle-orm";
import type { BatchRequest, BatchResult } from "../agent/batch-client.js";
import { safeParseJson } from "../agent/ai-json.js";

function generateId(): string {
  return Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}

// ---------------------------------------------------------------------------
// Generation cycle
// ---------------------------------------------------------------------------

import { SIDEJOB_INTERVAL, SIDEJOB_SYSTEM_PROMPT } from "../config/index.js";

export function shouldGenerateSidejobs(currentDay: number): boolean {
  return currentDay > 0 && currentDay % SIDEJOB_INTERVAL === 0;
}

// SIDEJOB_SYSTEM_PROMPT imported from config

// ---------------------------------------------------------------------------
// Batch request builder
// ---------------------------------------------------------------------------

export function buildSidejobBatchRequest(
  currentDay: number,
  parties: Party[],
  activeAiSeats: Array<typeof schema.bundestagSeats.$inferSelect>,
): { request: BatchRequest; candidates: Array<typeof schema.bundestagSeats.$inferSelect> } {
  // Pick 3-5 random AI seats
  const candidates = activeAiSeats
    .sort(() => Math.random() - 0.5)
    .slice(0, 3 + Math.floor(Math.random() * 3));

  const seatList = candidates.map((s, i) => {
    const party = parties.find(p => p.id === s.partyId);
    return `${i}. Sitz ${s.seatNumber} (${party?.name ?? s.partyId})`;
  }).join("\n");

  return {
    request: {
      customId: `sidejob-gen-day${currentDay}`,
      system: SIDEJOB_SYSTEM_PROMPT,
      prompt: `Generiere realistische Nebentätigkeiten für diese MdBs:\n${seatList}\n\nAktueller Simulationstag: ${currentDay}`,
      maxTokens: 1024,
      roleKey: "daily",
    },
    candidates,
  };
}

// ---------------------------------------------------------------------------
// Result processing
// ---------------------------------------------------------------------------

interface SidejobAIResult {
  seatIndex: number;
  politicianName: string;
  organization: string;
  role: string;
  incomeLevel: string;
  category: string;
  isControversial: boolean;
}

const VALID_INCOME_LEVELS = new Set(["1000-3500", "3500-7000", "7000-15000", "15000-30000", "30000+"]);
const VALID_CATEGORIES = new Set(["beratung", "vortrag", "aufsichtsrat", "verband", "medien", "sonstiges"]);

export function processSidejobResult(
  result: BatchResult | undefined,
  candidates: Array<typeof schema.bundestagSeats.$inferSelect>,
  currentDay: number,
): Array<Omit<SimulationEvent, "id">> {
  if (!result?.text) return [];

  const parsed = safeParseJson<{ sidejobs: SidejobAIResult[] }>(result.text);
  if (!parsed || !Array.isArray(parsed.sidejobs)) return [];

  const db = getDb();
  const events: Array<Omit<SimulationEvent, "id">> = [];

  for (const job of parsed.sidejobs) {
    const seat = candidates[job.seatIndex];
    if (!seat) continue;
    if (!job.politicianName || !job.organization || !job.role) continue;

    const incomeLevel = VALID_INCOME_LEVELS.has(job.incomeLevel) ? job.incomeLevel : "1000-3500";
    const category = VALID_CATEGORIES.has(job.category) ? job.category : "sonstiges";
    const isControversial = Boolean(job.isControversial);

    db.insert(schema.sidejobs).values({
      id: `sj-${generateId()}`,
      seatId: seat.id,
      partyId: seat.partyId,
      politicianName: job.politicianName,
      organization: job.organization,
      role: job.role,
      incomeLevel,
      category,
      isControversial,
      createdOnDay: currentDay,
      active: true,
    }).run();

    if (isControversial) {
      events.push({
        dayNumber: currentDay,
        type: "sidejob_scandal",
        actor: seat.partyId,
        title: `Kontroverse Nebentätigkeit: ${job.politicianName} (${seat.partyId.toUpperCase()})`,
        description: `${job.politicianName} erhält ${incomeLevel}€ von ${job.organization} als ${job.role}`,
        data: { seatId: seat.id, partyId: seat.partyId, organization: job.organization },
      });
    }
  }

  if (events.length > 0) {
    console.log(`  [Sidejobs] Generated ${parsed.sidejobs.length} sidejobs, ${events.length} controversial`);
  } else {
    console.log(`  [Sidejobs] Generated ${parsed.sidejobs.length} sidejobs (none controversial)`);
  }

  return events;
}

// ---------------------------------------------------------------------------
// Scandal approval impact
// ---------------------------------------------------------------------------

export function applySidejobScandalImpact(
  events: Array<Omit<SimulationEvent, "id">>,
  parties: Party[],
): void {
  const scandals = events.filter(e => e.type === "sidejob_scandal");
  if (scandals.length === 0) return;

  const db = getDb();
  for (const scandal of scandals) {
    const partyId = scandal.data?.partyId as string;
    const party = parties.find(p => p.id === partyId);
    if (!party) continue;

    // -0.2 to -0.5 approval hit
    const impact = -(0.2 + Math.random() * 0.3);
    const newApproval = Math.max(5, Math.round((party.approvalRating + impact) * 10) / 10);

    db.update(schema.parties)
      .set({ approvalRating: newApproval })
      .where(eq(schema.parties.id, partyId))
      .run();

    party.approvalRating = newApproval;
    console.log(`  [Sidejobs] ${partyId} approval ${impact > 0 ? "+" : ""}${impact.toFixed(2)} → ${newApproval}%`);
  }
}
