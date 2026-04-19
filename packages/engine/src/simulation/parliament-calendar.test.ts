import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  isSitzungsWoche,
  isSitzungsTag,
  nextSitzungsTag,
  isHaushaltsWoche,
  getWeekdaySemantic,
} from "./parliament-calendar.js";

const START = new Date(2025, 0, 1); // Wed 2025-01-01

function simDay(y: number, m: number, d: number): number {
  return Math.round((new Date(y, m, d).getTime() - START.getTime()) / 86_400_000);
}

describe("parliament-calendar", () => {
  const originalEnv = process.env.CALENDAR_ENFORCED;
  beforeEach(() => { delete process.env.CALENDAR_ENFORCED; });
  afterEach(() => {
    if (originalEnv === undefined) delete process.env.CALENDAR_ENFORCED;
    else process.env.CALENDAR_ENFORCED = originalEnv;
  });

  describe("isSitzungsTag", () => {
    it("is false for every day in July (Sommerpause)", () => {
      for (let d = 1; d <= 31; d++) {
        expect(isSitzungsTag(simDay(2025, 6, d), START)).toBe(false);
      }
    });

    it("is false for every day in August (Sommerpause)", () => {
      for (let d = 1; d <= 31; d++) {
        expect(isSitzungsTag(simDay(2025, 7, d), START)).toBe(false);
      }
    });

    it("is false for Saturdays and Sundays", () => {
      // Oct 4 2025 = Sat, Oct 5 = Sun
      expect(isSitzungsTag(simDay(2025, 9, 4), START)).toBe(false);
      expect(isSitzungsTag(simDay(2025, 9, 5), START)).toBe(false);
    });

    it("is false on Mondays (Fraktionstag)", () => {
      // Collect all Mondays in Oct 2025 and verify none are Sitzungstage
      for (let d = 1; d <= 31; d++) {
        const date = new Date(2025, 9, d);
        if (date.getDay() === 1) {
          expect(isSitzungsTag(simDay(2025, 9, d), START)).toBe(false);
        }
      }
    });

    it("is false on public holidays even on a Tue-Fri", () => {
      // Oct 3 2025 (German Unity Day) is a Friday
      const day = simDay(2025, 9, 3);
      expect(new Date(2025, 9, 3).getDay()).toBe(5); // sanity: Fri
      expect(isSitzungsTag(day, START)).toBe(false);
    });

    it("produces at least some Tue-Fri sitting days in a typical autumn month", () => {
      let hits = 0;
      for (let d = 1; d <= 30; d++) {
        if (isSitzungsTag(simDay(2025, 10, d), START)) hits++; // Nov 2025
      }
      expect(hits).toBeGreaterThan(0);
    });

    it("returns true on every day when CALENDAR_ENFORCED=false", () => {
      process.env.CALENDAR_ENFORCED = "false";
      expect(isSitzungsTag(simDay(2025, 6, 15), START)).toBe(true); // Jul (would be recess)
      expect(isSitzungsTag(simDay(2025, 9, 5), START)).toBe(true);  // Sun
      expect(isSitzungsTag(simDay(2025, 11, 25), START)).toBe(true); // Xmas Day
    });
  });

  describe("isSitzungsWoche density", () => {
    it("produces 16–26 Sitzungswochen in a calendar year", () => {
      const mondays = new Set<number>();
      for (let d = 0; d < 365; d++) {
        if (!isSitzungsWoche(d, START)) continue;
        // Key on the Monday of the week to dedupe
        const date = new Date(START.getTime() + d * 86_400_000);
        const dow = date.getDay();
        const offset = dow === 0 ? -6 : 1 - dow;
        const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset);
        mondays.add(monday.getTime());
      }
      expect(mondays.size).toBeGreaterThanOrEqual(16);
      expect(mondays.size).toBeLessThanOrEqual(26);
    });
  });

  describe("isHaushaltsWoche", () => {
    it("identifies exactly one Nov week per year", () => {
      const mondays = new Set<number>();
      for (let d = 0; d < 365; d++) {
        if (!isHaushaltsWoche(d, START)) continue;
        const date = new Date(START.getTime() + d * 86_400_000);
        const dow = date.getDay();
        const offset = dow === 0 ? -6 : 1 - dow;
        const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset);
        mondays.add(monday.getTime());
      }
      expect(mondays.size).toBe(1);
    });

    it("the Haushaltswoche is a Sitzungswoche even if ISO-week is odd", () => {
      for (let d = 0; d < 365; d++) {
        if (isHaushaltsWoche(d, START)) {
          expect(isSitzungsWoche(d, START)).toBe(true);
        }
      }
    });
  });

  describe("getWeekdaySemantic", () => {
    it("labels weekdays during a Sitzungswoche", () => {
      // Find first Tue in a Sitzungswoche in the year
      for (let d = 0; d < 365; d++) {
        const date = new Date(START.getTime() + d * 86_400_000);
        if (date.getDay() !== 2 || !isSitzungsWoche(d, START)) continue;
        expect(getWeekdaySemantic(d, START)).toBe("fraktion");
        expect(getWeekdaySemantic(d + 1, START)).toBe("regierungsbefragung");
        expect(getWeekdaySemantic(d + 2, START)).toBe("plenum");
        expect(getWeekdaySemantic(d + 3, START)).toBe("plenum");
        return;
      }
      throw new Error("No Sitzungswoche found in 2025");
    });

    it("returns 'none' for any day outside a Sitzungswoche", () => {
      expect(getWeekdaySemantic(simDay(2025, 6, 15), START)).toBe("none"); // Jul (Sommerpause)
    });
  });

  describe("nextSitzungsTag", () => {
    it("returns the same day if already a Sitzungstag", () => {
      for (let d = 0; d < 365; d++) {
        if (isSitzungsTag(d, START)) {
          expect(nextSitzungsTag(d, START)).toBe(d);
          return;
        }
      }
    });

    it("skips the entire Sommerpause", () => {
      // Jul 1 2025 (Tue) — next Sitzungstag must be in Sep or later
      const next = nextSitzungsTag(simDay(2025, 6, 1), START);
      const nextDate = new Date(START.getTime() + next * 86_400_000);
      expect(nextDate.getMonth()).toBeGreaterThanOrEqual(8); // Sep (8) or later
      expect(isSitzungsTag(next, START)).toBe(true);
    });
  });
});
