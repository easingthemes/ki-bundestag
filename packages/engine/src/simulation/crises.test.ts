import { describe, it, expect } from "vitest";
import {
  maybeTriggerCrisis,
  applyCrisisImpacts,
  resolveExpiredCrises,
  triggerCrisisFromTemplate,
  getCrisisTemplates,
} from "./crises.js";
import type { Crisis, EconomyState } from "@ki-bundestag/types";

function makeCrisis(overrides: Partial<Crisis> = {}): Crisis {
  return {
    id: "crisis-1",
    templateId: "energiekrise",
    name: "Energiekrise",
    description: "Test crisis",
    category: "economy",
    severity: "high",
    startDay: 10,
    endDay: 20,
    dailyImpact: { budget: -0.5, publicSentiment: -0.8 },
    resolved: false,
    ...overrides,
  };
}

describe("maybeTriggerCrisis", () => {
  it("returns null when 2 crises already active", () => {
    const active = [makeCrisis(), makeCrisis({ id: "crisis-2", templateId: "hochwasser" })];
    // Run 100 times to confirm it never triggers
    for (let i = 0; i < 100; i++) {
      expect(maybeTriggerCrisis(50, active, true)).toBeNull();
    }
  });

  it("does not duplicate an active crisis template", () => {
    const active = [makeCrisis({ templateId: "energiekrise" })];
    let triggered = 0;
    for (let i = 0; i < 200; i++) {
      const result = maybeTriggerCrisis(50, active, true);
      if (result) {
        expect(result.templateId).not.toBe("energiekrise");
        triggered++;
      }
    }
    // With 25% monthly probability and 200 attempts, should trigger sometimes
    expect(triggered).toBeGreaterThan(0);
  });

  it("returns a valid crisis object when triggered", () => {
    let crisis: Crisis | null = null;
    for (let i = 0; i < 200 && !crisis; i++) {
      crisis = maybeTriggerCrisis(100, [], true);
    }
    expect(crisis).not.toBeNull();
    expect(crisis!.startDay).toBe(100);
    expect(crisis!.endDay).toBeGreaterThan(100);
    expect(crisis!.resolved).toBe(false);
  });
});

describe("triggerCrisisFromTemplate", () => {
  it("returns null for unknown template", () => {
    expect(triggerCrisisFromTemplate("nonexistent", 10, [])).toBeNull();
  });

  it("returns null if template is already active", () => {
    const active = [makeCrisis({ templateId: "energiekrise", resolved: false })];
    expect(triggerCrisisFromTemplate("energiekrise", 10, active)).toBeNull();
  });

  it("creates crisis from known template", () => {
    const crisis = triggerCrisisFromTemplate("energiekrise", 50, []);
    expect(crisis).not.toBeNull();
    expect(crisis!.name).toBe("Energiekrise");
    expect(crisis!.startDay).toBe(50);
    expect(crisis!.endDay).toBeGreaterThan(50);
  });
});

describe("getCrisisTemplates", () => {
  it("returns all crisis templates", () => {
    const templates = getCrisisTemplates();
    expect(templates.length).toBeGreaterThanOrEqual(8);
    for (const t of templates) {
      expect(t.id).toBeTruthy();
      expect(t.name).toBeTruthy();
      expect(t.durationDays[0]).toBeLessThanOrEqual(t.durationDays[1]);
    }
  });
});

describe("applyCrisisImpacts", () => {
  it("applies multiple crisis impacts cumulatively", () => {
    const eco: EconomyState = { budget: 45, unemployment: 5, inflation: 2, gdpGrowth: 0.8 };
    const crises = [
      makeCrisis({ dailyImpact: { budget: -0.5, publicSentiment: -0.8 } }),
      makeCrisis({ id: "c2", dailyImpact: { budget: -0.3, publicSentiment: -0.6 } }),
    ];
    const result = applyCrisisImpacts(eco, 50, crises);
    expect(result.economy.budget).toBeLessThan(45);
    expect(result.sentiment).toBeLessThan(50);
  });
});

describe("resolveExpiredCrises", () => {
  it("resolves crises past their endDay", () => {
    const crises = [
      makeCrisis({ endDay: 15, resolved: false }),
      makeCrisis({ id: "c2", endDay: 25, resolved: false }),
    ];
    const resolved = resolveExpiredCrises(20, crises);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].endDay).toBe(15);
    expect(crises[0].resolved).toBe(true);
    expect(crises[1].resolved).toBe(false);
  });

  it("does not re-resolve already resolved crises", () => {
    const crises = [makeCrisis({ endDay: 5, resolved: true })];
    const resolved = resolveExpiredCrises(20, crises);
    expect(resolved).toHaveLength(0);
  });

  it("resolves on exact endDay", () => {
    const crises = [makeCrisis({ endDay: 20, resolved: false })];
    const resolved = resolveExpiredCrises(20, crises);
    expect(resolved).toHaveLength(1);
  });
});
