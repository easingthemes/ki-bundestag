import { describe, it, expect } from "vitest";
import {
  easterSunday,
  germanPublicHolidays,
  isWeekend,
  isWorkday,
  dayToDate,
  snapToNextSunday,
  isRecessDay,
} from "./calendar.js";

describe("easterSunday", () => {
  // Known Easter dates to verify the algorithm
  it("returns correct Easter for 2024", () => {
    const easter = easterSunday(2024);
    expect(easter.getFullYear()).toBe(2024);
    expect(easter.getMonth()).toBe(2); // March (0-indexed)
    expect(easter.getDate()).toBe(31);
  });

  it("returns correct Easter for 2025", () => {
    const easter = easterSunday(2025);
    expect(easter.getFullYear()).toBe(2025);
    expect(easter.getMonth()).toBe(3); // April
    expect(easter.getDate()).toBe(20);
  });
});

describe("germanPublicHolidays", () => {
  it("returns exactly 9 national holidays", () => {
    const holidays = germanPublicHolidays(2025);
    expect(holidays).toHaveLength(9);
  });

  it("includes New Year and Christmas", () => {
    const holidays = germanPublicHolidays(2025);
    const names = holidays.map(h => h.name);
    expect(names).toContain("New Year's Day");
    expect(names).toContain("Christmas Day");
    expect(names).toContain("German Unity Day");
  });
});

describe("isWeekend", () => {
  it("detects Saturday", () => {
    expect(isWeekend(new Date(2025, 3, 5))).toBe(true); // Saturday
  });

  it("detects Sunday", () => {
    expect(isWeekend(new Date(2025, 3, 6))).toBe(true); // Sunday
  });

  it("rejects Monday", () => {
    expect(isWeekend(new Date(2025, 3, 7))).toBe(false); // Monday
  });
});

describe("isWorkday", () => {
  const startDate = new Date(2025, 0, 1); // Jan 1 2025 (Wednesday)

  it("New Year's Day is not a workday", () => {
    // Day 0 = Jan 1 2025 = New Year's
    expect(isWorkday(0, startDate)).toBe(false);
  });

  it("regular Tuesday is a workday", () => {
    // Day 6 = Jan 7 2025 (Tuesday)
    expect(isWorkday(6, startDate)).toBe(true);
  });
});

describe("snapToNextSunday", () => {
  const startDate = new Date(2025, 0, 1); // Wednesday

  it("returns same day if already Sunday", () => {
    // Day 4 = Jan 5 2025 (Sunday)
    const d = dayToDate(4, startDate);
    expect(d.getDay()).toBe(0); // verify it's Sunday
    expect(snapToNextSunday(4, startDate)).toBe(4);
  });

  it("finds the next Sunday", () => {
    // Day 0 = Jan 1 (Wed), next Sunday = Day 4
    const result = snapToNextSunday(0, startDate);
    const resultDate = dayToDate(result, startDate);
    expect(resultDate.getDay()).toBe(0);
  });
});

describe("isRecessDay", () => {
  it("mid-July is summer recess", () => {
    expect(isRecessDay(new Date(2025, 6, 15))).toBe(true); // July 15
  });

  it("October is not recess", () => {
    expect(isRecessDay(new Date(2025, 9, 15))).toBe(false); // Oct 15
  });
});
