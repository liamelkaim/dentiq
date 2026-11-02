// The student's schedule: followed courses, weekly class blocks, and the terms/breaks of their university preset.
// Every student query filters on viewer.id. Terms and periods are shared reference data (read-only here).
import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import { academicPeriods, academicTerms, courses, studyCalendarEntries, userClassBlocks, userCourses, userProfile } from "@/db/schema";
import { canAccessLibrary, type Viewer } from "@/server/resources/service";
import { CALENDAR_ENTRIES_PER_USER_MAX } from "./constants";
import { checkDate, isValidTime } from "./dates";
import { ICS_MAX_BYTES, parseIcs } from "./ics";
import { calendarMarkers, expandClassBlocks, type ClassBlock, type Marker, type Occurrence, type PeriodInfo, type TermInfo } from "./schedule";

export const CLASS_BLOCKS_PER_USER_MAX = 60;
export const FOLLOWED_COURSES_MAX = 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Result<T> = { ok: true; value: T } | { ok: false; error: string };
const fail = (error: string) => ({ ok: false as const, error });

export async function getInstitution(db: Database, userId: string): Promise<string | null> {
  const [row] = await db.select({ p: userProfile.universityPreset }).from(userProfile).where(eq(userProfile.userId, userId));
  return row?.p && row.p !== "other" ? row.p : null;
}

/** Terms and periods of the viewer's university overlapping [from, to]. Empty when no preset is chosen. */
export async function loadTermData(db: Database, viewer: Viewer, from: string, to: string): Promise<{ terms: TermInfo[]; periods: PeriodInfo[] }> {
  const institution = await getInstitution(db, viewer.id);
  if (!institution) return { terms: [], periods: [] };
  const termRows = await db
    .select()
    .from(academicTerms)
    .where(and(eq(academicTerms.institution, institution), lte(academicTerms.startDate, to), gte(academicTerms.endDate, from)))
    .orderBy(asc(academicTerms.startDate));
  const periodRows = await db
    .select({ p: academicPeriods })
    .from(academicPeriods)
    .innerJoin(academicTerms, eq(academicPeriods.termId, academicTerms.id))
    .where(and(eq(academicTerms.institution, institution), lte(academicPeriods.startDate, to), gte(academicPeriods.endDate, from)));
  return {
    terms: termRows.map((t) => ({ id: t.id, term: t.term, academicYear: t.academicYear, start: t.startDate, end: t.endDate, verified: t.status === "verified" })),
    periods: periodRows.map(({ p }) => ({ kind: p.kind, nameFr: p.nameFr, nameEn: p.nameEn, start: p.startDate, end: p.endDate, verified: p.status === "verified" })),
  };
}

export async function listClassBlocks(db: Database, viewer: Viewer): Promise<(ClassBlock & { courseId: string | null })[]> {
  const rows = await db
    .select({ b: userClassBlocks, code: courses.code })
    .from(userClassBlocks)
    .leftJoin(courses, eq(userClassBlocks.courseId, courses.id))
    .where(eq(userClassBlocks.userId, viewer.id))
    .orderBy(asc(userClassBlocks.weekday), asc(userClassBlocks.startTime));
  return rows.map(({ b, code }) => ({ id: b.id, title: b.title, courseCode: code, courseId: b.courseId, weekday: b.weekday, startTime: b.startTime, endTime: b.endTime, location: b.location, validFrom: b.validFrom, validTo: b.validTo }));
}

/** What to draw on the calendar between two dates: class occurrences and term/break markers. */
export async function loadScheduleWindow(db: Database, viewer: Viewer, from: string, to: string): Promise<{ occurrences: Occurrence[]; markers: Marker[]; hasTermData: boolean }> {
  if (!canAccessLibrary(viewer)) return { occurrences: [], markers: [], hasTermData: false };
  const [{ terms, periods }, blocks] = await Promise.all([loadTermData(db, viewer, from, to), listClassBlocks(db, viewer)]);
  return { occurrences: expandClassBlocks(blocks, periods, from, to), markers: calendarMarkers(terms, periods, from, to), hasTermData: terms.length > 0 };
}

export type ClassBlockInput = { title?: unknown; weekday?: unknown; startTime?: unknown; endTime?: unknown; location?: unknown; validFrom?: unknown; validTo?: unknown; courseId?: unknown };
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export function parseClassBlock(input: ClassBlockInput): Result<Omit<typeof userClassBlocks.$inferInsert, "userId">> {
  const title = str(input.title).replace(/\s+/g, " ");
  if (!title) return fail("titleRequired");
  if (title.length > 120) return fail("titleTooLong");
  const weekday = /^[1-7]$/.test(str(input.weekday)) ? Number(str(input.weekday)) : 0;
  if (!weekday) return fail("invalid");
  const startTime = str(input.startTime);
  const endTime = str(input.endTime);
  if (!isValidTime(startTime) || !isValidTime(endTime)) return fail("invalidTime");
  if (startTime >= endTime) return fail("endBeforeStart");
  const validFrom = str(input.validFrom);
  const validTo = str(input.validTo);
  if (checkDate(validFrom) !== "ok" || checkDate(validTo) !== "ok") return fail("invalidDate");
  if (validFrom > validTo) return fail("endBeforeStart");
  const location = str(input.location).slice(0, 120) || null;
  const courseId = str(input.courseId);
  if (courseId && !UUID.test(courseId)) return fail("invalid");
  return { ok: true, value: { title, weekday, startTime, endTime, location, validFrom, validTo, courseId: courseId || null } };
}

export async function createClassBlock(db: Database, viewer: Viewer, input: ClassBlockInput): Promise<Result<{ id: string }>> {
  if (!canAccessLibrary(viewer)) return fail("forbidden");
  const parsed = parseClassBlock(input);
  if (!parsed.ok) return parsed;
  const [n] = await db.select({ n: sql<number>`count(*)::int` }).from(userClassBlocks).where(eq(userClassBlocks.userId, viewer.id));
  if ((n?.n ?? 0) >= CLASS_BLOCKS_PER_USER_MAX) return fail("limitReached");
  if (parsed.value.courseId) {
    const [c] = await db.select({ id: courses.id }).from(courses).where(eq(courses.id, parsed.value.courseId));
    if (!c) return fail("invalid");
  }
  const [row] = await db.insert(userClassBlocks).values({ ...parsed.value, userId: viewer.id }).returning({ id: userClassBlocks.id });
  return { ok: true, value: { id: row!.id } };
}

export async function deleteClassBlock(db: Database, viewer: Viewer, id: string): Promise<boolean> {
  if (!UUID.test(id)) return false;
  const rows = await db.delete(userClassBlocks).where(and(eq(userClassBlocks.id, id), eq(userClassBlocks.userId, viewer.id))).returning({ id: userClassBlocks.id });
  return rows.length > 0;
}

export async function listFollowedCourseIds(db: Database, viewer: Viewer): Promise<string[]> {
  return (await db.select({ id: userCourses.courseId }).from(userCourses).where(eq(userCourses.userId, viewer.id))).map((r) => r.id);
}

export async function setFollowedCourse(db: Database, viewer: Viewer, courseId: string, follow: boolean): Promise<Result<null>> {
  if (!UUID.test(courseId)) return fail("invalid");
  if (!follow) {
    await db.delete(userCourses).where(and(eq(userCourses.userId, viewer.id), eq(userCourses.courseId, courseId)));
    return { ok: true, value: null };
  }
  const [c] = await db.select({ id: courses.id }).from(courses).where(eq(courses.id, courseId));
  if (!c) return fail("invalid");
  if ((await listFollowedCourseIds(db, viewer)).length >= FOLLOWED_COURSES_MAX) return fail("limitReached");
  await db.insert(userCourses).values({ userId: viewer.id, courseId }).onConflictDoNothing();
  return { ok: true, value: null };
}

export type ImportSummary = { entries: number; classBlocks: number; skipped: number };

/** Imports a .ics file the student chose. One-off events become calendar entries; weekly events become class blocks. */
export async function importIcs(db: Database, viewer: Viewer, text: string): Promise<Result<ImportSummary>> {
  if (!canAccessLibrary(viewer)) return fail("forbidden");
  if (text.length > ICS_MAX_BYTES) return fail("fileTooLarge");
  const { events, skipped } = parseIcs(text);
  if (events.length === 0) return fail("nothingToImport");
  const summary: ImportSummary = { entries: 0, classBlocks: 0, skipped };
  await db.transaction(async (tx) => {
    const [e] = await tx.select({ n: sql<number>`count(*)::int` }).from(studyCalendarEntries).where(eq(studyCalendarEntries.userId, viewer.id));
    const [b] = await tx.select({ n: sql<number>`count(*)::int` }).from(userClassBlocks).where(eq(userClassBlocks.userId, viewer.id));
    let entryRoom = CALENDAR_ENTRIES_PER_USER_MAX - (e?.n ?? 0);
    let blockRoom = CLASS_BLOCKS_PER_USER_MAX - (b?.n ?? 0);
    for (const ev of events) {
      if (ev.weekly && ev.time && ev.endTime && ev.endTime > ev.time) {
        const validTo = ev.weekly.until ?? (ev.weekly.count ? addWeeks(ev.date, ev.weekly.count - 1) : null);
        if (!validTo || validTo < ev.date || blockRoom <= 0) {
          summary.skipped++;
          continue;
        }
        const weekday = ((new Date(`${ev.date}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
        await tx.insert(userClassBlocks).values({ userId: viewer.id, title: ev.title, weekday, startTime: ev.time, endTime: ev.endTime, location: ev.location, validFrom: ev.date, validTo });
        summary.classBlocks++;
        blockRoom--;
      } else if (!ev.weekly) {
        if (entryRoom <= 0) {
          summary.skipped++;
          continue;
        }
        await tx.insert(studyCalendarEntries).values({ userId: viewer.id, title: ev.title, entryDate: ev.date, entryTime: ev.time, kind: "other", note: [ev.location, ev.description].filter(Boolean).join("\n").slice(0, 1000) || null });
        summary.entries++;
        entryRoom--;
      } else {
        summary.skipped++;
      }
    }
  });
  return { ok: true, value: summary };
}

function addWeeks(iso: string, weeks: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + weeks * 7);
  return d.toISOString().slice(0, 10);
}

