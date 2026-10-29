// Academic catalog. Every imported or entered record can carry its source and retrieval date.
//
// A course is the stable thing ("DMD 1234"). A course offering is one teaching of it in a given
// academic year and term, with its own instructors. Later features (notes, passes, AI tutor
// context) attach to offerings, so a new professor never silently inherits old material.
import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

export const terms = ["fall", "winter", "summer"] as const;
export type Term = (typeof terms)[number];

export const instructorRoles = ["coordinator", "instructor"] as const;
export type InstructorRole = (typeof instructorRoles)[number];

const sourceColumns = {
  sourceName: text(),
  sourceUrl: text(),
  sourceRetrievedOn: date({ mode: "string" }),
};

const timestamps = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const programs = pgTable("programs", {
  id: uuid().primaryKey().defaultRandom(),
  slug: text().notNull().unique(),
  nameFr: text().notNull(),
  nameEn: text(),
  institution: text().notNull(),
  ...sourceColumns,
  ...timestamps,
});

export const courses = pgTable(
  "courses",
  {
    id: uuid().primaryKey().defaultRandom(),
    programId: uuid().references(() => programs.id, { onDelete: "set null" }),
    // Stored normalized: uppercase, single spaces (see normalizeCourseCode).
    code: text().notNull().unique(),
    titleFr: text().notNull(),
    titleEn: text(),
    descriptionFr: text(),
    descriptionEn: text(),
    // Nullable on purpose: we never guess credits or placement.
    credits: numeric({ precision: 4, scale: 1 }),
    yearOfStudy: integer(),
    typicalTerm: text({ enum: terms }),
    archivedAt: timestamp({ withTimezone: true }),
    ...sourceColumns,
    ...timestamps,
  },
  (t) => [
    index().on(t.programId),
    check("courses_year_of_study_range", sql`${t.yearOfStudy} between 1 and 8`),
    check("courses_credits_range", sql`${t.credits} >= 0`),
  ],
);

export const professors = pgTable("professors", {
  id: uuid().primaryKey().defaultRandom(),
  fullName: text().notNull().unique(),
  ...sourceColumns,
  ...timestamps,
});

export const courseOfferings = pgTable(
  "course_offerings",
  {
    id: uuid().primaryKey().defaultRandom(),
    courseId: uuid()
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    // Format "2026-2027".
    academicYear: text().notNull(),
    term: text({ enum: terms }).notNull(),
    ...sourceColumns,
    ...timestamps,
  },
  (t) => [
    unique().on(t.courseId, t.academicYear, t.term),
    check("course_offerings_academic_year_format", sql`${t.academicYear} ~ '^[0-9]{4}-[0-9]{4}$'`),
  ],
);

export const offeringInstructors = pgTable(
  "offering_instructors",
  {
    offeringId: uuid()
      .notNull()
      .references(() => courseOfferings.id, { onDelete: "cascade" }),
    professorId: uuid()
      .notNull()
      .references(() => professors.id, { onDelete: "restrict" }),
    role: text({ enum: instructorRoles }).notNull().default("instructor"),
  },
  (t) => [primaryKey({ columns: [t.offeringId, t.professorId] })],
);
