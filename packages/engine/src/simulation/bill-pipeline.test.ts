import { describe, it, expect } from "vitest";
import { dwellDays, committeeRange, shouldSkipFirstReading } from "./bill-pipeline.js";
import {
  BILL_STAGE_DURATIONS,
  BUNDESRAT_DURATION,
  AUSFERTIGUNG_DURATION,
  INKRAFTTRETEN_OFFSET,
  GOVERNMENT_BILL_COMMITTEE_MULTIPLIER,
  UEBERWEISUNG_OHNE_AUSSPRACHE_PROBABILITY,
} from "../config/parliament.js";
import type { Bill } from "@ki-bundestag/types";

function makeBill(over: Partial<Bill>): Bill {
  return {
    id: "bill-1",
    title: "Test",
    description: "Test bill",
    category: "economy",
    proposedBy: "spd",
    status: "committee",
    impact: {},
    votes: [],
    proposedOnDay: 10,
    ...over,
  };
}

describe("bill-pipeline helpers", () => {
  describe("dwellDays", () => {
    it("uses stageEntryDay when present", () => {
      const bill = makeBill({ stageEntryDay: 50, statusChangedOnDay: 30, proposedOnDay: 10 });
      expect(dwellDays(bill, 100)).toBe(50);
    });

    it("falls back to statusChangedOnDay for pre-Cycle-1 bills", () => {
      const bill = makeBill({ stageEntryDay: undefined, statusChangedOnDay: 30, proposedOnDay: 10 });
      expect(dwellDays(bill, 100)).toBe(70);
    });

    it("falls back to proposedOnDay when nothing else is set", () => {
      const bill = makeBill({ stageEntryDay: undefined, statusChangedOnDay: undefined, proposedOnDay: 10 });
      expect(dwellDays(bill, 100)).toBe(90);
    });

    it("returns 0 on the day the stage was entered", () => {
      const bill = makeBill({ stageEntryDay: 42 });
      expect(dwellDays(bill, 42)).toBe(0);
    });
  });

  describe("committeeRange", () => {
    it("returns ordinary range by default", () => {
      const bill = makeBill({});
      expect(committeeRange(bill)).toEqual(BILL_STAGE_DURATIONS.committee.ordinary);
    });

    it("returns complex range when isComplexBill is true", () => {
      const bill = makeBill({ isComplexBill: true });
      expect(committeeRange(bill)).toEqual(BILL_STAGE_DURATIONS.committee.complex);
    });

    // Cycle 3 PR 1 (Q4 flip-only): government bills get a 1.3× committee window
    it("scales ordinary committee by 1.3× for government bills", () => {
      const bill = makeBill({ isGovernmentBill: true } as Partial<Bill>);
      const base = BILL_STAGE_DURATIONS.committee.ordinary;
      expect(committeeRange(bill)).toEqual({
        min: Math.round(base.min * GOVERNMENT_BILL_COMMITTEE_MULTIPLIER),
        max: Math.round(base.max * GOVERNMENT_BILL_COMMITTEE_MULTIPLIER),
      });
    });

    it("scales complex committee by 1.3× for government bills", () => {
      const bill = makeBill({ isGovernmentBill: true, isComplexBill: true } as Partial<Bill>);
      const base = BILL_STAGE_DURATIONS.committee.complex;
      expect(committeeRange(bill)).toEqual({
        min: Math.round(base.min * GOVERNMENT_BILL_COMMITTEE_MULTIPLIER),
        max: Math.round(base.max * GOVERNMENT_BILL_COMMITTEE_MULTIPLIER),
      });
    });

    it("multiplier is 1.3 (real-data fit; revisit after a 4-year sim)", () => {
      expect(GOVERNMENT_BILL_COMMITTEE_MULTIPLIER).toBe(1.3);
    });
  });

  // Cycle 3 PR 4 (Q8): 65% Überweisung-ohne-Aussprache skip
  describe("shouldSkipFirstReading", () => {
    it("skips when rng < 0.65", () => {
      expect(shouldSkipFirstReading(() => 0)).toBe(true);
      expect(shouldSkipFirstReading(() => 0.4)).toBe(true);
      expect(shouldSkipFirstReading(() => 0.649)).toBe(true);
    });

    it("debates (no skip) when rng >= 0.65", () => {
      expect(shouldSkipFirstReading(() => 0.65)).toBe(false);
      expect(shouldSkipFirstReading(() => 0.8)).toBe(false);
      expect(shouldSkipFirstReading(() => 0.999)).toBe(false);
    });

    it("threshold is 0.65 (real Bundestag: 60–70% of bills skip 1st reading)", () => {
      expect(UEBERWEISUNG_OHNE_AUSSPRACHE_PROBABILITY).toBe(0.65);
    });

    it("converges to ~65% over many seeded trials", () => {
      let s = 1;
      const rng = () => { s = (s * 1103515245 + 12345) % 0x7fffffff; return s / 0x7fffffff; };
      const trials = 50_000;
      let skips = 0;
      for (let i = 0; i < trials; i++) {
        if (shouldSkipFirstReading(rng)) skips++;
      }
      const rate = skips / trials;
      // Allow ±0.01 trial-noise window around 0.65
      expect(rate).toBeGreaterThan(0.64);
      expect(rate).toBeLessThan(0.66);
    });
  });

  describe("BILL_STAGE_DURATIONS", () => {
    it("ordinary committee phase is 6–12 weeks", () => {
      expect(BILL_STAGE_DURATIONS.committee.ordinary.min).toBe(42);
      expect(BILL_STAGE_DURATIONS.committee.ordinary.max).toBe(84);
    });

    it("complex committee phase is 3–6 months", () => {
      expect(BILL_STAGE_DURATIONS.committee.complex.min).toBe(90);
      expect(BILL_STAGE_DURATIONS.committee.complex.max).toBe(180);
    });

    it("third reading can happen same sitting day as second", () => {
      expect(BILL_STAGE_DURATIONS.third_reading.min).toBe(0);
    });
  });

  describe("post-3rd-reading timing", () => {
    it("Bundesrat phase is 3–6 weeks", () => {
      expect(BUNDESRAT_DURATION.min).toBe(21);
      expect(BUNDESRAT_DURATION.max).toBe(42);
    });

    it("Ausfertigung phase is 2–6 weeks", () => {
      expect(AUSFERTIGUNG_DURATION.min).toBe(14);
      expect(AUSFERTIGUNG_DURATION.max).toBe(42);
    });

    it("default Inkrafttreten is +14 days after BGBl", () => {
      expect(INKRAFTTRETEN_OFFSET).toBe(14);
    });

    it("minimum end-to-end post-3rd-reading timeline ≥ 49 days", () => {
      // Even the fastest path: 21 (Bundesrat min) + 14 (Ausfert. min) + 14 (Inkrafttreten)
      const minimum = BUNDESRAT_DURATION.min + AUSFERTIGUNG_DURATION.min + INKRAFTTRETEN_OFFSET;
      expect(minimum).toBe(49);
    });

    it("maximum end-to-end post-3rd-reading timeline ≤ 98 days", () => {
      const maximum = BUNDESRAT_DURATION.max + AUSFERTIGUNG_DURATION.max + INKRAFTTRETEN_OFFSET;
      expect(maximum).toBe(98);
    });
  });
});
