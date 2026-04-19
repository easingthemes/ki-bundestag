import { describe, it, expect } from "vitest";
import { dwellDays, committeeRange } from "./bill-pipeline.js";
import { BILL_STAGE_DURATIONS } from "../config/parliament.js";
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
});
