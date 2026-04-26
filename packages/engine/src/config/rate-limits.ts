/**
 * Rate limit and AI input cap configuration.
 *
 * Two populations live here:
 * - Humans: capped per real-time 24h window (matches lived experience).
 * - Bots: capped per sim day (scales with the active timing preset).
 *
 * Pre-filter caps below bound how much user-generated content reaches the
 * AI engine each sim day. Tune down if costs spike, up if bots feel mute.
 */

// ── Per-user 24h rolling window caps (humans) ───────────────────────
/**
 * Human user daily limits for content-generating actions (24h wall-clock).
 * Independent of timing preset — bounds what a real person realistically
 * does in a real day.
 */
export const USER_DAILY_LIMITS: Record<string, number> = {
  submit_question: 5,
  submit_speech: 5,
  submit_proposal: 2,
  submit_amendment: 3,
  // apply_mdb: limited to 1 active + cooldown, no daily cap needed
};

// ── Per-bot sim-day caps ────────────────────────────────────────────
/**
 * Bot daily limits, measured in sim days.
 *
 * Bots live on the simulation clock — these caps scale with the active
 * timing preset (slow ≈ 10 sim days/24h wall, ultra-fast ≈ 96). Bots
 * bypass `requireParticipatory()`, so these are the only volume gate.
 *
 * Vote actions (poll, referendum, question, proposal, mdb-vote) are
 * naturally capped at one per item by DB UNIQUE constraints.
 */
export const BOT_SIM_DAY_LIMITS: Record<string, number> = {
  submit_question: 1,
  submit_speech: 1,           // additional per-bill cap enforced separately
  submit_proposal: 1,
  submit_amendment: 1,
  submit_motion: 1,
  submit_interpellation: 1,
  signal_bill: 5,             // matches the action type logged by /api/bills/:id/signal
  // apply_mdb: covered by "1 pending or 1 active seat" constraint in seats.ts
};

// ── AI input pre-filter caps ────────────────────────────────────────
/**
 * Top-N proposals per party fed into the proposal-rank AI prompt.
 * Sorted by `voteScore` desc before slicing. Output cap is separate
 * (`MAX_ACCEPT_PER_PARTY` in internal-proposals.ts).
 */
export const PROPOSAL_INPUT_CAP_PER_PARTY = 30;

/**
 * Top-N speeches per bill fed into the speech-flag AI prompt.
 * Short speeches (<50 chars) are auto-neutral and don't count toward
 * this cap. Sorted by length desc before slicing.
 */
export const SPEECH_INPUT_CAP_PER_BILL = 100;

// ── Sim-day processing caps (no AI, but state-impact) ───────────────
/**
 * Max user-submitted motions processed per sim day. Excess are deferred
 * to the next sim day (FIFO by submission time). Each motion applies a
 * sentiment delta — uncapped volume bypasses the intended ±0.5/day cap.
 */
export const USER_MOTION_CAP_PER_DAY = 10;

/**
 * Max pending interpellations in the queue. Only 2 are answered per sim
 * day (`INTERPELLATION_MAX_ANSWERS_PER_DAY`); without this cap the
 * backlog grows forever. Newest submissions are rejected when the queue
 * is full.
 */
export const INTERPELLATION_PENDING_CAP = 30;
