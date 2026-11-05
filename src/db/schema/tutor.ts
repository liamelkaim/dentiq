// AI tutor usage ledger. One row per question that was actually handed to a provider, so a per-student daily limit
// can be enforced in the service BEFORE any provider is called. While no provider exists nothing is ever written here.
// Rows hold counts only (never the question text or the retrieved passages), so this table holds no study content.
// `usageDate` is a plain calendar date in the app's time zone (CALENDAR_TIME_ZONE), so "per day" is the student's day.
import { sql } from "drizzle-orm";
import { bigint, check, date, index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
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
    // Tokens and cost (in millionths of a currency unit) for the daily caps: an estimate when reserved, the provider's
    // own figures once it answers. Counts only, never text.
    inputTokens: integer().notNull().default(0),
    outputTokens: integer().notNull().default(0),
    costMicros: bigint({ mode: "number" }).notNull().default(0),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index().on(t.userId, t.usageDate),
    check("tutor_usage_counts_non_negative", sql`${t.contextChars} >= 0 and ${t.passageCount} >= 0`),
  ],
);

// What the student agreed to before any of their content could leave the app. One row per student; `version` is the
// version of the consent text they accepted. A newer text means asking again. Deleting the row withdraws consent.
export const tutorConsents = pgTable("tutor_consents", {
  userId: text()
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  version: integer().notNull(),
  acceptedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  // Language of the wording the student actually saw ("fr" or "en"), so the proof of consent is complete.
  locale: text().notNull().default("fr"),
});

// Conversations are written only when a provider actually answered. They are the student's own and private: listed,
// exported and deleted by the student; deleted with the account.
export const tutorConversations = pgTable(
  "tutor_conversations",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    courseId: uuid().references(() => courses.id, { onDelete: "set null" }),
    title: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.userId, t.updatedAt)],
);

export type TutorCitation = { passageId: string; title: string; href: string; origin: string };

export const tutorMessages = pgTable(
  "tutor_messages",
  {
    id: uuid().primaryKey().defaultRandom(),
    conversationId: uuid()
      .notNull()
      .references(() => tutorConversations.id, { onDelete: "cascade" }),
    role: text({ enum: ["user", "assistant"] }).notNull(),
    body: text().notNull(),
    citations: jsonb().$type<TutorCitation[]>().notNull().default([]),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.conversationId, t.createdAt)],
);
