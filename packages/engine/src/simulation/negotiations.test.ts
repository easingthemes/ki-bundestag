import { describe, it, expect } from "vitest";
import { shouldSkipNegotiationDispatch, getMaxNegotiationRounds } from "./negotiations.js";
import { MAX_NEGOTIATION_DAYS, MIN_NEGOTIATION_ROUND_DWELL_DAYS } from "../config/elections.js";

// Cycle 3 PR 4 (Q7) — coalition negotiation timing tests
describe("shouldSkipNegotiationDispatch", () => {
  it("never skips Round 1 (no prior round to space from)", () => {
    expect(shouldSkipNegotiationDispatch(0, null, 1)).toBe(false);
    expect(shouldSkipNegotiationDispatch(50, 10, 1)).toBe(false);
  });

  it("does not skip when no lastRoundDay is recorded yet", () => {
    expect(shouldSkipNegotiationDispatch(50, null, 2)).toBe(false);
    expect(shouldSkipNegotiationDispatch(50, null, 3)).toBe(false);
  });

  it("skips Round 2+ within the dwell window", () => {
    // 7-day dwell. Last round day 100, current 100..106 → all skip.
    for (let d = 100; d < 100 + MIN_NEGOTIATION_ROUND_DWELL_DAYS; d++) {
      expect(shouldSkipNegotiationDispatch(d, 100, 2)).toBe(true);
    }
  });

  it("dispatches Round 2+ once dwell window has elapsed", () => {
    expect(shouldSkipNegotiationDispatch(100 + MIN_NEGOTIATION_ROUND_DWELL_DAYS, 100, 2)).toBe(false);
    expect(shouldSkipNegotiationDispatch(100 + MIN_NEGOTIATION_ROUND_DWELL_DAYS + 5, 100, 2)).toBe(false);
  });

  it("3-round negotiations span at least 14 sim days under the dwell guard", () => {
    // Round 1 at day 0 (no skip)
    // Round 2: must wait until day 7
    // Round 3: must wait until day 14
    expect(shouldSkipNegotiationDispatch(0, null, 1)).toBe(false);
    // After round 1 dispatch at day 0:
    expect(shouldSkipNegotiationDispatch(6, 0, 2)).toBe(true);
    expect(shouldSkipNegotiationDispatch(7, 0, 2)).toBe(false);
    // After round 2 dispatch at day 7:
    expect(shouldSkipNegotiationDispatch(13, 7, 3)).toBe(true);
    expect(shouldSkipNegotiationDispatch(14, 7, 3)).toBe(false);
  });
});

describe("negotiation timing constants (Cycle 3 PR 4)", () => {
  it("MAX_NEGOTIATION_DAYS is 90 (real range 28–171 days)", () => {
    expect(MAX_NEGOTIATION_DAYS).toBe(90);
  });

  it("MIN_NEGOTIATION_ROUND_DWELL_DAYS is 7 (one week between rounds)", () => {
    expect(MIN_NEGOTIATION_ROUND_DWELL_DAYS).toBe(7);
  });

  it("MAX_NEGOTIATION_ROUNDS × dwell stays inside MAX_NEGOTIATION_DAYS", () => {
    // 3 rounds × 7 days = 21 days minimum span. Cap of 90 leaves comfortable
    // headroom for AI latency, weekend pauses, and per-round AI synthesis.
    const minSpan = (getMaxNegotiationRounds() - 1) * MIN_NEGOTIATION_ROUND_DWELL_DAYS;
    expect(minSpan).toBeLessThan(MAX_NEGOTIATION_DAYS);
  });
});
