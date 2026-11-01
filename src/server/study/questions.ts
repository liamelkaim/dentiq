// Which published questions a student may study, and how they are loaded. This is the ONLY door the study tools
// use to read exam questions, and it reuses the exam-pass rules instead of copying them:
//  - the candidate list comes from listQuestions(..., { publishedOnly: true }) (approved members only; duplicates grouped
//    under their original are left out);
//  - every loaded row is checked again with canSeeQuestion AND must have status "published", so a pending, rejected
//    or hidden question can never reach practice, a quiz, a flashcard or an export;
//  - a verified answer is exposed only when the question's answer status is "verified" (otherwise verifiedCorrect is
//    null, exactly like getQuestion does).
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { Database } from "@/db/client";
import { courses, examQuestionChoices, examQuestionImages, examQuestions, studyQuestionMarks } from "@/db/schema";
import { describeQuestionType, getQuestionType, type AnswerRule } from "@/server/passes/question-types";
import { canSeeQuestion, listQuestions } from "@/server/passes/service";
import { canAccessLibrary, type Viewer } from "@/server/resources/service";
import type { CardQuestion } from "./cards";
import { STUDY_POOL_MAX } from "./constants";
import type { StudyScope } from "./scope";

/** A database or an open transaction (a transaction must not call the outer `db`: local Postgres has one connection). */
export type StudyExecutor = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];

export type StudyQuestion = CardQuestion & {
  id: string;
  courseId: string;
  questionType: string;
  rule: AnswerRule;
  images: { id: string; altText: string | null }[];
};

/** Everything a browser may receive BEFORE the student answers: no answer marks, no explanation. */
export type PublicQuestion = {
  id: string;
  courseCode: string;
  examAcademicYear: string;
  examTerm: string | null;
  topic: string | null;
  questionType: string;
  rule: AnswerRule;
  questionText: string;
  /** "verified" or "proposed" is shown as a badge; it does not reveal the answer. */
  answerStatus: "proposed" | "verified";
  choices: { position: number; text: string }[];
  images: { id: string; altText: string | null }[];
};

export function toPublicQuestion(q: StudyQuestion): PublicQuestion {
  return {
    id: q.id,
    courseCode: q.courseCode,
    examAcademicYear: q.examAcademicYear,
    examTerm: q.examTerm,
    topic: q.topic,
    questionType: q.questionType,
    rule: q.rule,
    questionText: q.questionText,
    answerStatus: q.answerStatus,
    choices: q.choices.map((c) => ({ position: c.position, text: c.text })),
    images: q.images,
  };
}

/**
 * Ids of the published questions in a scope that the viewer may study, newest exam year first.
 * Question types removed from the code are left out (they can only be shown read-only elsewhere).
 */
export async function studyPool(db: Database, viewer: Viewer, scope: StudyScope, options: { now?: Date } = {}): Promise<string[]> {
  if (!canAccessLibrary(viewer)) return [];
  const ids: string[] = [];
  let offset = 0;
  while (ids.length < STUDY_POOL_MAX) {
    const page = await listQuestions(db, viewer, {
      publishedOnly: true,
      courseId: scope.course,
      topic: scope.topic,
      examAcademicYear: scope.year,
      questionType: scope.type,
      category: scope.period,
      limit: 200,
      offset,
      now: options.now,
    });
    for (const item of page.items) if (getQuestionType(item.questionType)) ids.push(item.id);
    offset += page.items.length;
    if (page.items.length === 0 || offset >= page.total) break;
  }
  const pool = ids.slice(0, STUDY_POOL_MAX);
  if (!scope.mark || pool.length === 0) return pool;

  const marks = await db
    .select({ questionId: studyQuestionMarks.questionId })
    .from(studyQuestionMarks)
    .where(
      and(
        eq(studyQuestionMarks.userId, viewer.id),
        scope.mark === "flagged" ? eq(studyQuestionMarks.flagged, true) : eq(studyQuestionMarks.reviewLater, true),
        inArray(studyQuestionMarks.questionId, pool),
      ),
    );
  const marked = new Set(marks.map((m) => m.questionId));
  return pool.filter((id) => marked.has(id));
}

/** Loads questions by id for studying, in the order given. Anything the viewer may not study is silently left out. */
export async function loadStudyQuestions(db: StudyExecutor, viewer: Viewer, ids: readonly string[]): Promise<StudyQuestion[]> {
  if (!canAccessLibrary(viewer) || ids.length === 0) return [];
  const unique = [...new Set(ids)];
  const rows = await db
    .select({ q: examQuestions, courseCode: courses.code })
    .from(examQuestions)
    .innerJoin(courses, eq(examQuestions.courseId, courses.id))
    .where(and(inArray(examQuestions.id, unique), eq(examQuestions.status, "published")));
  const allowed = rows.filter((r) => canSeeQuestion(viewer, r.q) && r.q.status === "published" && getQuestionType(r.q.questionType));
  if (allowed.length === 0) return [];

  const allowedIds = allowed.map((r) => r.q.id);
  const [choiceRows, imageRows] = await Promise.all([
    db.select().from(examQuestionChoices).where(inArray(examQuestionChoices.questionId, allowedIds)).orderBy(asc(examQuestionChoices.position)),
    db
      .select({ id: examQuestionImages.id, questionId: examQuestionImages.questionId, altText: examQuestionImages.altText })
      .from(examQuestionImages)
      .where(and(inArray(examQuestionImages.questionId, allowedIds), isNull(examQuestionImages.removedAt)))
      .orderBy(asc(examQuestionImages.position)),
  ]);

  const byId = new Map<string, StudyQuestion>();
  for (const { q, courseCode } of allowed) {
    const verified = q.answerStatus === "verified";
    byId.set(q.id, {
      id: q.id,
      courseId: q.courseId,
      courseCode,
      examAcademicYear: q.examAcademicYear,
      examTerm: q.examTerm,
      topic: q.topic,
      questionType: q.questionType,
      rule: describeQuestionType(q.questionType).answer,
      questionText: q.questionText,
      explanation: q.explanation,
      provenance: q.provenance,
      answerStatus: q.answerStatus,
      proposedAnswerText: q.proposedAnswerText,
      verifiedAnswerText: verified ? q.verifiedAnswerText : null,
      choices: choiceRows
        .filter((c) => c.questionId === q.id)
        .map((c) => ({ position: c.position, text: c.text, proposedCorrect: c.proposedCorrect, verifiedCorrect: verified ? c.verifiedCorrect : null })),
      images: imageRows.filter((i) => i.questionId === q.id).map((i) => ({ id: i.id, altText: i.altText })),
    });
  }
  return unique.map((id) => byId.get(id)).filter((q): q is StudyQuestion => q !== undefined);
}
