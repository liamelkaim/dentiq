// The student's schedule: pure functions (no database, no clock). Terms, breaks and exam periods come from the program
// data (data/programs/*.json, each entry carrying its source and VERIFIED/UNVERIFIED status); class blocks are what the
// student entered or imported. Dates are plain "YYYY-MM-DD" strings, so no time zone can shift a day; the zone only
// matters when "today" is computed (CALENDAR_TIME_ZONE in constants.ts).
import { addDays, daysBetween, weekdayIndex } from "./dates";

export const periodKinds = ["reading_week", "break", "holiday", "exam_period"] as const;
export type PeriodKind = (typeof periodKinds)[number];

/** Classes do not run during these (an exam period is shown but does not cancel a class: the student decides). */
export const CLASS_FREE_KINDS: readonly PeriodKind[] = ["reading_week", "break", "holiday"];

export type TermInfo = { id: string; term: "fall" | "winter" | "summer"; academicYear: string; start: string; end: string; verified: boolean };
export type PeriodInfo = { kind: PeriodKind; nameFr: string; nameEn: string | null; start: string; end: string; verified: boolean };

/** Monday = 1 ... Sunday = 7. */
export type ClassBlock = {
  id: string;
  title: string;
  courseCode: string | null;
  weekday: number;
  startTime: string;
  endTime: string;
  location: string | null;
  validFrom: string;
  validTo: string;
};

export type Occurrence = Omit<ClassBlock, "weekday" | "validFrom" | "validTo"> & { date: string };

const inRange = (date: string, start: string, end: string) => date >= start && date <= end;

/** Every date of a block inside [from, to]: its weekday, within its own validity, not on a class-free day. */
export function expandClassBlock(block: ClassBlock, periods: readonly PeriodInfo[], from: string, to: string): Occurrence[] {
  const start = block.validFrom > from ? block.validFrom : from;
  const end = block.validTo < to ? block.validTo : to;
  if (start > end) return [];
  const free = periods.filter((p) => CLASS_FREE_KINDS.includes(p.kind));
  // Walk to the first matching weekday, then step a week at a time.
  let cursor = addDays(start, (block.weekday - 1 - weekdayIndex(start) + 7) % 7);
  const out: Occurrence[] = [];
  const rest = { id: block.id, title: block.title, courseCode: block.courseCode, startTime: block.startTime, endTime: block.endTime, location: block.location };
  for (; cursor <= end; cursor = addDays(cursor, 7)) {
    if (free.some((p) => inRange(cursor, p.start, p.end))) continue;
    out.push({ ...rest, date: cursor });
  }
  return out;
}

export function expandClassBlocks(blocks: readonly ClassBlock[], periods: readonly PeriodInfo[], from: string, to: string): Occurrence[] {
  return blocks
    .flatMap((b) => expandClassBlock(b, periods, from, to))
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime) || a.id.localeCompare(b.id));
}

export type MarkerKind = "term_start" | "term_end" | PeriodKind;
export type Marker = { date: string; kind: MarkerKind; nameFr: string; nameEn: string | null; verified: boolean };

/** One marker per day for every term start/end and for each day of a period, limited to [from, to]. */
export function calendarMarkers(terms: readonly TermInfo[], periods: readonly PeriodInfo[], from: string, to: string): Marker[] {
  const out: Marker[] = [];
  const termName = (t: TermInfo) => ({ fall: ["Automne", "Fall"], winter: ["Hiver", "Winter"], summer: ["Été", "Summer"] })[t.term];
  for (const t of terms) {
    const [fr, en] = termName(t)!;
    if (inRange(t.start, from, to)) out.push({ date: t.start, kind: "term_start", nameFr: `${fr} ${t.academicYear}`, nameEn: `${en} ${t.academicYear}`, verified: t.verified });
    if (inRange(t.end, from, to)) out.push({ date: t.end, kind: "term_end", nameFr: `${fr} ${t.academicYear}`, nameEn: `${en} ${t.academicYear}`, verified: t.verified });
  }
  for (const p of periods) {
    const start = p.start > from ? p.start : from;
    const end = p.end < to ? p.end : to;
    for (let d = start; d <= end; d = addDays(d, 1)) out.push({ date: d, kind: p.kind, nameFr: p.nameFr, nameEn: p.nameEn, verified: p.verified });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind));
}

/** Length in days of an inclusive range, for validation. */
export const spanDays = (start: string, end: string) => daysBetween(start, end) + 1;
