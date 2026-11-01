// Study calendar: pure date rules (leap years, Monday start, month boundaries), .ics text generation and escaping,
// and database behaviour (privacy between students, invalid dates rejected, limits, nothing pre-filled).
// Fake data only (TEST courses, example.com accounts).
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase, type Database } from "@/db/client";
import { courses, studyCalendarEntries, user } from "@/db/schema";
import { CALENDAR_ENTRIES_PER_USER_MAX, CALENDAR_NOTE_MAX, CALENDAR_TITLE_MAX, CALENDAR_YEAR_MAX, CALENDAR_YEAR_MIN } from "@/server/calendar/constants";
import { addDays, addMonths, buildMonthGrid, checkDate, daysBetween, daysInMonth, isLeapYear, isoDateIn, isValidTime, monthParam, parseIsoDate, parseMonthParam, weekdayIndex } from "@/server/calendar/dates";
import { buildIcs, escapeIcsText, foldIcsLine, type IcsEntry } from "@/server/calendar/ics";
import { calendarErrorField, calendarErrorKey, CALENDAR_ERROR_CODES } from "@/server/calendar/errors";
import { createEntry, deleteEntry, getEntry, listEntries, parseEntryInput, updateEntry, upcomingEntries } from "@/server/calendar/service";
import type { Viewer } from "@/server/resources/service";

// ---------- Pure: dates ----------

describe("calendar dates", () => {
  it("accepts real dates, including 29 February only in leap years", () => {
    expect(checkDate("2024-02-29")).toBe("ok");
    expect(checkDate("2000-02-29")).toBe("ok");
    expect(checkDate("2025-02-29")).toBe("invalidDate");
    expect(checkDate("2100-02-29")).toBe("invalidDate"); // 2100 is not a leap year
    expect(isLeapYear(2100)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2025, 2)).toBe(28);
  });

  it("rejects malformed and impossible dates", () => {
    for (const bad of ["", "abc", "2026-13-01", "2026-00-10", "2026-02-30", "2026-04-31", "2026-1-1", "26-01-01", "2026/01/01", "2026-01-01T10:00", " 2026-01-01"]) {
      expect(checkDate(bad), bad).toBe("invalidDate");
    }
  });

  it("bounds the year range by the constants", () => {
    expect(CALENDAR_YEAR_MIN).toBeLessThan(CALENDAR_YEAR_MAX);
    expect(checkDate(`${CALENDAR_YEAR_MIN}-01-01`)).toBe("ok");
    expect(checkDate(`${CALENDAR_YEAR_MAX}-12-31`)).toBe("ok");
    expect(checkDate(`${CALENDAR_YEAR_MIN - 1}-12-31`)).toBe("dateOutOfRange");
    expect(checkDate(`${CALENDAR_YEAR_MAX + 1}-01-01`)).toBe("dateOutOfRange");
    expect(checkDate("0099-01-01")).toBe("invalidDate");
  });

  it("validates 24-hour times", () => {
    for (const ok of ["00:00", "09:05", "23:59"]) expect(isValidTime(ok), ok).toBe(true);
    for (const bad of ["24:00", "9:05", "12:60", "12:5", "1230", "12:30:00", "ab:cd", ""]) expect(isValidTime(bad), bad).toBe(false);
  });

  it("does date arithmetic across month and year ends", () => {
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2025-02-28", 1)).toBe("2025-03-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(daysBetween("2026-11-01", "2026-11-04")).toBe(3);
    expect(daysBetween("2026-11-04", "2026-11-01")).toBe(-3);
    expect(daysBetween("2024-02-28", "2024-03-01")).toBe(2);
    expect(addMonths({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(addMonths({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(addMonths({ year: 2026, month: 3 }, 13)).toEqual({ year: 2027, month: 4 });
    expect(addMonths({ year: 2026, month: 3 }, -15)).toEqual({ year: 2024, month: 12 });
  });

  it("numbers weekdays from Monday", () => {
    expect(weekdayIndex("2024-01-01")).toBe(0); // a Monday
    expect(weekdayIndex("2024-01-07")).toBe(6); // a Sunday
    expect(weekdayIndex("2026-11-01")).toBe(6); // Sunday
  });

  it("reads the month from the URL only when it is valid and in range", () => {
    expect(parseMonthParam("2026-11")).toEqual({ year: 2026, month: 11 });
    expect(parseMonthParam("2026-13")).toBeNull();
    expect(parseMonthParam("2026-00")).toBeNull();
    expect(parseMonthParam("1999-12")).toBeNull();
    expect(parseMonthParam("2101-01")).toBeNull();
    expect(parseMonthParam("nope")).toBeNull();
    expect(parseMonthParam(undefined)).toBeNull();
    expect(monthParam({ year: 2026, month: 3 })).toBe("2026-03");
  });

  it("finds today's date in the configured time zone, not in UTC", () => {
    // 03:30 UTC on 2 November is still the evening of 1 November in Toronto.
    expect(isoDateIn(new Date("2026-11-02T03:30:00Z"), "America/Toronto")).toBe("2026-11-01");
    expect(isoDateIn(new Date("2026-11-02T03:30:00Z"), "UTC")).toBe("2026-11-02");
    expect(isoDateIn(new Date("2026-07-01T12:00:00Z"), "America/Toronto")).toBe("2026-07-01");
  });
});

describe("month grid", () => {
  const flat = (year: number, month: number) => buildMonthGrid(year, month).weeks.flat();

  it("starts every week on Monday and has 7 cells per row", () => {
    for (const [y, m] of [[2024, 2], [2025, 2], [2026, 2], [2026, 8], [2026, 11], [2027, 1]] as const) {
      const grid = buildMonthGrid(y, m);
      for (const week of grid.weeks) {
        expect(week).toHaveLength(7);
        expect(weekdayIndex(week[0]!.iso), `${y}-${m}`).toBe(0);
        expect(weekdayIndex(week[6]!.iso), `${y}-${m}`).toBe(6);
      }
    }
  });

  it("handles a leap February (29 days, starts on a Thursday)", () => {
    const grid = buildMonthGrid(2024, 2);
    expect(grid.weeks).toHaveLength(5);
    expect(grid.weeks[0]![0]).toEqual({ iso: "2024-01-29", day: 29, inMonth: false });
    expect(grid.weeks[0]![3]).toEqual({ iso: "2024-02-01", day: 1, inMonth: true });
    expect(flat(2024, 2).filter((c) => c.inMonth)).toHaveLength(29);
    expect(flat(2024, 2).some((c) => c.iso === "2024-02-29" && c.inMonth)).toBe(true);
    expect(flat(2025, 2).filter((c) => c.inMonth)).toHaveLength(28);
  });

  it("uses exactly 4 weeks when a 28-day February starts on a Monday (2021)", () => {
    const grid = buildMonthGrid(2021, 2);
    expect(grid.weeks).toHaveLength(4);
    expect(grid.weeks[0]![0]).toEqual({ iso: "2021-02-01", day: 1, inMonth: true });
    expect(flat(2021, 2).every((c) => c.inMonth)).toBe(true);
  });

  it("uses 6 weeks when the month starts late in the week (August 2026 starts on a Saturday)", () => {
    const grid = buildMonthGrid(2026, 8);
    expect(grid.weeks).toHaveLength(6);
    expect(grid.weeks[0]![5]).toEqual({ iso: "2026-08-01", day: 1, inMonth: true });
    expect(grid.weeks[5]![0]!.iso).toBe("2026-08-31");
  });

  it("flags the cells that belong to the neighbouring months, across a year boundary", () => {
    const dec = buildMonthGrid(2026, 12);
    const last = dec.weeks[dec.weeks.length - 1]!;
    expect(dec.weeks).toHaveLength(5);
    expect(last[6]).toEqual({ iso: "2027-01-03", day: 3, inMonth: false });
    const jan = buildMonthGrid(2027, 1);
    expect(jan.weeks[0]![0]).toEqual({ iso: "2026-12-28", day: 28, inMonth: false });
    expect(jan.weeks[0]![4]).toEqual({ iso: "2027-01-01", day: 1, inMonth: true });
  });

  it("never has a week without a day of the month, and lists each day once", () => {
    for (const [y, m] of [[2024, 2], [2026, 2], [2026, 8], [2026, 11]] as const) {
      const grid = buildMonthGrid(y, m);
      for (const week of grid.weeks) expect(week.some((c) => c.inMonth)).toBe(true);
      const inMonth = grid.weeks.flat().filter((c) => c.inMonth).map((c) => c.day);
      expect(inMonth).toEqual(Array.from({ length: daysInMonth(y, m) }, (_, i) => i + 1));
      expect(parseIsoDate(grid.weeks[0]![0]!.iso)).not.toBeNull();
    }
  });
});

// ---------- Pure: .ics ----------

const sample = (overrides: Partial<IcsEntry> = {}): IcsEntry => ({
  id: "11111111-2222-3333-4444-555555555555",
  title: "TEST Examen",
  date: "2026-12-10",
  time: null,
  kind: "exam",
  note: null,
  courseCode: null,
  ...overrides,
});

describe(".ics export", () => {
  const now = new Date("2026-11-01T12:00:00Z");

  it("escapes backslash, semicolon, comma and line breaks, and strips control characters", () => {
    expect(escapeIcsText("a,b;c\\d")).toBe("a\\,b\\;c\\\\d");
    // RFC 5545 requires the semicolon to be written as backslash + semicolon (two characters).
    expect(escapeIcsText(";")).toHaveLength(2);
    expect(escapeIcsText(";")[0]).toBe("\\");
    expect(escapeIcsText("ligne 1\nligne 2\r\nligne 3\rfin")).toBe("ligne 1\\nligne 2\\nligne 3\\nfin");
    expect(escapeIcsText("a\u0000b\u0007c\u007fd")).toBe("abcd");
    // The backslash is escaped first, so an escape written by the student cannot turn into a different one.
    expect(escapeIcsText("\\n")).toBe("\\\\n");
  });

  it("cannot be used to inject new iCalendar properties through a title or note", () => {
    const text = buildIcs([sample({ title: "Cours\r\nATTACH:http://example.com/evil", note: "x\nEND:VEVENT\nBEGIN:VEVENT" })], { now });
    const lines = text.split("\r\n");
    expect(lines.filter((l) => l.startsWith("ATTACH"))).toEqual([]);
    expect(lines.filter((l) => l === "END:VEVENT")).toHaveLength(1);
    expect(lines.filter((l) => l === "BEGIN:VEVENT")).toHaveLength(1);
    expect(text).toContain("SUMMARY:Cours\\nATTACH:http://example.com/evil");
  });

  it("writes an all-day event with an exclusive end date, and a timed event in floating local time", () => {
    const text = buildIcs([sample({ date: "2026-12-31" }), sample({ id: "aaaa", date: "2026-12-10", time: "14:30", title: "Séance" })], { now });
    expect(text).toContain("DTSTART;VALUE=DATE:20261231\r\nDTEND;VALUE=DATE:20270101");
    expect(text).toContain("DTSTART:20261210T143000\r\n");
    expect(text).not.toContain("DTSTART:20261210T143000Z");
    expect(text.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(text.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(text).toContain("DTSTAMP:20261101T120000Z");
    expect(text).toContain("UID:11111111-2222-3333-4444-555555555555@dentiq.local");
  });

  it("adds course and note to the description and the kind label as category", () => {
    const text = buildIcs([sample({ courseCode: "TEST 1001", note: "Salle 4, apporter le matériel" })], { now, kindLabels: { exam: "Examen" } });
    expect(text).toContain("DESCRIPTION:TEST 1001\\nSalle 4\\, apporter le matériel");
    expect(text).toContain("CATEGORIES:Examen");
    expect(buildIcs([sample()], { now })).not.toContain("DESCRIPTION");
  });

  it("folds long lines at 75 octets without splitting a character, and every line ends with CRLF", () => {
    const long = buildIcs([sample({ title: "é".repeat(120) })], { now });
    for (const line of long.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    // Unfolding gives the original text back.
    expect(long.replace(/\r\n /g, "")).toContain(`SUMMARY:${"é".repeat(120)}`);
    expect(long.includes("\n") && long.split("\n").every((part, i, all) => i === all.length - 1 || part.endsWith("\r"))).toBe(true);
    expect(foldIcsLine("short")).toBe("short");
    expect(foldIcsLine("x".repeat(80)).split("\r\n")).toHaveLength(2);
  });

  it("skips a row whose date is not real and exports nothing for an empty calendar", () => {
    expect(buildIcs([sample({ date: "2026-02-30" })], { now })).not.toContain("BEGIN:VEVENT");
    expect(buildIcs([], { now })).toBe("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Dentiq//Study calendar//EN\r\nCALSCALE:GREGORIAN\r\nX-WR-CALNAME:Dentiq\r\nEND:VCALENDAR\r\n");
  });
});

// ---------- Database ----------

const viewer = (id: string, role: Viewer["role"], approved = true): Viewer => ({ id, role, emailVerified: true, approvalStatus: approved ? "approved" : "pending" });
const alice = viewer("alice", "student");
const bob = viewer("bob", "student");
const carol = viewer("carol", "student", false);
const mod = viewer("mod", "moderator");

let db: Database;
let courseId: string;

const entry = (overrides: Record<string, unknown> = {}) => ({ title: "TEST Examen final", date: "2026-12-10", kind: "exam", ...overrides });

async function mustCreate(who: Viewer, overrides: Record<string, unknown> = {}) {
  const result = await createEntry(db, who, entry(overrides));
  if (!result.ok) throw new Error(result.error);
  return result.value.id;
}

beforeEach(async () => {
  db = await createTestDatabase();
  await db.insert(user).values([alice, bob, carol, mod].map((v) => ({ id: v.id, name: v.id, email: `${v.id}@example.com`, emailVerified: true, role: v.role, approvalStatus: v.approvalStatus })));
  const [c] = await db.insert(courses).values({ code: "TEST 1001", titleFr: "Cours fictif" }).returning();
  courseId = c!.id;
});

describe("calendar entries: privacy", () => {
  it("starts empty: nothing is pre-filled for anyone", async () => {
    for (const who of [alice, bob, mod]) {
      expect(await listEntries(db, who)).toEqual([]);
      expect(await upcomingEntries(db, who, "2026-01-01")).toEqual([]);
    }
    expect(await db.select().from(studyCalendarEntries)).toEqual([]);
  });

  it("lets only the owner read an entry; another student, a moderator and an unapproved account get nothing", async () => {
    const id = await mustCreate(alice, { courseId, note: "Privé" });
    expect(await getEntry(db, alice, id)).toMatchObject({ id, title: "TEST Examen final", courseCode: "TEST 1001", note: "Privé" });
    for (const other of [bob, mod, carol]) {
      expect(await getEntry(db, other, id), other.id).toBeNull();
      expect(await listEntries(db, other), other.id).toEqual([]);
      expect(await upcomingEntries(db, other, "2026-01-01"), other.id).toEqual([]);
    }
  });

  it("does not let another student edit an entry, and leaves it unchanged", async () => {
    const id = await mustCreate(alice);
    for (const other of [bob, mod]) {
      expect(await updateEntry(db, other, id, entry({ title: "Piraté", date: "2026-01-01" })), other.id).toEqual({ ok: false, error: "notFound" });
    }
    expect(await getEntry(db, alice, id)).toMatchObject({ title: "TEST Examen final", date: "2026-12-10" });
    expect(await updateEntry(db, alice, id, entry({ title: "Modifié" }))).toEqual({ ok: true, value: null });
    expect(await getEntry(db, alice, id)).toMatchObject({ title: "Modifié" });
  });

  it("does not let another student delete an entry", async () => {
    const id = await mustCreate(alice);
    for (const other of [bob, mod]) expect(await deleteEntry(db, other, id), other.id).toEqual({ ok: false, error: "notFound" });
    expect(await getEntry(db, alice, id)).not.toBeNull();
    expect(await deleteEntry(db, alice, id)).toEqual({ ok: true, value: null });
    expect(await getEntry(db, alice, id)).toBeNull();
    expect(await deleteEntry(db, alice, id)).toEqual({ ok: false, error: "notFound" });
  });

  it("treats a malformed id like a missing one", async () => {
    expect(await getEntry(db, alice, "not-a-uuid")).toBeNull();
    expect(await updateEntry(db, alice, "not-a-uuid", entry())).toEqual({ ok: false, error: "notFound" });
    expect(await deleteEntry(db, alice, "'; drop table study_calendar_entries; --")).toEqual({ ok: false, error: "notFound" });
  });

  it("gives accounts that are not approved no access", async () => {
    expect(await createEntry(db, carol, entry())).toEqual({ ok: false, error: "noAccess" });
    expect(await db.select().from(studyCalendarEntries)).toEqual([]);
  });

  it("keeps lists apart: each student sees only their own entries", async () => {
    await mustCreate(alice, { title: "TEST Alice" });
    await mustCreate(bob, { title: "TEST Bob" });
    expect((await listEntries(db, alice)).map((e) => e.title)).toEqual(["TEST Alice"]);
    expect((await listEntries(db, bob)).map((e) => e.title)).toEqual(["TEST Bob"]);
  });

  it("removes a student's entries with their account", async () => {
    await mustCreate(alice);
    await db.delete(user).where(eq(user.id, "alice"));
    expect(await db.select().from(studyCalendarEntries)).toEqual([]);
  });
});

describe("calendar entries: validation", () => {
  const rejects = async (overrides: Record<string, unknown>, error: string) => {
    expect(await createEntry(db, alice, entry(overrides)), JSON.stringify(overrides)).toEqual({ ok: false, error });
    expect(await db.select().from(studyCalendarEntries)).toEqual([]);
  };

  it("rejects invalid dates and stores nothing", async () => {
    await rejects({ date: "2025-02-29" }, "invalidDate");
    await rejects({ date: "2026-02-30" }, "invalidDate");
    await rejects({ date: "2026-13-01" }, "invalidDate");
    await rejects({ date: "" }, "invalidDate");
    await rejects({ date: undefined }, "invalidDate");
    await rejects({ date: "10/12/2026" }, "invalidDate");
    await rejects({ date: `${CALENDAR_YEAR_MIN - 1}-06-01` }, "dateOutOfRange");
    await rejects({ date: `${CALENDAR_YEAR_MAX + 1}-06-01` }, "dateOutOfRange");
  });

  it("rejects the same bad dates when editing, and keeps the old value", async () => {
    const id = await mustCreate(alice);
    expect(await updateEntry(db, alice, id, entry({ date: "2025-02-29" }))).toEqual({ ok: false, error: "invalidDate" });
    expect(await updateEntry(db, alice, id, entry({ date: "3000-01-01" }))).toEqual({ ok: false, error: "dateOutOfRange" });
    expect((await getEntry(db, alice, id))?.date).toBe("2026-12-10");
  });

  it("rejects a missing or blank title, a title or note that is too long, a bad time, a bad kind, an unknown course", async () => {
    await rejects({ title: "" }, "titleRequired");
    await rejects({ title: "   " }, "titleRequired");
    await rejects({ title: undefined }, "titleRequired");
    await rejects({ title: "x".repeat(CALENDAR_TITLE_MAX + 1) }, "titleTooLong");
    await rejects({ note: "x".repeat(CALENDAR_NOTE_MAX + 1) }, "noteTooLong");
    await rejects({ time: "25:00" }, "invalidTime");
    await rejects({ time: "9h30" }, "invalidTime");
    await rejects({ kind: "party" }, "invalid");
    await rejects({ courseId: "not-a-uuid" }, "courseNotFound");
    await rejects({ courseId: "00000000-0000-4000-8000-000000000000" }, "courseNotFound");
  });

  it("accepts the limits themselves and cleans the input", async () => {
    const id = await mustCreate(alice, { title: `  ${"x".repeat(CALENDAR_TITLE_MAX)}  `, note: "  a\r\nb  ", time: "07:05", date: `${CALENDAR_YEAR_MAX}-12-31`, courseId: "" });
    expect(await getEntry(db, alice, id)).toMatchObject({ title: "x".repeat(CALENDAR_TITLE_MAX), note: "a\nb", time: "07:05", date: `${CALENDAR_YEAR_MAX}-12-31`, courseId: null, kind: "exam" });
    const defaults = await mustCreate(alice, { kind: undefined, time: "", note: "   " });
    expect(await getEntry(db, alice, defaults)).toMatchObject({ kind: "other", time: null, note: null });
  });

  it("returns error codes that all have a French and an English message key", async () => {
    for (const code of CALENDAR_ERROR_CODES) expect(calendarErrorKey(code)).toBe(`calendar.errors.${code}`);
    expect(calendarErrorKey("somethingNew")).toBe("calendar.errors.invalid");
    expect(calendarErrorField("invalidDate")).toBe("date");
    expect(calendarErrorField("tooManyEntries")).toBeNull();
    expect(parseEntryInput({ title: "ok", date: "2026-01-01" })).toMatchObject({ ok: true });
  });

  it("is refused by the database too: a malformed time and a blank title", async () => {
    await expect(db.insert(studyCalendarEntries).values({ userId: "alice", title: "t", entryDate: "2026-01-01", entryTime: "7:5" })).rejects.toThrow();
    await expect(db.insert(studyCalendarEntries).values({ userId: "alice", title: "   ", entryDate: "2026-01-01" })).rejects.toThrow();
    await expect(db.insert(studyCalendarEntries).values({ userId: "alice", title: "t", entryDate: "2026-02-30" })).rejects.toThrow();
  });

  it("caps the entries per student", async () => {
    await db.insert(studyCalendarEntries).values(Array.from({ length: CALENDAR_ENTRIES_PER_USER_MAX }, (_, i) => ({ userId: "alice", title: `TEST ${i}`, entryDate: "2026-12-10" })));
    expect(await createEntry(db, alice, entry())).toEqual({ ok: false, error: "tooManyEntries" });
    // The cap is per student.
    expect(await createEntry(db, bob, entry())).toMatchObject({ ok: true });
  });
});

describe("calendar entries: listing", () => {
  it("lists in date order, all-day before timed, within a date range", async () => {
    await mustCreate(alice, { title: "C", date: "2026-12-12", time: "09:00" });
    await mustCreate(alice, { title: "A", date: "2026-12-10", time: "15:00" });
    await mustCreate(alice, { title: "B", date: "2026-12-10", time: "08:30" });
    await mustCreate(alice, { title: "D", date: "2027-01-05" });
    expect((await listEntries(db, alice)).map((e) => e.title)).toEqual(["B", "A", "C", "D"]);
    expect((await listEntries(db, alice, { from: "2026-12-10", to: "2026-12-12" })).map((e) => e.title)).toEqual(["B", "A", "C"]);
    expect((await listEntries(db, alice, { from: "2026-12-11" })).map((e) => e.title)).toEqual(["C", "D"]);
  });

  it("puts an all-day entry before a timed entry on the same date, whatever the creation order", async () => {
    await mustCreate(alice, { title: "Timed early", date: "2026-12-10", time: "00:30" });
    await mustCreate(alice, { title: "All day", date: "2026-12-10" });
    await mustCreate(alice, { title: "Timed late", date: "2026-12-10", time: "18:00" });
    expect((await listEntries(db, alice, { from: "2026-12-10", to: "2026-12-10" })).map((e) => e.title)).toEqual(["All day", "Timed early", "Timed late"]);
  });

  it("returns only upcoming entries (today included) and respects the limit", async () => {
    await mustCreate(alice, { title: "Passé", date: "2026-10-01" });
    await mustCreate(alice, { title: "Aujourd'hui", date: "2026-11-01" });
    for (let i = 0; i < 6; i++) await mustCreate(alice, { title: `Futur ${i}`, date: `2026-12-0${i + 1}` });
    const up = await upcomingEntries(db, alice, "2026-11-01", 5);
    expect(up).toHaveLength(5);
    expect(up[0]!.title).toBe("Aujourd'hui");
    expect(up.some((e) => e.title === "Passé")).toBe(false);
  });
});
