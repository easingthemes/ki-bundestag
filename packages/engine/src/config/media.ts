/**
 * Media system configuration.
 *
 * Controls news outlets, their biases, newsworthy event types,
 * and sentiment impact scaling.
 */

// ── News outlets ────────────────────────────────────────────────────
export const MEDIA_OUTLETS = [
  { name: "Berliner Tagesspiegel", bias: "center" },
  { name: "Volksstimme", bias: "left" },
  { name: "Wirtschaftswoche", bias: "right" },
  { name: "Süddeutsche Zeitung", bias: "center-left" },
  { name: "Frankfurter Allgemeine", bias: "center-right" },
  { name: "taz", bias: "left" },
] as const;

// ── Newsworthy event types ──────────────────────────────────────────
export const NEWSWORTHY_TYPES = new Set([
  "bill_passed",
  "bill_rejected",
  "crisis_start",
  "crisis_end",
  "election_announced",
  "election_campaign",
  "election_result",
  "government_formed",
  "negotiation_complete",
  "statement",
  "sidejob_scandal",
]);

// ── Sentiment scaling ───────────────────────────────────────────────
/** AI-provided sentiment is scaled by this factor per article */
export const MEDIA_SENTIMENT_SCALE = 0.2;
/** Max sentiment impact per article */
export const MEDIA_SENTIMENT_PER_ARTICLE_CAP = 0.2;
/** Max total media sentiment impact per day */
export const MEDIA_SENTIMENT_DAILY_CAP = 0.5;
/** Max articles generated per day */
export const MEDIA_DAILY_ARTICLE_CAP = 3;

// ── Fallback sentiment heuristics (when AI sentiment unavailable) ───
// Neutral-to-negative: media negativity bias (bad news sells)
export const MEDIA_CATEGORY_SENTIMENT: Record<string, number> = {
  crisis: -0.2,
  opinion: -0.1,
  election: -0.05,
  economy: 0,
  policy: 0,
};

// ── Significant event types for day summaries ───────────────────────
export const SUMMARY_SIGNIFICANT_TYPES = new Set([
  "bill_passed", "bill_rejected", "presidential_veto",
  "bill_committee_rejected",
  "constitutional_court_ruled", "confidence_vote_passed", "confidence_vote_failed",
  "government_formed", "government_cabinet_formed", "government_dissolved",
  "election_announced", "election_result", "negotiation_complete",
  "crisis_start", "crisis_end",
  "budget_passed", "budget_rejected", "provisional_budget_started", "budget_revision_rejected",
  "motion_passed",
]);

// ── Briefing event types ────────────────────────────────────────────
export const BRIEFING_EVENT_TYPES = new Set([
  "bill_passed",
  "bill_rejected",
  "bill_proposed",
  "crisis_start",
  "crisis_end",
  "election_announced",
  "election_result",
  "government_formed",
  "negotiation_complete",
  "statement",
  "confidence_vote_result",
  "constitutional_court_ruling",
  "presidential_veto",
  "budget_passed",
  "budget_rejected",
]);
