import { describe, expect, it } from "vitest";
import {
  categoryBounds,
  currentAcademicYear,
  getAcademicYearStartMonth,
  isFutureAcademicYear,
  isValidAcademicYear,
  parseAcademicYear,
  passCategory,
} from "@/server/passes/academic-year";

const at = (iso: string) => new Date(iso);

describe("academic year text", () => {
  it("accepts only two consecutive years", () => {
    expect(parseAcademicYear("2025-2026")).toBe(2025);
    for (const bad of ["2025-2027", "2026-2025", "2025-26", "25-26", "abcd-efgh", " 2025-2026", "2025-2026 ", "", "2025/2026"]) {
      expect(parseAcademicYear(bad), bad).toBeNull();
      expect(isValidAcademicYear(bad), bad).toBe(false);
    }
  });
});

describe("current academic year", () => {
  it("switches on the 1st of the start month (August by default)", () => {
    expect(currentAcademicYear(at("2026-07-31T16:00:00Z"))).toBe("2025-2026");
    expect(currentAcademicYear(at("2026-08-01T16:00:00Z"))).toBe("2026-2027");
    expect(currentAcademicYear(at("2027-01-15T16:00:00Z"))).toBe("2026-2027");
    expect(currentAcademicYear(at("2027-07-31T16:00:00Z"))).toBe("2026-2027");
  });

  it("reads the calendar in Montréal time, not UTC", () => {
    // 03:00 UTC on Aug 1 is 23:00 on July 31 in Montréal: still the old academic year.
    expect(currentAcademicYear(at("2026-08-01T03:00:00Z"))).toBe("2025-2026");
    expect(currentAcademicYear(at("2026-08-01T05:00:00Z"))).toBe("2026-2027");
  });

  it("uses a configurable start month", () => {
    expect(currentAcademicYear(at("2026-08-15T16:00:00Z"), 9)).toBe("2025-2026");
    expect(currentAcademicYear(at("2026-09-01T16:00:00Z"), 9)).toBe("2026-2027");
    expect(currentAcademicYear(at("2026-12-15T16:00:00Z"), 1)).toBe("2026-2027");
    expect(() => currentAcademicYear(new Date(), 13)).toThrow(RangeError);
    expect(() => currentAcademicYear(new Date(), 0)).toThrow(RangeError);
  });

  it("reads the start month from the environment, with a default", () => {
    expect(getAcademicYearStartMonth({})).toBe(8);
    expect(getAcademicYearStartMonth({ ACADEMIC_YEAR_START_MONTH: "  " })).toBe(8);
    expect(getAcademicYearStartMonth({ ACADEMIC_YEAR_START_MONTH: "9" })).toBe(9);
    expect(() => getAcademicYearStartMonth({ ACADEMIC_YEAR_START_MONTH: "13" })).toThrow();
    expect(() => getAcademicYearStartMonth({ ACADEMIC_YEAR_START_MONTH: "sept" })).toThrow();
  });
});

describe("pass category", () => {
  const now = at("2026-10-31T16:00:00Z"); // academic year 2026-2027

  it("is current for this academic year's exams and previous for earlier ones", () => {
    expect(passCategory("2026-2027", now)).toBe("current");
    expect(passCategory("2025-2026", now)).toBe("previous");
    expect(passCategory("2019-2020", now)).toBe("previous");
  });

  it("changes by itself when the next academic year starts (nothing is stored)", () => {
    const sameExam = "2026-2027";
    expect(passCategory(sameExam, at("2027-07-31T16:00:00Z"))).toBe("current");
    expect(passCategory(sameExam, at("2027-08-01T16:00:00Z"))).toBe("previous");
  });

  it("follows the configured start month", () => {
    // On Aug 20, 2026 the new year has started if it begins in August, but not if it begins in September.
    const aug20 = at("2026-08-20T16:00:00Z");
    expect(passCategory("2025-2026", aug20, 8)).toBe("previous");
    expect(passCategory("2025-2026", aug20, 9)).toBe("current");
  });

  it("flags exam years that haven't happened yet, and never throws while listing", () => {
    expect(isFutureAcademicYear("2027-2028", now)).toBe(true);
    expect(isFutureAcademicYear("2026-2027", now)).toBe(false);
    expect(isFutureAcademicYear("nonsense", now)).toBe(false);
    expect(passCategory("2027-2028", now)).toBe("current");
    expect(passCategory("nonsense", now)).toBe("current");
  });

  it("gives matching database bounds", () => {
    expect(categoryBounds("current", now)).toEqual({ equals: "2026-2027" });
    expect(categoryBounds("previous", now)).toEqual({ before: "2026-2027" });
    // The text comparison the database will use agrees with the function.
    expect("2025-2026" < "2026-2027").toBe(true);
    expect("2026-2027" < "2026-2027").toBe(false);
  });
});
