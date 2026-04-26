import type { BillImpact, Crisis, PendingInjection, SimulationEvent } from "@ki-bundestag/types";
import { getDb, schema } from "../db/index.js";
import { eq } from "drizzle-orm";
import { triggerCrisisFromTemplate } from "./crises.js";

export interface InjectionResult {
  crisis?: Crisis;
  triggerElection?: boolean;
  economicShock?: BillImpact;
  invalidateElection?: boolean;
  triggerBudget?: boolean;
  /** Cycle 4 PR 3 — Nachtragshaushalt injection rows queued for processing.
   *  loop.ts iterates these and calls `processNachtragsInjection` from
   *  `budget.ts` with full state access (parties / government / state).
   *  Cycle 5 PR 3 (S24/R10) — narrowed to the nachtragshaushalt variant so
   *  consumers see the typed `NachtragsInjectionPayload` directly. */
  pendingNachtragshaushaltInjections?: Array<PendingInjection & { type: "nachtragshaushalt" }>;
  events: Array<Omit<SimulationEvent, "id">>;
}

/**
 * Load and process all unconsumed injections at the start of a day.
 */
export function processInjections(
  currentDay: number,
  activeCrises: Crisis[],
): InjectionResult {
  const db = getDb();
  const rows = db.select().from(schema.pendingInjections).all()
    .filter((r: any) => !r.consumed);

  const result: InjectionResult = { events: [] };

  for (const row of rows) {
    // S24/R10: cast through `unknown` to land in the discriminated union;
    // the switch below narrows each branch's `data` payload by `type`. The
    // DB column is JSON-serialised so Drizzle returns it as `unknown` —
    // the runtime check is the discriminant itself.
    const injection = {
      id: row.id,
      type: row.type as PendingInjection["type"],
      data: row.data as unknown,
      consumed: row.consumed,
    } as PendingInjection;

    switch (injection.type) {
      case "crisis": {
        // S24/R10: TypeScript narrows `injection.data` to CrisisInjectionPayload.
        const templateId = injection.data.templateId;
        if (templateId) {
          const crisis = triggerCrisisFromTemplate(templateId, currentDay, activeCrises);
          if (crisis) {
            result.crisis = crisis;
            result.events.push({
              dayNumber: currentDay,
              type: "crisis_start",
              actor: "system",
              title: `Injected Crisis: ${crisis.name}`,
              description: `${crisis.description} (triggered by user injection)`,
              data: { crisisId: crisis.id, severity: crisis.severity, category: crisis.category, injected: true },
            });
          }
        }
        break;
      }
      case "election": {
        result.triggerElection = true;
        result.events.push({
          dayNumber: currentDay,
          type: "day_start",
          actor: "system",
          title: "Neuwahl ausgelöst",
          description: "Eine Neuwahl wurde per Nutzereingriff angesetzt.",
          data: { injected: true },
        });
        break;
      }
      case "invalidate_election": {
        result.invalidateElection = true;
        result.events.push({
          dayNumber: currentDay,
          type: "day_start",
          actor: "system",
          title: "Wahlannullierung angeordnet",
          description: "Ein Gerichtsbeschluss zur Annullierung der letzten Wahl wurde erlassen.",
          data: { injected: true },
        });
        break;
      }
      case "budget": {
        result.triggerBudget = true;
        result.events.push({
          dayNumber: currentDay,
          type: "budget_proposed",
          actor: "system",
          title: "Haushaltszyklus durch Admin ausgelöst",
          description: "Eine Haushaltsabstimmung wurde manuell per Admin-Eingriff ausgelöst.",
          data: { injected: true },
        });
        break;
      }
      case "economic_shock": {
        // S24/R10: narrowed to EconomicShockInjectionPayload — impact is required.
        const { impact } = injection.data;
        if (impact) {
          result.economicShock = impact;
          result.events.push({
            dayNumber: currentDay,
            type: "economy_update",
            actor: "system",
            title: "Wirtschaftsschock injiziert",
            description: `Nutzer-injiziertes Wirtschaftsereignis: Haushalt ${impact.budget || 0}, Arbeitslosigkeit ${impact.unemployment || 0}, Inflation ${impact.inflation || 0}, BIP-Wachstum ${impact.gdpGrowth || 0}, Stimmung ${impact.publicSentiment || 0}`,
            data: { impact, injected: true },
          });
        }
        break;
      }
      case "nachtragshaushalt": {
        // Cycle 4 PR 3 — full processing happens in loop.ts (needs parties /
        // government / state). Hand the injection off via the result; mark
        // consumed below so it's not re-processed on a future tick.
        if (!result.pendingNachtragshaushaltInjections) {
          result.pendingNachtragshaushaltInjections = [];
        }
        result.pendingNachtragshaushaltInjections.push(injection);
        break;
      }
    }

    // Mark as consumed
    db.update(schema.pendingInjections)
      .set({ consumed: true })
      .where(eq(schema.pendingInjections.id, row.id))
      .run();
  }

  return result;
}
