// Shared academic resources (outlines, notes, study guides) with version history and moderation.
//
// A resource belongs to a course and, optionally, to one course offering (year + term). Whether it
// is "current" or "historical" is derived from the offering, never stored, so a new offering
// automatically moves older material to the historical view without changing it.
import { sql } from "drizzle-orm";
import { boolean, check, index, integer, pgTable, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { courseOfferings, courses } from "./catalog";

export const resourceKinds = ["outline", "notes", "study_guide", "other"] as const;
export type ResourceKind = (typeof resourceKinds)[number];

// pending: awaiting moderator review · published: visible to members · hidden: taken down by a
// moderator, can be restored · removed: withdrawn; file kept for the record, never shown to students.
export const resourceStatuses = ["pending", "published", "hidden", "removed"] as const;
export type ResourceStatus = (typeof resourceStatuses)[number];

export const reportReasons = ["incorrect", "inappropriate", "copyright", "duplicate", "other"] as const;
export type ReportReason = (typeof reportReasons)[number];

export const reportStatuses = ["open", "resolved", "dismissed"] as const;
export type ReportStatus = (typeof reportStatuses)[number];

export const resources = pgTable(
  "resources",
  {
    id: uuid().primaryKey().defaultRandom(),
    courseId: uuid()
      .notNull()
      .references(() => courses.id, { onDelete: "restrict" }),
    offeringId: uuid().references(() => courseOfferings.id, { onDelete: "restrict" }),
    kind: text({ enum: resourceKinds }).notNull(),
    title: text().notNull(),
    description: text(),
    topic: text(),
    // Set only by moderators after checking the document comes from the instructor/faculty.
    isOfficial: boolean().notNull().default(false),
    visibility: text({ enum: ["shared", "private"] }).notNull().default("shared"),
    status: text({ enum: resourceStatuses }).notNull().default("pending"),
    createdBy: text().references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index().on(t.courseId, t.status), index().on(t.offeringId), index().on(t.createdBy),
    check("resources_visibility_valid", sql`${t.visibility} in ('shared', 'private')`)],
);

// Versions are append-only: uploading a new file never overwrites an old one.
export const resourceVersions = pgTable(
  "resource_versions",
  {
    id: uuid().primaryKey().defaultRandom(),
    resourceId: uuid()
      .notNull()
      .references(() => resources.id, { onDelete: "cascade" }),
    versionNumber: integer().notNull(),
    storageKey: text().notNull().unique(),
    fileName: text().notNull(),
    mimeType: text().notNull(),
    sizeBytes: integer().notNull(),
    sha256: text().notNull(),
    changeNote: text(),
    // The uploader confirmed they have the right to share this file.
    rightsConfirmed: boolean().notNull(),
    uploadedBy: text().references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique().on(t.resourceId, t.versionNumber),
    index().on(t.sha256),
    check("resource_versions_rights_confirmed", sql`${t.rightsConfirmed} = true`),
    check("resource_versions_size_positive", sql`${t.sizeBytes} > 0`),
  ],
);

export const resourceReports = pgTable(
  "resource_reports",
  {
    id: uuid().primaryKey().defaultRandom(),
    resourceId: uuid()
      .notNull()
      .references(() => resources.id, { onDelete: "cascade" }),
    reporterId: text().references(() => user.id, { onDelete: "set null" }),
    reason: text({ enum: reportReasons }).notNull(),
    details: text(),
    status: text({ enum: reportStatuses }).notNull().default("open"),
    resolvedBy: text().references(() => user.id, { onDelete: "set null" }),
    resolvedAt: timestamp({ withTimezone: true }),
    resolutionNote: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index().on(t.status),
    // One open report per person per resource (prevents report spam).
    uniqueIndex("resource_reports_one_open_per_reporter")
      .on(t.resourceId, t.reporterId)
      .where(sql`${t.status} = 'open'`),
  ],
);
