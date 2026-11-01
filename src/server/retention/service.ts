// File retention. Takes the database and a storage object explicitly (tests use the memory or local backend).
//
// What it does (also written in docs/account-data.md):
//  - Question images with `removed_at` older than RETENTION_GRACE_DAYS: the stored file is hard-deleted, the row stays
//    (marked `file_deleted_at`) so history and revision snapshots never point at a missing row.
//  - Documents with status "removed" whose last change is older than the grace period: every version's file is
//    hard-deleted, rows stay. "Hidden" documents can be restored, so they are never touched.
//  - Note versions beyond the newest NOTE_VERSIONS_MAX per note: rows deleted, oldest first, never the current version.
//  - Stored files that no row refers to and that are older than ORPHAN_MIN_AGE_DAYS: REPORTED only. They are deleted
//    only when the caller passes deleteOrphans together with apply.
//
// Safety: a dry run (apply: false) deletes nothing. Published or visible content is never a candidate (removed images
// and removed documents are not shown to students; attempts reference questions, not images). A failed storage delete
// leaves the row unmarked so the next run retries it. Each run writes one audit entry with counts only.
import { and, asc, eq, inArray, isNotNull, isNull, lte, gt, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import { courseNotes, courseNoteVersions, examQuestionImages, resources, resourceVersions } from "@/db/schema";
import { writeAudit } from "@/server/audit";
import { hasRole } from "@/server/auth/roles";
import type { Viewer } from "@/server/resources/service";
import type { FileStorage } from "@/server/storage";
import {
  DAY_MS,
  NOTE_VERSIONS_MAX,
  ORPHAN_MIN_AGE_DAYS,
  ORPHAN_SAMPLE_SIZE,
  ORPHAN_SCAN_MAX_FILES,
  ORPHAN_SCAN_PREFIXES,
  RETENTION_BATCH_SIZE,
  RETENTION_GRACE_DAYS,
} from "./constants";

export type RetentionOptions = {
  /** false (the default everywhere) = dry run: report only, delete nothing. */
  apply?: boolean;
  /** Also delete the orphaned files found. Ignored unless apply is true. */
  deleteOrphans?: boolean;
  /** Clock, for tests. */
  now?: Date;
};

type FileGroup = { eligible: number; bytes: number; inGrace: number; deleted: number; failed: number };

export type RetentionReport = {
  apply: boolean;
  deleteOrphans: boolean;
  generatedAt: Date;
  graceDays: number;
  noteVersionsMax: number;
  orphanMinAgeDays: number;
  batchSize: number;
  questionImages: FileGroup;
  documentVersions: FileGroup;
  noteVersions: { eligible: number; deleted: number };
  orphans: {
    /** "unavailable" when the storage backend cannot list its files (the cloud backend is not wired up yet). */
    status: "scanned" | "unavailable";
    found: number;
    bytes: number;
    truncated: boolean;
    deleted: number;
    failed: number;
    sampleKeys: string[];
  };
};

const emptyGroup = (): FileGroup => ({ eligible: 0, bytes: 0, inGrace: 0, deleted: 0, failed: 0 });

// ---------- Candidate rules ----------

const imageEligible = (cutoff: Date) =>
  and(isNotNull(examQuestionImages.removedAt), lte(examQuestionImages.removedAt, cutoff), isNull(examQuestionImages.fileDeletedAt));
const imageInGrace = (cutoff: Date) =>
  and(isNotNull(examQuestionImages.removedAt), gt(examQuestionImages.removedAt, cutoff), isNull(examQuestionImages.fileDeletedAt));

// resources.updated_at is bumped by every status change, so it is never earlier than the removal. Using it can only
// make the grace period longer, never shorter.
const documentEligible = (cutoff: Date) =>
  and(eq(resources.status, "removed"), lte(resources.updatedAt, cutoff), isNull(resourceVersions.fileDeletedAt));
const documentInGrace = (cutoff: Date) =>
  and(eq(resources.status, "removed"), gt(resources.updatedAt, cutoff), isNull(resourceVersions.fileDeletedAt));

/** A version is beyond the cap when at least NOTE_VERSIONS_MAX newer versions of the same note exist. */
function noteVersionEligible() {
  return and(
    sql`${courseNoteVersions.versionNumber} <> (select ${courseNotes.currentVersion} from ${courseNotes} where ${courseNotes.id} = ${courseNoteVersions.noteId})`,
    sql`(select count(*) from ${courseNoteVersions} as newer where newer.note_id = ${courseNoteVersions.noteId} and newer.version_number > ${courseNoteVersions.versionNumber}) >= ${NOTE_VERSIONS_MAX}`,
  );
}

const countAndBytes = sql<number>`count(*)::int`;

// ---------- Reading (always safe) ----------

async function measureImages(db: Database, cutoff: Date, group: FileGroup) {
  const [eligible] = await db
    .select({ n: countAndBytes, bytes: sql<number>`coalesce(sum(${examQuestionImages.sizeBytes}), 0)::float8` })
    .from(examQuestionImages)
    .where(imageEligible(cutoff));
  group.eligible = eligible?.n ?? 0;
  group.bytes = eligible?.bytes ?? 0;
  group.inGrace = await db.$count(examQuestionImages, imageInGrace(cutoff));
}

async function measureDocuments(db: Database, cutoff: Date, group: FileGroup) {
  const base = () => db.select({ n: countAndBytes, bytes: sql<number>`coalesce(sum(${resourceVersions.sizeBytes}), 0)::float8` }).from(resourceVersions).innerJoin(resources, eq(resources.id, resourceVersions.resourceId));
  const [eligible] = await base().where(documentEligible(cutoff));
  group.eligible = eligible?.n ?? 0;
  group.bytes = eligible?.bytes ?? 0;
  const [grace] = await base().where(documentInGrace(cutoff));
  group.inGrace = grace?.n ?? 0;
}

async function scanOrphans(db: Database, storage: FileStorage, now: Date): Promise<{ report: RetentionReport["orphans"]; keys: string[] }> {
  const report: RetentionReport["orphans"] = { status: "unavailable", found: 0, bytes: 0, truncated: false, deleted: 0, failed: 0, sampleKeys: [] };
  if (!storage.list) return { report, keys: [] };
  report.status = "scanned";
  const cutoff = new Date(now.getTime() - ORPHAN_MIN_AGE_DAYS * DAY_MS);
  const orphanKeys: string[] = [];
  for (const prefix of ORPHAN_SCAN_PREFIXES) {
    const { files, truncated } = await storage.list(prefix, ORPHAN_SCAN_MAX_FILES);
    if (truncated) report.truncated = true;
    const old = files.filter((f) => f.modifiedAt.getTime() <= cutoff.getTime());
    for (let i = 0; i < old.length; i += 500) {
      const chunk = old.slice(i, i + 500);
      const keys = chunk.map((f) => f.key);
      const [versionKeys, imageKeys] = await Promise.all([
        db.select({ key: resourceVersions.storageKey }).from(resourceVersions).where(inArray(resourceVersions.storageKey, keys)),
        db.select({ key: examQuestionImages.storageKey }).from(examQuestionImages).where(inArray(examQuestionImages.storageKey, keys)),
      ]);
      const referenced = new Set([...versionKeys, ...imageKeys].map((r) => r.key));
      for (const file of chunk) {
        if (referenced.has(file.key)) continue;
        orphanKeys.push(file.key);
        report.found += 1;
        report.bytes += file.sizeBytes;
      }
    }
  }
  report.sampleKeys = orphanKeys.slice(0, ORPHAN_SAMPLE_SIZE);
  return { report, keys: orphanKeys };
}

async function buildReport(db: Database, storage: FileStorage, options: RetentionOptions, now: Date) {
  const cutoff = new Date(now.getTime() - RETENTION_GRACE_DAYS * DAY_MS);
  const apply = options.apply === true;
  const report: RetentionReport = {
    apply,
    deleteOrphans: apply && options.deleteOrphans === true,
    generatedAt: now,
    graceDays: RETENTION_GRACE_DAYS,
    noteVersionsMax: NOTE_VERSIONS_MAX,
    orphanMinAgeDays: ORPHAN_MIN_AGE_DAYS,
    batchSize: RETENTION_BATCH_SIZE,
    questionImages: emptyGroup(),
    documentVersions: emptyGroup(),
    noteVersions: { eligible: 0, deleted: 0 },
    orphans: { status: "unavailable", found: 0, bytes: 0, truncated: false, deleted: 0, failed: 0, sampleKeys: [] },
  };
  await measureImages(db, cutoff, report.questionImages);
  await measureDocuments(db, cutoff, report.documentVersions);
  report.noteVersions.eligible = await db.$count(courseNoteVersions, noteVersionEligible());
  const orphans = await scanOrphans(db, storage, now);
  report.orphans = orphans.report;
  return { report, cutoff, orphanKeys: orphans.keys };
}

// ---------- Deleting (only when apply is true) ----------

/** Deletes the stored file, then marks the row. A storage failure leaves the row untouched so the next run retries it. */
async function purgeFiles(
  storage: FileStorage,
  items: { id: string; storageKey: string }[],
  stillEligible: (id: string) => Promise<boolean>,
  markDeleted: (id: string, at: Date) => Promise<void>,
  group: FileGroup,
  now: Date,
) {
  for (const item of items) {
    // Re-check just before deleting: a document restored in the meantime must not lose its file.
    if (!(await stillEligible(item.id))) continue;
    try {
      await storage.delete(item.storageKey);
    } catch {
      group.failed += 1;
      continue;
    }
    await markDeleted(item.id, now);
    group.deleted += 1;
  }
}

async function purgeImages(db: Database, storage: FileStorage, cutoff: Date, now: Date, group: FileGroup) {
  const items = await db
    .select({ id: examQuestionImages.id, storageKey: examQuestionImages.storageKey })
    .from(examQuestionImages)
    .where(imageEligible(cutoff))
    .orderBy(asc(examQuestionImages.removedAt), asc(examQuestionImages.id))
    .limit(RETENTION_BATCH_SIZE);
  await purgeFiles(
    storage,
    items,
    async (id) => (await db.$count(examQuestionImages, and(eq(examQuestionImages.id, id), imageEligible(cutoff)))) > 0,
    async (id, at) => {
      await db.update(examQuestionImages).set({ fileDeletedAt: at }).where(eq(examQuestionImages.id, id));
    },
    group,
    now,
  );
}

async function purgeDocuments(db: Database, storage: FileStorage, cutoff: Date, now: Date, group: FileGroup) {
  const items = await db
    .select({ id: resourceVersions.id, storageKey: resourceVersions.storageKey })
    .from(resourceVersions)
    .innerJoin(resources, eq(resources.id, resourceVersions.resourceId))
    .where(documentEligible(cutoff))
    .orderBy(asc(resources.updatedAt), asc(resourceVersions.id))
    .limit(RETENTION_BATCH_SIZE);
  await purgeFiles(
    storage,
    items,
    async (id) => {
      const [row] = await db
        .select({ id: resourceVersions.id })
        .from(resourceVersions)
        .innerJoin(resources, eq(resources.id, resourceVersions.resourceId))
        .where(and(eq(resourceVersions.id, id), documentEligible(cutoff)));
      return row !== undefined;
    },
    async (id, at) => {
      await db.update(resourceVersions).set({ fileDeletedAt: at }).where(eq(resourceVersions.id, id));
    },
    group,
    now,
  );
}

async function pruneNoteVersions(db: Database): Promise<number> {
  const ids = await db
    .select({ id: courseNoteVersions.id })
    .from(courseNoteVersions)
    .where(noteVersionEligible())
    .orderBy(asc(courseNoteVersions.createdAt), asc(courseNoteVersions.versionNumber))
    .limit(RETENTION_BATCH_SIZE);
  if (ids.length === 0) return 0;
  // The rule is evaluated again inside the delete, so a version that stopped being eligible is left alone.
  const deleted = await db
    .delete(courseNoteVersions)
    .where(and(inArray(courseNoteVersions.id, ids.map((r) => r.id)), noteVersionEligible()))
    .returning({ id: courseNoteVersions.id });
  return deleted.length;
}

async function deleteOrphanFiles(storage: FileStorage, keys: string[], orphans: RetentionReport["orphans"]) {
  for (const key of keys.slice(0, RETENTION_BATCH_SIZE)) {
    try {
      await storage.delete(key);
      orphans.deleted += 1;
    } catch {
      orphans.failed += 1;
    }
  }
}

// ---------- Entry points ----------

/** Report only: never deletes, never writes. Used by the admin page every time it opens. */
export async function previewRetention(db: Database, storage: FileStorage, now: Date = new Date()): Promise<RetentionReport> {
  return (await buildReport(db, storage, { apply: false }, now)).report;
}

/**
 * One run. Trusted callers only (the CLI, or runRetentionAsAdmin below). Dry run unless options.apply is true.
 * Writes one audit entry with counts only (no keys, no names, no ids of people or documents).
 */
export async function runRetention(db: Database, storage: FileStorage, actorId: string | null, options: RetentionOptions = {}): Promise<RetentionReport> {
  const now = options.now ?? new Date();
  const { report, cutoff, orphanKeys } = await buildReport(db, storage, options, now);

  if (report.apply) {
    await purgeImages(db, storage, cutoff, now, report.questionImages);
    await purgeDocuments(db, storage, cutoff, now, report.documentVersions);
    report.noteVersions.deleted = await pruneNoteVersions(db);
    if (report.deleteOrphans) await deleteOrphanFiles(storage, orphanKeys, report.orphans);
  }

  await writeAudit(db, {
    actorId,
    action: report.apply ? "retention.apply" : "retention.dry_run",
    entityType: "retention",
    metadata: {
      graceDays: report.graceDays,
      noteVersionsMax: report.noteVersionsMax,
      deleteOrphans: report.deleteOrphans,
      imagesEligible: report.questionImages.eligible,
      imagesDeleted: report.questionImages.deleted,
      imagesFailed: report.questionImages.failed,
      documentFilesEligible: report.documentVersions.eligible,
      documentFilesDeleted: report.documentVersions.deleted,
      documentFilesFailed: report.documentVersions.failed,
      noteVersionsEligible: report.noteVersions.eligible,
      noteVersionsDeleted: report.noteVersions.deleted,
      orphansFound: report.orphans.found,
      orphansDeleted: report.orphans.deleted,
      orphansFailed: report.orphans.failed,
      orphanScan: report.orphans.status,
      orphanScanTruncated: report.orphans.truncated,
    },
  });
  return report;
}

export type RetentionAccess = { ok: true; value: RetentionReport } | { ok: false; error: "forbidden" };

/** Administrators only. */
export async function runRetentionAsAdmin(
  db: Database,
  storage: FileStorage,
  viewer: Pick<Viewer, "id" | "role">,
  options: RetentionOptions = {},
): Promise<RetentionAccess> {
  if (!hasRole(viewer, "admin")) return { ok: false, error: "forbidden" };
  return { ok: true, value: await runRetention(db, storage, viewer.id, options) };
}

/** Administrators only. Read-only report for the admin page. */
export async function previewRetentionAsAdmin(db: Database, storage: FileStorage, viewer: Pick<Viewer, "role">): Promise<RetentionAccess> {
  if (!hasRole(viewer, "admin")) return { ok: false, error: "forbidden" };
  return { ok: true, value: await previewRetention(db, storage) };
}
