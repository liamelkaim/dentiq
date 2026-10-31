// Exam passes: individual past-exam questions contributed by students and reviewed by moderators.
//
// Design rules (see docs/phase-3-design.md):
// - A question keeps its REAL exam academic year, course, offering and professor (when known).
// - "Current-year" vs "previous-year" is NEVER stored. It is computed from `examAcademicYear` and today's
//   academic year (src/server/passes/academic-year.ts), so it changes by itself when a new year starts.
// - Two separate status axes: `status` (is it published?) and `answerStatus` (is the answer only a student's
//   proposal, or verified by a moderator?). A proposed answer is never shown as verified.
// - Editing never destroys history: every change is snapshotted in exam_question_revisions.
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { courseOfferings, courses, professors, terms } from "./catalog";
import { reportStatuses } from "./resources";

/**
 * sc = single choice (one correct), mc = multiple choice (one or more correct),
 * kprim = four statements, each true or false. Names follow the Anki "All in One" formats named in the
 * master prompt; compatibility of exports with that template is NOT yet verified.
 */
export const questionTypes = ["sc", "mc", "kprim"] as const;
export type QuestionType = (typeof questionTypes)[number];

// pending: awaiting review · published: visible to approved members · rejected: not accepted (reviewNote
// says why) · hidden: taken down by a moderator, can be restored.
export const questionStatuses = ["pending", "published", "rejected", "hidden"] as const;
export type QuestionStatus = (typeof questionStatuses)[number];

// proposed: only a student's suggestion · verified: confirmed by a moderator (with a note on what it rests on).
export const answerStatuses = ["proposed", "verified"] as const;
export type AnswerStatus = (typeof answerStatuses)[number];

// recalled: written from memory after sitting the exam · released: the instructor or faculty officially
// released it for study. Copying from a leaked or unauthorized exam is not allowed (rights confirmation).
export const provenances = ["recalled", "released"] as const;
export type Provenance = (typeof provenances)[number];

export const confidences = ["sure", "unsure"] as const;
export type Confidence = (typeof confidences)[number];

export const questionReportReasons = ["wrong_answer", "duplicate", "inappropriate", "leaked_or_copyrighted", "other"] as const;
export type QuestionReportReason = (typeof questionReportReasons)[number];

export const examQuestions = pgTable(
  "exam_questions",
  {
    id: uuid().primaryKey().defaultRandom(),
    courseId: uuid()
      .notNull()
      .references(() => courses.id, { onDelete: "restrict" }),
    // The offering the exam belonged to, when the contributor knows it. Professors are normally read from
    // the offering's instructors.
    offeringId: uuid().references(() => courseOfferings.id, { onDelete: "restrict" }),
    // Professor when known but the offering is not (or when an offering has several instructors).
    professorId: uuid().references(() => professors.id, { onDelete: "restrict" }),
    // Academic year of the EXAM, e.g. "2025-2026". Always required: it is what the category is derived from.
    examAcademicYear: text().notNull(),
    examTerm: text({ enum: terms }),
    topic: text(),
    questionType: text({ enum: questionTypes }).notNull(),
    questionText: text().notNull(),
    explanation: text(),
    provenance: text({ enum: provenances }).notNull().default("recalled"),
    // How sure the contributor is that the wording/answer is accurate; optional.
    confidence: text({ enum: confidences }),
    // The contributor confirmed this is not copied from a leaked or unauthorized exam or answer key.
    rightsConfirmed: boolean().notNull(),

    status: text({ enum: questionStatuses }).notNull().default("pending"),
    reviewNote: text(),
    reviewedBy: text().references(() => user.id, { onDelete: "set null" }),
    reviewedAt: timestamp({ withTimezone: true }),

    answerStatus: text({ enum: answerStatuses }).notNull().default("proposed"),
    verifiedBy: text().references(() => user.id, { onDelete: "set null" }),
    verifiedAt: timestamp({ withTimezone: true }),
    // What the verification rests on (never a leaked answer key).
    verificationNote: text(),

    // Hash of the normalized question wording + choices, to flag likely duplicates within a course.
    fingerprint: text().notNull(),
    // Set by a moderator when this question repeats another one (that one is the canonical version).
    duplicateOfId: uuid().references((): AnyPgColumn => examQuestions.id, { onDelete: "set null" }),

    contributedBy: text().references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index().on(t.courseId, t.status),
    index().on(t.courseId, t.examAcademicYear),
    index().on(t.courseId, t.fingerprint),
    index().on(t.offeringId),
    index().on(t.contributedBy),
    index().on(t.duplicateOfId),
    // "YYYY-YYYY" where the second year is exactly one more. CASE avoids casting text that isn't a year.
    check(
      "exam_questions_year_valid",
      sql`case when ${t.examAcademicYear} ~ '^[0-9]{4}-[0-9]{4}$'
            then substr(${t.examAcademicYear}, 6, 4)::int = substr(${t.examAcademicYear}, 1, 4)::int + 1
            else false end`,
    ),
    check("exam_questions_rights_confirmed", sql`${t.rightsConfirmed} = true`),
    // The date stays even if the verifier's account is later deleted (verified_by becomes null).
    check("exam_questions_verified_has_date", sql`${t.answerStatus} = 'proposed' or ${t.verifiedAt} is not null`),
    check("exam_questions_not_own_duplicate", sql`${t.duplicateOfId} is null or ${t.duplicateOfId} <> ${t.id}`),
  ],
);

// Answer choices (or, for kprim, the four statements). `proposedCorrect` is the contributor's suggestion
// (null = they don't remember); `verifiedCorrect` is set only by a moderator when verifying.
export const examQuestionChoices = pgTable(
  "exam_question_choices",
  {
    id: uuid().primaryKey().defaultRandom(),
    questionId: uuid()
      .notNull()
      .references(() => examQuestions.id, { onDelete: "cascade" }),
    position: integer().notNull(),
    text: text().notNull(),
    proposedCorrect: boolean(),
    verifiedCorrect: boolean(),
  },
  (t) => [
    unique().on(t.questionId, t.position),
    check("exam_question_choices_position_range", sql`${t.position} between 1 and 10`),
  ],
);

// Append-only history. `snapshot` holds the full content as it was after each change (wording, choices,
// proposed/verified answers, year, offering, ...), so corrections and verification changes can be audited.
export const examQuestionRevisions = pgTable(
  "exam_question_revisions",
  {
    id: uuid().primaryKey().defaultRandom(),
    questionId: uuid()
      .notNull()
      .references(() => examQuestions.id, { onDelete: "cascade" }),
    revisionNumber: integer().notNull(),
    snapshot: jsonb().$type<Record<string, unknown>>().notNull(),
    changeNote: text(),
    changedBy: text().references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.questionId, t.revisionNumber), check("exam_question_revisions_number_positive", sql`${t.revisionNumber} >= 1`)],
);

export const examQuestionReports = pgTable(
  "exam_question_reports",
  {
    id: uuid().primaryKey().defaultRandom(),
    questionId: uuid()
      .notNull()
      .references(() => examQuestions.id, { onDelete: "cascade" }),
    reporterId: text().references(() => user.id, { onDelete: "set null" }),
    reason: text({ enum: questionReportReasons }).notNull(),
    details: text(),
    status: text({ enum: reportStatuses }).notNull().default("open"),
    resolvedBy: text().references(() => user.id, { onDelete: "set null" }),
    resolvedAt: timestamp({ withTimezone: true }),
    resolutionNote: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index().on(t.status),
    // One open report per person per question (prevents report spam).
    uniqueIndex("exam_question_reports_one_open_per_reporter")
      .on(t.questionId, t.reporterId)
      .where(sql`${t.status} = 'open'`),
  ],
);
