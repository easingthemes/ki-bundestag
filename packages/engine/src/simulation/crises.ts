import type { Crisis, EconomyState } from "@ki-bundestag/types";
import { applyBillImpact } from "./economy.js";
import { updateSentiment } from "./opinion.js";
import {
  CRISIS_TEMPLATES,
  CRISIS_DAILY_PROBABILITY,
  CRISIS_MONTHLY_PROBABILITY,
  CRISIS_MAX_CONCURRENT,
} from "../config/index.js";
import type { CrisisTemplate } from "../config/crises.js";

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
  if (activeCrises.length >= CRISIS_MAX_CONCURRENT) return null;

  const probability = isMonthlyDay ? CRISIS_MONTHLY_PROBABILITY : CRISIS_DAILY_PROBABILITY;
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
