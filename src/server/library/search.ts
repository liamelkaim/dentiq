// Search across the viewer's own notes, topics, documents and published exam questions.
// Every source reuses its own permission rules, so private notes of other people never appear.
// ILIKE patterns are built with escaped wildcards (like.ts): "%" and "_" typed by a user match themselves.
import { and, asc, count, eq, ilike, isNull, or } from "drizzle-orm";
import type { Database } from "@/db/client";
import { courses, courseTopics } from "@/db/schema";
import { searchPublishedQuestions } from "@/server/passes/queries";
import { canAccessLibrary, listResources, type Viewer } from "@/server/resources/service";
import { SEARCH_QUERY_MAX, SEARCH_RESULT_LIMIT, SNIPPET_LENGTH } from "./constants";
import { containsPattern, snippet } from "./like";
import { countNotes, listNotes } from "./notes";

/** Search text as typed: trimmed and cut to the maximum length. */
export const cleanQuery = (raw: string | undefined) => (raw ?? "").trim().slice(0, SEARCH_QUERY_MAX);

export async function searchLibrary(db: Database, viewer: Viewer, input: { q: string; courseId?: string }) {
  const q = cleanQuery(input.q);
  const empty = { q, documents: { items: [], total: 0 }, notes: { items: [], total: 0 }, topics: { items: [], total: 0 }, questions: { items: [], total: 0 } };
  if (!q || !canAccessLibrary(viewer)) return empty;
  const { courseId } = input;
  const pattern = containsPattern(q);
  const topicWhere = and(
    isNull(courseTopics.archivedAt),
    courseId ? eq(courseTopics.courseId, courseId) : undefined,
    or(ilike(courseTopics.name, pattern), ilike(courseTopics.nameEn, pattern)),
  );

  const [documents, noteItems, noteTotal, topicItems, topicTotal, questions] = await Promise.all([
    listResources(db, viewer, { q, courseId, period: "all" }),
    listNotes(db, viewer, { q, courseId, limit: SEARCH_RESULT_LIMIT }),
    countNotes(db, viewer, { q, courseId }),
    db
      .select({ id: courseTopics.id, name: courseTopics.name, nameEn: courseTopics.nameEn, courseCode: courses.code })
      .from(courseTopics)
      .innerJoin(courses, eq(courseTopics.courseId, courses.id))
      .where(topicWhere)
      .orderBy(asc(courses.code), asc(courseTopics.sortOrder))
      .limit(SEARCH_RESULT_LIMIT),
    db.select({ n: count() }).from(courseTopics).where(topicWhere),
    searchPublishedQuestions(db, viewer, q, SEARCH_RESULT_LIMIT, courseId),
  ]);

  return {
    q,
    documents: { items: documents.slice(0, SEARCH_RESULT_LIMIT), total: documents.length },
    notes: { items: noteItems.map(({ body, ...n }) => ({ ...n, snippet: snippet(body, q, SNIPPET_LENGTH) })), total: noteTotal },
    topics: { items: topicItems, total: Number(topicTotal[0]?.n ?? 0) },
    questions,
  };
}
