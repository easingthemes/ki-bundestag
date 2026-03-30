/**
 * Context depth configuration for AI agent prompts.
 *
 * Controls how much context is packed into each AI call — not just raw token
 * count, but which sections are included and how much history is fetched.
 *
 * Three levels:
 * - low:    Minimal context, cheapest. Good for fast/ultra-fast bulk runs.
 * - normal: Balanced (current default). Good for normal/slow participatory.
 * - high:   Rich context, most expensive. Best quality decisions.
 */

export type ContextDepth = "low" | "normal" | "high";

export interface DepthConfig {
  /** Max tokens for optional context sections (Priority 2+3). */
  contextTokenBudget: number;
  /** How many days of events the briefing AI call looks back. */
  briefingEventLookbackDays: number;
  /** How many days of approval trends for briefing. */
  briefingTrendDays: number;
  /** How many days of own actions each party sees. */
  ownActionsLookbackDays: number;
  /** Max own-action items included. */
  ownActionsMaxItems: number;
  /** Max recent events in Priority 2. */
  recentEventsMax: number;
  /** Max media headlines in Priority 2. */
  recentMediaMax: number;
  /** Whether to include Priority 3 sections (motions, interpellations, etc.). */
  includeP3: boolean;
  /** Whether to generate the daily briefing call at all. */
  enableBriefing: boolean;
  /** Whether to pass briefing to secondary calls (questions, media, interpellations). */
  enrichSecondaryCalls: boolean;
  /** Display label. */
  label: string;
}

export const DEPTH_CONFIGS: Record<ContextDepth, DepthConfig> = {
  low: {
    contextTokenBudget: 3000,
    briefingEventLookbackDays: 0,    // no briefing
    briefingTrendDays: 0,
    ownActionsLookbackDays: 0,       // no cross-day memory
    ownActionsMaxItems: 0,
    recentEventsMax: 5,
    recentMediaMax: 2,
    includeP3: false,
    enableBriefing: false,
    enrichSecondaryCalls: false,
    label: "Low",
  },
  normal: {
    contextTokenBudget: 8000,
    briefingEventLookbackDays: 30,
    briefingTrendDays: 14,
    ownActionsLookbackDays: 14,
    ownActionsMaxItems: 15,
    recentEventsMax: 10,
    recentMediaMax: 3,
    includeP3: true,
    enableBriefing: true,
    enrichSecondaryCalls: true,
    label: "Normal",
  },
  high: {
    contextTokenBudget: 16000,
    briefingEventLookbackDays: 60,
    briefingTrendDays: 30,
    ownActionsLookbackDays: 30,
    ownActionsMaxItems: 30,
    recentEventsMax: 20,
    recentMediaMax: 5,
    includeP3: true,
    enableBriefing: true,
    enrichSecondaryCalls: true,
    label: "High",
  },
};

export function getDepthConfig(depth: ContextDepth): DepthConfig {
  return DEPTH_CONFIGS[depth];
}

export function isValidContextDepth(value: string): value is ContextDepth {
  return value === "low" || value === "normal" || value === "high";
}
