// File retention job. Fake data only (TEST courses, example.com accounts). Storage is the in-memory or a temporary
// local folder; nothing here talks to Blob or any hosted service.
import { mkdtemp, rm, utimes } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase, type Database } from "@/db/client";
import { auditLog, courseNotes, courseNoteVersions, courses, examQuestionImages, examQuestions, resources, resourceVersions, user } from "@/db/schema";
import { parseRetentionArgs } from "@/server/retention/cli";
import { DAY_MS, NOTE_VERSIONS_MAX, ORPHAN_MIN_AGE_DAYS, RETENTION_BATCH_SIZE, RETENTION_GRACE_DAYS } from "@/server/retention/constants";
import { previewRetention, previewRetentionAsAdmin, runRetention, runRetentionAsAdmin } from "@/server/retention/service";
import { createLocalStorage, createMemoryStorage, type FileStorage } from "@/server/storage";

const NOW = new Date("2026-06-15T12:00:00.000Z");
const daysAgo = (days: number, extraMs = 0) => new Date(NOW.getTime() - days * DAY_MS - extraMs);

let db: Database;
let storage: FileStorage & { size(): number };
let courseId: string;
let questionId: string;
let seq = 0;
let position = 0;

async function addImage(removedAt: Date | null, key = `questions/img-${++seq}`) {
  await storage.put(key, new Uint8Array([1, 2, 3, 4]));
  const [row] = await db
    .insert(examQuestionImages)
    .values({ questionId, position: ++position, storageKey: key, fileName: "x.png", mimeType: "image/png", sizeBytes: 4, sha256: `sha-${key}`, removedAt })
    .returning({ id: examQuestionImages.id });
  return { id: row!.id, key };
}

async function addDocument(status: "pending" | "published" | "hidden" | "removed", changedAt: Date, versions = 1) {
  const [r] = await db
    .insert(resources)
    .values({ courseId, kind: "notes", title: `TEST doc ${++seq}`, status, createdBy: "student-1", updatedAt: changedAt })
    .returning({ id: resources.id });
  const out: { id: string; key: string }[] = [];
  for (let n = 1; n <= versions; n++) {
    const key = `resources/doc-${++seq}`;
    await storage.put(key, new Uint8Array([9, 9]));
    const [v] = await db
      .insert(resourceVersions)
      .values({ resourceId: r!.id, versionNumber: n, storageKey: key, fileName: "d.pdf", mimeType: "application/pdf", sizeBytes: 2, sha256: `sha-${key}`, rightsConfirmed: true })
      .returning({ id: resourceVersions.id });
    out.push({ id: v!.id, key });
  }
  // The insert above set updated_at; pin it again so the "removal time" is exactly what the test wants.
  await db.update(resources).set({ updatedAt: changedAt }).where(eq(resources.id, r!.id));
  return { resourceId: r!.id, versions: out };
}

const imageRow = async (id: string) => (await db.select().from(examQuestionImages).where(eq(examQuestionImages.id, id)))[0]!;
const versionRow = async (id: string) => (await db.select().from(resourceVersions).where(eq(resourceVersions.id, id)))[0]!;
const exists = async (key: string) => (await storage.get(key)) !== null;

async function addNote(ownerId: string, versions: number) {
  const [n] = await db
    .insert(courseNotes)
    .values({ courseId, ownerId, title: "TEST note", body: "current", currentVersion: versions })
    .returning({ id: courseNotes.id });
  await db.insert(courseNoteVersions).values(
    Array.from({ length: versions }, (_, i) => ({ noteId: n!.id, versionNumber: i + 1, title: "TEST note", body: `body ${i + 1}`, createdAt: new Date(NOW.getTime() - (versions - i) * 60_000) })),
  );
  return n!.id;
}
const versionNumbers = async (noteId: string) =>
  (await db.select({ n: courseNoteVersions.versionNumber }).from(courseNoteVersions).where(eq(courseNoteVersions.noteId, noteId))).map((r) => r.n).sort((a, b) => a - b);

beforeEach(async () => {
  position = 0;
  db = await createTestDatabase();
  storage = createMemoryStorage();
  await db.insert(user).values([
    { id: "admin-1", name: "Admin", email: "admin@example.com", emailVerified: true, role: "admin", approvalStatus: "approved" },
    { id: "mod-1", name: "Mod", email: "mod@example.com", emailVerified: true, role: "moderator", approvalStatus: "approved" },
    { id: "student-1", name: "Student", email: "student@example.com", emailVerified: true, approvalStatus: "approved" },
    { id: "student-2", name: "Other", email: "other@example.com", emailVerified: true, approvalStatus: "approved" },
  ]);
  const [c] = await db.insert(courses).values({ code: "TEST 1000", titleFr: "Cours TEST" }).returning({ id: courses.id });
  courseId = c!.id;
  const [q] = await db
    .insert(examQuestions)
    .values({ courseId, examAcademicYear: "2025-2026", questionType: "sc", questionText: "TEST question", rightsConfirmed: true, fingerprint: "fp-retention", status: "published" })
    .returning({ id: examQuestions.id });
  questionId = q!.id;
});

describe("dry run", () => {
  it("reports what would be deleted and deletes nothing", async () => {
    const old = await addImage(daysAgo(RETENTION_GRACE_DAYS + 5));
    const doc = await addDocument("removed", daysAgo(RETENTION_GRACE_DAYS + 5));
    const note = await addNote("student-1", NOTE_VERSIONS_MAX + 3);

    const report = await runRetention(db, storage, "admin-1", { now: NOW });

    expect(report.apply).toBe(false);
    expect(report.questionImages).toMatchObject({ eligible: 1, bytes: 4, deleted: 0 });
    expect(report.documentVersions).toMatchObject({ eligible: 1, bytes: 2, deleted: 0 });
    expect(report.noteVersions).toMatchObject({ eligible: 3, deleted: 0 });
    expect(await exists(old.key)).toBe(true);
    expect(await exists(doc.versions[0]!.key)).toBe(true);
    expect((await imageRow(old.id)).fileDeletedAt).toBeNull();
    expect(await versionNumbers(note)).toHaveLength(NOTE_VERSIONS_MAX + 3);
  });

  it("ignores deleteOrphans when apply is off", async () => {
    await storage.put("resources/lonely", new Uint8Array([1]));
    const report = await runRetention(db, storage, null, { apply: false, deleteOrphans: true, now: new Date(NOW.getTime() + 30 * DAY_MS) });
    expect(report.deleteOrphans).toBe(false);
    expect(await exists("resources/lonely")).toBe(true);
  });

  it("previewRetention writes no audit entry; runRetention writes exactly one with counts only", async () => {
    const img = await addImage(daysAgo(RETENTION_GRACE_DAYS + 1));
    await previewRetention(db, storage, NOW);
    expect(await db.$count(auditLog)).toBe(0);

    await runRetention(db, storage, "admin-1", { apply: true, now: NOW });
    const rows = await db.select().from(auditLog);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: "retention.apply", entityType: "retention", actorId: "admin-1", entityId: null });
    const text = JSON.stringify(rows[0]!.metadata);
    expect(text).not.toContain(img.key);
    expect(text).not.toContain("student");
    for (const value of Object.values(rows[0]!.metadata as Record<string, unknown>)) expect(["number", "boolean", "string"]).toContain(typeof value);
  });
});

describe("apply", () => {
  it("deletes only removed files past the grace period, and keeps their rows", async () => {
    const oldImage = await addImage(daysAgo(RETENTION_GRACE_DAYS + 1));
    const youngImage = await addImage(daysAgo(RETENTION_GRACE_DAYS - 1));
    const activeImage = await addImage(null);
    const oldDoc = await addDocument("removed", daysAgo(RETENTION_GRACE_DAYS + 1), 2);
    const youngDoc = await addDocument("removed", daysAgo(RETENTION_GRACE_DAYS - 1));

    const report = await runRetention(db, storage, "admin-1", { apply: true, now: NOW });

    expect(report.questionImages).toMatchObject({ eligible: 1, deleted: 1, failed: 0, inGrace: 1 });
    expect(report.documentVersions).toMatchObject({ eligible: 2, deleted: 2, failed: 0, inGrace: 1 });
    expect(await exists(oldImage.key)).toBe(false);
    expect(await exists(youngImage.key)).toBe(true);
    expect(await exists(activeImage.key)).toBe(true);
    for (const v of oldDoc.versions) {
      expect(await exists(v.key)).toBe(false);
      expect((await versionRow(v.id)).fileDeletedAt).toEqual(NOW);
    }
    expect(await exists(youngDoc.versions[0]!.key)).toBe(true);
    // Rows stay, so history never points at a missing row.
    expect((await imageRow(oldImage.id)).fileDeletedAt).toEqual(NOW);
    expect((await imageRow(oldImage.id)).storageKey).toBe(oldImage.key);
    expect((await imageRow(youngImage.id)).fileDeletedAt).toBeNull();
    expect(await db.$count(examQuestions)).toBe(1);
  });

  it("grace boundary: exactly the grace period is eligible, one millisecond less is not", async () => {
    const exact = await addImage(daysAgo(RETENTION_GRACE_DAYS));
    const justShort = await addImage(daysAgo(RETENTION_GRACE_DAYS, -1));
    const exactDoc = await addDocument("removed", daysAgo(RETENTION_GRACE_DAYS));
    const shortDoc = await addDocument("removed", daysAgo(RETENTION_GRACE_DAYS, -1));

    await runRetention(db, storage, null, { apply: true, now: NOW });

    expect(await exists(exact.key)).toBe(false);
    expect(await exists(justShort.key)).toBe(true);
    expect(await exists(exactDoc.versions[0]!.key)).toBe(false);
    expect(await exists(shortDoc.versions[0]!.key)).toBe(true);
  });

  it("never touches published, pending or hidden documents, or images of published questions that are not removed", async () => {
    const veryOld = daysAgo(RETENTION_GRACE_DAYS * 10);
    const published = await addDocument("published", veryOld);
    const pending = await addDocument("pending", veryOld);
    const hidden = await addDocument("hidden", veryOld);
    const shownImage = await addImage(null);

    const report = await runRetention(db, storage, null, { apply: true, now: NOW });

    expect(report.questionImages.eligible + report.documentVersions.eligible).toBe(0);
    for (const doc of [published, pending, hidden]) expect(await exists(doc.versions[0]!.key)).toBe(true);
    expect(await exists(shownImage.key)).toBe(true);
  });

  it("does not delete the file of a document that was restored (no longer removed)", async () => {
    const doc = await addDocument("removed", daysAgo(RETENTION_GRACE_DAYS + 3));
    await db.update(resources).set({ status: "published", updatedAt: NOW }).where(eq(resources.id, doc.resourceId));
    const report = await runRetention(db, storage, null, { apply: true, now: NOW });
    expect(report.documentVersions.deleted).toBe(0);
    expect(await exists(doc.versions[0]!.key)).toBe(true);
  });

  it("is idempotent: a second run finds nothing left to do", async () => {
    await addImage(daysAgo(RETENTION_GRACE_DAYS + 1));
    await addDocument("removed", daysAgo(RETENTION_GRACE_DAYS + 1));
    await addNote("student-1", NOTE_VERSIONS_MAX + 2);

    const first = await runRetention(db, storage, null, { apply: true, now: NOW });
    const second = await runRetention(db, storage, null, { apply: true, now: NOW });

    expect(first.questionImages.deleted + first.documentVersions.deleted + first.noteVersions.deleted).toBe(4);
    expect(second.questionImages).toMatchObject({ eligible: 0, deleted: 0, failed: 0 });
    expect(second.documentVersions).toMatchObject({ eligible: 0, deleted: 0, failed: 0 });
    expect(second.noteVersions).toMatchObject({ eligible: 0, deleted: 0 });
  });

  it("a failed storage delete leaves the row unmarked and the next run retries it", async () => {
    const img = await addImage(daysAgo(RETENTION_GRACE_DAYS + 1));
    const doc = await addDocument("removed", daysAgo(RETENTION_GRACE_DAYS + 1));
    let failing = true;
    const flaky: FileStorage = { ...storage, delete: async (key) => { if (failing && key === img.key) throw new Error("storage down"); await storage.delete(key); } };

    const first = await runRetention(db, flaky, null, { apply: true, now: NOW });
    expect(first.questionImages).toMatchObject({ deleted: 0, failed: 1 });
    expect(first.documentVersions).toMatchObject({ deleted: 1, failed: 0 });
    expect((await imageRow(img.id)).fileDeletedAt).toBeNull();
    expect(await exists(img.key)).toBe(true);
    expect(await exists(doc.versions[0]!.key)).toBe(false);

    failing = false;
    const second = await runRetention(db, flaky, null, { apply: true, now: NOW });
    expect(second.questionImages).toMatchObject({ eligible: 1, deleted: 1, failed: 0 });
    expect(await exists(img.key)).toBe(false);
    expect((await imageRow(img.id)).fileDeletedAt).toEqual(NOW);
  });

  it("handles at most one batch per category per run and finishes on the next run", async () => {
    const total = RETENTION_BATCH_SIZE + 5;
    const qs = await db
      .insert(examQuestions)
      .values(Array.from({ length: total }, (_, i) => ({ courseId, examAcademicYear: "2025-2026", questionType: "sc", questionText: `TEST bulk ${i}`, rightsConfirmed: true, fingerprint: `fp-bulk-${i}`, status: "published" as const })))
      .returning({ id: examQuestions.id });
    await db.insert(examQuestionImages).values(qs.map((q, i) => ({ questionId: q.id, position: 1, storageKey: `questions/bulk-${i}`, fileName: "b.png", mimeType: "image/png", sizeBytes: 1, sha256: `b${i}`, removedAt: daysAgo(RETENTION_GRACE_DAYS + 1) })));

    const first = await runRetention(db, storage, null, { apply: true, now: NOW });
    expect(first.questionImages).toMatchObject({ eligible: total, deleted: RETENTION_BATCH_SIZE });
    const second = await runRetention(db, storage, null, { apply: true, now: NOW });
    expect(second.questionImages).toMatchObject({ eligible: 5, deleted: 5 });
  });
});

describe("note versions", () => {
  it("keeps the newest versions and the current one, deletes the oldest first", async () => {
    const over = await addNote("student-1", NOTE_VERSIONS_MAX + 5);
    const exactlyAtCap = await addNote("student-2", NOTE_VERSIONS_MAX);
    const few = await addNote("student-2", 3);

    const report = await runRetention(db, storage, null, { apply: true, now: NOW });

    expect(report.noteVersions.deleted).toBe(5);
    const kept = await versionNumbers(over);
    expect(kept).toHaveLength(NOTE_VERSIONS_MAX);
    expect(kept[0]).toBe(6);
    expect(kept.at(-1)).toBe(NOTE_VERSIONS_MAX + 5);
    expect(kept).toContain(NOTE_VERSIONS_MAX + 5); // the current version
    expect(await versionNumbers(exactlyAtCap)).toHaveLength(NOTE_VERSIONS_MAX);
    expect(await versionNumbers(few)).toEqual([1, 2, 3]);
    // The note itself is untouched.
    const [note] = await db.select().from(courseNotes).where(eq(courseNotes.id, over));
    expect(note).toMatchObject({ currentVersion: NOTE_VERSIONS_MAX + 5, body: "current" });
  });

  it("never deletes the current version even when it is not the newest number", async () => {
    const id = await addNote("student-1", NOTE_VERSIONS_MAX + 2);
    await db.update(courseNotes).set({ currentVersion: 1 }).where(eq(courseNotes.id, id));
    await runRetention(db, storage, null, { apply: true, now: NOW });
    expect(await versionNumbers(id)).toContain(1);
  });
});

describe("orphaned files", () => {
  it("reports old unreferenced files and deletes nothing unless explicitly asked", async () => {
    const referenced = await addImage(null);
    await storage.put("resources/orphan-old", new Uint8Array([1, 2, 3]));
    const farFuture = new Date(Date.now() + (ORPHAN_MIN_AGE_DAYS + 1) * DAY_MS);

    const dry = await runRetention(db, storage, null, { now: farFuture });
    expect(dry.orphans).toMatchObject({ status: "scanned", found: 1, bytes: 3, deleted: 0, sampleKeys: ["resources/orphan-old"] });

    const applied = await runRetention(db, storage, null, { apply: true, now: farFuture });
    expect(applied.orphans).toMatchObject({ found: 1, deleted: 0 });
    expect(await exists("resources/orphan-old")).toBe(true);
    expect(await exists(referenced.key)).toBe(true);

    const confirmed = await runRetention(db, storage, null, { apply: true, deleteOrphans: true, now: farFuture });
    expect(confirmed.orphans).toMatchObject({ found: 1, deleted: 1, failed: 0 });
    expect(await exists("resources/orphan-old")).toBe(false);
    expect(await exists(referenced.key)).toBe(true);
  });

  it("does not report files younger than the minimum age", async () => {
    await storage.put("resources/fresh", new Uint8Array([1]));
    const report = await previewRetention(db, storage, new Date());
    expect(report.orphans.found).toBe(0);
  });

  it("works with the local disk backend (backdated file) and ignores keys outside the scanned folders", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "dentos-retention-"));
    try {
      const local = createLocalStorage(dir);
      await local.put("resources/old-orphan", new Uint8Array([1, 2]));
      await local.put("resources/new-orphan", new Uint8Array([1, 2]));
      await local.put("other/not-ours", new Uint8Array([1]));
      const old = new Date(Date.now() - (ORPHAN_MIN_AGE_DAYS + 2) * DAY_MS);
      await utimes(path.join(dir, "resources/old-orphan"), old, old);
      await utimes(path.join(dir, "other/not-ours"), old, old);

      const report = await previewRetention(db, local, new Date());
      expect(report.orphans).toMatchObject({ status: "scanned", found: 1, bytes: 2, sampleKeys: ["resources/old-orphan"] });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("says so when the storage backend cannot list its files", async () => {
    const noList: FileStorage = { put: storage.put, get: storage.get, delete: storage.delete };
    const report = await previewRetention(db, noList, NOW);
    expect(report.orphans).toMatchObject({ status: "unavailable", found: 0 });
  });

  it("marks a scan that hit the listing limit as cut short", async () => {
    const limited: FileStorage = { ...storage, list: async () => ({ files: [], truncated: true }) };
    expect((await previewRetention(db, limited, NOW)).orphans.truncated).toBe(true);
  });
});

describe("access", () => {
  it("refuses students and moderators, deleting and writing nothing", async () => {
    const img = await addImage(daysAgo(RETENTION_GRACE_DAYS + 1));
    for (const role of ["student", "moderator"] as const) {
      const run = await runRetentionAsAdmin(db, storage, { id: "x", role }, { apply: true });
      expect(run).toEqual({ ok: false, error: "forbidden" });
      expect(await previewRetentionAsAdmin(db, storage, { role })).toEqual({ ok: false, error: "forbidden" });
    }
    expect(await exists(img.key)).toBe(true);
    expect(await db.$count(auditLog)).toBe(0);
  });

  it("lets an administrator run it, recording who ran it", async () => {
    const img = await addImage(daysAgo(RETENTION_GRACE_DAYS + 1));
    const run = await runRetentionAsAdmin(db, storage, { id: "admin-1", role: "admin" }, { apply: true, now: NOW });
    expect(run.ok).toBe(true);
    expect(await exists(img.key)).toBe(false);
    expect((await db.select().from(auditLog))[0]!.actorId).toBe("admin-1");
  });

  it("the page and the action both check the administrator role on the server", () => {
    const page = readFileSync(path.join("src", "app", "(app)", "admin", "retention", "page.tsx"), "utf8");
    const action = readFileSync(path.join("src", "server", "retention", "actions.ts"), "utf8");
    expect(page).toContain('requireRole("admin")');
    expect(action).toContain('requireRole("admin")');
    expect(action).toContain("runRetentionAsAdmin");
  });
});

describe("storage listing", () => {
  it("memory and local backends list by prefix and report truncation", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "dentos-list-"));
    try {
      for (const s of [createMemoryStorage(), createLocalStorage(dir)]) {
        await s.put("resources/a", new Uint8Array([1]));
        await s.put("resources/b", new Uint8Array([1, 2]));
        await s.put("questions/c", new Uint8Array([1]));
        const all = await s.list!("resources/", 10);
        expect(all.files.map((f) => f.key)).toEqual(["resources/a", "resources/b"]);
        expect(all.files.map((f) => f.sizeBytes)).toEqual([1, 2]);
        expect(all.truncated).toBe(false);
        expect((await s.list!("resources/", 1))).toMatchObject({ truncated: true });
        expect((await s.list!("nothing/", 10)).files).toEqual([]);
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("command line", () => {
  it("is a dry run by default and needs --apply to delete", () => {
    expect(parseRetentionArgs([])).toEqual({ ok: true, options: { apply: false, deleteOrphans: false } });
    expect(parseRetentionArgs(["--apply"])).toEqual({ ok: true, options: { apply: true, deleteOrphans: false } });
    expect(parseRetentionArgs(["--apply", "--delete-orphans"])).toEqual({ ok: true, options: { apply: true, deleteOrphans: true } });
  });
  it("refuses orphan deletion without --apply, and unknown options", () => {
    expect(parseRetentionArgs(["--delete-orphans"]).ok).toBe(false);
    expect(parseRetentionArgs(["--force"]).ok).toBe(false);
  });
});

describe("texts", () => {
  it("has the retention texts in both languages, with no em dash", () => {
    const read = (l: string) => JSON.parse(readFileSync(path.join("src", "messages", `${l}.json`), "utf8")) as Record<string, Record<string, unknown>>;
    const en = read("en");
    const fr = read("fr");
    expect(Object.keys(en.retention!).sort()).toEqual(Object.keys(fr.retention!).sort());
    for (const text of [JSON.stringify(en.retention), JSON.stringify(fr.retention)]) expect(text.includes(String.fromCharCode(0x2014))).toBe(false);
  });
});
