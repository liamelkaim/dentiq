// AI tutor usage ledger. One row per question that was actually handed to a provider, so a per-student daily limit
// can be enforced in the service BEFORE any provider is called. While no provider exists nothing is ever written here.
// Rows hold counts only (never the question text or the retrieved passages), so this table holds no study content.
// `usageDate` is a plain calendar date in the app's time zone (CALENDAR_TIME_ZONE), so "per day" is the student's day.
import { sql } from "drizzle-orm";
import { check, date, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { courses } from "./catalog";

export const tutorUsage = pgTable(
  "tutor_usage",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    usageDate: date({ mode: "string" }).notNull(),
    courseId: uuid().references(() => courses.id, { onDelete: "set null" }),
    // Size of what was sent to the provider (characters of retrieved passages) and how many passages.
    contextChars: integer().notNull().default(0),
    passageCount: integer().notNull().default(0),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index().on(t.userId, t.usageDate),
    check("tutor_usage_counts_non_negative", sql`${t.contextChars} >= 0 and ${t.passageCount} >= 0`),
  ],
);
