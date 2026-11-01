// Links between topics, documents, notes and published exam questions, and the read side that shows them.
//
// Writing: only someone who may EDIT the document or note (or the question, for topics) can link it, topics
// must belong to the same course (and not be archived), and a question link must point to a PUBLISHED question
// of the same course that the editor may see.
//
// Reading: a link is shown only when the viewer may see BOTH sides. Everything below is built from the
// conditions in visibility.ts, so a student never learns about another student's private note, a pending
// question, or a document they cannot open, whatever page asks.
import { and, asc, desc, eq, inArray, notInArray, or, sql, type SQL } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { z } from "zod";
import type { Database } from "@/db/client";
import {
  courseNotes,
  courseOfferings,
  courseTopics,
  examQuestions,
  noteQuestionLinks,
  noteTopics,
  questionTopics,
  resourceQuestionLinks,
  resources,
  resourceTopics,
} from "@/db/schema";
import { writeAudit, type DbExecutor } from "@/server/audit";
import { passCategory } from "@/server/passes/academic-year";
import { canEditQuestion, canSeeQuestion } from "@/server/passes/service";
import { canAccessLibrary, canEditResource, canSeeResource, latestOfferingByCourse, periodOf, type Viewer } from "@/server/resources/service";
import { QUESTION_LINKS_PER_ITEM_MAX, TOPIC_PAGE_LIMIT, TOPICS_PER_ITEM_MAX } from "./constants";
import { escapeLike } from "./like";
import { getTopic, libFail, type LibraryResult } from "./topics";
import { visibleNotes, visibleQuestions, visibleResources } from "./visibility";

export type LinkKind = "resource" | "note";
export type TopicTarget = "resource" | "note" | "question";

// ---------- Validating what a link may point to ----------

/**
 * The topic ids if every one belongs to the course and is usable, else null. A topic that is already linked
 * (`keep`) may stay even if it was archived since; new links can only use active topics.
 */
export async function checkTopicIds(db: DbExecutor, courseId: string, topicIds: string[], keep: Set<string> = new Set()): Promise<string[] | null> {
  const ids = [...new Set(topicIds)];
  if (ids.length > TOPICS_PER_ITEM_MAX) return null;
  if (ids.length === 0) return ids;
  const rows = await db
    .select({ id: courseTopics.id, archivedAt: courseTopics.archivedAt })
    .from(courseTopics)
    .where(and(inArray(courseTopics.id, ids), eq(courseTopics.courseId, courseId)));
  if (rows.length !== ids.length) return null;
  return rows.every((r) => r.archivedAt === null || keep.has(r.id)) ? ids : null;
}

/** The question ids if every one is a published question of the course the viewer may see, else null. */
export async function checkQuestionIds(db: DbExecutor, viewer: Viewer, courseId: string, questionIds: string[]): Promise<string[] | null> {
  const ids = [...new Set(questionIds)];
  if (ids.length > QUESTION_LINKS_PER_ITEM_MAX) return null;
  if (ids.length === 0) return ids;
  const rows = await db
    .select({ id: examQuestions.id, status: examQuestions.status, contributedBy: examQuestions.contributedBy })
    .from(examQuestions)
    .where(and(inArray(examQuestions.id, ids), eq(examQuestions.courseId, courseId), eq(examQuestions.status, "published")));
  if (rows.length !== ids.length) return null;
  return rows.every((r) => canSeeQuestion(viewer, r)) ? ids : null;
}

// ---------- Writing links ----------

type LinkTable = {
  table: PgTable;
  owner: PgColumn;
  other: PgColumn;
  /** One row of this table, built with its own property names. */
  row: (ownerId: string, otherId: string, by: string) => Record<string, string>;
};

/** Make the set of `other` ids for one owner exactly `wanted` (inserting what is missing, removing what is not wanted). */
async function replaceLinks(tx: DbExecutor, t: LinkTable, ownerId: string, wanted: string[], actorId: string) {
  await tx.delete(t.table).where(and(eq(t.owner, ownerId), wanted.length ? notInArray(t.other, wanted) : undefined));
  if (wanted.length === 0) return;
  const values = wanted.map((id) => t.row(ownerId, id, actorId));
  await tx.insert(t.table).values(values as never).onConflictDoNothing();
}

const topicLinkTables: Record<TopicTarget, LinkTable> = {
  resource: { table: resourceTopics, owner: resourceTopics.resourceId, other: resourceTopics.topicId, row: (o, t, by) => ({ resourceId: o, topicId: t, createdBy: by }) },
  note: { table: noteTopics, owner: noteTopics.noteId, other: noteTopics.topicId, row: (o, t, by) => ({ noteId: o, topicId: t, createdBy: by }) },
  question: { table: questionTopics, owner: questionTopics.questionId, other: questionTopics.topicId, row: (o, t, by) => ({ questionId: o, topicId: t, createdBy: by }) },
};

/** What the viewer may edit, and which course it is in. Not found and not allowed look the same to the caller. */
async function editableTarget(db: Database, viewer: Viewer, target: TopicTarget, id: string): Promise<{ courseId: string } | null> {
  if (!canAccessLibrary(viewer) || !z.uuid().safeParse(id).success) return null;
  if (target === "resource") {
    const [r] = await db.select().from(resources).where(eq(resources.id, id));
    return r && canSeeResource(viewer, r) && canEditResource(viewer, r) ? { courseId: r.courseId } : null;
  }
  if (target === "note") {
    const [n] = await db.select({ courseId: courseNotes.courseId, ownerId: courseNotes.ownerId }).from(courseNotes).where(eq(courseNotes.id, id));
    return n && n.ownerId === viewer.id ? { courseId: n.courseId } : null;
  }
  const [q] = await db.select({ courseId: examQuestions.courseId, status: examQuestions.status, contributedBy: examQuestions.contributedBy }).from(examQuestions).where(eq(examQuestions.id, id));
  return q && canSeeQuestion(viewer, q) && canEditQuestion(viewer, q) ? { courseId: q.courseId } : null;
}

/** Replace the topics of a document, note or question. The editor of the item (or a moderator) only. */
export async function setItemTopics(db: Database, viewer: Viewer, target: TopicTarget, id: string, topicIds: string[]): Promise<LibraryResult<null>> {
  const found = await editableTarget(db, viewer, target, id);
  if (!found) return libFail("notFound");
  const t = topicLinkTables[target];
  return db.transaction(async (tx) => {
    const existing = await tx.select({ topicId: t.other }).from(t.table).where(eq(t.owner, id));
    const ids = await checkTopicIds(tx, found.courseId, topicIds, new Set(existing.map((e) => e.topicId as string)));
    if (!ids) return libFail("invalidTopics");
    await replaceLinks(tx, t, id, ids, viewer.id);
    await writeAudit(tx, { actorId: viewer.id, action: `${target}.topics.set`, entityType: target, entityId: id, metadata: { topicIds: ids } });
    return { ok: true as const, value: null };
  });
}

const questionLinkTables: Record<LinkKind, LinkTable> = {
  resource: { table: resourceQuestionLinks, owner: resourceQuestionLinks.resourceId, other: resourceQuestionLinks.questionId, row: (o, q, by) => ({ resourceId: o, questionId: q, createdBy: by }) },
  note: { table: noteQuestionLinks, owner: noteQuestionLinks.noteId, other: noteQuestionLinks.questionId, row: (o, q, by) => ({ noteId: o, questionId: q, createdBy: by }) },
};

/** Link a document or note to one published question of the same course. */
export async function addQuestionLink(db: Database, viewer: Viewer, kind: LinkKind, id: string, questionId: string): Promise<LibraryResult<null>> {
  const found = await editableTarget(db, viewer, kind, id);
  if (!found) return libFail("notFound");
  const t = questionLinkTables[kind];
  return db.transaction(async (tx) => {
    const existing = await tx.select({ questionId: t.other }).from(t.table).where(eq(t.owner, id));
    if (existing.some((e) => e.questionId === questionId)) return { ok: true as const, value: null };
    if (existing.length >= QUESTION_LINKS_PER_ITEM_MAX) return libFail("tooManyLinks");
    const ids = await checkQuestionIds(tx, viewer, found.courseId, [questionId]);
    if (!ids) return libFail("invalidQuestion");
    await replaceLinks(tx, t, id, [...existing.map((e) => e.questionId as string), questionId], viewer.id);
    await writeAudit(tx, { actorId: viewer.id, action: `${kind}.question.link`, entityType: kind, entityId: id, metadata: { questionId } });
    return { ok: true as const, value: null };
  });
}

export async function removeQuestionLink(db: Database, viewer: Viewer, kind: LinkKind, id: string, questionId: string): Promise<LibraryResult<null>> {
  const found = await editableTarget(db, viewer, kind, id);
  if (!found) return libFail("notFound");
  const t = questionLinkTables[kind];
  await db.delete(t.table).where(and(eq(t.owner, id), eq(t.other, questionId)));
  await writeAudit(db, { actorId: viewer.id, action: `${kind}.question.unlink`, entityType: kind, entityId: id, metadata: { questionId } });
  return { ok: true, value: null };
}

/** Published questions of a course for the "link a question" picker, most recent first. */
export async function listLinkableQuestions(db: Database, viewer: Viewer, courseId: string, limit: number) {
  if (!canAccessLibrary(viewer)) return [];
  return db
    .select({ id: examQuestions.id, questionText: examQuestions.questionText, examAcademicYear: examQuestions.examAcademicYear })
    .from(examQuestions)
    .where(and(eq(examQuestions.courseId, courseId), visibleQuestions(), sql`${examQuestions.duplicateOfId} is null`))
    .orderBy(desc(examQuestions.examAcademicYear), desc(examQuestions.createdAt))
    .limit(limit);
}

// ---------- Reading: related items ----------

type Period = "current" | "historical" | "general";

const resourceColumns = {
  id: resources.id,
  title: resources.title,
  kind: resources.kind,
  topic: resources.topic,
  isOfficial: resources.isOfficial,
  visibility: resources.visibility,
  status: resources.status,
  courseId: resources.courseId,
  offeringId: resources.offeringId,
  academicYear: courseOfferings.academicYear,
  term: courseOfferings.term,
};
const noteColumns = {
  id: courseNotes.id,
  title: courseNotes.title,
  courseId: courseNotes.courseId,
  offeringId: courseNotes.offeringId,
  academicYear: courseOfferings.academicYear,
  term: courseOfferings.term,
};
const questionColumns = {
  id: examQuestions.id,
  courseId: examQuestions.courseId,
  questionText: examQuestions.questionText,
  examAcademicYear: examQuestions.examAcademicYear,
  examTerm: examQuestions.examTerm,
  answerStatus: examQuestions.answerStatus,
  topic: examQuestions.topic,
};

export type RelatedTopic = { id: string; name: string; nameEn: string | null; archived: boolean };
export type RelatedResource = Awaited<ReturnType<typeof relatedResourceRows>>[number];
export type RelatedNote = Awaited<ReturnType<typeof relatedNoteRows>>[number];
export type RelatedQuestion = Awaited<ReturnType<typeof relatedQuestionRows>>[number];

async function withPeriods<T extends { courseId: string; offeringId: string | null }>(db: Database, rows: T[]) {
  const latest = await latestOfferingByCourse(db, [...new Set(rows.map((r) => r.courseId))]);
  return rows.map((r) => ({ ...r, period: periodOf(r.offeringId, latest.get(r.courseId)) as Period }));
}

async function relatedResourceRows(db: Database, viewer: Viewer, where: SQL) {
  const rows = await db
    .select(resourceColumns)
    .from(resources)
    .leftJoin(courseOfferings, eq(resources.offeringId, courseOfferings.id))
    .where(and(where, visibleResources(viewer)))
    .orderBy(desc(resources.isOfficial), desc(resources.updatedAt))
    .limit(TOPIC_PAGE_LIMIT);
  return withPeriods(db, rows);
}

async function relatedNoteRows(db: Database, viewer: Viewer, where: SQL) {
  const rows = await db
    .select(noteColumns)
    .from(courseNotes)
    .leftJoin(courseOfferings, eq(courseNotes.offeringId, courseOfferings.id))
    .where(and(where, visibleNotes(viewer)))
    .orderBy(desc(courseNotes.updatedAt))
    .limit(TOPIC_PAGE_LIMIT);
  return withPeriods(db, rows);
}

async function relatedQuestionRows(db: Database, where: SQL) {
  const rows = await db
    .select(questionColumns)
    .from(examQuestions)
    .where(and(where, visibleQuestions(), sql`${examQuestions.duplicateOfId} is null`))
    .orderBy(desc(examQuestions.examAcademicYear), desc(examQuestions.createdAt))
    .limit(TOPIC_PAGE_LIMIT);
  return rows.map((r) => ({ ...r, category: passCategory(r.examAcademicYear) }));
}

async function topicsOf(db: Database, t: LinkTable, id: string): Promise<RelatedTopic[]> {
  const rows = await db
    .select({ id: courseTopics.id, name: courseTopics.name, nameEn: courseTopics.nameEn, archivedAt: courseTopics.archivedAt })
    .from(t.table)
    .innerJoin(courseTopics, eq(courseTopics.id, t.other))
    .where(eq(t.owner, id))
    .orderBy(asc(courseTopics.sortOrder), asc(courseTopics.name));
  return rows.map(({ archivedAt, ...r }) => ({ ...r, archived: archivedAt !== null }));
}

/** Topics and published questions linked to a document the viewer can open. Null when they cannot open it. */
export async function relatedForResource(db: Database, viewer: Viewer, resourceId: string) {
  if (!canAccessLibrary(viewer) || !z.uuid().safeParse(resourceId).success) return null;
  const [r] = await db.select().from(resources).where(eq(resources.id, resourceId));
  if (!r || !canSeeResource(viewer, r)) return null;
  const linked = db.select({ id: resourceQuestionLinks.questionId }).from(resourceQuestionLinks).where(eq(resourceQuestionLinks.resourceId, resourceId));
  const [topics, questions] = await Promise.all([topicsOf(db, topicLinkTables.resource, resourceId), relatedQuestionRows(db, inArray(examQuestions.id, linked))]);
  return { courseId: r.courseId, legacyTopic: r.topic, topics, questions };
}

/** Same for a note. Only its owner gets anything: a note's links are as private as the note. */
export async function relatedForNote(db: Database, viewer: Viewer, noteId: string) {
  if (!canAccessLibrary(viewer) || !z.uuid().safeParse(noteId).success) return null;
  const [n] = await db.select({ courseId: courseNotes.courseId, ownerId: courseNotes.ownerId }).from(courseNotes).where(eq(courseNotes.id, noteId));
  if (!n || n.ownerId !== viewer.id) return null;
  const linked = db.select({ id: noteQuestionLinks.questionId }).from(noteQuestionLinks).where(eq(noteQuestionLinks.noteId, noteId));
  const [topics, questions] = await Promise.all([topicsOf(db, topicLinkTables.note, noteId), relatedQuestionRows(db, inArray(examQuestions.id, linked))]);
  return { courseId: n.courseId, legacyTopic: null as string | null, topics, questions };
}

/**
 * Topics, documents and notes linked to a question the viewer can open. Documents are limited to what the viewer
 * may see; notes to the viewer's own. Anyone else's private material is not counted, named or hinted at.
 */
export async function relatedForQuestion(db: Database, viewer: Viewer, questionId: string) {
  if (!canAccessLibrary(viewer) || !z.uuid().safeParse(questionId).success) return null;
  const [q] = await db
    .select({ courseId: examQuestions.courseId, status: examQuestions.status, contributedBy: examQuestions.contributedBy, topic: examQuestions.topic })
    .from(examQuestions)
    .where(eq(examQuestions.id, questionId));
  if (!q || !canSeeQuestion(viewer, q)) return null;
  const linkedResources = db.select({ id: resourceQuestionLinks.resourceId }).from(resourceQuestionLinks).where(eq(resourceQuestionLinks.questionId, questionId));
  const linkedNotes = db.select({ id: noteQuestionLinks.noteId }).from(noteQuestionLinks).where(eq(noteQuestionLinks.questionId, questionId));
  const [topics, documents, notes] = await Promise.all([
    topicsOf(db, topicLinkTables.question, questionId),
    relatedResourceRows(db, viewer, inArray(resources.id, linkedResources)),
    relatedNoteRows(db, viewer, inArray(courseNotes.id, linkedNotes)),
  ]);
  return { courseId: q.courseId, legacyTopic: q.topic, topics, documents, notes };
}

// ---------- Reading: the topic page ----------

/**
 * Everything the viewer may see for one topic: documents, their own notes, published questions. Items are included
 * when linked to the topic, or (for documents and questions that predate topics) when their free-text topic equals
 * the topic's name; those are flagged `legacy` so the page can say how they got there.
 */
export async function getTopicPage(db: Database, viewer: Viewer, topicId: string) {
  const topic = await getTopic(db, viewer, topicId);
  if (!topic) return null;
  const names = [topic.name, topic.nameEn].filter((n): n is string => Boolean(n));
  const legacyMatch = (column: PgColumn) => or(...names.map((n) => sql`${column} ilike ${escapeLike(n)}`))!;

  const linkedResourceIds = db.select({ id: resourceTopics.resourceId }).from(resourceTopics).where(eq(resourceTopics.topicId, topicId));
  const linkedNoteIds = db.select({ id: noteTopics.noteId }).from(noteTopics).where(eq(noteTopics.topicId, topicId));
  const linkedQuestionIds = db.select({ id: questionTopics.questionId }).from(questionTopics).where(eq(questionTopics.topicId, topicId));

  const [documents, notes, questions, linkedDocs, linkedQs] = await Promise.all([
    relatedResourceRows(db, viewer, and(eq(resources.courseId, topic.courseId), or(inArray(resources.id, linkedResourceIds), legacyMatch(resources.topic)))!),
    relatedNoteRows(db, viewer, and(eq(courseNotes.courseId, topic.courseId), inArray(courseNotes.id, linkedNoteIds))!),
    relatedQuestionRows(db, and(eq(examQuestions.courseId, topic.courseId), or(inArray(examQuestions.id, linkedQuestionIds), legacyMatch(examQuestions.topic)))!),
    db.select({ id: resourceTopics.resourceId }).from(resourceTopics).where(eq(resourceTopics.topicId, topicId)),
    db.select({ id: questionTopics.questionId }).from(questionTopics).where(eq(questionTopics.topicId, topicId)),
  ]);
  const docSet = new Set(linkedDocs.map((r) => r.id));
  const qSet = new Set(linkedQs.map((r) => r.id));
  return {
    topic,
    documents: documents.map((d) => ({ ...d, legacy: !docSet.has(d.id) })),
    notes,
    questions: questions.map((q) => ({ ...q, legacy: !qSet.has(q.id) })),
  };
}

/** Topic ids of a document, note or question (for pre-ticking the picker). Same access rule as editing. */
export async function selectedTopicIds(db: Database, target: TopicTarget, id: string): Promise<string[]> {
  const t = topicLinkTables[target];
  const rows = await db.select({ topicId: t.other }).from(t.table).where(eq(t.owner, id));
  return rows.map((r) => r.topicId as string);
}
