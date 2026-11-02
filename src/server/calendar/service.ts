// Study calendar: business rules. Every function takes the database explicitly and the viewer, and EVERY query
// filters on `viewer.id`, so a student can only ever read, change or delete their own entries. Looking up someone
// else's entry by id behaves exactly like "not found". Nothing is pre-filled: the table only holds what the student
// typed. Approved members only (same rule as the study tools).
import { and, asc, count, eq, gte, lte, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import { calendarEntryKinds, courses, studyCalendarEntries, type CalendarEntryKind } from "@/db/schema";
import { canAccessLibrary, type Viewer } from "@/server/resources/service";
import { CALENDAR_ENTRIES_PER_USER_MAX, CALENDAR_NOTE_MAX, CALENDAR_TITLE_MAX, UPCOMING_LIMIT } from "./constants";
import { checkDate, isValidTime } from "./dates";

export type CalendarResult<T> = { ok: true; value: T } | { ok: false; error: string; field?: string | null };
const fail = (error: string) => ({ ok: false as const, error });

/** What the form sends: plain strings. Unknown keys are ignored. */
export type CalendarEntryInput = {
  title?: unknown;
  date?: unknown;
  time?: unknown;
  courseId?: unknown;
  kind?: unknown;
  note?: unknown;
};

export type CleanEntry = {
  title: string;
  date: string;
  time: string | null;
  courseId: string | null;
  kind: CalendarEntryKind;
  note: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

/** Validates and cleans the form values. Returns an error CODE (translated by the screens), never a message. */
export function parseEntryInput(input: CalendarEntryInput): { ok: true; value: CleanEntry } | { ok: false; error: string } {
  const title = text(input.title);
  if (!title) return { ok: false, error: "titleRequired" };
  if (title.length > CALENDAR_TITLE_MAX) return { ok: false, error: "titleTooLong" };

  const date = text(input.date);
  const dateCheck = checkDate(date);
  if (dateCheck !== "ok") return { ok: false, error: dateCheck };

  const time = text(input.time);
  if (time && !isValidTime(time)) return { ok: false, error: "invalidTime" };

  const kind = text(input.kind) || "other";
  if (!(calendarEntryKinds as readonly string[]).includes(kind)) return { ok: false, error: "invalid" };

  const courseId = text(input.courseId);
  if (courseId && !UUID.test(courseId)) return { ok: false, error: "courseNotFound" };

  // Line breaks in a note are kept; the length limit counts them.
  const note = typeof input.note === "string" ? input.note.replace(/\r\n?/g, "\n").trim() : "";
  if (note.length > CALENDAR_NOTE_MAX) return { ok: false, error: "noteTooLong" };

  return { ok: true, value: { title, date, time: time || null, courseId: courseId || null, kind: kind as CalendarEntryKind, note: note || null } };
}

export type CalendarEntry = {
  id: string;
  title: string;
  date: string;
  time: string | null;
  kind: CalendarEntryKind;
  note: string | null;
  courseId: string | null;
  courseCode: string | null;
  /** Set on rows that are not the student's own entries: a class from their schedule or a term/break marker. */
  virtual?: { type: "class" | "marker"; markerKind?: string; verified?: boolean };
};

const columns = {
  id: studyCalendarEntries.id,
  title: studyCalendarEntries.title,
  date: studyCalendarEntries.entryDate,
  time: studyCalendarEntries.entryTime,
  kind: studyCalendarEntries.kind,
  note: studyCalendarEntries.note,
  courseId: studyCalendarEntries.courseId,
  courseCode: courses.code,
};

/** All of the student's entries between two dates (inclusive), earliest first (all-day entries before timed ones). */
export async function listEntries(db: Database, viewer: Viewer, range?: { from?: string; to?: string }): Promise<CalendarEntry[]> {
  if (!canAccessLibrary(viewer)) return [];
  return db
    .select(columns)
    .from(studyCalendarEntries)
    .leftJoin(courses, eq(studyCalendarEntries.courseId, courses.id))
    .where(
      and(
        eq(studyCalendarEntries.userId, viewer.id),
        range?.from ? gte(studyCalendarEntries.entryDate, range.from) : undefined,
        range?.to ? lte(studyCalendarEntries.entryDate, range.to) : undefined,
      ),
    )
    // Postgres sorts NULLs last by default, so the all-day entries (no time) are put first explicitly.
    .orderBy(asc(studyCalendarEntries.entryDate), sql`${studyCalendarEntries.entryTime} asc nulls first`, asc(studyCalendarEntries.createdAt));
}

/** One of the viewer's own entries, or null (also when it belongs to someone else). */
export async function getEntry(db: Database, viewer: Viewer, id: string): Promise<CalendarEntry | null> {
  if (!canAccessLibrary(viewer) || !UUID.test(id)) return null;
  const [row] = await db
    .select(columns)
    .from(studyCalendarEntries)
    .leftJoin(courses, eq(studyCalendarEntries.courseId, courses.id))
    .where(and(eq(studyCalendarEntries.id, id), eq(studyCalendarEntries.userId, viewer.id)));
  return row ?? null;
}

/** The viewer's next entries from `today` (inclusive). Empty when the student has added none: never a placeholder. */
export async function upcomingEntries(db: Database, viewer: Viewer, today: string, limit = UPCOMING_LIMIT): Promise<CalendarEntry[]> {
  if (!canAccessLibrary(viewer)) return [];
  const rows = await listEntries(db, viewer, { from: today });
  return rows.slice(0, limit);
}

export async function countEntries(db: Database, viewer: Viewer): Promise<number> {
  const [row] = await db.select({ n: count() }).from(studyCalendarEntries).where(eq(studyCalendarEntries.userId, viewer.id));
  return row?.n ?? 0;
}

async function courseExists(db: Database, courseId: string): Promise<boolean> {
  const [row] = await db.select({ id: courses.id }).from(courses).where(eq(courses.id, courseId));
  return Boolean(row);
}

export async function createEntry(db: Database, viewer: Viewer, input: CalendarEntryInput): Promise<CalendarResult<{ id: string }>> {
  if (!canAccessLibrary(viewer)) return fail("noAccess");
  const parsed = parseEntryInput(input);
  if (!parsed.ok) return parsed;
  const v = parsed.value;
  if (v.courseId && !(await courseExists(db, v.courseId))) return fail("courseNotFound");
  if ((await countEntries(db, viewer)) >= CALENDAR_ENTRIES_PER_USER_MAX) return fail("tooManyEntries");
  const [row] = await db
    .insert(studyCalendarEntries)
    .values({ userId: viewer.id, title: v.title, entryDate: v.date, entryTime: v.time, courseId: v.courseId, kind: v.kind, note: v.note })
    .returning({ id: studyCalendarEntries.id });
  return { ok: true, value: { id: row!.id } };
}

export async function updateEntry(db: Database, viewer: Viewer, id: string, input: CalendarEntryInput): Promise<CalendarResult<null>> {
  if (!canAccessLibrary(viewer)) return fail("noAccess");
  const parsed = parseEntryInput(input);
  if (!parsed.ok) return parsed;
  const v = parsed.value;
  if (v.courseId && !(await courseExists(db, v.courseId))) return fail("courseNotFound");
  if (!UUID.test(id)) return fail("notFound");
  const updated = await db
    .update(studyCalendarEntries)
    .set({ title: v.title, entryDate: v.date, entryTime: v.time, courseId: v.courseId, kind: v.kind, note: v.note })
    .where(and(eq(studyCalendarEntries.id, id), eq(studyCalendarEntries.userId, viewer.id)))
    .returning({ id: studyCalendarEntries.id });
  return updated.length ? { ok: true, value: null } : fail("notFound");
}

export async function deleteEntry(db: Database, viewer: Viewer, id: string): Promise<CalendarResult<null>> {
  if (!canAccessLibrary(viewer)) return fail("noAccess");
  if (!UUID.test(id)) return fail("notFound");
  const deleted = await db
    .delete(studyCalendarEntries)
    .where(and(eq(studyCalendarEntries.id, id), eq(studyCalendarEntries.userId, viewer.id)))
    .returning({ id: studyCalendarEntries.id });
  return deleted.length ? { ok: true, value: null } : fail("notFound");
}
