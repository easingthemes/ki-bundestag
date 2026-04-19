/**
 * Timing presets and simulation speed configuration.
 *
 * Core principle: 1 sim day = 1 real calendar day.
 * Elections every 1461 sim days (4 years including leap year).
 * The only variable is how fast sim days tick in wall-clock time.
 */

export type TimingPreset = "ultra-fast" | "fast" | "normal" | "slow";

export type NightMode = "none" | "light" | "pause";

export interface PresetConfig {
  /** Fixed ms per sim day (non-participatory modes) */
  msPerDay?: number;
  /** Ms per sim day during daytime (participatory modes) */
  msPerDayDay?: number;
  /** Ms per sim day during nighttime, null = paused (participatory modes) */
  msPerDayNight?: number | null;
  /** Whether users can interact with the simulation */
  participatory: boolean;
  /** Night behavior: none = 24/7, light = routine only, pause = full stop */
  nightMode: NightMode;
  /** Display label */
  label: string;
  /** Approximate real-time per full term */
  termRealTime: string;
}

export const TIME_CONFIG = {
  // Fixed constants (real-world mapping)
  TERM_DAYS: 1461,              // 4 years including leap year
  POLL_INTERVAL: 15,            // bi-weekly polls
  ECONOMY_INTERVAL: 30,         // monthly economic report
  BUDGET_INTERVAL: 365,         // annual budget
  SESSION_INTERVAL: 5,          // ~weekly Plenarsitzung

  // Election campaign timeline (in sim days)
  ELECTION_CAMPAIGN_START: 7,   // campaign starts N days after announcement
  ELECTION_CAMPAIGN_DAYS: 21,   // total days from announcement to election

  // Night hours (Europe/Berlin local time)
  nightStart: 22,               // 10 PM
  nightEnd: 8,                  // 8 AM

  // Presets
  //
  // IMPORTANT: Wall-clock time per sim day is dominated by Anthropic batch API
  // latency, NOT by the msPerDay delay. Each day submits 4-6 batches (briefing,
  // party agents, interpellations, MdB seats, media+summary). Under normal API
  // load, total batch time is ~10-15 min/day. When Anthropic is under load
  // (observed 2026-04-01, days 84-85), batch time can balloon to 20-40 min/day.
  //
  // The msPerDay value is the ADDITIONAL delay after all batches complete.
  // For ultra-fast (msPerDay=0), total day time = pure batch API wait time.
  // For fast (msPerDay=420s), total = batch time + 7 min pause.
  //
  // termRealTime estimates include both batch time and delay.
  // Ranges reflect normal API (low end) vs slow API (high end).
  presets: {
    "ultra-fast": {
      msPerDay: 0,                        // No additional delay — total time = batch API only
                                          // Normal API: ~10-15 min/day → ~10 days/term
                                          // Slow API:   ~20-40 min/day → ~25 days/term
      participatory: false,
      nightMode: "none",
      label: "Ultra-Fast (Demo)",
      termRealTime: "~10-25 days",        // varies with Anthropic batch API latency
    },
    "fast": {
      msPerDay: 420_000,                  // 7 min pause between days + batch API time
                                          // Normal API: ~17-22 min/day → ~2 weeks/term
                                          // Slow API:   ~30-50 min/day → ~5 weeks/term
      participatory: false,
      nightMode: "none",
      label: "Fast (Weekly)",
      termRealTime: "~2-5 weeks",         // varies with Anthropic batch API latency
    },
    "normal": {
      msPerDayDay: 1_800_000,             // 30 min daytime
      msPerDayNight: 900_000,             // 15 min nighttime
      participatory: true,
      nightMode: "light",                 // routine actions only at night
      label: "Normal (Citizen)",
      termRealTime: "~30 days",
    },
    "slow": {
      msPerDayDay: 5_400_000,             // 1.5 hours daytime
      msPerDayNight: null,                // paused at night
      participatory: true,
      nightMode: "pause",                 // full pause at night
      label: "Slow (MdB)",
      termRealTime: "~5 months",
    },
  } satisfies Record<TimingPreset, PresetConfig>,
} as const;

// Event importance classification for night mode queueing
export const CRITICAL_EVENTS = [
  "election_voting",
  "confidence_vote_filed",
  "budget_passed",
  "budget_rejected",
] as const;

export const IMPORTANT_EVENTS = [
  "bill_third_reading",
  "bill_passed",
  "bill_rejected",
  "referendum",
  "crisis_start",
  "government_dissolved",
  "government_formed",
  "constitutional_court_ruled",
  "konstituierende_sitzung",
] as const;

export const ROUTINE_EVENTS = [
  "statement",
  "poll",
  "media",
  "economy_update",
  "bill_proposed",
  "bill_first_reading",
  "bill_second_reading",
  "bill_committee",
  "day_start",
  "weekly_report",
  "monthly_report",
] as const;

/**
 * Feature availability matrix.
 * Maps preset → feature → enabled.
 * Includes future MdB features as false for forward-compatibility.
 */
export const FEATURE_AVAILABILITY: Record<TimingPreset, Record<string, boolean>> = {
  "ultra-fast": {
    vote_polls: false,
    ask_questions: false,
    upvote_downvote: false,
    vote_referendums: false,
    internal_proposals: false,
    bill_signals: false,
    request_to_speak: false,
    give_speech: false,
    vote_bills: false,
    propose_amendments: false,
    mdb_apply: false,
  },
  "fast": {
    vote_polls: false,
    ask_questions: false,
    upvote_downvote: false,
    vote_referendums: false,
    internal_proposals: false,
    bill_signals: false,
    request_to_speak: false,
    give_speech: false,
    vote_bills: false,
    propose_amendments: false,
    mdb_apply: false,
  },
  "normal": {
    vote_polls: true,
    ask_questions: true,
    upvote_downvote: true,
    vote_referendums: true,
    internal_proposals: true,
    bill_signals: true,
    request_to_speak: false,
    give_speech: true,
    vote_bills: false,
    propose_amendments: false,
    mdb_apply: true,
  },
  "slow": {
    vote_polls: true,
    ask_questions: true,
    upvote_downvote: true,
    vote_referendums: true,
    internal_proposals: true,
    bill_signals: true,
    request_to_speak: true,
    give_speech: true,
    vote_bills: true,
    propose_amendments: true,
    mdb_apply: true,
  },
};

// ── Helpers ──

export function getPresetConfig(preset: TimingPreset): PresetConfig {
  return TIME_CONFIG.presets[preset];
}

export function isParticipatoryPreset(preset: TimingPreset): boolean {
  return TIME_CONFIG.presets[preset].participatory;
}

export function isFeatureEnabled(preset: TimingPreset, feature: string): boolean {
  return FEATURE_AVAILABILITY[preset]?.[feature] ?? false;
}

/**
 * Check if the current wall-clock time is nighttime in Europe/Berlin.
 */
export function isNightTime(): boolean {
  const hour = getBerlinHour();
  return hour >= TIME_CONFIG.nightEnd ? hour >= TIME_CONFIG.nightStart : hour < TIME_CONFIG.nightEnd;
}

/**
 * Get current hour (0-23) in Europe/Berlin timezone.
 */
function getBerlinHour(): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Berlin",
    hour: "numeric",
    hour12: false,
  }).formatToParts(new Date());
  const hourPart = parts.find(p => p.type === "hour");
  return parseInt(hourPart?.value ?? "12", 10);
}

/**
 * Calculate delay in ms before next sim day, based on preset and time of day.
 * Returns Infinity for slow mode at night (caller should poll until morning).
 */
export function getDelayMs(preset: TimingPreset): number {
  const config = TIME_CONFIG.presets[preset];

  if (!config.participatory) {
    // Non-participatory: fixed delay (or 0 for ultra-fast)
    return config.msPerDay ?? 0;
  }

  // Participatory mode: day/night aware
  if (isNightTime()) {
    if (config.msPerDayNight === null) return Infinity; // pause
    return config.msPerDayNight ?? 0;
  }

  return config.msPerDayDay ?? 0;
}

/**
 * Whether the runner should fully pause (slow mode at night).
 */
export function shouldPauseForNight(preset: TimingPreset): boolean {
  return preset === "slow" && isNightTime();
}

/**
 * Classify an event type by importance level for night mode queueing.
 */
export function classifyEvent(eventType: string): "critical" | "important" | "standard" | "routine" {
  if ((CRITICAL_EVENTS as readonly string[]).includes(eventType)) return "critical";
  if ((IMPORTANT_EVENTS as readonly string[]).includes(eventType)) return "important";
  if ((ROUTINE_EVENTS as readonly string[]).includes(eventType)) return "routine";
  return "standard";
}

/**
 * Human seat ratio per preset.
 * ultra-fast/fast = 0 (all AI, watch-only), normal = 30%, slow = 70%.
 */
const HUMAN_SEAT_RATIO: Record<TimingPreset, number> = {
  "ultra-fast": 0,
  "fast": 0,
  "normal": 0.3,
  "slow": 0.7,
};

export function getHumanSeatRatio(preset: TimingPreset): number {
  return HUMAN_SEAT_RATIO[preset];
}

/**
 * Bot seat ratio per preset.
 * Bots get a small allocation in ALL presets (including ultra-fast/fast)
 * so they can apply for seats and participate regardless of mode.
 */
const BOT_SEAT_RATIO: Record<TimingPreset, number> = {
  "ultra-fast": 0.05,
  "fast": 0.05,
  "normal": 0.05,
  "slow": 0.05,
};

export function getBotSeatRatio(preset: TimingPreset): number {
  return BOT_SEAT_RATIO[preset];
}

/**
 * Whether an event should be queued instead of executed (night mode in participatory presets).
 */
export function shouldQueueEvent(preset: TimingPreset, eventType: string): boolean {
  if (!isParticipatoryPreset(preset) || !isNightTime()) return false;

  const config = TIME_CONFIG.presets[preset];
  const importance = classifyEvent(eventType);

  if (config.nightMode === "pause") {
    // Slow mode: queue everything at night (runner handles full pause)
    return true;
  }

  if (config.nightMode === "light") {
    // Normal mode: queue critical + important events, run routine + standard
    return importance === "critical" || importance === "important";
  }

  return false;
}
