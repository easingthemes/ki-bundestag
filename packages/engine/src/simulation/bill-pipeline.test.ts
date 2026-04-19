import { describe, it, expect } from "vitest";
import { dwellDays, committeeRange } from "./bill-pipeline.js";
import {
  BILL_STAGE_DURATIONS,
  BUNDESRAT_DURATION,
  AUSFERTIGUNG_DURATION,
  INKRAFTTRETEN_OFFSET,
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
