// Shared per-course topic list. Only moderators and admins manage it; every approved member picks from it.
// Topics are archived, never deleted. Rules: docs/library-topics.md.
import { and, asc, count, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import { courseNotes, courses, courseTopics, examQuestions, noteTopics, questionTopics, resources, resourceTopics } from "@/db/schema";
import { writeAudit } from "@/server/audit";
import { canAccessLibrary, isModerator, type Viewer } from "@/server/resources/service";
import { TOPIC_NAME_MAX, TOPICS_PER_COURSE_MAX } from "./constants";
import { visibleNotes, visibleQuestions, visibleResources } from "./visibility";

export type LibraryResult<T> = { ok: true; value: T } | { ok: false; error: string };
export const libFail = (error: string) => ({ ok: false as const, error });

const blankToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
const tidy = (v: string) => v.replace(/\s+/g, " ");

export const topicInputSchema = z.object({
  name: z.string().trim().min(1, { message: "required" }).max(TOPIC_NAME_MAX).transform(tidy),
  nameEn: z
    .preprocess(blankToNull, z.string().trim().max(TOPIC_NAME_MAX).nullish())
    .transform((v) => (v ? tidy(v) : null)),
});
export type TopicInput = z.output<typeof topicInputSchema>;

/** Name for the active language; French is the source language, so it is the fallback. */
export function topicLabel(topic: { name: string; nameEn: string | null }, locale: string): string {
  return locale === "en" && topic.nameEn ? topic.nameEn : topic.name;
}

const isUniqueViolation = (error: unknown) => {
  const e = error as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
};

/** Topics of a course in display order. Archived ones only when a moderator asks for them. */
export async function listCourseTopics(db: Database, viewer: Viewer, courseId: string, options: { includeArchived?: boolean } = {}) {
  if (!canAccessLibrary(viewer)) return [];
  const includeArchived = Boolean(options.includeArchived) && isModerator(viewer);
  const rows = await db
    .select({
      id: courseTopics.id,
      courseId: courseTopics.courseId,
      name: courseTopics.name,
      nameEn: courseTopics.nameEn,
      sortOrder: courseTopics.sortOrder,
      archivedAt: courseTopics.archivedAt,
    })
    .from(courseTopics)
    .where(and(eq(courseTopics.courseId, courseId), includeArchived ? undefined : isNull(courseTopics.archivedAt)))
    .orderBy(asc(courseTopics.sortOrder), asc(courseTopics.createdAt), asc(courseTopics.id));
  return rows.map((r) => ({ ...r, archived: r.archivedAt !== null }));
}

export type TopicRow = Awaited<ReturnType<typeof listCourseTopics>>[number];

/** One topic (archived ones included: old links and URLs keep working). Null without library access. */
export async function getTopic(db: Database, viewer: Viewer, topicId: string) {
  if (!canAccessLibrary(viewer) || !z.uuid().safeParse(topicId).success) return null;
  const [row] = await db
    .select({
      id: courseTopics.id,
      courseId: courseTopics.courseId,
      name: courseTopics.name,
      nameEn: courseTopics.nameEn,
      archivedAt: courseTopics.archivedAt,
      courseCode: courses.code,
      courseTitleFr: courses.titleFr,
      courseTitleEn: courses.titleEn,
    })
    .from(courseTopics)
    .innerJoin(courses, eq(courseTopics.courseId, courses.id))
    .where(eq(courseTopics.id, topicId));
  return row ? { ...row, archived: row.archivedAt !== null } : null;
}

/** How many items each topic of a course has FOR THIS VIEWER (their own private notes only, published questions only). */
export async function topicItemCounts(db: Database, viewer: Viewer, courseId: string) {
  const counts = new Map<string, { documents: number; notes: number; questions: number }>();
  if (!canAccessLibrary(viewer)) return counts;
  const entry = (id: string) => {
    let e = counts.get(id);
    if (!e) counts.set(id, (e = { documents: 0, notes: 0, questions: 0 }));
    return e;
  };
  const [docs, notes, questions] = await Promise.all([
    db
      .select({ topicId: resourceTopics.topicId, n: count() })
      .from(resourceTopics)
      .innerJoin(resources, eq(resourceTopics.resourceId, resources.id))
      .innerJoin(courseTopics, eq(resourceTopics.topicId, courseTopics.id))
      .where(and(eq(courseTopics.courseId, courseId), visibleResources(viewer)))
      .groupBy(resourceTopics.topicId),
    db
      .select({ topicId: noteTopics.topicId, n: count() })
      .from(noteTopics)
      .innerJoin(courseNotes, eq(noteTopics.noteId, courseNotes.id))
      .innerJoin(courseTopics, eq(noteTopics.topicId, courseTopics.id))
      .where(and(eq(courseTopics.courseId, courseId), visibleNotes(viewer)))
      .groupBy(noteTopics.topicId),
    db
      .select({ topicId: questionTopics.topicId, n: count() })
      .from(questionTopics)
      .innerJoin(examQuestions, eq(questionTopics.questionId, examQuestions.id))
      .innerJoin(courseTopics, eq(questionTopics.topicId, courseTopics.id))
      .where(and(eq(courseTopics.courseId, courseId), visibleQuestions(), isNull(examQuestions.duplicateOfId)))
      .groupBy(questionTopics.topicId),
  ]);
  for (const r of docs) entry(r.topicId).documents = Number(r.n);
  for (const r of notes) entry(r.topicId).notes = Number(r.n);
  for (const r of questions) entry(r.topicId).questions = Number(r.n);
  return counts;
}

// ---------- Managing topics (moderators and admins) ----------

export async function createTopic(db: Database, viewer: Viewer, courseId: string, input: TopicInput): Promise<LibraryResult<{ id: string }>> {
  if (!isModerator(viewer)) return libFail("forbidden");
  const [course] = await db.select({ id: courses.id }).from(courses).where(and(eq(courses.id, courseId), isNull(courses.archivedAt)));
  if (!course) return libFail("notFound");
  try {
    return await db.transaction(async (tx) => {
      const [{ n, next } = { n: 0, next: 0 }] = await tx
        .select({ n: count(), next: sql<number>`coalesce(max(${courseTopics.sortOrder}), -1) + 1` })
        .from(courseTopics)
        .where(eq(courseTopics.courseId, courseId));
      if (Number(n) >= TOPICS_PER_COURSE_MAX) return libFail("tooManyTopics");
      const [row] = await tx
        .insert(courseTopics)
        .values({ courseId, name: input.name, nameEn: input.nameEn, sortOrder: Number(next), createdBy: viewer.id })
        .returning({ id: courseTopics.id });
      await writeAudit(tx, { actorId: viewer.id, action: "topic.create", entityType: "course_topic", entityId: row!.id, metadata: { courseId, name: input.name } });
      return { ok: true as const, value: { id: row!.id } };
    });
  } catch (error) {
    if (isUniqueViolation(error)) return libFail("duplicateTopic");
    throw error;
  }
}

export async function renameTopic(db: Database, viewer: Viewer, topicId: string, input: TopicInput): Promise<LibraryResult<null>> {
  if (!isModerator(viewer)) return libFail("forbidden");
  try {
    const [before] = await db.select({ name: courseTopics.name, nameEn: courseTopics.nameEn }).from(courseTopics).where(eq(courseTopics.id, topicId));
    if (!before) return libFail("notFound");
    await db.update(courseTopics).set({ name: input.name, nameEn: input.nameEn }).where(eq(courseTopics.id, topicId));
    await writeAudit(db, { actorId: viewer.id, action: "topic.rename", entityType: "course_topic", entityId: topicId, metadata: { before, after: input } });
    return { ok: true, value: null };
  } catch (error) {
    if (isUniqueViolation(error)) return libFail("duplicateTopic");
    throw error;
  }
}

/** Archived topics leave the pickers; existing links and the topic page stay. Restoring puts it back. */
export async function setTopicArchived(db: Database, viewer: Viewer, topicId: string, archived: boolean): Promise<LibraryResult<null>> {
  if (!isModerator(viewer)) return libFail("forbidden");
  const [row] = await db
    .update(courseTopics)
    .set({ archivedAt: archived ? new Date() : null })
    .where(eq(courseTopics.id, topicId))
    .returning({ id: courseTopics.id });
  if (!row) return libFail("notFound");
  await writeAudit(db, { actorId: viewer.id, action: archived ? "topic.archive" : "topic.restore", entityType: "course_topic", entityId: topicId });
  return { ok: true, value: null };
}

/**
 * Move a topic one place up or down. The whole course list is renumbered 0..n-1 first, so ties and gaps in
 * `sort_order` can never make a move do nothing or jump two places.
 */
export async function moveTopic(db: Database, viewer: Viewer, topicId: string, direction: "up" | "down"): Promise<LibraryResult<null>> {
  if (!isModerator(viewer)) return libFail("forbidden");
  const [topic] = await db.select({ courseId: courseTopics.courseId }).from(courseTopics).where(eq(courseTopics.id, topicId));
  if (!topic) return libFail("notFound");
  await db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: courseTopics.id })
      .from(courseTopics)
      .where(eq(courseTopics.courseId, topic.courseId))
      .orderBy(asc(courseTopics.sortOrder), asc(courseTopics.createdAt), asc(courseTopics.id));
    const ids = rows.map((r) => r.id);
    const at = ids.indexOf(topicId);
    const to = direction === "up" ? at - 1 : at + 1;
    if (to >= 0 && to < ids.length) [ids[at], ids[to]] = [ids[to]!, ids[at]!];
    for (const [position, id] of ids.entries()) {
      await tx.update(courseTopics).set({ sortOrder: position }).where(eq(courseTopics.id, id));
    }
    await writeAudit(tx, { actorId: viewer.id, action: "topic.move", entityType: "course_topic", entityId: topicId, metadata: { direction } });
  });
  return { ok: true, value: null };
}
