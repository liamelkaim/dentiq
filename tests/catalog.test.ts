// Uses obviously fake course codes ("TEST ...") — never real catalog data.
import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase, type Database } from "@/db/client";
import { auditLog, courses, professors, user } from "@/db/schema";
import {
  addOffering,
  createCourse,
  createProgram,
  getCourseByCode,
  importCourses,
  listCourses,
  listCourseYears,
} from "@/server/catalog/service";
import {
  courseInputSchema,
  normalizeCourseCode,
  offeringInputSchema,
  parseCourseCsv,
  sourceInputSchema,
  type CourseInput,
} from "@/server/catalog/validation";

const noSource = { sourceName: null, sourceUrl: null, sourceRetrievedOn: null };

function course(overrides: Partial<CourseInput> = {}): CourseInput {
  return courseInputSchema.parse({ code: "TEST 1001", titleFr: "Cours fictif", ...overrides });
}

let db: Database;
const adminId = "admin-1";

beforeEach(async () => {
  db = await createTestDatabase();
  await db.insert(user).values({ id: adminId, name: "Admin", email: "admin@example.com", role: "admin", approvalStatus: "approved" });
});

describe("validation", () => {
  it("normalizes course codes", () => {
    expect(normalizeCourseCode("  test   1001 ")).toBe("TEST 1001");
  });

  it("turns blank optional fields into null and accepts French term names", () => {
    const parsed = courseInputSchema.parse({
      code: "test 1001",
      titleFr: "  Cours fictif ",
      titleEn: "",
      credits: "3",
      yearOfStudy: "",
      typicalTerm: "Hiver",
    });
    expect(parsed).toMatchObject({
      code: "TEST 1001",
      titleFr: "Cours fictif",
      titleEn: null,
      credits: "3",
      yearOfStudy: null,
      typicalTerm: "winter",
    });
  });

  it("rejects invalid codes, missing titles and out-of-range values", () => {
    expect(courseInputSchema.safeParse({ code: "<script>", titleFr: "x" }).success).toBe(false);
    expect(courseInputSchema.safeParse({ code: "TEST 1", titleFr: "" }).success).toBe(false);
    expect(courseInputSchema.safeParse({ code: "TEST 1", titleFr: "x", yearOfStudy: "12" }).success).toBe(false);
    expect(courseInputSchema.safeParse({ code: "TEST 1", titleFr: "x", credits: "-1" }).success).toBe(false);
  });

  it("only accepts http(s) source links and ISO dates", () => {
    expect(sourceInputSchema.safeParse({ sourceUrl: "javascript:alert(1)" }).success).toBe(false);
    expect(sourceInputSchema.safeParse({ sourceRetrievedOn: "28/10/2026" }).success).toBe(false);
    expect(sourceInputSchema.parse({ sourceUrl: "https://example.com", sourceRetrievedOn: "2026-10-28" })).toMatchObject({
      sourceUrl: "https://example.com",
      sourceRetrievedOn: "2026-10-28",
    });
  });

  it("validates academic years and splits professor names", () => {
    expect(offeringInputSchema.safeParse({ courseId: crypto.randomUUID(), academicYear: "2026-2028", term: "fall", professorNames: "" }).success).toBe(false);
    const parsed = offeringInputSchema.parse({
      courseId: crypto.randomUUID(),
      academicYear: "2026-2027",
      term: "automne",
      professorNames: "Prof A;  Prof   B ; Prof A",
    });
    expect(parsed.term).toBe("fall");
    expect(parsed.professorNames).toEqual(["Prof A", "Prof B"]);
  });
});

describe("CSV parsing", () => {
  it("parses valid rows and reports invalid ones with their line numbers", () => {
    const csv = [
      "﻿code,title_fr,title_en,credits,year_of_study,term",
      "test 1001,Cours un,Course one,3,1,automne",
      ",Sans code,,,,",
      "TEST 1002,Cours deux,,,2,",
      "TEST 1001,Doublon,,,,",
    ].join("\n");
    const { rows, errors } = parseCourseCsv(csv);
    expect(rows.map((r) => r.code)).toEqual(["TEST 1001", "TEST 1002"]);
    expect(rows[0]).toMatchObject({ titleEn: "Course one", credits: "3", yearOfStudy: 1, typicalTerm: "fall" });
    expect(errors).toEqual([
      { line: 3, message: "code:invalidCode" },
      { line: 5, message: "duplicateInFile:TEST 1001" },
    ]);
  });

  it("refuses files without the required columns", () => {
    const { rows, errors } = parseCourseCsv("name,title\nfoo,bar");
    expect(rows).toEqual([]);
    expect(errors[0]?.message).toBe("missingColumns:code,title_fr");
  });
});

describe("catalog service", () => {
  it("creates a course with an audit entry and rejects duplicate codes", async () => {
    const created = await createCourse(db, adminId, course(), noSource);
    expect(created.ok).toBe(true);

    const duplicate = await createCourse(db, adminId, course({ titleFr: "Autre" }), noSource);
    expect(duplicate).toEqual({ ok: false, error: "duplicateCode" });

    const audit = await db.select().from(auditLog);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actorId: adminId, action: "course.create", entityType: "course" });
  });

  it("searches by code and title (case-insensitive) and filters by year and term", async () => {
    await createCourse(db, adminId, course({ code: "TEST 1001", titleFr: "Anatomie fictive", yearOfStudy: 1, typicalTerm: "fall" }), noSource);
    await createCourse(db, adminId, course({ code: "TEST 2001", titleFr: "Histologie fictive", titleEn: "Fake histology", yearOfStudy: 2, typicalTerm: "winter" }), noSource);

    expect((await listCourses(db, { q: "anatomie" })).map((c) => c.code)).toEqual(["TEST 1001"]);
    expect((await listCourses(db, { q: "2001" })).map((c) => c.code)).toEqual(["TEST 2001"]);
    expect((await listCourses(db, { q: "histology" })).map((c) => c.code)).toEqual(["TEST 2001"]);
    expect((await listCourses(db, { year: 2 })).map((c) => c.code)).toEqual(["TEST 2001"]);
    expect((await listCourses(db, { term: "fall" })).map((c) => c.code)).toEqual(["TEST 1001"]);
    // LIKE wildcards in the search box are treated as plain characters.
    expect(await listCourses(db, { q: "%" })).toEqual([]);
    expect(await listCourseYears(db)).toEqual([1, 2]);
  });

  it("hides archived courses", async () => {
    await createCourse(db, adminId, course(), noSource);
    await db.update(courses).set({ archivedAt: new Date() });
    expect(await listCourses(db)).toEqual([]);
  });

  it("imports new courses, updates existing ones, and records the source", async () => {
    await createCourse(db, adminId, course({ code: "TEST 1001", titleFr: "Ancien titre" }), noSource);
    const program = await createProgram(
      db,
      adminId,
      { slug: "test-program", nameFr: "Programme fictif", nameEn: null, institution: "Établissement fictif" },
      noSource,
    );
    if (!program.ok) throw new Error(program.error);

    const source = { sourceName: "Fichier de test", sourceUrl: null, sourceRetrievedOn: "2026-10-28" };
    const result = await importCourses(
      db,
      adminId,
      [course({ code: "TEST 1001", titleFr: "Nouveau titre" }), course({ code: "TEST 1002", titleFr: "Cours deux" })],
      source,
      program.value.id,
    );
    expect(result).toEqual({ created: 1, updated: 1 });

    const updated = await getCourseByCode(db, "TEST 1001");
    expect(updated).toMatchObject({ titleFr: "Nouveau titre", sourceName: "Fichier de test", sourceRetrievedOn: "2026-10-28" });
    expect(updated?.program?.slug).toBe("test-program");

    const [importAudit] = await db.select().from(auditLog).where(eq(auditLog.action, "course.import"));
    expect(importAudit?.metadata).toMatchObject({ created: 1, updated: 1 });
  });

  it("keeps each offering's instructors separate and reuses professor records", async () => {
    const created = await createCourse(db, adminId, course(), noSource);
    if (!created.ok) throw new Error(created.error);
    const courseId = created.value.id;

    await addOffering(db, adminId, { courseId, academicYear: "2025-2026", term: "fall", professorNames: ["Prof A"] }, noSource);
    await addOffering(db, adminId, { courseId, academicYear: "2026-2027", term: "fall", professorNames: ["Prof B", "Prof A"] }, noSource);

    const duplicate = await addOffering(db, adminId, { courseId, academicYear: "2026-2027", term: "fall", professorNames: [] }, noSource);
    expect(duplicate).toEqual({ ok: false, error: "duplicateOffering" });

    const detail = await getCourseByCode(db, "TEST 1001");
    expect(detail?.offerings.map((o) => [o.academicYear, o.instructors.map((i) => i.fullName)])).toEqual([
      ["2026-2027", ["Prof A", "Prof B"]],
      ["2025-2026", ["Prof A"]],
    ]);
    expect(await db.select().from(professors)).toHaveLength(2);
  });

  it("enforces constraints in the database itself, not only in validation", async () => {
    await expect(
      db.execute(sql`insert into courses (code, title_fr, year_of_study) values ('TEST 9', 'x', 42)`),
    ).rejects.toThrow();
    const created = await createCourse(db, adminId, course(), noSource);
    if (!created.ok) throw new Error(created.error);
    await expect(
      db.execute(sql`insert into course_offerings (course_id, academic_year, term) values (${created.value.id}, '26-27', 'fall')`),
    ).rejects.toThrow();
  });
});
