// The rule behind "current-year" and "previous-year" passes.
//
//   category = "current"   when the exam's academic year is today's academic year
//   category = "previous"  when the exam's academic year is earlier
//
// It is computed every time from the exam's academic year, never stored on the question, so on the first
// day of a new academic year last year's "current" passes become "previous" with no data change.
//
// ASSUMPTION (owner to confirm): the academic year starts on the 1st of a configurable month, August by
// default. Set ACADEMIC_YEAR_START_MONTH (1-12) to change it. Dates are read in Montréal time.

export const DEFAULT_ACADEMIC_YEAR_START_MONTH = 8;
export const ACADEMIC_TIME_ZONE = "America/Toronto";

export type PassCategory = "current" | "previous";

const YEAR_PATTERN = /^(\d{4})-(\d{4})$/;

/** Start month from ACADEMIC_YEAR_START_MONTH; a missing or blank value means the default. */
export function getAcademicYearStartMonth(env: Record<string, string | undefined> = process.env): number {
  const raw = env.ACADEMIC_YEAR_START_MONTH?.trim();
  if (!raw) return DEFAULT_ACADEMIC_YEAR_START_MONTH;
  const month = Number(raw);
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error("ACADEMIC_YEAR_START_MONTH must be a whole number from 1 to 12");
  }
  return month;
}

/** The first calendar year of "2025-2026" (2025), or null when the text isn't a valid academic year. */
export function parseAcademicYear(value: string): number | null {
  const match = YEAR_PATTERN.exec(value);
  if (!match) return null;
  const start = Number(match[1]);
  return Number(match[2]) === start + 1 ? start : null;
}

export function isValidAcademicYear(value: string): boolean {
  return parseAcademicYear(value) !== null;
}

function calendarParts(date: Date): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: ACADEMIC_TIME_ZONE, year: "numeric", month: "numeric" }).formatToParts(date);
  return {
    year: Number(parts.find((p) => p.type === "year")!.value),
    month: Number(parts.find((p) => p.type === "month")!.value),
  };
}

/** Today's academic year, e.g. "2026-2027". */
export function currentAcademicYear(now: Date = new Date(), startMonth: number = getAcademicYearStartMonth()): string {
  if (!Number.isInteger(startMonth) || startMonth < 1 || startMonth > 12) throw new RangeError("startMonth must be 1-12");
  const { year, month } = calendarParts(now);
  const start = month >= startMonth ? year : year - 1;
  return `${start}-${start + 1}`;
}

/** Exam years after the current academic year can't exist yet; submissions with one are rejected. */
export function isFutureAcademicYear(examYear: string, now: Date = new Date(), startMonth?: number): boolean {
  const exam = parseAcademicYear(examYear);
  const current = parseAcademicYear(currentAcademicYear(now, startMonth));
  return exam !== null && current !== null && exam > current;
}

/**
 * Category of a question from its exam year. Total on purpose: an invalid or future year (which
 * validation prevents) falls on the "current" side rather than throwing while a list is being rendered.
 */
export function passCategory(examYear: string, now: Date = new Date(), startMonth?: number): PassCategory {
  const exam = parseAcademicYear(examYear);
  const current = parseAcademicYear(currentAcademicYear(now, startMonth));
  return exam !== null && current !== null && exam < current ? "previous" : "current";
}

/**
 * The same rule as a database filter, so lists can be filtered in SQL:
 * current = year equals `current`; previous = year sorts before `current` ("YYYY-YYYY" sorts like time).
 */
export function categoryBounds(
  category: PassCategory,
  now: Date = new Date(),
  startMonth?: number,
): { equals: string } | { before: string } {
  const current = currentAcademicYear(now, startMonth);
  return category === "current" ? { equals: current } : { before: current };
}

/** The last `count` academic years up to and including the current one, newest first ("2026-2027", "2025-2026", …). */
export function recentAcademicYears(count = 8, now: Date = new Date(), startMonth?: number): string[] {
  const current = parseAcademicYear(currentAcademicYear(now, startMonth))!;
  return Array.from({ length: Math.max(count, 1) }, (_, i) => `${current - i}-${current - i + 1}`);
}
