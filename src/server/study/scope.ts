// What a student can pick when they start practice, a quiz, a flashcard session or an export. Pure: reads the page
// address strictly (anything odd is ignored) and does the seeded shuffle that makes a session stable on refresh.
import { z } from "zod";
import { parseAcademicYear } from "@/server/passes/academic-year";
import { getQuestionType } from "@/server/passes/question-types";

export type StudyScope = {
  course?: string;
  topic?: string;
  year?: string;
  type?: string;
  /** current-year or previous-years questions (derived from the exam year, never stored) */
  period?: "current" | "previous";
  /** Only questions the student marked. */
  mark?: "flagged" | "review_later";
};

type Raw = Record<string, string | string[] | undefined>;

const one = (raw: Raw, key: string): string | undefined => {
  const v = raw[key];
  const value = Array.isArray(v) ? v[0] : v;
  return value?.trim() ? value.trim() : undefined;
};

export function parseStudyScope(raw: Raw): StudyScope {
  const course = one(raw, "course");
  const year = one(raw, "year");
  const type = one(raw, "type");
  const period = one(raw, "period");
  const mark = one(raw, "mark");
  return {
    course: course && z.uuid().safeParse(course).success ? course : undefined,
    topic: one(raw, "topic")?.slice(0, 80),
    year: year && parseAcademicYear(year) !== null ? year : undefined,
    type: type && getQuestionType(type) ? type : undefined,
    period: period === "current" || period === "previous" ? period : undefined,
    mark: mark === "flagged" || mark === "review_later" ? mark : undefined,
  };
}

/** The scope as plain strings for links and hidden form fields (empty values dropped). */
export function scopeToQuery(scope: StudyScope): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(scope)) if (value) out[key] = value;
  return out;
}

/** A whole number between 1 and `max`, or `fallback` when the input is missing or not a number. */
export function parseCount(value: string | undefined, fallback: number, max: number): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) return Math.min(fallback, max);
  return Math.min(n, max);
}

/** Small deterministic hash of a text (for seeding the shuffle). */
export function hashSeed(seed: string): number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

function mulberry32(a: number) {
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates shuffle that gives the same order for the same seed (so a page refresh keeps the session). */
export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  const random = mulberry32(hashSeed(seed));
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}
