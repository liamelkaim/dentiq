import Papa from "papaparse";
import { z } from "zod";
import { terms, type Term } from "@/db/schema";

/** "dmd  1234 " -> "DMD 1234" */
export function normalizeCourseCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, " ");
}

const blankToNull = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? null : value;

const optionalText = (max: number) =>
  z.preprocess(blankToNull, z.string().trim().max(max).nullish()).transform((v) => v ?? null);

// French and English spellings are both accepted in forms and CSV files.
const termAliases: Record<string, Term> = {
  fall: "fall",
  autumn: "fall",
  automne: "fall",
  winter: "winter",
  hiver: "winter",
  summer: "summer",
  ete: "summer",
  "été": "summer",
};

const optionalTerm = z
  .preprocess((value) => {
    const v = blankToNull(value);
    return typeof v === "string" ? (termAliases[v.trim().toLowerCase()] ?? v) : v;
  }, z.enum(terms).nullish())
  .transform((v) => v ?? null);

export const courseCodeSchema = z
  .string()
  .transform(normalizeCourseCode)
  .pipe(z.string().regex(/^[A-Z0-9][A-Z0-9 -]{1,19}$/, { message: "invalidCode" }));

export const courseInputSchema = z.object({
  code: courseCodeSchema,
  titleFr: z.string().trim().min(1, { message: "required" }).max(200),
  titleEn: optionalText(200),
  descriptionFr: optionalText(5000),
  descriptionEn: optionalText(5000),
  credits: z
    .preprocess(blankToNull, z.coerce.number().min(0).max(99).nullish())
    .transform((v) => (v == null ? null : String(v))),
  yearOfStudy: z
    .preprocess(blankToNull, z.coerce.number().int().min(1).max(8).nullish())
    .transform((v) => v ?? null),
  typicalTerm: optionalTerm,
  programId: z.preprocess(blankToNull, z.uuid().nullish()).transform((v) => v ?? null),
});
export type CourseInput = z.output<typeof courseInputSchema>;

export const sourceInputSchema = z.object({
  sourceName: optionalText(200),
  sourceUrl: z
    .preprocess(blankToNull, z.url({ protocol: /^https?$/ }).max(500).nullish())
    .transform((v) => v ?? null),
  sourceRetrievedOn: z.preprocess(blankToNull, z.iso.date().nullish()).transform((v) => v ?? null),
});
export type SourceInput = z.output<typeof sourceInputSchema>;

export const programInputSchema = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, { message: "invalidSlug" })
    .max(60),
  nameFr: z.string().trim().min(1, { message: "required" }).max(200),
  nameEn: optionalText(200),
  institution: z.string().trim().min(1, { message: "required" }).max(200),
});
export type ProgramInput = z.output<typeof programInputSchema>;

export const offeringInputSchema = z.object({
  courseId: z.uuid(),
  academicYear: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{4}$/, { message: "invalidAcademicYear" })
    .refine((v) => Number(v.slice(5)) === Number(v.slice(0, 4)) + 1, { message: "invalidAcademicYear" }),
  term: z.preprocess((v) => (typeof v === "string" ? (termAliases[v.trim().toLowerCase()] ?? v) : v), z.enum(terms)),
  // Names separated by semicolons or new lines.
  professorNames: z
    .string()
    .max(1000)
    .transform((v) =>
      [...new Set(v.split(/[;\n]/).map((n) => n.trim().replace(/\s+/g, " ")).filter(Boolean))],
    )
    .pipe(z.array(z.string().max(120)).max(20)),
});
export type OfferingInput = z.output<typeof offeringInputSchema>;

// ---------- CSV import ----------

export const MAX_IMPORT_ROWS = 2000;
export const MAX_IMPORT_BYTES = 1_000_000;

const csvColumns = {
  code: "code",
  title_fr: "titleFr",
  title_en: "titleEn",
  description_fr: "descriptionFr",
  description_en: "descriptionEn",
  credits: "credits",
  year_of_study: "yearOfStudy",
  term: "typicalTerm",
} as const;

export const CSV_TEMPLATE_HEADER = Object.keys(csvColumns).join(",");

export type CsvRowError = { line: number; message: string };
export type CsvParseResult = { rows: CourseInput[]; errors: CsvRowError[] };

export function parseCourseCsv(text: string): CsvParseResult {
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ""), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim().toLowerCase(),
  });

  const headers = parsed.meta.fields ?? [];
  const missing = ["code", "title_fr"].filter((h) => !headers.includes(h));
  if (missing.length > 0) {
    return { rows: [], errors: [{ line: 1, message: `missingColumns:${missing.join(",")}` }] };
  }
  if (parsed.data.length > MAX_IMPORT_ROWS) {
    return { rows: [], errors: [{ line: 1, message: `tooManyRows:${MAX_IMPORT_ROWS}` }] };
  }

  const rows: CourseInput[] = [];
  const errors: CsvRowError[] = [];
  const seen = new Set<string>();

  parsed.data.forEach((record, index) => {
    const line = index + 2; // header is line 1
    const input = Object.fromEntries(
      Object.entries(csvColumns).map(([column, field]) => [field, record[column] ?? ""]),
    );
    const result = courseInputSchema.safeParse(input);
    if (!result.success) {
      const issue = result.error.issues[0];
      errors.push({ line, message: `${issue?.path.join(".") ?? "row"}:${issue?.message ?? "invalid"}` });
      return;
    }
    if (seen.has(result.data.code)) {
      errors.push({ line, message: `duplicateInFile:${result.data.code}` });
      return;
    }
    seen.add(result.data.code);
    rows.push(result.data);
  });

  return { rows, errors };
}

/** Flattens a FormData into a plain object for zod. */
export function formToObject(form: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}
