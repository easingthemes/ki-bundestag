import type { BillCategory, BillImpact, Crisis, CrisisSeverity, EconomyState } from "@ki-bundestag/types";
import { applyBillImpact } from "./economy.js";
import { updateSentiment } from "./opinion.js";

interface CrisisTemplate {
  id: string;
  name: string;
  description: string;
  category: BillCategory;
  severity: CrisisSeverity;
  durationDays: [number, number]; // [min, max]
  dailyImpact: BillImpact;
}

const CRISIS_TEMPLATES: CrisisTemplate[] = [
  {
    id: "energiekrise",
    name: "Energiekrise",
    description: "Steigende Energiepreise belasten Haushalte und Industrie. Sofortige Maßnahmen zur Preisstabilisierung werden gefordert.",
    category: "economy",
    severity: "high",
    durationDays: [5, 12],
    dailyImpact: { budget: -0.5, inflation: 0.04, gdpGrowth: -0.02, publicSentiment: -0.8 },
  },
  {
    id: "fluechtlingswelle",
    name: "Flüchtlingswelle",
    description: "Ein starker Anstieg der Asylanträge stellt die Aufnahmekapazitäten auf die Probe und dominiert die politische Debatte.",
    category: "immigration",
    severity: "high",
    durationDays: [7, 14],
    dailyImpact: { budget: -0.3, publicSentiment: -0.6 },
  },
  {
    id: "industrieskandal",
    name: "Industrieskandal",
    description: "Ein großer deutscher Konzern steht wegen Betrug unter Verdacht. Vertrauen in die Wirtschaftsaufsicht sinkt.",
    category: "economy",
    severity: "medium",
    durationDays: [3, 8],
    dailyImpact: { gdpGrowth: -0.02, publicSentiment: -0.5 },
  },
  {
    id: "hochwasser",
    name: "Hochwasserkatastrophe",
    description: "Schwere Überschwemmungen zerstören Infrastruktur in mehreren Bundesländern. Soforthilfe und Wiederaufbau werden gebraucht.",
    category: "infrastructure",
    severity: "high",
    durationDays: [4, 10],
    dailyImpact: { budget: -0.5, unemployment: 0.01, publicSentiment: -0.4 },
  },
  {
    id: "krankenhausnotstand",
    name: "Krankenhausnotstand",
    description: "Personalmangel und Überlastung der Krankenhäuser führen zu Versorgungsengpässen im Gesundheitssystem.",
    category: "healthcare",
    severity: "medium",
    durationDays: [5, 12],
    dailyImpact: { budget: -0.2, publicSentiment: -0.5 },
  },
  {
    id: "cyberangriff",
    name: "Cyberangriff auf Bundesbehörden",
    description: "Ein massiver Cyberangriff legt IT-Systeme mehrerer Bundesbehörden lahm. Sicherheitslücken werden offenbar.",
    category: "defense",
    severity: "medium",
    durationDays: [3, 7],
    dailyImpact: { budget: -0.3, publicSentiment: -0.6 },
  },
  {
    id: "handelsstreit",
    name: "Handelsstreit mit den USA",
    description: "Neue Zölle bedrohen den deutschen Export. Die Automobilindustrie und der Maschinenbau sind besonders betroffen.",
    category: "economy",
    severity: "medium",
    durationDays: [6, 14],
    dailyImpact: { gdpGrowth: -0.04, unemployment: 0.01, publicSentiment: -0.3 },
  },
  {
    id: "protestwelle",
    name: "Protestwelle",
    description: "Landesweite Proteste gegen die Regierungspolitik legen den öffentlichen Verkehr lahm und erhöhen den politischen Druck.",
    category: "social",
    severity: "low",
    durationDays: [3, 7],
    dailyImpact: { publicSentiment: -1.0 },
  },
];

export function getCrisisTemplates(): CrisisTemplate[] {
  return CRISIS_TEMPLATES;
}

export function triggerCrisisFromTemplate(
  templateId: string,
  currentDay: number,
  activeCrises: Crisis[],
): Crisis | null {
  const template = CRISIS_TEMPLATES.find(t => t.id === templateId);
  if (!template) return null;

  // Don't allow duplicating active crises
  if (activeCrises.some(c => c.templateId === templateId && !c.resolved)) return null;

  const duration = randomInt(template.durationDays[0], template.durationDays[1]);
  return {
    id: `crisis-${generateId()}`,
    templateId: template.id,
    name: template.name,
    description: template.description,
    category: template.category,
    severity: template.severity,
    startDay: currentDay,
    endDay: currentDay + duration,
    dailyImpact: template.dailyImpact,
    resolved: false,
  };
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Maybe trigger a new crisis. Daily probability 8%, monthly trigger 25%.
 * Max 2 concurrent active crises.
 */
export function maybeTriggerCrisis(
  currentDay: number,
  activeCrises: Crisis[],
  isMonthlyDay: boolean,
): Crisis | null {
  if (activeCrises.length >= 2) return null;

  const probability = isMonthlyDay ? 0.25 : 0.08;
  if (Math.random() > probability) return null;

  // Avoid duplicating an active crisis template
  const activeTemplateIds = new Set(activeCrises.map(c => c.templateId));
  const available = CRISIS_TEMPLATES.filter(t => !activeTemplateIds.has(t.id));
  if (available.length === 0) return null;

  const template = available[randomInt(0, available.length - 1)];
  const duration = randomInt(template.durationDays[0], template.durationDays[1]);

  return {
    id: `crisis-${generateId()}`,
    templateId: template.id,
    name: template.name,
    description: template.description,
    category: template.category,
    severity: template.severity,
    startDay: currentDay,
    endDay: currentDay + duration,
    dailyImpact: template.dailyImpact,
    resolved: false,
  };
}

/**
 * Apply all active crisis impacts to economy and sentiment.
 */
export function applyCrisisImpacts(
  economy: EconomyState,
  sentiment: number,
  crises: Crisis[],
): { economy: EconomyState; sentiment: number } {
  let eco = economy;
  let sent = sentiment;
  for (const crisis of crises) {
    eco = applyBillImpact(eco, crisis.dailyImpact);
    sent = updateSentiment(sent, crisis.dailyImpact);
  }
  return { economy: eco, sentiment: sent };
}

/**
 * Find crises that have expired (endDay <= currentDay) and mark them resolved.
 * Returns the list of newly resolved crises.
 */
export function resolveExpiredCrises(
  currentDay: number,
  crises: Crisis[],
): Crisis[] {
  const resolved: Crisis[] = [];
  for (const crisis of crises) {
    if (!crisis.resolved && currentDay >= crisis.endDay) {
      crisis.resolved = true;
      resolved.push(crisis);
    }
  }
  return resolved;
}
