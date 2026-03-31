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
    const injection: PendingInjection = {
      id: row.id,
      type: row.type as PendingInjection["type"],
      data: row.data as unknown as Record<string, unknown>,
      consumed: row.consumed,
    };

    switch (injection.type) {
      case "crisis": {
        const templateId = injection.data.templateId as string;
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
        const impact = injection.data.impact as BillImpact | undefined;
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
    }

    // Mark as consumed
    db.update(schema.pendingInjections)
      .set({ consumed: true })
      .where(eq(schema.pendingInjections.id, row.id))
      .run();
  }

  return result;
}
