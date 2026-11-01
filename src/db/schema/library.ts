// Course library: shared per-course topics, private typed notes with version history, and the link tables
// that connect topics, documents (resources), notes and published exam questions.
//
// Design rules (see docs/library-topics.md):
// - A topic belongs to ONE course and is managed only by moderators and admins. Topics are archived, never
//   deleted, so old links keep working. The free-text `topic` columns on resources and exam questions stay as
//   they are ("legacy topic") and are never rewritten.
// - A note is private to its owner (no sharing exists). Every save appends a row to course_note_versions.
// - Link tables hold only the relationship. WHO may see a link is decided when it is read: a link is shown only
//   when the viewer may see both sides (src/server/library/links.ts). Same-course rules are enforced by the
//   service when a link is written.
import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, primaryKey, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { courseOfferings, courses } from "./catalog";
import { examQuestions } from "./passes";
import { resources } from "./resources";

export const courseTopics = pgTable(
  "course_topics",
  {
    id: uuid().primaryKey().defaultRandom(),
    courseId: uuid()
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    // French is the source language (like the catalog); English is optional and never auto-translated.
    name: text().notNull(),
    nameEn: text(),
    sortOrder: integer().notNull().default(0),
    archivedAt: timestamp({ withTimezone: true }),
    createdBy: text().references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index().on(t.courseId, t.sortOrder),
    // Same name twice in one course (ignoring case) would make the pickers ambiguous.
    uniqueIndex("course_topics_course_name_unique").on(t.courseId, sql`lower(${t.name})`),
    check("course_topics_name_not_blank", sql`length(btrim(${t.name})) > 0`),
  ],
);

export const courseNotes = pgTable(
  "course_notes",
  {
    id: uuid().primaryKey().defaultRandom(),
    courseId: uuid()
      .notNull()
      .references(() => courses.id, { onDelete: "restrict" }),
    // The offering the note is about, when the student chooses one. "Current" or "previous" is derived from it.
    offeringId: uuid().references(() => courseOfferings.id, { onDelete: "restrict" }),
    // Private to the owner. Deleting the account deletes the notes.
    ownerId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text().notNull(),
    body: text().notNull().default(""),
    currentVersion: integer().notNull().default(1),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index().on(t.ownerId, t.courseId),
    index().on(t.offeringId),
    check("course_notes_title_not_blank", sql`length(btrim(${t.title})) > 0`),
  ],
);

// Append-only: every save (and every restore) adds a row. Nothing here is ever updated.
export const courseNoteVersions = pgTable(
  "course_note_versions",
  {
    id: uuid().primaryKey().defaultRandom(),
    noteId: uuid()
      .notNull()
      .references(() => courseNotes.id, { onDelete: "cascade" }),
    versionNumber: integer().notNull(),
    title: text().notNull(),
    body: text().notNull(),
    changeNote: text(),
    // Set when this version was created by restoring an older one.
    restoredFromVersion: integer(),
    createdBy: text().references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.noteId, t.versionNumber), check("course_note_versions_number_positive", sql`${t.versionNumber} >= 1`)],
);

// ---------- Topic links ----------

const linkMeta = {
  createdBy: text().references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
};

export const resourceTopics = pgTable(
  "resource_topics",
  {
    resourceId: uuid()
      .notNull()
      .references(() => resources.id, { onDelete: "cascade" }),
    topicId: uuid()
      .notNull()
      .references(() => courseTopics.id, { onDelete: "cascade" }),
    ...linkMeta,
  },
  (t) => [primaryKey({ columns: [t.resourceId, t.topicId] }), index().on(t.topicId)],
);

export const noteTopics = pgTable(
  "note_topics",
  {
    noteId: uuid()
      .notNull()
      .references(() => courseNotes.id, { onDelete: "cascade" }),
    topicId: uuid()
      .notNull()
      .references(() => courseTopics.id, { onDelete: "cascade" }),
    ...linkMeta,
  },
  (t) => [primaryKey({ columns: [t.noteId, t.topicId] }), index().on(t.topicId)],
);

export const questionTopics = pgTable(
  "question_topics",
  {
    questionId: uuid()
      .notNull()
      .references(() => examQuestions.id, { onDelete: "cascade" }),
    topicId: uuid()
      .notNull()
      .references(() => courseTopics.id, { onDelete: "cascade" }),
    ...linkMeta,
  },
  (t) => [primaryKey({ columns: [t.questionId, t.topicId] }), index().on(t.topicId)],
);

// ---------- Links to specific exam questions ----------

export const resourceQuestionLinks = pgTable(
  "resource_question_links",
  {
    resourceId: uuid()
      .notNull()
      .references(() => resources.id, { onDelete: "cascade" }),
    questionId: uuid()
      .notNull()
      .references(() => examQuestions.id, { onDelete: "cascade" }),
    ...linkMeta,
  },
  (t) => [primaryKey({ columns: [t.resourceId, t.questionId] }), index().on(t.questionId)],
);

export const noteQuestionLinks = pgTable(
  "note_question_links",
  {
    noteId: uuid()
      .notNull()
      .references(() => courseNotes.id, { onDelete: "cascade" }),
    questionId: uuid()
      .notNull()
      .references(() => examQuestions.id, { onDelete: "cascade" }),
    ...linkMeta,
  },
  (t) => [primaryKey({ columns: [t.noteId, t.questionId] }), index().on(t.questionId)],
);
