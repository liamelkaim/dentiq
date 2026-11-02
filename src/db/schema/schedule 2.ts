// Academic terms and periods (from the program data files, each with its source and status) and what a student
// enters about their own schedule: followed courses and weekly class blocks. Student rows are private (userId) and
// deleted with the account (cascade).
import { sql } from "drizzle-orm";
import { check, date, index, integer, pgTable, primaryKey, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { courses, terms } from "./catalog";

export const periodKindValues = ["reading_week", "break", "holiday", "exam_period"] as const;
export const dataStatuses = ["verified", "unverified"] as const;

export const academicTerms = pgTable(
  "academic_terms",
  {
    id: uuid().primaryKey().defaultRandom(),
    /** Matches a university preset key (e.g. "udem"). */
    institution: text().notNull(),
    academicYear: text().notNull(),
    term: text({ enum: terms }).notNull(),
    startDate: date({ mode: "string" }).notNull(),
    endDate: date({ mode: "string" }).notNull(),
    status: text({ enum: dataStatuses }).notNull().default("unverified"),
    sourceUrl: text(),
    sourceRetrievedOn: date({ mode: "string" }),
  },
  (t) => [unique().on(t.institution, t.academicYear, t.term), check("academic_terms_order", sql`${t.startDate} <= ${t.endDate}`)],
);

export const academicPeriods = pgTable(
  "academic_periods",
  {
    id: uuid().primaryKey().defaultRandom(),
    termId: uuid()
      .notNull()
      .references(() => academicTerms.id, { onDelete: "cascade" }),
    kind: text({ enum: periodKindValues }).notNull(),
    nameFr: text().notNull(),
    nameEn: text(),
    startDate: date({ mode: "string" }).notNull(),
    endDate: date({ mode: "string" }).notNull(),
    status: text({ enum: dataStatuses }).notNull().default("unverified"),
    sourceUrl: text(),
    sourceRetrievedOn: date({ mode: "string" }),
  },
  (t) => [index().on(t.termId), check("academic_periods_order", sql`${t.startDate} <= ${t.endDate}`)],
);

export const userCourses = pgTable(
  "user_courses",
  {
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    courseId: uuid()
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.courseId] })],
);

export const userClassBlocks = pgTable(
  "user_class_blocks",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    courseId: uuid().references(() => courses.id, { onDelete: "set null" }),
    title: text().notNull(),
    /** Monday = 1 ... Sunday = 7. */
    weekday: integer().notNull(),
    startTime: text().notNull(),
    endTime: text().notNull(),
    location: text(),
    validFrom: date({ mode: "string" }).notNull(),
    validTo: date({ mode: "string" }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index().on(t.userId),
    check("user_class_blocks_weekday", sql`${t.weekday} between 1 and 7`),
    check("user_class_blocks_times", sql`${t.startTime} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and ${t.endTime} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and ${t.startTime} < ${t.endTime}`),
    check("user_class_blocks_dates", sql`${t.validFrom} <= ${t.validTo}`),
    check("user_class_blocks_title", sql`length(btrim(${t.title})) > 0`),
  ],
);
