/**
 * Calendar awareness for the simulation.
 *
 * Maps sim-days to real calendar dates so that events can be snapped
 * to workdays, Sundays (elections), and away from public holidays.
 */

// ── Day ↔ Date mapping ──────────────────────────────────────────────────────

/** Convert a simulation day number to a calendar Date. */
export function dayToDate(day: number, startDate: Date): Date {
  return new Date(startDate.getTime() + day * 86_400_000);
}

// ── Easter (Meeus / Jones / Butcher) ─────────────────────────────────────────

/** Returns Easter Sunday for a given year (Gregorian). */
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = March, 4 = April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

// ── German public holidays ───────────────────────────────────────────────────

export interface PublicHoliday {
  date: Date;
  name: string;
  nameDE: string;
}

/** All 9 national German public holidays for a given year. */
export function germanPublicHolidays(year: number): PublicHoliday[] {
  const easter = easterSunday(year);
  const easterMs = easter.getTime();
  const day = 86_400_000;

  return [
    { date: new Date(year, 0, 1), name: "New Year's Day", nameDE: "Neujahr" },
    { date: new Date(easterMs - 2 * day), name: "Good Friday", nameDE: "Karfreitag" },
    { date: new Date(easterMs + 1 * day), name: "Easter Monday", nameDE: "Ostermontag" },
    { date: new Date(year, 4, 1), name: "Labour Day", nameDE: "Tag der Arbeit" },
    { date: new Date(easterMs + 39 * day), name: "Ascension Day", nameDE: "Christi Himmelfahrt" },
    { date: new Date(easterMs + 50 * day), name: "Whit Monday", nameDE: "Pfingstmontag" },
    { date: new Date(year, 9, 3), name: "German Unity Day", nameDE: "Tag der Deutschen Einheit" },
    { date: new Date(year, 11, 25), name: "Christmas Day", nameDE: "1. Weihnachtstag" },
    { date: new Date(year, 11, 26), name: "St. Stephen's Day", nameDE: "2. Weihnachtstag" },
  ];
}

// ── Date checks ──────────────────────────────────────────────────────────────

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function isWeekend(date: Date): boolean {
  const dow = date.getDay();
  return dow === 0 || dow === 6;
}

export function isPublicHoliday(date: Date): boolean {
  return getPublicHoliday(date) !== null;
}

/** Returns holiday info if the date is a German public holiday, or null. */
export function getPublicHoliday(date: Date): PublicHoliday | null {
  const key = dateKey(date);
  const holidays = germanPublicHolidays(date.getFullYear());
  return holidays.find(h => dateKey(h.date) === key) ?? null;
}

/** True if the sim day maps to a workday (Mon–Fri, not a public holiday). */
export function isWorkday(day: number, startDate: Date): boolean {
  const d = dayToDate(day, startDate);
  return !isWeekend(d) && !isPublicHoliday(d);
}

// ── Snap helpers ─────────────────────────────────────────────────────────────

/** Scan forward (up to 10 days) to find the next workday. */
export function snapToNextWorkday(day: number, startDate: Date): number {
  for (let i = 0; i <= 10; i++) {
    if (isWorkday(day + i, startDate)) return day + i;
  }
  return day; // fallback (should never happen)
}

/** Scan forward (up to 7 days) to find the next Sunday (for election scheduling). */
export function snapToNextSunday(day: number, startDate: Date): number {
  for (let i = 0; i <= 7; i++) {
    const d = dayToDate(day + i, startDate);
    if (d.getDay() === 0) return day + i;
  }
  return day; // fallback
}

// ── Recess periods ───────────────────────────────────────────────────────────

/**
 * Bundestag recess periods (approximate):
 * - Summer: ~Jul 1 – Sep 10
 * - Christmas: Dec 20 – Jan 10
 * - Easter: Easter Sunday ±7 days
 * - Pentecost: Whit Monday ±3 days
 */
export function isRecessDay(date: Date): boolean {
  const month = date.getMonth(); // 0-based
  const day = date.getDate();

  // Summer recess: Jul 1 – Sep 10
  if (month === 6) return true; // all of July
  if (month === 7) return true; // all of August
  if (month === 8 && day <= 10) return true; // Sep 1–10

  // Christmas recess: Dec 20 – Jan 10
  if (month === 11 && day >= 20) return true;
  if (month === 0 && day <= 10) return true;

  // Easter recess: ±7 days around Easter Sunday
  const easter = easterSunday(date.getFullYear());
  const diff = Math.abs(date.getTime() - easter.getTime()) / 86_400_000;
  if (diff <= 7) return true;

  // Pentecost recess: ±3 days around Whit Monday
  const whitMonday = new Date(easter.getTime() + 50 * 86_400_000);
  const pentDiff = Math.abs(date.getTime() - whitMonday.getTime()) / 86_400_000;
  if (pentDiff <= 3) return true;

  return false;
}

// ── Session days ─────────────────────────────────────────────────────────────

/**
 * Realistic Bundestag session day: Wed/Thu/Fri, not a holiday, not in recess.
 */
export function isRealisticSessionDay(day: number, startDate: Date): boolean {
  const d = dayToDate(day, startDate);
  const dow = d.getDay();
  // Wed=3, Thu=4, Fri=5
  if (dow < 3 || dow > 5) return false;
  if (isPublicHoliday(d)) return false;
  if (isRecessDay(d)) return false;
  return true;
}

// ── Range queries ────────────────────────────────────────────────────────────

/** All public holidays that fall within a sim-day range (inclusive). */
export function getHolidaysInRange(
  startDay: number,
  endDay: number,
  startDate: Date,
): Array<{ day: number; holiday: PublicHoliday }> {
  // Figure out which calendar years are covered
  const first = dayToDate(startDay, startDate);
  const last = dayToDate(endDay, startDate);
  const years = new Set<number>();
  for (let y = first.getFullYear(); y <= last.getFullYear(); y++) years.add(y);

  const results: Array<{ day: number; holiday: PublicHoliday }> = [];
  for (const year of years) {
    for (const h of germanPublicHolidays(year)) {
      // Convert holiday date back to sim day
      const simDay = Math.round((h.date.getTime() - startDate.getTime()) / 86_400_000);
      if (simDay >= startDay && simDay <= endDay) {
        results.push({ day: simDay, holiday: h });
      }
    }
  }
  results.sort((a, b) => a.day - b.day);
  return results;
}
