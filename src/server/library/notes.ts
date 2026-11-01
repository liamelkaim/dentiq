// Private typed notes with version history. A note belongs to ONE student and nobody else can read it:
// not other students, not moderators, not administrators (the same rule as private documents).
// Every save appends a version; restoring an old version appends a new one, so nothing is ever lost.
import { and, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import { courseNotes, courseNoteVersions, courseOfferings, courses, noteQuestionLinks, noteTopics, user } from "@/db/schema";
import { writeAudit } from "@/server/audit";
import { canAccessLibrary, latestOfferingByCourse, periodOf, type Viewer } from "@/server/resources/service";
import {
  NOTE_BODY_MAX,
  NOTE_CHANGE_NOTE_MAX,
  NOTE_HISTORY_LIMIT,
  NOTE_TITLE_MAX,
  NOTES_PER_USER_MAX,
  QUESTION_LINKS_PER_ITEM_MAX,
  TOPICS_PER_ITEM_MAX,
} from "./constants";
import { describeChange, diffLines, type VersionChange } from "./diff";
import { checkQuestionIds, checkTopicIds } from "./links";
import { containsPattern } from "./like";
import { libFail, type LibraryResult } from "./topics";

/** Notes are private: the owner, and only if they may use the library. */
export const canSeeNote = (viewer: Viewer, note: { ownerId: string }) => note.ownerId === viewer.id && canAccessLibrary(viewer);

const blankToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
const body = z
  .string()
  .max(NOTE_BODY_MAX, { message: "tooLong" })
  .transform((v) => v.replace(/\r\n/g, "\n"));
const uuids = (max: number) => z.array(z.uuid()).max(max, { message: "tooMany" }).default([]);

export const noteInputSchema = z.object({
  courseId: z.uuid(),
  offeringId: z.preprocess(blankToNull, z.uuid().nullish()).transform((v) => v ?? null),
  title: z.string().trim().min(1, { message: "required" }).max(NOTE_TITLE_MAX),
  body: body.default(""),
  topicIds: uuids(TOPICS_PER_ITEM_MAX),
  questionIds: uuids(QUESTION_LINKS_PER_ITEM_MAX),
});
export type NoteInput = z.output<typeof noteInputSchema>;

export const noteEditSchema = z.object({
  noteId: z.uuid(),
  /** The version the editor started from; a different current version means someone else saved in between. */
  baseVersion: z.coerce.number().int().min(1),
  title: z.string().trim().min(1, { message: "required" }).max(NOTE_TITLE_MAX),
  body,
  changeNote: z
    .preprocess(blankToNull, z.string().trim().max(NOTE_CHANGE_NOTE_MAX).nullish())
    .transform((v) => (v ? v.replace(/\s+/g, " ") : null)),
});
export type NoteEdit = z.output<typeof noteEditSchema>;

// ---------- Writing ----------

export async function createNote(db: Database, viewer: Viewer, input: NoteInput): Promise<LibraryResult<{ id: string }>> {
  if (!canAccessLibrary(viewer)) return libFail("forbidden");
  const [course] = await db.select({ id: courses.id, archivedAt: courses.archivedAt }).from(courses).where(eq(courses.id, input.courseId));
  if (!course || course.archivedAt) return libFail("notFound");
  if (input.offeringId) {
    const [o] = await db
      .select({ id: courseOfferings.id })
      .from(courseOfferings)
      .where(and(eq(courseOfferings.id, input.offeringId), eq(courseOfferings.courseId, input.courseId)));
    if (!o) return libFail("invalidOffering");
  }
  return db.transaction(async (tx) => {
    const [{ n } = { n: 0 }] = await tx.select({ n: count() }).from(courseNotes).where(eq(courseNotes.ownerId, viewer.id));
    if (Number(n) >= NOTES_PER_USER_MAX) return libFail("tooManyNotes");
    const topicIds = await checkTopicIds(tx, input.courseId, input.topicIds);
    if (!topicIds) return libFail("invalidTopics");
    const questionIds = await checkQuestionIds(tx, viewer, input.courseId, input.questionIds);
    if (!questionIds) return libFail("invalidQuestion");

    const [note] = await tx
      .insert(courseNotes)
      .values({ courseId: input.courseId, offeringId: input.offeringId, ownerId: viewer.id, title: input.title, body: input.body })
      .returning({ id: courseNotes.id });
    await tx.insert(courseNoteVersions).values({ noteId: note!.id, versionNumber: 1, title: input.title, body: input.body, createdBy: viewer.id });
    if (topicIds.length) await tx.insert(noteTopics).values(topicIds.map((topicId) => ({ noteId: note!.id, topicId, createdBy: viewer.id })));
    if (questionIds.length) await tx.insert(noteQuestionLinks).values(questionIds.map((questionId) => ({ noteId: note!.id, questionId, createdBy: viewer.id })));
    // The audit entry names the note, never its text.
    await writeAudit(tx, { actorId: viewer.id, action: "note.create", entityType: "course_note", entityId: note!.id, metadata: { courseId: input.courseId } });
    return { ok: true as const, value: { id: note!.id } };
  });
}

/** True for Postgres "unique_violation" (also when the driver wraps it in `cause`). */
function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string } } | null;
  return e?.code === "23505" || e?.cause?.code === "23505";
}

/**
 * Two saves of the same note can race. The note row is locked (FOR UPDATE) for the whole transaction so the second
 * save re-reads the new current version and gets "versionConflict"; if the database still reports a duplicate
 * version number (a lock that was not taken), that is the same conflict, never a 500.
 */
async function saveVersion<T>(run: () => Promise<LibraryResult<T>>): Promise<LibraryResult<T>> {
  try {
    return await run();
  } catch (error) {
    if (isUniqueViolation(error)) return libFail("versionConflict");
    throw error;
  }
}

export async function updateNote(db: Database, viewer: Viewer, input: NoteEdit): Promise<LibraryResult<{ versionNumber: number }>> {
  return saveVersion(() => updateNoteLocked(db, viewer, input));
}

async function updateNoteLocked(db: Database, viewer: Viewer, input: NoteEdit): Promise<LibraryResult<{ versionNumber: number }>> {
  return db.transaction(async (tx) => {
    const [note] = await tx.select().from(courseNotes).where(eq(courseNotes.id, input.noteId)).for("update");
    if (!note || !canSeeNote(viewer, note)) return libFail("notFound");
    if (note.currentVersion !== input.baseVersion) return libFail("versionConflict");
    const text = input.body;
    if (note.title === input.title && note.body === text) return libFail("noChange");
    const versionNumber = note.currentVersion + 1;
    await tx.insert(courseNoteVersions).values({
      noteId: note.id,
      versionNumber,
      title: input.title,
      body: text,
      changeNote: input.changeNote,
      createdBy: viewer.id,
    });
    await tx.update(courseNotes).set({ title: input.title, body: text, currentVersion: versionNumber }).where(eq(courseNotes.id, note.id));
    await writeAudit(tx, { actorId: viewer.id, action: "note.update", entityType: "course_note", entityId: note.id, metadata: { versionNumber } });
    return { ok: true as const, value: { versionNumber } };
  });
}

/** Restore an older version AS A NEW VERSION (history only grows). The owner only. */
export async function restoreNoteVersion(db: Database, viewer: Viewer, noteId: string, versionNumber: number): Promise<LibraryResult<{ versionNumber: number }>> {
  if (!z.uuid().safeParse(noteId).success || !Number.isInteger(versionNumber) || versionNumber < 1) return libFail("notFound");
  return saveVersion(() => restoreNoteVersionLocked(db, viewer, noteId, versionNumber));
}

async function restoreNoteVersionLocked(db: Database, viewer: Viewer, noteId: string, versionNumber: number): Promise<LibraryResult<{ versionNumber: number }>> {
  return db.transaction(async (tx) => {
    const [note] = await tx.select().from(courseNotes).where(eq(courseNotes.id, noteId)).for("update");
    if (!note || !canSeeNote(viewer, note)) return libFail("notFound");
    const [old] = await tx
      .select()
      .from(courseNoteVersions)
      .where(and(eq(courseNoteVersions.noteId, noteId), eq(courseNoteVersions.versionNumber, versionNumber)));
    if (!old) return libFail("notFound");
    if (old.title === note.title && old.body === note.body) return libFail("noChange");
    const next = note.currentVersion + 1;
    await tx.insert(courseNoteVersions).values({
      noteId,
      versionNumber: next,
      title: old.title,
      body: old.body,
      restoredFromVersion: versionNumber,
      createdBy: viewer.id,
    });
    await tx.update(courseNotes).set({ title: old.title, body: old.body, currentVersion: next }).where(eq(courseNotes.id, noteId));
    await writeAudit(tx, { actorId: viewer.id, action: "note.restore", entityType: "course_note", entityId: noteId, metadata: { from: versionNumber, to: next } });
    return { ok: true as const, value: { versionNumber: next } };
  });
}

// ---------- Reading (the viewer's own notes only) ----------

export type NoteFilters = { courseId?: string; q?: string; limit?: number };

export async function listNotes(db: Database, viewer: Viewer, filters: NoteFilters = {}) {
  if (!canAccessLibrary(viewer)) return [];
  const q = filters.q?.trim();
  const rows = await db
    .select({
      id: courseNotes.id,
      title: courseNotes.title,
      body: courseNotes.body,
      courseId: courseNotes.courseId,
      courseCode: courses.code,
      offeringId: courseNotes.offeringId,
      academicYear: courseOfferings.academicYear,
      term: courseOfferings.term,
      updatedAt: courseNotes.updatedAt,
    })
    .from(courseNotes)
    .innerJoin(courses, eq(courseNotes.courseId, courses.id))
    .leftJoin(courseOfferings, eq(courseNotes.offeringId, courseOfferings.id))
    .where(
      and(
        eq(courseNotes.ownerId, viewer.id),
        filters.courseId ? eq(courseNotes.courseId, filters.courseId) : undefined,
        q ? or(ilike(courseNotes.title, containsPattern(q)), ilike(courseNotes.body, containsPattern(q))) : undefined,
      ),
    )
    .orderBy(desc(courseNotes.updatedAt))
    .limit(Math.min(Math.max(filters.limit ?? 500, 1), 500));
  const latest = await latestOfferingByCourse(db, [...new Set(rows.map((r) => r.courseId))]);
  return rows.map((r) => ({ ...r, period: periodOf(r.offeringId, latest.get(r.courseId)) }));
}

/** Number of the viewer's notes matching a search text (for "showing 10 of N"). */
export async function countNotes(db: Database, viewer: Viewer, filters: { courseId?: string; q: string }): Promise<number> {
  if (!canAccessLibrary(viewer)) return 0;
  const [row] = await db
    .select({ n: count() })
    .from(courseNotes)
    .where(
      and(
        eq(courseNotes.ownerId, viewer.id),
        filters.courseId ? eq(courseNotes.courseId, filters.courseId) : undefined,
        or(ilike(courseNotes.title, containsPattern(filters.q)), ilike(courseNotes.body, containsPattern(filters.q))),
      ),
    );
  return Number(row?.n ?? 0);
}

export async function getNote(db: Database, viewer: Viewer, id: string) {
  if (!z.uuid().safeParse(id).success) return null;
  const [row] = await db
    .select({ note: courseNotes, course: courses, offering: courseOfferings })
    .from(courseNotes)
    .innerJoin(courses, eq(courseNotes.courseId, courses.id))
    .leftJoin(courseOfferings, eq(courseNotes.offeringId, courseOfferings.id))
    .where(eq(courseNotes.id, id));
  if (!row || !canSeeNote(viewer, row.note)) return null;
  const latest = await latestOfferingByCourse(db, [row.note.courseId]);
  return { ...row.note, course: row.course, offering: row.offering, period: periodOf(row.note.offeringId, latest.get(row.note.courseId)) };
}

export type VersionSummary = {
  versionNumber: number;
  title: string;
  changeNote: string | null;
  restoredFromVersion: number | null;
  createdAt: Date;
  authorName: string | null;
  change: VersionChange;
  isCurrent: boolean;
};

/** The note's versions, newest first, each with a summary of what changed from the one before. */
export async function listNoteVersions(db: Database, viewer: Viewer, noteId: string): Promise<VersionSummary[] | null> {
  const note = await getNote(db, viewer, noteId);
  if (!note) return null;
  const rows = await db
    .select({
      versionNumber: courseNoteVersions.versionNumber,
      title: courseNoteVersions.title,
      body: courseNoteVersions.body,
      changeNote: courseNoteVersions.changeNote,
      restoredFromVersion: courseNoteVersions.restoredFromVersion,
      createdAt: courseNoteVersions.createdAt,
      authorName: user.name,
    })
    .from(courseNoteVersions)
    .leftJoin(user, eq(courseNoteVersions.createdBy, user.id))
    .where(eq(courseNoteVersions.noteId, noteId))
    .orderBy(sql`${courseNoteVersions.versionNumber} desc`)
    .limit(NOTE_HISTORY_LIMIT);
  return rows.map((r, i) => {
    const previous = rows[i + 1] ?? null;
    return {
      versionNumber: r.versionNumber,
      title: r.title,
      changeNote: r.changeNote,
      restoredFromVersion: r.restoredFromVersion,
      createdAt: r.createdAt,
      authorName: r.authorName,
      change: describeChange(previous, r),
      isCurrent: r.versionNumber === note.currentVersion,
    };
  });
}

/** One version with its line-by-line comparison against the version before it. */
export async function getNoteVersionDiff(db: Database, viewer: Viewer, noteId: string, versionNumber: number) {
  const note = await getNote(db, viewer, noteId);
  if (!note) return null;
  const rows = await db
    .select()
    .from(courseNoteVersions)
    .where(and(eq(courseNoteVersions.noteId, noteId), or(eq(courseNoteVersions.versionNumber, versionNumber), eq(courseNoteVersions.versionNumber, versionNumber - 1))));
  const version = rows.find((r) => r.versionNumber === versionNumber);
  if (!version) return null;
  const previous = rows.find((r) => r.versionNumber === versionNumber - 1) ?? null;
  return {
    version,
    previous,
    titleChanged: previous ? previous.title !== version.title : false,
    body: diffLines(previous?.body ?? "", version.body),
    isCurrent: version.versionNumber === note.currentVersion,
  };
}
