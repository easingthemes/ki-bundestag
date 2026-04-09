/**
 * Voting probability configuration.
 *
 * Controls algorithmic vote rates for amendments, motions,
 * and confidence votes.
 */

// ── Amendment vote rates ────────────────────────────────────────────
/** Coalition-aligned party yes rate for coalition-proposed amendments */
export const AMENDMENT_COALITION_YES_RATE = 0.9;
/** Both-opposition yes rate for opposition-proposed amendments */
export const AMENDMENT_OPPOSITION_YES_RATE = 0.7;
/** Cross-alignment yes rate (opposition vs coalition or vice versa) */
export const AMENDMENT_CROSS_YES_RATE = 0.1;

// ── Motion vote rates ───────────────────────────────────────────────
/** Coalition on coalition motion: yes rate */
export const MOTION_COALITION_YES_RATE = 0.8;
/** Opposition on opposition motion: yes rate */
export const MOTION_OPPOSITION_YES_RATE = 0.7;
/** Cross-alignment motion: yes rate */
export const MOTION_CROSS_YES_RATE = 0.2;

// ── Motion sentiment impacts ────────────────────────────────────────
/** Sentiment gain when a motion passes */
export const MOTION_PASSED_SENTIMENT = 0.3;
/** Sentiment loss when a motion is rejected (gridlock disappoints the public) */
export const MOTION_REJECTED_SENTIMENT = -0.1;
/** Sentiment gain when a resolution passes */
export const RESOLUTION_PASSED_SENTIMENT = 0.2;
/** Sentiment loss when a resolution is rejected */
export const RESOLUTION_REJECTED_SENTIMENT = -0.1;

// ── Confidence vote rates ───────────────────────────────────────────
/** Vertrauensfrage: coalition yes rate (10% defection risk) */
export const VERTRAUENSFRAGE_COALITION_YES_RATE = 0.9;

/** Misstrauensvotum: other opposition yes rate */
export const MISSTRAUENSVOTUM_OPPOSITION_YES_RATE = 0.85;

// ── Confidence vote approval impacts ────────────────────────────────
export const CONFIDENCE_IMPACTS = {
  vertrauensfrage: {
    passed:  { coalition: 0.5,  opposition: -0.3 },
    failed:  { coalition: -2.0, opposition: 1.0  },
  },
  misstrauensvotum: {
    passed:  { proposer: 2.0,   coalition: -2.0 },
    failed:  { coalition: 0.3,  proposer: -0.5  },
  },
} as const;

// ── Discipline-forced voting ────────────────────────────────────────
/** MdB discipline level at which votes are forced to party line */
export const DISCIPLINE_FORCE_LEVEL = 3;
