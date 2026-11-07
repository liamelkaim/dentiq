// Lecture recordings: business rules. Takes the database and storage explicitly. EVERY query filters on the viewer's own
// id: a recording (and its notes) is never visible to anyone else, administrators included. Uploading needs the
// administrator's switch ON and the consent checklist confirmed; reading and deleting your own recordings always work.
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import { courses, recordingNotes, recordings } from "@/db/schema";
import { writeAudit } from "@/server/audit";
import { canAccessLibrary, type Viewer } from "@/server/resources/service";
import type { FileStorage } from "@/server/storage";
import { NOTE_MAX, NOTES_PER_RECORDING_MAX, RECORDINGS_PER_USER_MAX, TITLE_MAX } from "./constants";
import { getRecordingSettings } from "./settings";
import { detectRecordingType } from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type RecResult<T> = { ok: true; value: T } | { ok: false; error: string };
const fail = (error: string) => ({ ok: false as const, error });

export type RecordingInput = {
  title: string;
  courseId?: string | null;
  lecturerName?: string | null;
  /** The three checklist boxes. All must be true. */
  consent: { recordingAllowed: boolean; lecturerPermission: boolean; privateUse: boolean };
};

const clean = (s: string | null | undefined, max: number) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, max);

export async function usedBytes(db: Database, ownerId: string): Promise<number> {
  const [row] = await db.select({ n: sql<number>`coalesce(sum(${recordings.sizeBytes}), 0)::float8` }).from(recordings).where(eq(recordings.ownerId, ownerId));
  return row?.n ?? 0;
}

export async function createRecording(db: Database, storage: FileStorage, viewer: Viewer, input: RecordingInput, file: { name: string; bytes: Uint8Array }): Promise<RecResult<{ id: string }>> {
  const settings = await getRecordingSettings(db);
  if (!settings.enabled) return fail("disabled");
  if (!canAccessLibrary(viewer)) return fail("forbidden");
  const c = input.consent;
  if (c.recordingAllowed !== true || c.lecturerPermission !== true || c.privateUse !== true) return fail("consentRequired");
  const title = clean(input.title, TITLE_MAX);
  if (!title) return fail("titleRequired");
  if (file.bytes.byteLength === 0) return fail("fileMissing");
  if (file.bytes.byteLength > settings.maxFileBytes) return fail("fileTooLarge");
  const type = detectRecordingType(file.name, file.bytes);
  // Audio only for now: video files are refused (no transcription or video player yet).
  if (!type || type.kind !== "audio") return fail("fileType");
  const [count] = await db.select({ n: sql<number>`count(*)::int` }).from(recordings).where(eq(recordings.ownerId, viewer.id));
  if ((count?.n ?? 0) >= RECORDINGS_PER_USER_MAX) return fail("limitReached");
  if ((await usedBytes(db, viewer.id)) + file.bytes.byteLength > settings.quotaBytes) return fail("quotaExceeded");
  let courseId: string | null = null;
  if (input.courseId) {
    if (!UUID.test(input.courseId)) return fail("invalid");
    const [course] = await db.select({ id: courses.id }).from(courses).where(eq(courses.id, input.courseId));
    if (!course) return fail("invalid");
    courseId = course.id;
  }
  const storageKey = `recordings/${randomUUID()}`;
  await storage.put(storageKey, file.bytes);
  try {
    const [row] = await db
      .insert(recordings)
      .values({ ownerId: viewer.id, courseId, title, storageKey, mimeType: type.mime, fileName: file.name.replace(/[^\w.\- ()]/g, "_").slice(0, 120) || "recording", sizeBytes: file.bytes.byteLength, lecturerName: clean(input.lecturerName, 120) || null, consentConfirmedAt: new Date() })
      .returning({ id: recordings.id });
    // The audit entry records that a recording was added and its size, never its title or content.
    await writeAudit(db, { actorId: viewer.id, action: "recording.create", entityType: "recording", entityId: row!.id, metadata: { sizeBytes: file.bytes.byteLength } });
    return { ok: true, value: { id: row!.id } };
  } catch (error) {
    await storage.delete(storageKey).catch(() => undefined);
    throw error;
  }
}

const listColumns = { id: recordings.id, title: recordings.title, mimeType: recordings.mimeType, sizeBytes: recordings.sizeBytes, createdAt: recordings.createdAt, lecturerName: recordings.lecturerName, courseId: recordings.courseId, courseCode: courses.code };

export async function listRecordings(db: Database, viewer: Viewer) {
  return db.select(listColumns).from(recordings).leftJoin(courses, eq(recordings.courseId, courses.id)).where(eq(recordings.ownerId, viewer.id)).orderBy(desc(recordings.createdAt));
}

export async function getRecording(db: Database, viewer: Viewer, id: string) {
  if (!UUID.test(id)) return null;
  const [row] = await db.select({ ...listColumns, fileName: recordings.fileName, consentConfirmedAt: recordings.consentConfirmedAt }).from(recordings).leftJoin(courses, eq(recordings.courseId, courses.id)).where(and(eq(recordings.id, id), eq(recordings.ownerId, viewer.id)));
  if (!row) return null;
  const notes = await db.select().from(recordingNotes).where(and(eq(recordingNotes.recordingId, id), eq(recordingNotes.ownerId, viewer.id))).orderBy(asc(recordingNotes.atSeconds), asc(recordingNotes.createdAt));
  return { ...row, notes };
}

/** What the file route needs. Null for another student's recording, exactly like "not found". */
export async function getRecordingFile(db: Database, viewer: Viewer, id: string) {
  if (!UUID.test(id) || !canAccessLibrary(viewer)) return null;
  const [row] = await db.select({ storageKey: recordings.storageKey, mimeType: recordings.mimeType, sizeBytes: recordings.sizeBytes, fileName: recordings.fileName }).from(recordings).where(and(eq(recordings.id, id), eq(recordings.ownerId, viewer.id)));
  return row ?? null;
}

export async function deleteRecording(db: Database, storage: FileStorage, viewer: Viewer, id: string): Promise<boolean> {
  if (!UUID.test(id)) return false;
  const rows = await db.delete(recordings).where(and(eq(recordings.id, id), eq(recordings.ownerId, viewer.id))).returning({ key: recordings.storageKey });
  if (rows.length === 0) return false;
  await writeAudit(db, { actorId: viewer.id, action: "recording.delete", entityType: "recording", entityId: id });
  await storage.delete(rows[0]!.key).catch(() => undefined);
  return true;
}

export async function addRecordingNote(db: Database, viewer: Viewer, recordingId: string, body: string, atSeconds: number | null): Promise<RecResult<{ id: string }>> {
  const text = body.replace(/\r\n/g, "\n").trim();
  if (!text) return fail("noteRequired");
  if (text.length > NOTE_MAX) return fail("noteTooLong");
  if (atSeconds !== null && (!Number.isInteger(atSeconds) || atSeconds < 0 || atSeconds > 60 * 60 * 24)) return fail("invalid");
  if (!UUID.test(recordingId)) return fail("notFound");
  const [rec] = await db.select({ id: recordings.id }).from(recordings).where(and(eq(recordings.id, recordingId), eq(recordings.ownerId, viewer.id)));
  if (!rec) return fail("notFound");
  const [n] = await db.select({ n: sql<number>`count(*)::int` }).from(recordingNotes).where(eq(recordingNotes.recordingId, recordingId));
  if ((n?.n ?? 0) >= NOTES_PER_RECORDING_MAX) return fail("limitReached");
  const [row] = await db.insert(recordingNotes).values({ recordingId, ownerId: viewer.id, body: text, atSeconds }).returning({ id: recordingNotes.id });
  return { ok: true, value: { id: row!.id } };
}

export async function deleteRecordingNote(db: Database, viewer: Viewer, noteId: string): Promise<boolean> {
  if (!UUID.test(noteId)) return false;
  const rows = await db.delete(recordingNotes).where(and(eq(recordingNotes.id, noteId), eq(recordingNotes.ownerId, viewer.id))).returning({ id: recordingNotes.id });
  return rows.length > 0;
}
