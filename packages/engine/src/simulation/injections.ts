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
          title: "Snap election triggered",
          description: "A snap election has been called via user injection.",
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
          title: "Election invalidation ordered",
          description: "A court order has been issued to invalidate the most recent election.",
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
          title: "Budget cycle triggered by admin",
          description: "A budget vote has been manually triggered via admin injection.",
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
            title: "Economic shock injected",
            description: `User-injected economic event: budget ${impact.budget || 0}, unemployment ${impact.unemployment || 0}, inflation ${impact.inflation || 0}, GDP growth ${impact.gdpGrowth || 0}, sentiment ${impact.publicSentiment || 0}`,
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
