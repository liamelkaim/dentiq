// Recordings: switch default OFF, consent checklist, file type/size/quota limits, privacy, deletion, export. Synthetic bytes only.
import { beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase, type Database } from "@/db/client";
import { courses, recordingNotes, recordings, user } from "@/db/schema";
import { buildAccountExport } from "@/server/account/export";
import { deleteAccount } from "@/server/account/delete";
import { addRecordingNote, createRecording, deleteRecording, deleteRecordingNote, getRecording, getRecordingFile, listRecordings, usedBytes, type RecordingInput } from "@/server/recordings/service";
import { getRecordingSettings, normalizeRecordingSettings, updateRecordingSettings } from "@/server/recordings/settings";
import { getTranscriptionProvider } from "@/server/recordings/transcription";
import { detectRecordingType } from "@/server/recordings/types";
import { createMemoryStorage, type FileStorage } from "@/server/storage";

const MB = 1024 * 1024;
const mp4 = (size = 64) => {
  const b = new Uint8Array(size);
  b.set([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]); // ....ftypisom
  return b;
};
const consent = { recordingAllowed: true, lecturerPermission: true, privateUse: true };
const input = (extra: Partial<RecordingInput> = {}): RecordingInput => ({ title: "TEST lecture", consent, ...extra });
const A = { id: "a", role: "student" as const, emailVerified: true, approvalStatus: "approved" as const };
const B = { id: "b", role: "student" as const, emailVerified: true, approvalStatus: "approved" as const };
const ADMIN = { id: "adm", role: "admin" as const, emailVerified: true, approvalStatus: "approved" as const };

let db: Database;
let storage: FileStorage & { size(): number };
beforeEach(async () => {
  db = await createTestDatabase();
  storage = createMemoryStorage();
  await db.insert(user).values([
    { id: "a", name: "A", email: "a@example.com", emailVerified: true, approvalStatus: "approved" },
    { id: "b", name: "B", email: "b@example.com", emailVerified: true, approvalStatus: "approved" },
    { id: "adm", name: "Adm", email: "adm@example.com", role: "admin", emailVerified: true, approvalStatus: "approved" },
  ]);
});
const enable = (patch = {}) => updateRecordingSettings(db, ADMIN, { enabled: true, ...patch });

describe("settings", () => {
  it("are OFF by default and only a stored true turns them on", async () => {
    expect((await getRecordingSettings(db)).enabled).toBe(false);
    expect(normalizeRecordingSettings({ enabled: "true" }).enabled).toBe(false);
    expect(normalizeRecordingSettings({ enabled: 1 }).enabled).toBe(false);
    expect(normalizeRecordingSettings({ enabled: true, maxFileBytes: -5 }).maxFileBytes).toBe(200 * MB);
  });
  it("only an administrator changes them, within bounds", async () => {
    expect(await updateRecordingSettings(db, A, { enabled: true })).toEqual({ ok: false, error: "forbidden" });
    expect(await updateRecordingSettings(db, ADMIN, { maxFileBytes: 10 })).toEqual({ ok: false, error: "outOfRange" });
    expect(await updateRecordingSettings(db, ADMIN, { maxFileBytes: 50 * MB, quotaBytes: 20 * MB })).toEqual({ ok: false, error: "outOfRange" });
    expect((await enable()).ok).toBe(true);
  });
  it("no transcription provider exists", () => expect(getTranscriptionProvider()).toBeNull());
});

describe("file types", () => {
  it("decides from the first bytes", () => {
    expect(detectRecordingType("x.mp4", mp4())?.mime).toBe("video/mp4");
    expect(detectRecordingType("x.mp3", new Uint8Array([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, 0, 0, 0]))?.mime).toBe("audio/mpeg");
    expect(detectRecordingType("x.webm", new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, 0, 0, 0, 0]))?.mime).toBe("video/webm");
    expect(detectRecordingType("x.exe", new Uint8Array([0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0, 4, 0, 0, 0]))).toBeNull();
    expect(detectRecordingType("renamed.mp4", new TextEncoder().encode("just some text here"))).toBeNull();
    expect(detectRecordingType("tiny.mp4", new Uint8Array(4))).toBeNull();
  });
});

describe("upload rules", () => {
  it("is refused while the switch is OFF", async () => {
    expect(await createRecording(db, storage, A, input(), { name: "a.mp4", bytes: mp4() })).toEqual({ ok: false, error: "disabled" });
    expect(storage.size()).toBe(0);
  });
  it("needs every consent box", async () => {
    await enable();
    for (const k of ["recordingAllowed", "lecturerPermission", "privateUse"] as const) {
      const r = await createRecording(db, storage, A, input({ consent: { ...consent, [k]: false } }), { name: "a.mp4", bytes: mp4() });
      expect(r).toEqual({ ok: false, error: "consentRequired" });
    }
    expect(storage.size()).toBe(0);
  });
  it("stores a valid recording privately and records the consent time", async () => {
    await enable();
    const r = await createRecording(db, storage, A, input({ lecturerName: "TEST Lecturer" }), { name: "a.mp4", bytes: mp4() });
    expect(r.ok).toBe(true);
    expect(storage.size()).toBe(1);
    const [row] = await db.select().from(recordings);
    expect(row).toMatchObject({ ownerId: "a", mimeType: "video/mp4", lecturerName: "TEST Lecturer" });
    expect(row!.consentConfirmedAt).toBeInstanceOf(Date);
  });
  it.each([
    ["a blank title", { title: " " }, { name: "a.mp4", bytes: mp4() }, "titleRequired"],
    ["an empty file", {}, { name: "a.mp4", bytes: new Uint8Array(0) }, "fileMissing"],
    ["a wrong type", {}, { name: "a.mp4", bytes: new TextEncoder().encode("not media at all, plain text") }, "fileType"],
  ])("rejects %s", async (_n, extra, file, code) => {
    await enable();
    expect(await createRecording(db, storage, A, input(extra), file)).toEqual({ ok: false, error: code });
    expect(storage.size()).toBe(0);
  });
  it("enforces the size limit and the per-user quota", async () => {
    await enable({ maxFileBytes: 1 * MB, quotaBytes: 2 * MB });
    expect(await createRecording(db, storage, A, input(), { name: "a.mp4", bytes: mp4(1 * MB + 1) })).toEqual({ ok: false, error: "fileTooLarge" });
    expect((await createRecording(db, storage, A, input(), { name: "a.mp4", bytes: mp4(1 * MB) })).ok).toBe(true);
    expect((await createRecording(db, storage, A, input(), { name: "b.mp4", bytes: mp4(1 * MB) })).ok).toBe(true);
    expect(await createRecording(db, storage, A, input(), { name: "c.mp4", bytes: mp4(1000) })).toEqual({ ok: false, error: "quotaExceeded" });
    expect(await usedBytes(db, "a")).toBe(2 * MB);
    // Another student's quota is separate.
    expect((await createRecording(db, storage, B, input(), { name: "d.mp4", bytes: mp4(1 * MB) })).ok).toBe(true);
  });
  it("a pending (unapproved) student cannot upload", async () => {
    await enable();
    expect(await createRecording(db, storage, { ...A, approvalStatus: "pending" }, input(), { name: "a.mp4", bytes: mp4() })).toEqual({ ok: false, error: "forbidden" });
  });
  it("checks the course exists", async () => {
    await enable();
    expect(await createRecording(db, storage, A, input({ courseId: "00000000-0000-4000-8000-000000000000" }), { name: "a.mp4", bytes: mp4() })).toEqual({ ok: false, error: "invalid" });
    const [c] = await db.insert(courses).values({ code: "TEST 101", titleFr: "TEST" }).returning();
    expect((await createRecording(db, storage, A, input({ courseId: c!.id }), { name: "a.mp4", bytes: mp4() })).ok).toBe(true);
  });
});

describe("privacy", () => {
  let id: string;
  beforeEach(async () => {
    await enable();
    const r = await createRecording(db, storage, A, input(), { name: "a.mp4", bytes: mp4() });
    if (!r.ok) throw new Error("setup");
    id = r.value.id;
    await addRecordingNote(db, A, id, "My private note", 12);
  });
  it("nobody else can list, open, stream, annotate or delete it, administrators included", async () => {
    for (const other of [B, ADMIN]) {
      expect(await listRecordings(db, other)).toEqual([]);
      expect(await getRecording(db, other, id)).toBeNull();
      expect(await getRecordingFile(db, other, id)).toBeNull();
      expect(await addRecordingNote(db, other, id, "x", null)).toEqual({ ok: false, error: "notFound" });
      expect(await deleteRecording(db, storage, other, id)).toBe(false);
    }
    expect(storage.size()).toBe(1);
    expect((await getRecording(db, A, id))?.notes).toHaveLength(1);
  });
  it("the owner can still read and delete after the switch is turned OFF", async () => {
    await updateRecordingSettings(db, ADMIN, { enabled: false });
    expect(await getRecording(db, A, id)).not.toBeNull();
    expect(await deleteRecording(db, storage, A, id)).toBe(true);
    expect(storage.size()).toBe(0);
  });
  it("notes: validated, owner-only deletion, removed with the recording", async () => {
    expect(await addRecordingNote(db, A, id, "  ", null)).toEqual({ ok: false, error: "noteRequired" });
    expect(await addRecordingNote(db, A, id, "x".repeat(2001), null)).toEqual({ ok: false, error: "noteTooLong" });
    expect(await addRecordingNote(db, A, id, "ok", -1)).toEqual({ ok: false, error: "invalid" });
    const [note] = await db.select().from(recordingNotes);
    expect(await deleteRecordingNote(db, B, note!.id)).toBe(false);
    expect(await deleteRecording(db, storage, A, id)).toBe(true);
    expect(await db.select().from(recordingNotes)).toHaveLength(0);
  });
  it("the audit trail never holds the title or text", async () => {
    const { auditLog } = await import("@/db/schema");
    const rows = JSON.stringify(await db.select().from(auditLog));
    expect(rows).not.toContain("TEST lecture");
    expect(rows).not.toContain("My private note");
  });
});

describe("account export and deletion", () => {
  it("export lists recordings and notes (not the file); deletion removes the stored file", async () => {
    await enable();
    const r = await createRecording(db, storage, A, input(), { name: "a.mp4", bytes: mp4() });
    if (!r.ok) throw new Error("setup");
    await addRecordingNote(db, A, r.value.id, "note one", 3);
    const exported = await buildAccountExport(db, "a");
    expect(exported.ok).toBe(true);
    const text = exported.ok ? JSON.stringify(exported.value) : "";
    expect(text).toContain("TEST lecture");
    expect(text).toContain("note one");
    expect(text).not.toContain("recordings/");
    const del = await deleteAccount(db, storage, "a", "a@example.com");
    expect(del.ok).toBe(true);
    expect(storage.size()).toBe(0);
    expect(await db.select().from(recordings)).toHaveLength(0);
  });
});

describe("Range header", () => {
  it("parses single ranges and refuses unsatisfiable ones", async () => {
    const { parseRange } = await import("@/server/recordings/range");
    expect(parseRange(null, 100)).toBeNull();
    expect(parseRange("bytes=0-9", 100)).toEqual({ start: 0, end: 9 });
    expect(parseRange("bytes=90-", 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange("bytes=-10", 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange("bytes=0-500", 100)).toEqual({ start: 0, end: 99 });
    expect(parseRange("bytes=100-", 100)).toBe("invalid");
    expect(parseRange("bytes=-0", 100)).toBe("invalid");
    expect(parseRange("bytes=5-2", 100)).toBe("invalid");
    expect(parseRange("items=1-2", 100)).toBeNull();
  });
});
