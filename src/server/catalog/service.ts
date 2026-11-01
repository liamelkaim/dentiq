// Catalog business logic. Every function takes the database explicitly so it can be tested
// against an in-memory Postgres. Authorization happens in the calling server action.
import { and, asc, count, desc, eq, ilike, inArray, isNotNull, isNull, or, type SQL } from "drizzle-orm";
import type { Database } from "@/db/client";
import {
  courseOfferings,
  courses,
  offeringInstructors,
  professors,
  programs,
  type Term,
} from "@/db/schema";
import { writeAudit } from "@/server/audit";
import { escapeLike } from "@/server/library/like";
import type { CourseInput, OfferingInput, ProgramInput, SourceInput } from "./validation";

export type ServiceResult<T> = { ok: true; value: T } | { ok: false; error: string };

function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}

// ---------- Reading ----------

export type CourseFilters = { q?: string; year?: number; term?: Term; programId?: string };

export async function listCourses(db: Database, filters: CourseFilters = {}) {
  const conditions: SQL[] = [isNull(courses.archivedAt)];
  const q = filters.q?.trim();
  if (q) {
    const pattern = `%${escapeLike(q)}%`;
    conditions.push(
      or(ilike(courses.code, pattern), ilike(courses.titleFr, pattern), ilike(courses.titleEn, pattern))!,
    );
  }
  if (filters.year) conditions.push(eq(courses.yearOfStudy, filters.year));
  if (filters.term) conditions.push(eq(courses.typicalTerm, filters.term));
  if (filters.programId) conditions.push(eq(courses.programId, filters.programId));

  return db
    .select({
      id: courses.id,
      code: courses.code,
      titleFr: courses.titleFr,
      titleEn: courses.titleEn,
      credits: courses.credits,
      yearOfStudy: courses.yearOfStudy,
      typicalTerm: courses.typicalTerm,
    })
    .from(courses)
    .where(and(...conditions))
    .orderBy(asc(courses.yearOfStudy), asc(courses.code))
    .limit(500);
}

/** Years of study present in the catalog, for filters. Never a hard-coded list. */
export async function listCourseYears(db: Database): Promise<number[]> {
  const rows = await db
    .selectDistinct({ year: courses.yearOfStudy })
    .from(courses)
    .where(and(isNull(courses.archivedAt), isNotNull(courses.yearOfStudy)))
    .orderBy(asc(courses.yearOfStudy));
  return rows.map((r) => r.year!);
}

export async function countCourses(db: Database): Promise<number> {
  const [row] = await db.select({ n: count() }).from(courses).where(isNull(courses.archivedAt));
  return row?.n ?? 0;
}

export async function getCourseByCode(db: Database, code: string) {
  const [course] = await db
    .select({ course: courses, program: programs })
    .from(courses)
    .leftJoin(programs, eq(courses.programId, programs.id))
    .where(eq(courses.code, code));
  if (!course) return null;

  const offerings = await db
    .select()
    .from(courseOfferings)
    .where(eq(courseOfferings.courseId, course.course.id))
    .orderBy(desc(courseOfferings.academicYear), asc(courseOfferings.term));

  const instructors = offerings.length
    ? await db
        .select({
          offeringId: offeringInstructors.offeringId,
          role: offeringInstructors.role,
          fullName: professors.fullName,
        })
        .from(offeringInstructors)
        .innerJoin(professors, eq(offeringInstructors.professorId, professors.id))
        .where(inArray(offeringInstructors.offeringId, offerings.map((o) => o.id)))
        .orderBy(asc(professors.fullName))
    : [];

  return {
    ...course.course,
    program: course.program,
    offerings: offerings.map((o) => ({
      ...o,
      instructors: instructors.filter((i) => i.offeringId === o.id),
    })),
  };
}

export async function listPrograms(db: Database) {
  return db.select().from(programs).orderBy(asc(programs.nameFr));
}

// ---------- Writing ----------

export async function createProgram(
  db: Database,
  actorId: string,
  input: ProgramInput,
  source: SourceInput,
): Promise<ServiceResult<{ id: string }>> {
  try {
    const [row] = await db.insert(programs).values({ ...input, ...source }).returning({ id: programs.id });
    await writeAudit(db, { actorId, action: "program.create", entityType: "program", entityId: row!.id });
    return { ok: true, value: row! };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: "duplicateSlug" };
    throw error;
  }
}

export async function createCourse(
  db: Database,
  actorId: string,
  input: CourseInput,
  source: SourceInput,
): Promise<ServiceResult<{ id: string; code: string }>> {
  try {
    const [row] = await db
      .insert(courses)
      .values({ ...input, ...source })
      .returning({ id: courses.id, code: courses.code });
    await writeAudit(db, {
      actorId,
      action: "course.create",
      entityType: "course",
      entityId: row!.id,
      metadata: { code: row!.code },
    });
    return { ok: true, value: row! };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: "duplicateCode" };
    throw error;
  }
}

export async function updateCourse(
  db: Database,
  actorId: string,
  id: string,
  input: CourseInput,
  source: SourceInput,
): Promise<ServiceResult<{ id: string; code: string }>> {
  try {
    const [row] = await db
      .update(courses)
      .set({ ...input, ...source })
      .where(eq(courses.id, id))
      .returning({ id: courses.id, code: courses.code });
    if (!row) return { ok: false, error: "notFound" };
    await writeAudit(db, {
      actorId,
      action: "course.update",
      entityType: "course",
      entityId: row.id,
      metadata: { code: row.code },
    });
    return { ok: true, value: row };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: "duplicateCode" };
    throw error;
  }
}

/** Creates new courses and updates existing ones (matched by code) in one transaction. */
export async function importCourses(
  db: Database,
  actorId: string,
  rows: CourseInput[],
  source: SourceInput,
  programId: string | null,
): Promise<{ created: number; updated: number }> {
  if (rows.length === 0) return { created: 0, updated: 0 };

  return db.transaction(async (tx) => {
    const codes = rows.map((r) => r.code);
    const existing = new Set(
      (await tx.select({ code: courses.code }).from(courses).where(inArray(courses.code, codes))).map(
        (r) => r.code,
      ),
    );

    for (const row of rows) {
      const values = { ...row, ...source, programId: programId ?? row.programId };
      await tx.insert(courses).values(values).onConflictDoUpdate({ target: courses.code, set: values });
    }

    const result = { created: rows.length - existing.size, updated: existing.size };
    await writeAudit(tx, {
      actorId,
      action: "course.import",
      entityType: "course",
      metadata: { ...result, sourceName: source.sourceName, programId },
    });
    return result;
  });
}

export async function addOffering(
  db: Database,
  actorId: string,
  input: OfferingInput,
  source: SourceInput,
): Promise<ServiceResult<{ id: string }>> {
  try {
    return await db.transaction(async (tx) => {
      const [offering] = await tx
        .insert(courseOfferings)
        .values({ courseId: input.courseId, academicYear: input.academicYear, term: input.term, ...source })
        .returning({ id: courseOfferings.id });

      for (const fullName of input.professorNames) {
        await tx.insert(professors).values({ fullName, ...source }).onConflictDoNothing();
        const [professor] = await tx
          .select({ id: professors.id })
          .from(professors)
          .where(eq(professors.fullName, fullName));
        await tx.insert(offeringInstructors).values({ offeringId: offering!.id, professorId: professor!.id });
      }

      await writeAudit(tx, {
        actorId,
        action: "offering.create",
        entityType: "course_offering",
        entityId: offering!.id,
        metadata: { ...input },
      });
      return { ok: true as const, value: offering! };
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: "duplicateOffering" };
    throw error;
  }
}
