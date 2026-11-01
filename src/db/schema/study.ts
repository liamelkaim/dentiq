// Study tools: private, per-student material. Every table here belongs to exactly one user (`userId`) and every
// query in src/server/study/service.ts filters on it, so one student can never read another's attempts, marks,
// cards or quizzes (tested in tests/study-tools.test.ts). Nothing here is shared or moderated.
//
// Honesty rules enforced by the database itself:
//  - A question attempt can be "correct / incorrect / partial" only when it was scored against a VERIFIED answer
//    (`answer_basis = 'verified'`). Against a student's proposal or no answer it is stored as "unscored".
//  - Spaced-repetition boxes stay inside the documented range (see src/server/study/schedule.ts).
import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgTable, primaryKey, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { courses } from "./catalog";
import { examQuestions } from "./passes";

export const attemptModes = ["practice", "quiz"] as const;
export type AttemptMode = (typeof attemptModes)[number];

// correct / incorrect / partial: scored against a verified answer. unscored: no verified answer to score against.
export const attemptOutcomes = ["correct", "incorrect", "partial", "unscored"] as const;
export type AttemptOutcome = (typeof attemptOutcomes)[number];

// What the answer looked like when the student answered: verified by a moderator, only a student's proposal, or nothing.
export const answerBases = ["verified", "proposed", "none"] as const;
export type AnswerBasis = (typeof answerBases)[number];

// Open questions: the student rates themselves after seeing the answer.
export const selfRatings = ["got_it", "partly", "missed"] as const;
export type SelfRating = (typeof selfRatings)[number];

export const cardRatings = ["again", "hard", "good", "easy"] as const;
export type CardRating = (typeof cardRatings)[number];

/** One answered question (practice or quiz). Append-only history. */
export const studyAttempts = pgTable(
  "study_attempts",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    questionId: uuid()
      .notNull()
      .references(() => examQuestions.id, { onDelete: "cascade" }),
    mode: text({ enum: attemptModes }).notNull(),
    outcome: text({ enum: attemptOutcomes }).notNull(),
    answerBasis: text({ enum: answerBases }).notNull(),
    // What the student answered: { selected: [positions] } | { verdicts: { "1": true, ... } } | { text: "..." }
    response: jsonb().$type<Record<string, unknown>>().notNull(),
    selfRating: text({ enum: selfRatings }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index().on(t.userId, t.createdAt),
    index().on(t.userId, t.questionId),
    // Never "correct" or "incorrect" against anything but a verified answer.
    check("study_attempts_scored_needs_verified", sql`${t.outcome} = 'unscored' or ${t.answerBasis} = 'verified'`),
  ],
);

/** Flag and "review later" marks, one row per student and question. */
export const studyQuestionMarks = pgTable(
  "study_question_marks",
  {
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    questionId: uuid()
      .notNull()
      .references(() => examQuestions.id, { onDelete: "cascade" }),
    flagged: boolean().notNull().default(false),
    reviewLater: boolean().notNull().default(false),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [primaryKey({ columns: [t.userId, t.questionId] })],
);

/** A card the student wrote themselves. Private; has its own schedule. */
export const studyPersonalCards = pgTable(
  "study_personal_cards",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    courseId: uuid().references(() => courses.id, { onDelete: "set null" }),
    front: text().notNull(),
    back: text().notNull(),
    // Spaced repetition state (documented in src/server/study/schedule.ts).
    box: integer().notNull().default(0),
    dueAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    lastReviewedAt: timestamp({ withTimezone: true }),
    reviewCount: integer().notNull().default(0),
    lapseCount: integer().notNull().default(0),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index().on(t.userId, t.dueAt),
    check("study_personal_cards_box_range", sql`${t.box} between 0 and 5`),
    check("study_personal_cards_text_present", sql`length(trim(${t.front})) > 0 and length(trim(${t.back})) > 0`),
  ],
);

/**
 * Schedule of a card GENERATED from a published question (the card itself is never stored: it is built from the
 * question each time). A row appears the first time the student reviews that card; no row means "new".
 */
export const studyQuestionCards = pgTable(
  "study_question_cards",
  {
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    questionId: uuid()
      .notNull()
      .references(() => examQuestions.id, { onDelete: "cascade" }),
    box: integer().notNull().default(0),
    dueAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    lastReviewedAt: timestamp({ withTimezone: true }),
    reviewCount: integer().notNull().default(0),
    lapseCount: integer().notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.questionId] }), index().on(t.userId, t.dueAt), check("study_question_cards_box_range", sql`${t.box} between 0 and 5`)],
);

/** Append-only log of card reviews (for honest counts; the schedule itself lives on the card rows). */
export const studyCardReviews = pgTable(
  "study_card_reviews",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    questionId: uuid().references(() => examQuestions.id, { onDelete: "cascade" }),
    personalCardId: uuid().references(() => studyPersonalCards.id, { onDelete: "cascade" }),
    rating: text({ enum: cardRatings }).notNull(),
    boxBefore: integer().notNull(),
    boxAfter: integer().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index().on(t.userId, t.createdAt),
    // Exactly one of the two card kinds.
    check("study_card_reviews_one_kind", sql`(${t.questionId} is null) <> (${t.personalCardId} is null)`),
  ],
);

/** A quiz the student built from a scope. Scores are computed from the items, never stored. */
export const studyQuizzes = pgTable(
  "study_quizzes",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    courseId: uuid().references(() => courses.id, { onDelete: "set null" }),
    // The filters used to build it (course, topic, year, type...), kept for display.
    scope: jsonb().$type<Record<string, unknown>>().notNull(),
    requestedCount: integer().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    // Set when every item has been answered.
    completedAt: timestamp({ withTimezone: true }),
  },
  (t) => [index().on(t.userId, t.createdAt), check("study_quizzes_count_positive", sql`${t.requestedCount} >= 1`)],
);

export const studyQuizItems = pgTable(
  "study_quiz_items",
  {
    id: uuid().primaryKey().defaultRandom(),
    quizId: uuid()
      .notNull()
      .references(() => studyQuizzes.id, { onDelete: "cascade" }),
    position: integer().notNull(),
    questionId: uuid()
      .notNull()
      .references(() => examQuestions.id, { onDelete: "cascade" }),
    // Null until answered.
    response: jsonb().$type<Record<string, unknown>>(),
    // Null until answered, and for an open question against a verified answer until the student rates themselves.
    outcome: text({ enum: attemptOutcomes }),
    answerBasis: text({ enum: answerBases }),
    selfRating: text({ enum: selfRatings }),
    answeredAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    unique().on(t.quizId, t.position),
    unique().on(t.quizId, t.questionId),
    check("study_quiz_items_scored_needs_verified", sql`${t.outcome} is null or ${t.outcome} = 'unscored' or ${t.answerBasis} = 'verified'`),
  ],
);
