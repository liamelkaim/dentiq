import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type Slot = { weekday: string; start: string; end: string; code: string | null; roomOrMode: string | null; needsReview: boolean };
type Staged = {
  status: string;
  gradingScale: { scales: { firstCycle: { grade: string; lower: number; upper: number; step: number }[]; higherDegrees: { grade: string; lower: number; upper: number; step: number }[] }; notStated: string };
  facultyCalendar: { events: { date: string | null; label: string; description_fr: string; needsReview: boolean; weekdayAgreesWithDate: boolean | null }[] };
  weeklyTimetables: Record<string, { visuallyChecked: boolean; slots: Slot[] }>;
  integrationWeeks: Record<string, { slots: Slot[] }>;
};
const s: Staged = JSON.parse(readFileSync("data/staging/udem-2026-2027.schedule.staged.json", "utf8"));
const seed = JSON.parse(readFileSync("data/programs/udem-dmd.json", "utf8")) as { courses: { code: string }[] };

describe("staged UdeM schedule facts (provisional)", () => {
  it("is provisional and keeps the two grading scales separate", () => {
    expect(s.status).toMatch(/PROVISIONAL/);
    expect(s.gradingScale.scales.firstCycle).toHaveLength(14);
    expect(s.gradingScale.scales.higherDegrees).toHaveLength(14);
    const a = (k: "firstCycle" | "higherDegrees", g: string) => s.gradingScale.scales[k].find((r) => r.grade === g);
    expect([a("firstCycle", "A")?.lower, a("firstCycle", "B")?.lower, a("firstCycle", "D")?.lower]).toEqual([84.5, 74.5, 59.5]);
    expect([a("higherDegrees", "A")?.lower, a("higherDegrees", "B-")?.lower, a("higherDegrees", "C")?.lower]).toEqual([94.5, 74.5, 66.5]);
    expect(s.gradingScale.notStated).toMatch(/no pass mark/);
  });
  it("calendar dates agree with their printed weekday; anything else is flagged for review", () => {
    for (const e of s.facultyCalendar.events) {
      if (!e.needsReview) expect(e.date && e.weekdayAgreesWithDate).toBeTruthy();
      if (e.weekdayAgreesWithDate === false) expect(e.needsReview).toBe(true);
    }
    const labour = s.facultyCalendar.events.find((e) => e.date === "2026-09-07");
    expect(labour?.description_fr).toMatch(/Fête du travail/);
    expect(s.facultyCalendar.events.find((e) => e.date === "2026-10-12")?.description_fr).toMatch(/Action de gr/);
  });
  it("the checked cohort 1 timetable has the 22 slots seen on the rendered page", () => {
    const c1 = s.weeklyTimetables.cohort1;
    expect(c1.visuallyChecked).toBe(true);
    expect(c1.slots).toHaveLength(22);
    expect(c1.slots[0]).toMatchObject({ weekday: "Lundi", start: "08:30", end: "11:30", code: "DEN 1006" });
    expect(c1.slots.filter((x) => x.weekday === "Vendredi").map((x) => x.start)).toEqual(["08:30", "10:30", "13:30", "13:30"]);
  });
  it("every timetable slot needs review; course codes exist in the reviewed seed; no placement or people are staged", () => {
    const codes = new Set(seed.courses.map((c) => c.code));
    const all = [...Object.values(s.weeklyTimetables), ...Object.values(s.integrationWeeks)].flatMap((t) => t.slots);
    expect(all.length).toBeGreaterThan(80);
    for (const slot of all) {
      expect(slot.needsReview).toBe(true);
      expect(slot.roomOrMode ?? "").not.toMatch(/assignation|\bSynchro|déterminer/i);
      if (slot.code) expect(codes.has(slot.code)).toBe(true);
    }
    expect(JSON.stringify(s)).not.toMatch(/\b(Dr|Dre|Mme|M\.) [A-ZÉ]/);
  });
});
