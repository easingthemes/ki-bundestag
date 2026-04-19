/**
 * Parliamentary mechanics configuration.
 *
 * Controls constitutional court, interpellations, discipline system,
 * and related approval impacts.
 */

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
