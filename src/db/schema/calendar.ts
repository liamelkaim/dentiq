// Study calendar: private entries the student writes themselves. Nothing is ever pre-filled, imported or shared:
// every row belongs to exactly one user (`userId`) and every query in src/server/calendar/service.ts filters on it
// (tested in tests/calendar.test.ts). Dates are plain calendar dates (no time zone); the optional time is a wall-clock
// "HH:MM". The database refuses malformed times and blank titles on its own, not only the form validation.
import { sql } from "drizzle-orm";
import { check, date, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { courses } from "./catalog";

export const calendarEntryKinds = ["exam", "assignment", "study_session", "other"] as const;
export type CalendarEntryKind = (typeof calendarEntryKinds)[number];

export const studyCalendarEntries = pgTable(
  "study_calendar_entries",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text().notNull(),
    // "YYYY-MM-DD", returned as a string so a time zone can never shift the day.
    entryDate: date({ mode: "string" }).notNull(),
    // "HH:MM" or null (all day).
    entryTime: text(),
    courseId: uuid().references(() => courses.id, { onDelete: "set null" }),
    kind: text({ enum: calendarEntryKinds }).notNull().default("other"),
    note: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index().on(t.userId, t.entryDate),
    check("study_calendar_entries_title_present", sql`length(btrim(${t.title})) > 0`),
    check("study_calendar_entries_time_format", sql`${t.entryTime} is null or ${t.entryTime} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'`),
  ],
);

// A private, read-only subscription link to the student's OWN calendar (for Apple Calendar and others). Only the SHA-256
// of the secret token is stored, so a database leak does not expose working links. The student can revoke it at any
// time; one active link per student (creating a new one revokes the old one).
export const calendarFeeds = pgTable(
  "calendar_feeds",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    tokenHash: text().notNull().unique(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp({ withTimezone: true }),
    revokedAt: timestamp({ withTimezone: true }),
  },
  (t) => [index().on(t.userId)],
);
