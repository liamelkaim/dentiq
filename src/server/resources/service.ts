// Shared academic resources: business rules and permissions.
// Every function receives the database (and storage) explicitly so it can be tested in isolation.
import { randomUUID } from "node:crypto";
import { and, asc, count, desc, eq, exists, ilike, inArray, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import {
  courseOfferings,
  courses,
  offeringInstructors,
  professors,
  reportReasons,
  resourceKinds,
  resourceReports,
  resources,
  resourceVersions,
  user,
  type ResourceStatus,
  type Term,
} from "@/db/schema";
import { writeAudit } from "@/server/audit";
import { escapeLike } from "@/server/library/like";
import { canContribute, hasRole, type AccessUser } from "@/server/auth/roles";
import type { FileStorage } from "@/server/storage";
import { checkUpload } from "./files";

export type Viewer = AccessUser & { id: string };
export type Result<T> = { ok: true; value: T } | { ok: false; error: string; resourceId?: string };
export type Period = "current" | "historical" | "general";

// ---------- Permissions ----------

export const isModerator = (v: Viewer) => hasRole(v, "moderator");

/** Shared files are for verified, approved members (and moderators). */
export const canAccessLibrary = (v: Viewer) => isModerator(v) || canContribute(v);

type Ownable = { status: ResourceStatus; createdBy: string | null; visibility: "shared" | "private" };

export function canSeeResource(v: Viewer, r: Ownable): boolean {
  if (r.visibility === "private") return r.createdBy === v.id && canAccessLibrary(v) && r.status !== "removed";
  if (isModerator(v)) return true;
  if (r.createdBy === v.id && r.status !== "removed") return true;
  return r.status === "published" && canAccessLibrary(v);
}

export function canEditResource(v: Viewer, r: Ownable): boolean {
  if (r.visibility === "private") return r.createdBy === v.id && canAccessLibrary(v) && r.status !== "removed";
  if (isModerator(v)) return true;
  return r.createdBy === v.id && canAccessLibrary(v) && (r.status === "published" || r.status === "pending");
}

// ---------- Validation ----------

const blankToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
const checkbox = (v: unknown) => v === "on" || v === "true" || v === true;
const optionalText = (max: number) =>
  z
    .preprocess(blankToNull, z.string().trim().max(max).nullish())
    .transform((v) => (v ? v.replace(/\s+/g, " ") : null));

export const resourceInputSchema = z.object({
  courseId: z.uuid(),
  offeringId: z.preprocess(blankToNull, z.uuid().nullish()).transform((v) => v ?? null),
  kind: z.enum(resourceKinds),
  visibility: z.enum(["shared", "private"]).default("shared"),
  title: z.string().trim().min(1, { message: "required" }).max(200),
  description: z.preprocess(blankToNull, z.string().trim().max(2000).nullish()).transform((v) => v ?? null),
  topic: optionalText(80),
  isOfficial: z.preprocess(checkbox, z.boolean()),
  rightsConfirmed: z.preprocess(checkbox, z.literal(true, { message: "rightsRequired" })),
});
export type ResourceInput = z.output<typeof resourceInputSchema>;

export const versionInputSchema = z.object({
  resourceId: z.uuid(),
  changeNote: optionalText(300),
  rightsConfirmed: z.preprocess(checkbox, z.literal(true, { message: "rightsRequired" })),
});

export const reportInputSchema = z.object({
  resourceId: z.uuid(),
  reason: z.enum(reportReasons),
  details: z.preprocess(blankToNull, z.string().trim().max(1000).nullish()).transform((v) => v ?? null),
});

export type UploadFile = { name: string; bytes: Uint8Array };

// ---------- Current vs historical ----------

const termOrder = sql<number>`case ${courseOfferings.term} when 'summer' then 3 when 'winter' then 2 else 1 end`;

/** The most recent offering of each course (latest academic year, then latest term). */
export async function latestOfferingByCourse(db: Database, courseIds: string[]): Promise<Map<string, string>> {
  if (courseIds.length === 0) return new Map();
  const rows = await db
    .selectDistinctOn([courseOfferings.courseId], { id: courseOfferings.id, courseId: courseOfferings.courseId })
    .from(courseOfferings)
    .where(inArray(courseOfferings.courseId, courseIds))
    .orderBy(courseOfferings.courseId, desc(courseOfferings.academicYear), desc(termOrder));
  return new Map(rows.map((r) => [r.courseId, r.id]));
}

export function periodOf(offeringId: string | null, latestOfferingId: string | undefined): Period {
  if (!offeringId) return "general";
  return offeringId === latestOfferingId ? "current" : "historical";
}

// ---------- Reading ----------

export type ResourceFilters = {
  visibility?: "shared" | "private";
  courseId?: string;
  q?: string;
  kind?: (typeof resourceKinds)[number];
  topic?: string;
  professorId?: string;
  academicYear?: string;
  term?: Term;
  /** "current" includes general (not tied to an offering) material. Default: all. */
  period?: "current" | "historical" | "all";
  /** Moderators only. */
  status?: ResourceStatus;
};

export async function listResources(db: Database, viewer: Viewer, filters: ResourceFilters = {}) {
  if (!canAccessLibrary(viewer)) return [];

  const conditions: SQL[] = [or(eq(resources.visibility, "shared"), eq(resources.createdBy, viewer.id))!];
  if (filters.visibility) conditions.push(eq(resources.visibility, filters.visibility));
  if (isModerator(viewer) && filters.status) {
    conditions.push(eq(resources.status, filters.status));
  } else {
    // Published material, plus the viewer's own items still under review.
    conditions.push(
      or(eq(resources.status, "published"), and(eq(resources.createdBy, viewer.id), inArray(resources.status, ["pending", "hidden"])))!,
    );
  }
  if (filters.courseId) conditions.push(eq(resources.courseId, filters.courseId));
  if (filters.kind) conditions.push(eq(resources.kind, filters.kind));
  if (filters.topic) conditions.push(ilike(resources.topic, escapeLike(filters.topic)));
  if (filters.academicYear) conditions.push(eq(courseOfferings.academicYear, filters.academicYear));
  if (filters.term) conditions.push(eq(courseOfferings.term, filters.term));
  if (filters.professorId) {
    conditions.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(offeringInstructors)
          .where(and(eq(offeringInstructors.offeringId, resources.offeringId), eq(offeringInstructors.professorId, filters.professorId))),
      ),
    );
  }
  const q = filters.q?.trim();
  if (q) {
    const pattern = `%${escapeLike(q)}%`;
    conditions.push(or(ilike(resources.title, pattern), ilike(resources.description, pattern), ilike(resources.topic, pattern))!);
  }

  const rows = await db
    .select({
      id: resources.id,
      title: resources.title,
      kind: resources.kind,
      topic: resources.topic,
      isOfficial: resources.isOfficial,
      visibility: resources.visibility,
      status: resources.status,
      createdBy: resources.createdBy,
      createdAt: resources.createdAt,
      updatedAt: resources.updatedAt,
      courseId: resources.courseId,
      courseCode: courses.code,
      courseTitleFr: courses.titleFr,
      courseTitleEn: courses.titleEn,
      offeringId: resources.offeringId,
      academicYear: courseOfferings.academicYear,
      term: courseOfferings.term,
    })
    .from(resources)
    .innerJoin(courses, eq(resources.courseId, courses.id))
    .leftJoin(courseOfferings, eq(resources.offeringId, courseOfferings.id))
    .where(and(...conditions))
    .orderBy(desc(resources.isOfficial), desc(resources.updatedAt))
    .limit(500);

  const latest = await latestOfferingByCourse(db, [...new Set(rows.map((r) => r.courseId))]);
  const versions = rows.length
    ? await db
        .select({
          resourceId: resourceVersions.resourceId,
          versionNumber: resourceVersions.versionNumber,
          mimeType: resourceVersions.mimeType,
          sizeBytes: resourceVersions.sizeBytes,
        })
        .from(resourceVersions)
        .where(inArray(resourceVersions.resourceId, rows.map((r) => r.id)))
        .orderBy(desc(resourceVersions.versionNumber))
    : [];

  const period = filters.period ?? "all";
  return rows
    .map((r) => {
      const own = versions.filter((v) => v.resourceId === r.id);
      return {
        ...r,
        period: periodOf(r.offeringId, latest.get(r.courseId)),
        versionCount: own.length,
        latestVersion: own[0] ?? null,
      };
    })
    .filter((r) => period === "all" || (period === "historical" ? r.period === "historical" : r.period !== "historical"));
}

export type ResourceListItem = Awaited<ReturnType<typeof listResources>>[number];

export async function getResource(db: Database, viewer: Viewer, id: string) {
  const [row] = await db
    .select({ resource: resources, course: courses, offering: courseOfferings, uploaderName: user.name })
    .from(resources)
    .innerJoin(courses, eq(resources.courseId, courses.id))
    .leftJoin(courseOfferings, eq(resources.offeringId, courseOfferings.id))
    .leftJoin(user, eq(resources.createdBy, user.id))
    .where(eq(resources.id, id));
  if (!row || !canSeeResource(viewer, row.resource)) return null;

  const [versions, instructors, latest, reports] = await Promise.all([
    db
      .select({
        id: resourceVersions.id,
        versionNumber: resourceVersions.versionNumber,
        fileName: resourceVersions.fileName,
        mimeType: resourceVersions.mimeType,
        sizeBytes: resourceVersions.sizeBytes,
        changeNote: resourceVersions.changeNote,
        createdAt: resourceVersions.createdAt,
        uploaderName: user.name,
      })
      .from(resourceVersions)
      .leftJoin(user, eq(resourceVersions.uploadedBy, user.id))
      .where(eq(resourceVersions.resourceId, id))
      .orderBy(desc(resourceVersions.versionNumber)),
    row.resource.offeringId
      ? db
          .select({ fullName: professors.fullName })
          .from(offeringInstructors)
          .innerJoin(professors, eq(offeringInstructors.professorId, professors.id))
          .where(eq(offeringInstructors.offeringId, row.resource.offeringId))
          .orderBy(asc(professors.fullName))
      : Promise.resolve([]),
    latestOfferingByCourse(db, [row.resource.courseId]),
    isModerator(viewer)
      ? db
          .select({
            id: resourceReports.id,
            reason: resourceReports.reason,
            details: resourceReports.details,
            createdAt: resourceReports.createdAt,
            reporterName: user.name,
          })
          .from(resourceReports)
          .leftJoin(user, eq(resourceReports.reporterId, user.id))
          .where(and(eq(resourceReports.resourceId, id), eq(resourceReports.status, "open")))
          .orderBy(asc(resourceReports.createdAt))
      : Promise.resolve([]),
  ]);

  return {
    ...row.resource,
    course: row.course,
    offering: row.offering,
    uploaderName: row.uploaderName,
    instructors: instructors.map((i) => i.fullName),
    versions,
    openReports: reports,
    period: periodOf(row.resource.offeringId, latest.get(row.resource.courseId)),
    canEdit: canEditResource(viewer, row.resource),
    canModerate: row.resource.visibility === "shared" && isModerator(viewer),
    canReport: row.resource.visibility === "shared" && row.resource.status === "published" && canAccessLibrary(viewer),
  };
}

/** What the download route needs, or null when the viewer may not read this file. */
export async function getDownload(db: Database, viewer: Viewer, versionId: string) {
  if (!z.uuid().safeParse(versionId).success) return null;
  const [row] = await db
    .select({ version: resourceVersions, status: resources.status, createdBy: resources.createdBy, visibility: resources.visibility })
    .from(resourceVersions)
    .innerJoin(resources, eq(resourceVersions.resourceId, resources.id))
    .where(eq(resourceVersions.id, versionId));
  if (!row || !canSeeResource(viewer, row)) return null;
  const { storageKey, fileName, mimeType, sizeBytes } = row.version;
  return { storageKey, fileName, mimeType, sizeBytes };
}

/**
 * Course cards for the dashboard and course header: real catalog data only. Document counts are
 * published documents, and are only returned to viewers who may see the library (null otherwise).
 */
export async function listCourseSummaries(
  db: Database,
  viewer: Viewer,
  options: { courseIds?: string[]; limit?: number } = {},
) {
  const conditions: SQL[] = [isNull(courses.archivedAt)];
  if (options.courseIds) {
    if (options.courseIds.length === 0) return [];
    conditions.push(inArray(courses.id, options.courseIds));
  }
  const rows = await db
    .select({
      id: courses.id,
      code: courses.code,
      titleFr: courses.titleFr,
      titleEn: courses.titleEn,
      yearOfStudy: courses.yearOfStudy,
      typicalTerm: courses.typicalTerm,
    })
    .from(courses)
    .where(and(...conditions))
    .orderBy(asc(courses.yearOfStudy), asc(courses.code))
    .limit(options.limit ?? 500);
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const latest = await latestOfferingByCourse(db, ids);
  const offeringIds = [...latest.values()];
  const [offerings, instructors, counts] = await Promise.all([
    offeringIds.length
      ? db
          .select({ id: courseOfferings.id, academicYear: courseOfferings.academicYear, term: courseOfferings.term })
          .from(courseOfferings)
          .where(inArray(courseOfferings.id, offeringIds))
      : Promise.resolve([]),
    offeringIds.length
      ? db
          .select({ offeringId: offeringInstructors.offeringId, fullName: professors.fullName })
          .from(offeringInstructors)
          .innerJoin(professors, eq(offeringInstructors.professorId, professors.id))
          .where(inArray(offeringInstructors.offeringId, offeringIds))
          .orderBy(asc(professors.fullName))
      : Promise.resolve([]),
    canAccessLibrary(viewer)
      ? db
          .select({ courseId: resources.courseId, n: count() })
          .from(resources)
          .where(and(inArray(resources.courseId, ids), eq(resources.status, "published"), or(eq(resources.visibility, "shared"), eq(resources.createdBy, viewer.id))))
          .groupBy(resources.courseId)
      : Promise.resolve(null),
  ]);

  return rows.map((course) => {
    const offeringId = latest.get(course.id);
    const offering = offerings.find((o) => o.id === offeringId) ?? null;
    return {
      ...course,
      currentOffering: offering && { academicYear: offering.academicYear, term: offering.term },
      instructors: instructors.filter((i) => i.offeringId === offeringId).map((i) => i.fullName),
      documentCount: counts ? (counts.find((c) => c.courseId === course.id)?.n ?? 0) : null,
    };
  });
}

export type CourseSummary = Awaited<ReturnType<typeof listCourseSummaries>>[number];

export async function listFilterOptions(db: Database, viewer: Viewer) {
  const [courseRows, professorRows, yearRows, topicRows] = await Promise.all([
    db
      .select({ id: courses.id, code: courses.code, titleFr: courses.titleFr, titleEn: courses.titleEn })
      .from(courses)
      .where(isNull(courses.archivedAt))
      .orderBy(asc(courses.code)),
    db.select({ id: professors.id, fullName: professors.fullName }).from(professors).orderBy(asc(professors.fullName)),
    db.selectDistinct({ year: courseOfferings.academicYear }).from(courseOfferings).orderBy(desc(courseOfferings.academicYear)),
    db
      .selectDistinct({ topic: resources.topic })
      .from(resources)
      .where(and(eq(resources.status, "published"), or(eq(resources.visibility, "shared"), eq(resources.createdBy, viewer.id)), isNotNull(resources.topic)))
      .orderBy(asc(resources.topic)),
  ]);
  return {
    courses: courseRows,
    professors: professorRows,
    academicYears: yearRows.map((r) => r.year),
    topics: topicRows.map((r) => r.topic!),
  };
}

export async function listModerationQueue(db: Database, viewer: Viewer) {
  if (!isModerator(viewer)) return { pending: [], reports: [] };
  const [pending, reports] = await Promise.all([
    db
      .select({
        id: resources.id,
        title: resources.title,
        kind: resources.kind,
        createdAt: resources.createdAt,
        courseCode: courses.code,
        uploaderName: user.name,
      })
      .from(resources)
      .innerJoin(courses, eq(resources.courseId, courses.id))
      .leftJoin(user, eq(resources.createdBy, user.id))
      .where(and(eq(resources.status, "pending"), eq(resources.visibility, "shared")))
      .orderBy(asc(resources.createdAt)),
    db
      .select({
        id: resourceReports.id,
        reason: resourceReports.reason,
        details: resourceReports.details,
        createdAt: resourceReports.createdAt,
        resourceId: resources.id,
        resourceTitle: resources.title,
        reporterName: user.name,
      })
      .from(resourceReports)
      .innerJoin(resources, eq(resourceReports.resourceId, resources.id))
      .leftJoin(user, eq(resourceReports.reporterId, user.id))
      .where(and(eq(resourceReports.status, "open"), eq(resources.visibility, "shared")))
      .orderBy(asc(resourceReports.createdAt)),
  ]);
  return { pending, reports };
}

// ---------- Writing ----------

async function findDuplicate(db: Database, hash: string, viewer: Viewer, visibility: "shared" | "private") {
  const [row] = await db
    .select({ resourceId: resourceVersions.resourceId, status: resources.status, createdBy: resources.createdBy, visibility: resources.visibility })
    .from(resourceVersions)
    .innerJoin(resources, eq(resourceVersions.resourceId, resources.id))
    .where(and(eq(resourceVersions.sha256, hash), eq(resources.visibility, visibility), visibility === "private" ? eq(resources.createdBy, viewer.id) : undefined))
    .limit(1);
  return row ?? null;
}

function duplicateError(viewer: Viewer, existing: NonNullable<Awaited<ReturnType<typeof findDuplicate>>>): Result<never> {
  // Only point to the existing copy if the viewer is allowed to see it.
  return { ok: false, error: "duplicateFile", resourceId: canSeeResource(viewer, existing) ? existing.resourceId : undefined };
}

export async function createResource(
  db: Database,
  storage: FileStorage,
  viewer: Viewer,
  input: ResourceInput,
  file: UploadFile,
): Promise<Result<{ id: string }>> {
  if (!canAccessLibrary(viewer)) return { ok: false, error: "forbidden" };

  const [course] = await db
    .select({ id: courses.id })
    .from(courses)
    .where(and(eq(courses.id, input.courseId), isNull(courses.archivedAt)));
  if (!course) return { ok: false, error: "notFound" };
  if (input.offeringId) {
    const [offering] = await db
      .select({ id: courseOfferings.id })
      .from(courseOfferings)
      .where(and(eq(courseOfferings.id, input.offeringId), eq(courseOfferings.courseId, input.courseId)));
    if (!offering) return { ok: false, error: "invalidOffering" };
  }

  const upload = checkUpload(file.name, file.bytes);
  if (!upload.ok) return upload;
  const duplicate = await findDuplicate(db, upload.hash, viewer, input.visibility);
  if (duplicate) return duplicateError(viewer, duplicate);

  const moderator = isModerator(viewer);
  const storageKey = `resources/${randomUUID()}`;
  await storage.put(storageKey, file.bytes);
  try {
    return await db.transaction(async (tx) => {
      const [resource] = await tx
        .insert(resources)
        .values({
          courseId: input.courseId,
          offeringId: input.offeringId,
          kind: input.kind,
          title: input.title,
          description: input.description,
          topic: input.topic,
          visibility: input.visibility,
          isOfficial: input.visibility === "shared" && moderator && input.isOfficial,
          // Student uploads wait for review (copyright and quality); moderators publish directly.
          status: input.visibility === "private" || moderator ? "published" : "pending",
          createdBy: viewer.id,
        })
        .returning({ id: resources.id, status: resources.status });
      await tx.insert(resourceVersions).values({
        resourceId: resource!.id,
        versionNumber: 1,
        storageKey,
        fileName: upload.fileName,
        mimeType: upload.mime,
        sizeBytes: file.bytes.byteLength,
        sha256: upload.hash,
        rightsConfirmed: true,
        uploadedBy: viewer.id,
      });
      await writeAudit(tx, {
        actorId: viewer.id,
        action: "resource.create",
        entityType: "resource",
        entityId: resource!.id,
        metadata: { courseId: input.courseId, kind: input.kind, status: resource!.status, sha256: upload.hash },
      });
      return { ok: true as const, value: { id: resource!.id } };
    });
  } catch (error) {
    await storage.delete(storageKey);
    throw error;
  }
}

export async function addVersion(
  db: Database,
  storage: FileStorage,
  viewer: Viewer,
  resourceId: string,
  file: UploadFile,
  changeNote: string | null,
): Promise<Result<{ versionNumber: number }>> {
  const [resource] = await db.select().from(resources).where(eq(resources.id, resourceId));
  if (!resource || !canSeeResource(viewer, resource)) return { ok: false, error: "notFound" };
  if (!canEditResource(viewer, resource)) return { ok: false, error: "forbidden" };

  const upload = checkUpload(file.name, file.bytes);
  if (!upload.ok) return upload;
  const duplicate = await findDuplicate(db, upload.hash, viewer, resource.visibility);
  if (duplicate) return duplicateError(viewer, duplicate);

  const moderator = isModerator(viewer);
  const storageKey = `resources/${randomUUID()}`;
  await storage.put(storageKey, file.bytes);
  try {
    return await db.transaction(async (tx) => {
      const [{ next } = { next: 1 }] = await tx
        .select({ next: sql<number>`coalesce(max(${resourceVersions.versionNumber}), 0) + 1` })
        .from(resourceVersions)
        .where(eq(resourceVersions.resourceId, resourceId));
      const versionNumber = Number(next);
      await tx.insert(resourceVersions).values({
        resourceId,
        versionNumber,
        storageKey,
        fileName: upload.fileName,
        mimeType: upload.mime,
        sizeBytes: file.bytes.byteLength,
        sha256: upload.hash,
        changeNote,
        rightsConfirmed: true,
        uploadedBy: viewer.id,
      });
      // A student's new file goes back through review before others see it.
      const status: ResourceStatus = resource.visibility === "private" || moderator ? resource.status : "pending";
      await tx.update(resources).set({ status }).where(eq(resources.id, resourceId));
      await writeAudit(tx, {
        actorId: viewer.id,
        action: "resource.version.add",
        entityType: "resource",
        entityId: resourceId,
        metadata: { versionNumber, sha256: upload.hash, status },
      });
      return { ok: true as const, value: { versionNumber } };
    });
  } catch (error) {
    await storage.delete(storageKey);
    throw error;
  }
}

export const moderationActions = { publish: "published", hide: "hidden", remove: "removed" } as const;
export type ModerationAction = keyof typeof moderationActions;

export async function moderateResource(
  db: Database,
  viewer: Viewer,
  resourceId: string,
  action: ModerationAction,
): Promise<Result<null>> {
  if (!isModerator(viewer)) return { ok: false, error: "forbidden" };
  const status = moderationActions[action];
  const [before] = await db.select({ status: resources.status }).from(resources).where(and(eq(resources.id, resourceId), eq(resources.visibility, "shared")));
  if (!before) return { ok: false, error: "notFound" };
  await db.update(resources).set({ status }).where(eq(resources.id, resourceId));
  await writeAudit(db, {
    actorId: viewer.id,
    action: `resource.${action}`,
    entityType: "resource",
    entityId: resourceId,
    metadata: { from: before.status, to: status },
  });
  return { ok: true, value: null };
}

export async function setOfficial(db: Database, viewer: Viewer, resourceId: string, isOfficial: boolean): Promise<Result<null>> {
  if (!isModerator(viewer)) return { ok: false, error: "forbidden" };
  const [row] = await db.update(resources).set({ isOfficial }).where(and(eq(resources.id, resourceId), eq(resources.visibility, "shared"))).returning({ id: resources.id });
  if (!row) return { ok: false, error: "notFound" };
  await writeAudit(db, {
    actorId: viewer.id,
    action: isOfficial ? "resource.official.set" : "resource.official.unset",
    entityType: "resource",
    entityId: resourceId,
  });
  return { ok: true, value: null };
}

export async function reportResource(
  db: Database,
  viewer: Viewer,
  input: z.output<typeof reportInputSchema>,
): Promise<Result<null>> {
  const [resource] = await db.select().from(resources).where(eq(resources.id, input.resourceId));
  if (!resource || !canSeeResource(viewer, resource)) return { ok: false, error: "notFound" };
  if (resource.visibility !== "shared" || resource.status !== "published" || !canAccessLibrary(viewer)) return { ok: false, error: "forbidden" };
  try {
    await db.insert(resourceReports).values({ ...input, reporterId: viewer.id });
  } catch (error) {
    const e = error as { code?: string; cause?: { code?: string } };
    if (e?.code === "23505" || e?.cause?.code === "23505") return { ok: false, error: "alreadyReported" };
    throw error;
  }
  return { ok: true, value: null };
}

export async function resolveReport(
  db: Database,
  viewer: Viewer,
  reportId: string,
  outcome: "resolved" | "dismissed",
  note: string | null,
): Promise<Result<null>> {
  if (!isModerator(viewer)) return { ok: false, error: "forbidden" };
  const [row] = await db
    .update(resourceReports)
    .set({ status: outcome, resolvedBy: viewer.id, resolvedAt: new Date(), resolutionNote: note })
    .where(and(eq(resourceReports.id, reportId), eq(resourceReports.status, "open")))
    .returning({ id: resourceReports.id, resourceId: resourceReports.resourceId });
  if (!row) return { ok: false, error: "notFound" };
  await writeAudit(db, {
    actorId: viewer.id,
    action: `report.${outcome}`,
    entityType: "resource_report",
    entityId: reportId,
    metadata: { resourceId: row.resourceId },
  });
  return { ok: true, value: null };
}
