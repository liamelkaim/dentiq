// Reads the Passes list filters from the page address and turns them into service filters. Pure (no database),
// and strict: anything that doesn't look right is ignored rather than trusted.
import { z } from "zod";
import { parseAcademicYear } from "./academic-year";
import { getQuestionType } from "./question-types";
import type { QuestionFilters } from "./service";

export const PAGE_SIZE = 25;
export const SCOPES = ["current", "previous", "all"] as const;
export type Scope = (typeof SCOPES)[number];

export type BrowseParams = {
  /** current-year, previous years, or everything (derived from the exam year, never stored) */
  scope: Scope;
  q?: string;
  year?: string;
  type?: string;
  answer?: "proposed" | "verified";
  /** Moderators only. */
  status?: "pending" | "published" | "rejected" | "hidden";
  course?: string;
  offering?: string;
  professor?: string;
  topic?: string;
  page: number;
};

type Raw = Record<string, string | string[] | undefined>;

const one = (raw: Raw, key: string): string | undefined => {
  const v = raw[key];
  const value = Array.isArray(v) ? v[0] : v;
  return value?.trim() ? value.trim() : undefined;
};
const uuid = (value: string | undefined) => (value && z.uuid().safeParse(value).success ? value : undefined);

export function parseBrowseParams(raw: Raw, options: { moderator: boolean }): BrowseParams {
  const year = one(raw, "year");
  const type = one(raw, "type");
  const answer = one(raw, "answer");
  const status = one(raw, "status");
  const page = Number(one(raw, "page"));
  return {
    scope: SCOPES.find((s) => s === one(raw, "scope")) ?? "all",
    q: one(raw, "q")?.slice(0, 100),
    year: year && parseAcademicYear(year) !== null ? year : undefined,
    type: type && getQuestionType(type) ? type : undefined,
    answer: answer === "proposed" || answer === "verified" ? answer : undefined,
    status:
      options.moderator && (status === "pending" || status === "published" || status === "rejected" || status === "hidden") ? status : undefined,
    course: uuid(one(raw, "course")),
    offering: uuid(one(raw, "offering")),
    professor: uuid(one(raw, "professor")),
    topic: one(raw, "topic")?.slice(0, 80),
    page: Number.isInteger(page) && page >= 1 && page <= 1000 ? page : 1,
  };
}

/** The filters for listQuestions. A course page passes its own course id, which a `course` parameter can't override. */
export function toQuestionFilters(params: BrowseParams, courseId?: string): QuestionFilters {
  return {
    courseId: courseId ?? params.course,
    offeringId: params.offering,
    professorId: params.professor,
    examAcademicYear: params.year,
    category: params.scope === "all" ? undefined : params.scope,
    topic: params.topic,
    questionType: params.type,
    answerStatus: params.answer,
    status: params.status,
    q: params.q,
    limit: PAGE_SIZE,
    offset: (params.page - 1) * PAGE_SIZE,
  };
}

/** The same params as plain strings for building links (empty values are dropped by hrefWith). */
export function paramsToQuery(params: BrowseParams): Record<string, string | undefined> {
  return {
    scope: params.scope === "all" ? undefined : params.scope,
    q: params.q,
    year: params.year,
    type: params.type,
    answer: params.answer,
    status: params.status,
    course: params.course,
    offering: params.offering,
    professor: params.professor,
    topic: params.topic,
    page: params.page > 1 ? String(params.page) : undefined,
  };
}
