/**
 * Parliamentary mechanics configuration.
 *
 * Controls constitutional court, interpellations, discipline system,
 * and related approval impacts.
 */

import type { BillCategory, MinistryPortfolio } from "@ki-bundestag/types";

// ── Constitutional court ────────────────────────────────────────────
/** Probability that a challenged bill is struck down */
export const COURT_STRIKE_DOWN_PROBABILITY = 0.30;

/** Approval impacts for constitutional court rulings */
export const COURT_APPROVAL_IMPACTS = {
  /** Filing party gains credibility when challenge succeeds */
  filerGainOnStrikeDown: 0.8,
  /** Proposing party loses when their law is struck down */
  proposerLossOnStrikeDown: -0.5,
  /** Filing party penalized for frivolous challenge (upheld) */
  filerLossOnUphold: -0.3,
};

/** Reasons the court gives when striking down a law */
export const STRIKE_DOWN_REASONS = [
  "The court finds the economic provisions incompatible with Art. 20 GG (Sozialstaatsprinzip). The burden imposed on citizens lacks proportionality.",
  "The legislation violates the principle of proportionality (Verhältnismäßigkeit) as enshrined in the Basic Law. The means exceed what is necessary to achieve the stated aim.",
  "The Bundesverfassungsgericht holds that the law infringes upon fundamental rights under Art. 2 GG (Allgemeine Handlungsfreiheit) without sufficient constitutional justification.",
  "The court rules the law unconstitutional under Art. 14 GG (Eigentumsgarantie). The interference with property rights is disproportionate to the public benefit.",
  "The legislation conflicts with the federal principle (Art. 20 GG). Exclusive Bundesrat consent was required and was not obtained.",
];

/** Reasons the court gives when upholding a law */
export const UPHOLD_REASONS = [
  "The Bundestag acted within its constitutional mandate. The challenged provisions are consistent with the Basic Law and fall within the legislature's margin of appreciation.",
  "The court finds no violation of fundamental rights. The law pursues a legitimate aim and the means chosen are proportionate and necessary.",
  "The constitutional challenge is dismissed. The challenged provisions comply with the rule of law principle (Rechtsstaatsprinzip) and do not infringe any protected right.",
  "The Bundesverfassungsgericht upholds the law. The legislature's assessment of necessity is constitutionally sound and within its competence.",
  "The challenge is rejected. The court finds the law consistent with Art. 20 GG and all cited fundamental rights provisions of the Basic Law.",
];

// ── Interpellations ─────────────────────────────────────────────────
/** Max interpellations answered per day */
export const INTERPELLATION_MAX_ANSWERS_PER_DAY = 2;
/** Days before unanswered interpellations expire */
export const INTERPELLATION_DEADLINE_DAYS = 14;

/** Sentiment impacts for interpellation outcomes */
export const INTERPELLATION_IMPACTS = {
  grosseAnswered: 0.3,
  kleineAnswered: 0.1,
  expired: -0.3,
};

// ── Discipline system ───────────────────────────────────────────────
/** Review interval in simulation days */
export const DISCIPLINE_REVIEW_INTERVAL = 7;
/** Disloyalty score multiplier (votesAgainst * this) */
export const DISCIPLINE_DISLOYALTY_MULTIPLIER = 2;
/** Disloyalty threshold for +2 level escalation */
export const DISCIPLINE_SEVERE_THRESHOLD = 6;
/** Disloyalty threshold for +1 level escalation */
export const DISCIPLINE_MODERATE_THRESHOLD = 4;
/** Max discipline level (4 = expulsion) */
export const DISCIPLINE_MAX_LEVEL = 4;
/** Discipline level labels */
export const DISCIPLINE_LEVEL_LABELS = ["Gut", "Verwarnung", "Eingeschränkt", "Fraktionszwang"];

// ── Questions ───────────────────────────────────────────────────────
/** Max citizen question answers per party per day */
export const QUESTION_MAX_ANSWERS_PER_DAY = 50;
/** Days before unanswered questions expire */
export const QUESTION_EXPIRY_DAYS = 14;
/** Available question topics */
export const QUESTION_TOPICS = [
  "Klimaschutz",
  "Migration",
  "Bildung",
  "Wirtschaft",
  "Soziales",
  "Gesundheit",
  "Innere Sicherheit",
  "Verteidigung",
  "Digitalisierung",
  "Verkehr",
  "Finanzen",
  "Arbeit",
  "Wohnen",
  "Außenpolitik",
  "Landwirtschaft",
  "Justiz",
  "Sonstiges",
] as const;

// ── Polls & Referendums ─────────────────────────────────────────────
/** Days a poll stays active */
export const POLL_ACTIVE_DAYS = 14;
/** Days a referendum stays active */
export const REFERENDUM_ACTIVE_DAYS = 14;
/** Minimum votes for a referendum to count (below = expired) */
export const REFERENDUM_MIN_VOTES = 10;
/** Sidejob generation interval (days) */
export const SIDEJOB_INTERVAL = 30;

// ── Day summary moods ───────────────────────────────────────────────
export const VALID_MOODS: string[] = [
  "Stabile Mehrheit", "Koalitionsreibung", "Politischer Druck",
  "Krisenreaktion", "Wahlkampf", "Haushaltsstreit", "Regierungswechsel",
];

// ── Bill pipeline stage durations ───────────────────────────────────
/**
 * Per-stage minimum dwell time (in sim days) before a bill can advance.
 *
 * Committee phase has two tiers:
 *   - ordinary: 6–12 weeks (matches 20. WP median)
 *   - complex:  3–6 months (constitutional amendments, structural reforms)
 *
 * First/second readings advance on the next Sitzungstag (gating handled by
 * the pipeline). Third reading follows the second on the same sitting day
 * (GO-BT §81 — standard practice is 2./3. Lesung back-to-back).
 */
export const BILL_STAGE_DURATIONS = {
  proposed:       { min: 0, max: 0 },
  first_reading:  { min: 1, max: 1 },
  committee: {
    ordinary: { min: 42, max: 84 },
    complex:  { min: 90, max: 180 },
  },
  second_reading: { min: 1, max: 1 },
  third_reading:  { min: 0, max: 0 },
} as const;

/**
 * Baseline probability that a newly-proposed bill is drawn on the complex
 * committee tier. Reserved for constitutional amendments, Steuerreformen,
 * Rentenreformen. Actual categorisation heuristic lives in bill-pipeline.ts.
 */
export const COMPLEX_BILL_PROBABILITY = 0.15;

/**
 * Government-bill committee multiplier (Cycle 3 PR 1, Q4 flip-only).
 *
 * Real Bundestag pattern: government bills tend to be broader and harder
 * (ministries bundle multiple items), so they spend MORE weeks in committee,
 * not fewer. The previous fast-track was structurally backwards. This
 * multiplier scales `committeeRange()` for `isGovernmentBill === true`.
 *
 * Applied at committee-stage entry only; bills mid-committee at the multiplier-
 * change moment keep their already-stored `stage_min/max_duration` (no
 * retroactive update).
 */
export const GOVERNMENT_BILL_COMMITTEE_MULTIPLIER = 1.3;

/**
 * Überweisung ohne Aussprache — probability that a non-government bill skips
 * the 1. Lesung floor debate and goes directly to committee (Cycle 3 PR 4, Q8).
 *
 * Real Bundestag: ~60–70% of bills are silently referred to committee without
 * any 1st-reading floor debate. Sim previously emitted `bill_first_reading`
 * for every bill, over-stating plenary activity. With this flag, ~65% of new
 * bills emit a compact `bill_ueberweisung_ohne_aussprache` event instead.
 *
 * Government bills are unaffected — they always skip 1. Lesung via the
 * existing fast-track path. The roll only applies to opposition / member /
 * coalition non-government bills.
 */
export const UEBERWEISUNG_OHNE_AUSSPRACHE_PROBABILITY = 0.65;

// ── Post-3rd-reading timing ─────────────────────────────────────────
/**
 * Bundesrat 2. Durchgang window (sim days). Cycle 1 models the phase as a
 * dwell timer only — Zustimmungsgesetz / Einspruchsgesetz and Vermittlungs-
 * ausschuss voting logic are P1. Real range per 20. WP: 3–6 weeks.
 */
export const BUNDESRAT_DURATION = { min: 21, max: 42 } as const;

/** Ausfertigung (Kanzler + ressortverantwortlicher Minister signature) + Verkündung im BGBl. */
export const AUSFERTIGUNG_DURATION = { min: 14, max: 42 } as const;

/** Default offset between Verkündung and Inkrafttreten when the bill doesn't specify. */
export const INKRAFTTRETEN_OFFSET = 14;

// ── Cycle 4 PR 1 — Untersuchungsausschuss ───────────────────────────

/** Min sim days an Untersuchungsausschuss runs before scheduled conclusion. */
export const INQUIRY_DURATION_MIN = 180;

/** Max sim days an Untersuchungsausschuss runs before scheduled conclusion. */
export const INQUIRY_DURATION_MAX = 540;

/** Hearings fire every N sim days while an inquiry is active (Q7 cadence). */
export const INQUIRY_HEARING_INTERVAL = 30;

/** Max simultaneously-active inquiries across all parties (S9). */
export const INQUIRY_MAX_ACTIVE = 2;

/** Min sim days between inquiry filings globally (S8 rate-limit). */
export const INQUIRY_MIN_DAYS_BETWEEN_FILINGS = 60;

/** Combined opposition seat-share threshold to file (Bundestag rule: 25%). */
export const INQUIRY_THRESHOLD_PERCENT = 0.25;

/** One-time approval bonus for filing party at filing time (S2). */
export const INQUIRY_FILER_FILING_BONUS = 0.3;

/** Per-day approval drag on target party while inquiry is active (S2).
 *  Negative = drag. Clamping handled by `clampApproval()` in opinion.ts (R1). */
export const INQUIRY_TARGET_DAILY_DRAG = -0.05;

/** Conclusion: wrongdoing-found impacts on target / filer (S2). */
export const INQUIRY_WRONGDOING_TARGET_IMPACT = -1.5;
export const INQUIRY_WRONGDOING_FILER_IMPACT = 0.8;

/** Conclusion: cleared impacts on target / filer (S2). */
export const INQUIRY_CLEARED_TARGET_IMPACT = 0.5;
export const INQUIRY_CLEARED_FILER_IMPACT = -0.3;

/** Watchdog (Q9): auto-conclude as cleared if past scheduled-end + this many
 *  days AND no hearing in the prior `INQUIRY_WATCHDOG_HEARING_GAP_DAYS`. */
export const INQUIRY_WATCHDOG_GRACE_DAYS = 30;
export const INQUIRY_WATCHDOG_HEARING_GAP_DAYS = 60;

// ── Cycle 4 PR 4 — Debate sub-formats (S6) ──────────────────────────

/** Probability per bill-reading event of a Kurzintervention firing.
 *  Independent roll from Zwischenfrage. */
export const KURZINTERVENTION_PROBABILITY = 0.30;

/** Probability per bill-reading event of a Zwischenfrage firing. */
export const ZWISCHENFRAGE_PROBABILITY = 0.30;

/**
 * Maps each `crises.category` (= BillCategory) to a ministry portfolio.
 * Used by:
 *   - PR 3 (S4): Nachtragshaushalt allocation crisis-boost
 *   - PR 1 (R5): findInquiryOpportunity — does this crisis embarrass govt?
 * Single source of truth (S18). All 8 BillCategory values mapped exhaustively.
 *
 * Note on spellings: BillCategory uses US spelling (`defense`, `healthcare`),
 * MinistryPortfolio uses UK spelling (`defence`, `health`) — preserved as the
 * codebase has shipped both for several cycles now.
 */
export const CRISIS_CATEGORY_TO_MINISTRY: Record<BillCategory, MinistryPortfolio> = {
  economy:        "finance",
  social:         "labour",
  environment:    "environment",
  immigration:    "interior",
  defense:        "defence",
  education:      "education",
  healthcare:     "health",
  infrastructure: "infrastructure",
};

// ── Parliamentary calendar ──────────────────────────────────────────
/**
 * Abstract calendar rule: even ISO weeks are Sitzungswochen, minus recess
 * periods, plus one forced Haushaltswoche per year. Matches real Bundestag
 * density of ~20–22 sitting weeks per year without requiring an externally
 * maintained Sitzungskalender JSON.
 */
export const CALENDAR = {
  /** Expected Sitzungswochen per year (for reference / tests). */
  SITZUNGS_WEEKS_PER_YEAR_TARGET: 22,
  /** Month (0-indexed) that holds the Haushaltswoche. */
  HAUSHALTS_WEEK_MONTH: 10, // November
  /** 1-indexed ordinal of the Monday-week within HAUSHALTS_WEEK_MONTH. */
  HAUSHALTS_WEEK_OF_MONTH: 2,
} as const;
