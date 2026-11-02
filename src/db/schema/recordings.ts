// Lecture recordings (audio or video) and the student's notes on them. Private to the owner: every query in
// src/server/recordings/service.ts filters on ownerId. The file itself lives behind the storage adapter (private).
// A recording is only accepted after the owner confirms the consent checklist; the confirmation time is stored.
import { sql } from "drizzle-orm";
import { bigint, check, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { courses } from "./catalog";

export const recordings = pgTable(
  "recordings",
  {
    id: uuid().primaryKey().defaultRandom(),
    ownerId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    courseId: uuid().references(() => courses.id, { onDelete: "set null" }),
    title: text().notNull(),
    storageKey: text().notNull().unique(),
    mimeType: text().notNull(),
    fileName: text().notNull(),
    sizeBytes: bigint({ mode: "number" }).notNull(),
    /** Who allowed the recording (lecturer) and when the owner ticked the checklist. */
    lecturerName: text(),
    consentConfirmedAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.ownerId, t.createdAt), check("recordings_title_present", sql`length(btrim(${t.title})) > 0`), check("recordings_size_positive", sql`${t.sizeBytes} > 0`)],
);

export const recordingNotes = pgTable(
  "recording_notes",
  {
    id: uuid().primaryKey().defaultRandom(),
    recordingId: uuid()
      .notNull()
      .references(() => recordings.id, { onDelete: "cascade" }),
    ownerId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Position in the recording the note refers to, in seconds, or null for a general note. */
    atSeconds: integer(),
    body: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.recordingId), check("recording_notes_body_present", sql`length(btrim(${t.body})) > 0`), check("recording_notes_position", sql`${t.atSeconds} is null or ${t.atSeconds} >= 0`)],
);
