// Pure calendar-date helpers (no database, no React). Dates are "YYYY-MM-DD" strings; arithmetic goes through UTC so
// the machine's time zone can never shift a day. Weeks start on Monday.
import { CALENDAR_TIME_ZONE, CALENDAR_YEAR_MAX, CALENDAR_YEAR_MIN } from "./constants";

export type YearMonth = { year: number; month: number };

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_MONTH = /^(\d{4})-(\d{2})$/;

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

export const formatIso = (year: number, month: number, day: number) => `${pad(year, 4)}-${pad(month)}-${pad(day)}`;

/** Splits a real calendar date ("2024-02-29" yes, "2025-02-29" no); null when it is not one. Year range is not checked here. */
export function parseIsoDate(value: string): { year: number; month: number; day: number } | null {
  const m = ISO_DATE.exec(value);
  if (!m) return null;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(year, month - 1, day));
  // Year 0-99 would be read as 1900-1999 by Date.UTC; the round trip below catches that too.
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return { year, month, day };
}

export type DateCheck = "ok" | "invalidDate" | "dateOutOfRange";

/** Real date AND inside the allowed year range. */
export function checkDate(value: string): DateCheck {
  const parsed = parseIsoDate(value);
  if (!parsed) return "invalidDate";
  return parsed.year < CALENDAR_YEAR_MIN || parsed.year > CALENDAR_YEAR_MAX ? "dateOutOfRange" : "ok";
}

/** "HH:MM" 24-hour clock. */
export const isValidTime = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

export const isLeapYear = (year: number) => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

/** `month` is 1 to 12. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

const toUtc = (iso: string) => {
  const p = parseIsoDate(iso);
  if (!p) throw new Error(`Not a calendar date: ${iso}`);
  return Date.UTC(p.year, p.month - 1, p.day);
};

const fromUtc = (ms: number) => {
  const d = new Date(ms);
  return formatIso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
};

export const addDays = (iso: string, days: number) => fromUtc(toUtc(iso) + days * 86_400_000);

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export const daysBetween = (from: string, to: string) => Math.round((toUtc(to) - toUtc(from)) / 86_400_000);

/** 0 = Monday ... 6 = Sunday. */
export const weekdayIndex = (iso: string) => (new Date(toUtc(iso)).getUTCDay() + 6) % 7;

export function addMonths({ year, month }: YearMonth, delta: number): YearMonth {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (((index % 12) + 12) % 12) + 1 };
}

export const monthParam = ({ year, month }: YearMonth) => `${pad(year, 4)}-${pad(month)}`;

/** "YYYY-MM" from a URL, or null when it is missing, malformed or outside the allowed years. */
export function parseMonthParam(value: string | undefined): YearMonth | null {
  const m = value ? ISO_MONTH.exec(value) : null;
  if (!m) return null;
  const [year, month] = [Number(m[1]), Number(m[2])];
  if (month < 1 || month > 12 || year < CALENDAR_YEAR_MIN || year > CALENDAR_YEAR_MAX) return null;
  return { year, month };
}

/** The calendar date of `now` in a time zone (default: CALENDAR_TIME_ZONE), as "YYYY-MM-DD". */
export function isoDateIn(now: Date, timeZone: string = CALENDAR_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export type GridCell = { iso: string; day: number; inMonth: boolean };
export type MonthGrid = { year: number; month: number; weeks: GridCell[][] };

/**
 * The cells of a month view, Monday first. Each week has 7 cells; leading and trailing cells from the neighbouring
 * months are included (flagged `inMonth: false`) so every row is full. 4 to 6 weeks, never a fully empty row.
 */
export function buildMonthGrid(year: number, month: number): MonthGrid {
  const first = formatIso(year, month, 1);
  const lead = weekdayIndex(first);
  const total = lead + daysInMonth(year, month);
  const weekCount = Math.ceil(total / 7);
  const start = addDays(first, -lead);
  const weeks: GridCell[][] = [];
  for (let w = 0; w < weekCount; w++) {
    const row: GridCell[] = [];
    for (let d = 0; d < 7; d++) {
      const iso = addDays(start, w * 7 + d);
      const p = parseIsoDate(iso)!;
      row.push({ iso, day: p.day, inMonth: p.year === year && p.month === month });
    }
    weeks.push(row);
  }
  return { year, month, weeks };
}

/** Days from `today` until `date`: 0 today, positive in the future, negative in the past. */
export const daysUntil = (today: string, date: string) => daysBetween(today, date);
