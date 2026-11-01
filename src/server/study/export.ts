// CSV / TSV / Anki exports. Limited to what the student may study: published questions in the scope that
// ./questions.ts lets them see (never pending, rejected or hidden ones), plus their OWN personal cards and
// progress. Every export carries source attribution (course code, exam year, term, how the question was obtained).
//
// Honesty in the files: a verified answer is in `answer_verified`; a student's proposal is in
// `answer_proposed_unverified` and only when no verified answer exists. `answer_status` says which.
//
// Anki: the "anki" export is a plain tab-separated Front / Back / Tags file. Compatibility with the "Anki All in One"
// template (or any note type beyond Basic) is UNVERIFIED: it has not been tested in Anki.
import { and, desc, eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { courses, examQuestions, studyAttempts, studyPersonalCards } from "@/db/schema";
import { canAccessLibrary, type Viewer } from "@/server/resources/service";
import { answerStatusWord, answerSummary, cardBack, cardFront, type CardLabels } from "./cards";
import { EXPORT_MAX_ROWS } from "./constants";
import { ankiField, ankiTag, toDelimited, type Delimiter } from "./csv";
import { buildReveal } from "./grading";
import { loadStudyQuestions, studyPool } from "./questions";
import type { StudyScope } from "./scope";
import { getMarks, type StudyResult } from "./service";

export const exportKinds = ["questions", "cards", "progress", "anki"] as const;
export type ExportKind = (typeof exportKinds)[number];
export const exportFormats = ["csv", "tsv"] as const;
export type ExportFormat = (typeof exportFormats)[number];

export type ExportFile = { filename: string; contentType: string; body: string };

const day = (now: Date) => now.toISOString().slice(0, 10);
const BOM = "﻿";

function wrap(kind: string, format: ExportFormat, rows: string[][], now: Date): ExportFile {
  const delimiter: Delimiter = format === "csv" ? "," : "\t";
  return {
    filename: `dentiq-${kind}-${day(now)}.${format}`,
    contentType: format === "csv" ? "text/csv; charset=utf-8" : "text/tab-separated-values; charset=utf-8",
    // The byte-order mark lets Excel read accents in a CSV; a TSV is left plain.
    body: (format === "csv" ? BOM : "") + toDelimited(rows, delimiter),
  };
}

/** Personal cards join an export only when the scope is nothing but a course (they have no topic, year or type). */
const includesPersonal = (scope: StudyScope) => !scope.topic && !scope.year && !scope.type && !scope.period && !scope.mark;

export async function buildExport(
  db: Database,
  viewer: Viewer,
  options: { kind: ExportKind; format: ExportFormat; scope: StudyScope },
  labels: CardLabels,
  now: Date = new Date(),
): Promise<StudyResult<ExportFile>> {
  if (!canAccessLibrary(viewer)) return { ok: false, error: "noAccess" };
  const { kind, format, scope } = options;

  if (kind === "cards") {
    const rows = await db
      .select({ code: courses.code, front: studyPersonalCards.front, back: studyPersonalCards.back, createdAt: studyPersonalCards.createdAt })
      .from(studyPersonalCards)
      .leftJoin(courses, eq(studyPersonalCards.courseId, courses.id))
      .where(and(eq(studyPersonalCards.userId, viewer.id), scope.course ? eq(studyPersonalCards.courseId, scope.course) : undefined))
      .orderBy(desc(studyPersonalCards.createdAt))
      .limit(EXPORT_MAX_ROWS);
    const table = [["course_code", "front", "back", "created_on"], ...rows.map((r) => [r.code ?? "", r.front, r.back, day(r.createdAt)])];
    return { ok: true, value: wrap("personal-cards", format, table, now) };
  }

  if (kind === "progress") {
    const a = studyAttempts;
    const rows = await db
      .select({
        at: a.createdAt,
        mode: a.mode,
        code: courses.code,
        year: examQuestions.examAcademicYear,
        term: examQuestions.examTerm,
        questionId: a.questionId,
        outcome: a.outcome,
        basis: a.answerBasis,
        selfRating: a.selfRating,
      })
      .from(a)
      .innerJoin(examQuestions, eq(a.questionId, examQuestions.id))
      .innerJoin(courses, eq(examQuestions.courseId, courses.id))
      .where(and(eq(a.userId, viewer.id), eq(examQuestions.status, "published"), scope.course ? eq(examQuestions.courseId, scope.course) : undefined))
      .orderBy(desc(a.createdAt))
      .limit(EXPORT_MAX_ROWS);
    const marks = await getMarks(db, viewer, [...new Set(rows.map((r) => r.questionId))]);
    const table = [
      ["answered_at", "mode", "course_code", "exam_year", "exam_term", "question_id", "outcome", "answer_basis", "self_rating", "flagged", "review_later"],
      ...rows.map((r) => [
        r.at.toISOString(),
        r.mode,
        r.code,
        r.year,
        r.term ?? "",
        r.questionId,
        r.outcome,
        r.basis,
        r.selfRating ?? "",
        marks.get(r.questionId)?.flagged ? "yes" : "no",
        marks.get(r.questionId)?.reviewLater ? "yes" : "no",
      ]),
    ];
    return { ok: true, value: wrap("progress", format, table, now) };
  }

  // questions and anki both start from the published questions the student may study.
  const ids = (await studyPool(db, viewer, scope, { now })).slice(0, EXPORT_MAX_ROWS);
  const questions = await loadStudyQuestions(db, viewer, ids);

  if (kind === "questions") {
    const table = [
      [
        "question_id",
        "course_code",
        "exam_year",
        "exam_term",
        "source",
        "topic",
        "question_type",
        "question",
        "choices",
        "answer_status",
        "answer_verified",
        "answer_proposed_unverified",
        "explanation",
      ],
      ...questions.map((q) => {
        const basis = buildReveal(q).basis;
        return [
          q.id,
          q.courseCode,
          q.examAcademicYear,
          q.examTerm ?? "",
          q.provenance,
          q.topic ?? "",
          q.questionType,
          q.questionText,
          q.choices.map((c, i) => `${String.fromCharCode(65 + i)}. ${c.text}`).join("\n"),
          answerStatusWord(basis),
          answerSummary(q, labels, "verified") ?? "",
          answerSummary(q, labels, "proposed") ?? "",
          q.explanation ?? "",
        ];
      }),
    ];
    return { ok: true, value: wrap("questions", format, table, now) };
  }

  // anki: always tab-separated, plain Front / Back / Tags. UNVERIFIED in Anki.
  const personal = includesPersonal(scope)
    ? await db
        .select({ code: courses.code, front: studyPersonalCards.front, back: studyPersonalCards.back })
        .from(studyPersonalCards)
        .leftJoin(courses, eq(studyPersonalCards.courseId, courses.id))
        .where(and(eq(studyPersonalCards.userId, viewer.id), scope.course ? eq(studyPersonalCards.courseId, scope.course) : undefined))
        .orderBy(desc(studyPersonalCards.createdAt))
        .limit(EXPORT_MAX_ROWS)
    : [];
  const rows: string[][] = [
    ...questions.map((q) => {
      const basis = buildReveal(q).basis;
      const tags = [ankiTag(q.courseCode), q.examAcademicYear, basis === "verified" ? null : "unverified"].filter(Boolean).join(" ");
      return [ankiField(cardFront(q)), ankiField(cardBack(q, labels)), tags];
    }),
    ...personal.map((c) => [ankiField(c.front), ankiField(c.back), ["personal", c.code ? ankiTag(c.code) : null].filter(Boolean).join(" ")]),
  ];
  const header = "#separator:tab\n#html:true\n#tags column:3\n";
  return {
    ok: true,
    value: { filename: `dentiq-anki-${day(now)}.tsv`, contentType: "text/tab-separated-values; charset=utf-8", body: header + toDelimited(rows, "\t") },
  };
}
