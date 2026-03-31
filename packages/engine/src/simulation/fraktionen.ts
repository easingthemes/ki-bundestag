import { eq } from "drizzle-orm";
import type { Fraktion, Party, SimulationEvent } from "@ki-bundestag/types";
import { getDb, getSqlite, schema } from "../db/index.js";

export const FRAKTION_LEADERS: Record<string, string> = {
  spd: "Lars Klingbeil",
  cdu: "Friedrich Merz",
  gruene: "Katharina Dröge",
  fdp: "Christian Dürr",
  afd: "Alice Weidel",
  linke: "Dietmar Bartsch",
};

/** 5% of 735 seats = 36.75, rounded up */
export const FRAKTION_THRESHOLD = 37;

function generateId(): string {
  return Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}

export function getActiveFraktionen(): Fraktion[] {
  const db = getDb();
  const rows = db.select().from(schema.fraktionen).all();
  return rows
    .filter(r => r.status === "active")
    .map(mapFraktion);
}

export function partyHasFraktion(partyId: string): boolean {
  const sqlite = getSqlite();
  const row = sqlite.prepare(
    "SELECT COUNT(*) as cnt FROM fraktionen WHERE party_id = ? AND status = 'active'"
  ).get(partyId) as { cnt: number };
  return row.cnt > 0;
}

export function updateFraktionen(
  currentDay: number,
  parties: Party[],
): { formed: Fraktion[]; dissolved: Fraktion[]; events: Array<Omit<SimulationEvent, "id">> } {
  const db = getDb();
  const activeFraktionen = getActiveFraktionen();
  const activeByParty = new Map(activeFraktionen.map(f => [f.partyId, f]));

  const formed: Fraktion[] = [];
  const dissolved: Fraktion[] = [];
  const events: Array<Omit<SimulationEvent, "id">> = [];

  for (const party of parties) {
    const existing = activeByParty.get(party.id);

    if (party.seatCount >= FRAKTION_THRESHOLD && !existing) {
      // Form new Fraktion
      const leaderName = FRAKTION_LEADERS[party.id] || "Unknown";
      const fraktion: Fraktion = {
        id: `frak-${generateId()}`,
        partyId: party.id,
        leaderName,
        status: "active",
        formedOnDay: currentDay,
        dissolvedOnDay: null,
      };

      db.insert(schema.fraktionen).values({
        id: fraktion.id,
        partyId: fraktion.partyId,
        leaderName: fraktion.leaderName,
        status: "active",
        formedOnDay: currentDay,
        dissolvedOnDay: null,
      }).run();

      formed.push(fraktion);
      events.push({
        dayNumber: currentDay,
        type: "fraktion_formed",
        actor: party.id,
        title: `${party.name} bildet Fraktion`,
        description: `${party.name} hat eine Fraktion gebildet mit ${party.seatCount} Sitzen. Fraktionsvorsitz: ${leaderName}.`,
        data: { fraktionId: fraktion.id, leaderName, seatCount: party.seatCount },
      });

      console.log(`  [Fraktion] Formed: ${party.name} (${party.seatCount} seats, leader: ${leaderName})`);

    } else if (party.seatCount < FRAKTION_THRESHOLD && existing) {
      // Dissolve Fraktion
      db.update(schema.fraktionen)
        .set({ status: "dissolved", dissolvedOnDay: currentDay })
        .where(eq(schema.fraktionen.id, existing.id))
        .run();

      const dissolvedFraktion = { ...existing, status: "dissolved" as const, dissolvedOnDay: currentDay };
      dissolved.push(dissolvedFraktion);
      events.push({
        dayNumber: currentDay,
        type: "fraktion_dissolved",
        actor: party.id,
        title: `${party.name} verliert Fraktionsstatus`,
        description: `${party.name} hat die Fraktion verloren mit nur ${party.seatCount} Sitzen (Minimum: ${FRAKTION_THRESHOLD}). Die Partei kann keine Gesetzentwürfe mehr einbringen oder abstimmen.`,
        data: { fraktionId: existing.id, seatCount: party.seatCount },
      });

      console.log(`  [Fraktion] Dissolved: ${party.name} (${party.seatCount} seats, below ${FRAKTION_THRESHOLD})`);
    }
  }

  return { formed, dissolved, events };
}

function mapFraktion(row: typeof schema.fraktionen.$inferSelect): Fraktion {
  return {
    id: row.id,
    partyId: row.partyId,
    leaderName: row.leaderName,
    status: row.status as Fraktion["status"],
    formedOnDay: row.formedOnDay,
    dissolvedOnDay: row.dissolvedOnDay,
  };
}
