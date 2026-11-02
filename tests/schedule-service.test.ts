// Seeding program data, the personalized schedule and .ics import. Synthetic data only (TEST codes, fake dates).
import { beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase, type Database } from "@/db/client";
import { courses, studyCalendarEntries, user } from "@/db/schema";
import { buildClassBlocksIcs } from "@/server/calendar/ics";
import { createClassBlock, deleteClassBlock, importIcs, listClassBlocks, loadScheduleWindow, setFollowedCourse } from "@/server/calendar/schedule-service";
import { seedProgram } from "@/server/catalog/program-seed";
import { saveOnboarding } from "@/server/onboarding/service";

const data = {
  program: { name_fr: "TEST Programme", name_en: null, university: "TEST University", source: { url: "https://example.test/p", retrieved: "2026-11-01" }, status: "VERIFIED" },
  terms: [
    {
      academicYear: "2030-2031", term: "fall", start: "2030-09-02", end: "2030-12-13", status: "UNVERIFIED",
      readingWeek: { start: "2030-10-14", end: "2030-10-18" }, breaks: [], examPeriods: [{ start: "2030-12-09", end: "2030-12-13" }],
    },
    { academicYear: "2031-2032", term: "fall", start: null, end: null, status: "UNVERIFIED" },
  ],
  courses: [
    { code: "test 101", title_fr: "TEST Cours un", programYear: 1, semester: 1, status: "VERIFIED" },
    { code: "TEST 999", title_fr: "TEST Non vérifié", programYear: 1, semester: 2, status: "UNVERIFIED" },
  ],
};

const student = { id: "s1", role: "student" as const, emailVerified: true, approvalStatus: "approved" as const };
const other = { id: "s2", role: "student" as const, emailVerified: true, approvalStatus: "approved" as const };
let db: Database;

beforeEach(async () => {
  db = await createTestDatabase();
  await db.insert(user).values([
    { id: "s1", name: "S1", email: "s1@example.com", emailVerified: true, approvalStatus: "approved" },
    { id: "s2", name: "S2", email: "s2@example.com", emailVerified: true, approvalStatus: "approved" },
  ]);
});

describe("seedProgram", () => {
  it("loads verified courses only and terms with dates, and is safe to run twice", async () => {
    const first = await seedProgram(db, "s1", data, { institution: "udem", slug: "test-prog" });
    expect(first).toMatchObject({ courses: 1, coursesSkippedUnverified: 1, terms: 1, termsSkippedNoDates: 1, periods: 2 });
    const second = await seedProgram(db, "s1", data, { institution: "udem", slug: "test-prog" });
    expect(second.periods).toBe(2);
    const rows = await db.select().from(courses);
    expect(rows.map((c) => [c.code, c.yearOfStudy, c.typicalTerm])).toEqual([["TEST 101", 1, "fall"]]);
  });
  it("rejects a malformed file", async () => {
    await expect(seedProgram(db, "s1", { program: {} }, { institution: "udem", slug: "x" })).rejects.toThrow();
  });
});

describe("personalized schedule", () => {
  beforeEach(async () => {
    await seedProgram(db, "s1", data, { institution: "udem", slug: "test-prog" });
    await saveOnboarding(db, "s1", { university: "udem", programYear: "1", semester: "1" });
  });
  const mon = { title: "TEST class", weekday: "1", startTime: "09:30", endTime: "11:20", validFrom: "2030-09-02", validTo: "2030-12-13", location: "Room 1" };

  it("shows class occurrences without the reading week, plus term and period markers", async () => {
    await createClassBlock(db, student, mon);
    const w = await loadScheduleWindow(db, student, "2030-09-01", "2030-12-31");
    expect(w.hasTermData).toBe(true);
    expect(w.occurrences.some((o) => o.date === "2030-10-14")).toBe(false);
    expect(w.occurrences).toHaveLength(14);
    expect(w.markers.some((m) => m.kind === "reading_week" && !m.verified)).toBe(true);
    expect(w.markers.some((m) => m.kind === "exam_period")).toBe(true);
  });
  it("without a university preset there are no term markers (class blocks still show)", async () => {
    await createClassBlock(db, other, mon);
    const w = await loadScheduleWindow(db, other, "2030-09-01", "2030-09-30");
    expect(w.hasTermData).toBe(false);
    expect(w.occurrences.length).toBeGreaterThan(0);
  });
  it("is private: another student sees nothing and cannot delete it", async () => {
    const r = await createClassBlock(db, student, mon);
    if (!r.ok) throw new Error("create failed");
    expect((await loadScheduleWindow(db, other, "2030-09-01", "2030-12-31")).occurrences).toEqual([]);
    expect(await deleteClassBlock(db, other, r.value.id)).toBe(false);
    expect(await listClassBlocks(db, student)).toHaveLength(1);
    expect(await deleteClassBlock(db, student, r.value.id)).toBe(true);
  });
  it.each([
    [{ ...mon, title: " " }, "titleRequired"],
    [{ ...mon, weekday: "8" }, "invalid"],
    [{ ...mon, startTime: "12:00", endTime: "11:00" }, "endBeforeStart"],
    [{ ...mon, startTime: "9:5" }, "invalidTime"],
    [{ ...mon, validTo: "2030-02-30" }, "invalidDate"],
    [{ ...mon, validFrom: "2031-01-01" }, "endBeforeStart"],
  ])("validates %j", async (input, code) => {
    expect(await createClassBlock(db, student, input)).toEqual({ ok: false, error: code });
  });
  it("a pending student cannot add blocks", async () => {
    expect(await createClassBlock(db, { ...student, approvalStatus: "pending" }, mon)).toEqual({ ok: false, error: "forbidden" });
  });
  it("follows and unfollows a course", async () => {
    const [c] = await db.select().from(courses);
    expect((await setFollowedCourse(db, student, c!.id, true)).ok).toBe(true);
    expect((await setFollowedCourse(db, student, "nope", true)).ok).toBe(false);
    expect((await setFollowedCourse(db, student, c!.id, false)).ok).toBe(true);
  });
});

describe("importIcs", () => {
  it("round-trips exported class blocks into the student's own blocks", async () => {
    const ics = buildClassBlocksIcs([{ id: "b", title: "TEST class", courseCode: null, weekday: 3, startTime: "13:00", endTime: "14:50", location: "Lab", validFrom: "2030-09-02", validTo: "2030-12-13" }], []);
    const r = await importIcs(db, student, ics);
    expect(r).toEqual({ ok: true, value: { entries: 0, classBlocks: 1, skipped: 0 } });
    expect(await listClassBlocks(db, student)).toMatchObject([{ title: "TEST class", weekday: 3, startTime: "13:00", endTime: "14:50", validFrom: "2030-09-04", validTo: "2030-12-13", location: "Lab" }]);
  });
  it("imports one-off events as entries, ignores unknown rules, refuses empty and huge files", async () => {
    const text = "BEGIN:VEVENT\r\nSUMMARY:TEST exam\r\nDTSTART:20301120T150000\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nSUMMARY:Yearly\r\nDTSTART:20301120T150000\r\nRRULE:FREQ=YEARLY\r\nEND:VEVENT";
    expect(await importIcs(db, student, text)).toEqual({ ok: true, value: { entries: 1, classBlocks: 0, skipped: 1 } });
    expect((await db.select().from(studyCalendarEntries))[0]).toMatchObject({ userId: "s1", title: "TEST exam", entryTime: "15:00" });
    expect(await importIcs(db, student, "not a calendar")).toEqual({ ok: false, error: "nothingToImport" });
    expect(await importIcs(db, student, "x".repeat(600 * 1024))).toEqual({ ok: false, error: "fileTooLarge" });
  });
});

describe("the UdeM D.M.D. data file", () => {
  it("loads: only verified courses, the faculty calendar for 2026-2027, every entry with a source", async () => {
    const file = (await import("../data/programs/udem-dmd.json")).default;
    for (const c of file.courses) if (c.status === "VERIFIED") expect(c.source?.url).toMatch(/^https:\/\/[a-z.]*umontreal\.ca\//);
    const summary = await seedProgram(db, "s1", file, { institution: "udem", slug: "udem-dmd", scopePrefix: "D.M.D." });
    expect(summary.courses).toBeGreaterThan(100);
    expect(summary.coursesSkippedUnverified).toBe(0);
    expect(summary.terms).toBe(3);
    await saveOnboarding(db, "s1", { university: "udem", programYear: "1", semester: "1" });
    const w = await loadScheduleWindow(db, student, "2026-08-01", "2026-12-31");
    expect(w.markers.find((m) => m.kind === "term_start")?.date).toBe("2026-08-17");
    const rows = await db.select().from(courses);
    expect(rows.every((c) => c.yearOfStudy && c.yearOfStudy <= 5)).toBe(true);
  });
});
