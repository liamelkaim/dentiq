// Schedule generation (terms, breaks, exam periods) and the .ics export/import round trip. Synthetic dates only.
import { describe, expect, it } from "vitest";
import { buildClassBlocksIcs, buildIcs, parseIcs } from "@/server/calendar/ics";
import { calendarMarkers, expandClassBlock, expandClassBlocks, type ClassBlock, type PeriodInfo, type TermInfo } from "@/server/calendar/schedule";

const term: TermInfo = { id: "t1", term: "fall", academicYear: "2030-2031", start: "2030-09-02", end: "2030-12-13", verified: false };
const reading: PeriodInfo = { kind: "reading_week", nameFr: "Semaine de lecture", nameEn: "Reading week", start: "2030-10-14", end: "2030-10-18", verified: false };
const exams: PeriodInfo = { kind: "exam_period", nameFr: "Examens", nameEn: "Exams", start: "2030-12-09", end: "2030-12-13", verified: false };
const block: ClassBlock = { id: "b1", title: "TEST Course", courseCode: "TEST 101", weekday: 1, startTime: "09:30", endTime: "11:20", location: "Room, 12", validFrom: term.start, validTo: term.end };

describe("class block expansion", () => {
  it("lands on the right weekday, weekly, within the term", () => {
    const days = expandClassBlock(block, [], "2030-09-01", "2030-12-31").map((o) => o.date);
    expect(days[0]).toBe("2030-09-02"); // a Monday
    expect(days.at(-1)).toBe("2030-12-09");
    expect(days).toHaveLength(15);
    expect(days.every((d) => new Date(d + "T12:00:00Z").getUTCDay() === 1)).toBe(true);
  });
  it("skips the reading week but keeps exam-period days", () => {
    const days = expandClassBlock(block, [reading, exams], "2030-09-01", "2030-12-31").map((o) => o.date);
    expect(days).not.toContain("2030-10-14");
    expect(days).toContain("2030-12-09");
    expect(days).toHaveLength(14);
  });
  it("respects the requested range and returns nothing outside validity", () => {
    expect(expandClassBlock(block, [], "2030-09-09", "2030-09-15").map((o) => o.date)).toEqual(["2030-09-09"]);
    expect(expandClassBlock(block, [], "2031-01-01", "2031-02-01")).toEqual([]);
  });
  it("starts the walk on the weekday even when the term starts mid-week", () => {
    const friday = expandClassBlock({ ...block, weekday: 5, validFrom: "2030-09-04" }, [], "2030-09-01", "2030-09-30").map((o) => o.date);
    expect(friday).toEqual(["2030-09-06", "2030-09-13", "2030-09-20", "2030-09-27"]);
  });
  it("sorts several blocks by date then time", () => {
    const out = expandClassBlocks([{ ...block, id: "late", startTime: "13:00" }, block], [], "2030-09-02", "2030-09-02");
    expect(out.map((o) => o.id)).toEqual(["b1", "late"]);
  });
});

describe("calendar markers", () => {
  it("marks term start and end and every day of a period inside the range", () => {
    const m = calendarMarkers([term], [reading, exams], "2030-10-01", "2030-12-31");
    expect(m.filter((x) => x.kind === "reading_week")).toHaveLength(5);
    expect(m.find((x) => x.kind === "term_end")?.date).toBe("2030-12-13");
    expect(m.find((x) => x.kind === "term_start")).toBeUndefined(); // before the range
    expect(m.filter((x) => x.kind === "exam_period").map((x) => x.date)[0]).toBe("2030-12-09");
  });
  it("clips a period that straddles the range", () => {
    const m = calendarMarkers([], [reading], "2030-10-16", "2030-10-31");
    expect(m.map((x) => x.date)).toEqual(["2030-10-16", "2030-10-17", "2030-10-18"]);
  });
  it("carries the UNVERIFIED flag through", () => {
    expect(calendarMarkers([term], [], "2030-09-01", "2030-09-30")[0]?.verified).toBe(false);
  });
});

describe(".ics round trip", () => {
  const now = new Date("2030-01-01T00:00:00Z");
  it("entries: export then import gives the same title, date, time and note", () => {
    const ics = buildIcs(
      [
        { id: "e1", title: "Exam, part 1; bring ID", date: "2030-10-20", time: "08:30", kind: "exam", note: "Line one\nLine two", courseCode: "TEST 101" },
        { id: "e2", title: "All day", date: "2030-10-21", time: null, kind: "other", note: null, courseCode: null },
      ],
      { now },
    );
    const { events, skipped } = parseIcs(ics);
    expect(skipped).toBe(0);
    expect(events.map((e) => [e.title, e.date, e.time])).toEqual([
      ["Exam, part 1; bring ID", "2030-10-20", "08:30"],
      ["All day", "2030-10-21", null],
    ]);
    expect(events[0]?.description).toBe("TEST 101\nLine one\nLine two");
  });
  it("class blocks: export then import gives a weekly rule with the same time, place and last date, skipping breaks via EXDATE", () => {
    const ics = buildClassBlocksIcs([block], [reading], { now });
    expect(ics).toContain("RRULE:FREQ=WEEKLY;UNTIL=20301213T235959");
    expect(ics).toContain("EXDATE:20301014T093000");
    const [ev] = parseIcs(ics).events;
    expect(ev).toMatchObject({ title: "TEST Course", date: "2030-09-02", time: "09:30", endTime: "11:20", location: "Room, 12", weekly: { until: "2030-12-13" } });
  });
  it("converts UTC times to the calendar's zone and keeps all-day dates", () => {
    const text = "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nSUMMARY:UTC\r\nDTSTART:20301120T150000Z\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nSUMMARY:Day\r\nDTSTART;VALUE=DATE:20301121\r\nEND:VEVENT\r\nEND:VCALENDAR";
    const { events } = parseIcs(text);
    expect(events[0]).toMatchObject({ date: "2030-11-20", time: "10:00" }); // EST, UTC-5
    expect(events[1]).toMatchObject({ date: "2030-11-21", time: null });
  });
  it("handles folded lines and skips what it cannot read", () => {
    const text = "BEGIN:VEVENT\r\nSUMMARY:A very long\r\n  title\r\nDTSTART:20301120T150000\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nSUMMARY:No date\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nSUMMARY:Monthly\r\nDTSTART:20301120T150000\r\nRRULE:FREQ=MONTHLY\r\nEND:VEVENT";
    const r = parseIcs(text);
    expect(r.events).toHaveLength(1);
    expect(r.events[0]?.title).toBe("A very long title");
    expect(r.skipped).toBe(2);
  });
  it("cannot inject properties through a title", () => {
    const { events } = parseIcs(buildIcs([{ id: "x", title: "Hi\r\nATTENDEE:evil", date: "2030-10-20", time: null, kind: "other", note: null, courseCode: null }], { now }));
    expect(events).toHaveLength(1);
    expect(events[0]?.title).not.toContain("\n");
  });
});
