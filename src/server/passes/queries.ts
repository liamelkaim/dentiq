// Read helpers for the Passes screens (filter choices, course picker, dashboard summary).
// The permission rules stay in service.ts; these only reuse listQuestions so they can never show more.
import { and, asc, eq, isNotNull, isNull } from "drizzle-orm";
import type { Database } from "@/db/client";
import { courseOfferings, courses, examQuestions, offeringInstructors, professors } from "@/db/schema";
import { canAccessLibrary, type Viewer } from "@/server/resources/service";
import { listQuestions } from "./service";

/** Active courses for pickers and the global Passes filter. */
export async function listCourseChoices(db: Database) {
  return db
    .select({ id: courses.id, code: courses.code, titleFr: courses.titleFr, titleEn: courses.titleEn })
    .from(courses)
    .where(isNull(courses.archivedAt))
    .orderBy(asc(courses.code));
}

/** Professors who taught an offering of the course (for the submission form). Nothing is invented. */
export async function courseProfessors(db: Database, courseId: string) {
  const rows = await db
    .select({ id: professors.id, name: professors.fullName })
    .from(offeringInstructors)
    .innerJoin(courseOfferings, eq(offeringInstructors.offeringId, courseOfferings.id))
    .innerJoin(professors, eq(offeringInstructors.professorId, professors.id))
    .where(eq(courseOfferings.courseId, courseId));
  const unique = new Map(rows.map((r) => [r.id, r.name]));
  return [...unique].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * What the filters can offer: exam years and topics that exist in published questions (of one course when given),
 * and, for a course, the professors who taught an offering of it or are named on a question.
 */
export async function passFilterOptions(db: Database, courseId?: string) {
  const published = and(eq(examQuestions.status, "published"), courseId ? eq(examQuestions.courseId, courseId) : undefined);
  const [yearRows, topicRows, taught, named] = await Promise.all([
    db.selectDistinct({ v: examQuestions.examAcademicYear }).from(examQuestions).where(published),
    db.selectDistinct({ v: examQuestions.topic }).from(examQuestions).where(and(published, isNotNull(examQuestions.topic))),
    courseId ? courseProfessors(db, courseId) : Promise.resolve([]),
    courseId
      ? db
          .select({ id: professors.id, name: professors.fullName })
          .from(examQuestions)
          .innerJoin(professors, eq(examQuestions.professorId, professors.id))
          .where(and(eq(examQuestions.courseId, courseId), isNotNull(examQuestions.professorId)))
      : Promise.resolve([]),
  ]);
  const people = new Map<string, string>();
  for (const p of [...taught, ...named]) people.set(p.id, p.name);
  return {
    years: yearRows.map((r) => r.v).sort().reverse(),
    topics: topicRows.map((r) => r.v!).sort((a, b) => a.localeCompare(b)),
    professors: [...people].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/** Numbers and the latest questions for the dashboard. Respects the viewer's permissions via listQuestions. */
export async function passesSummary(db: Database, viewer: Viewer) {
  if (!canAccessLibrary(viewer)) return null;
  const [all, current, verified, recent] = await Promise.all([
    listQuestions(db, viewer, { limit: 1 }),
    listQuestions(db, viewer, { limit: 1, category: "current" }),
    listQuestions(db, viewer, { limit: 1, answerStatus: "verified" }),
    listQuestions(db, viewer, { limit: 4 }),
  ]);
  return { total: all.total, current: current.total, verified: verified.total, recent: recent.items };
}
