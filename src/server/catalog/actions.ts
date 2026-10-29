"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { getDb } from "@/db/client";
import { requireRole } from "@/server/auth/session";
import { addOffering, createCourse, createProgram, importCourses, updateCourse } from "./service";
import {
  courseInputSchema,
  formToObject,
  MAX_IMPORT_BYTES,
  offeringInputSchema,
  parseCourseCsv,
  programInputSchema,
  sourceInputSchema,
  type CsvRowError,
} from "./validation";

/** Messages are translation keys; the form component translates them. */
export type FormState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string>;
  importSummary?: { created: number; updated: number; skipped: CsvRowError[] };
};

const knownErrors = new Set(["required", "invalidCode", "invalidSlug", "invalidAcademicYear"]);

function toFieldErrors(...errors: (z.ZodError | undefined)[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const error of errors) {
    for (const issue of error?.issues ?? []) {
      const field = String(issue.path[0] ?? "form");
      out[field] ??= `errors.${knownErrors.has(issue.message) ? issue.message : "invalid"}`;
    }
  }
  return out;
}

function invalid(fieldErrors: Record<string, string>): FormState {
  return { status: "error", message: "errors.invalid", fieldErrors };
}

function revalidateCatalog(code?: string) {
  revalidatePath("/courses");
  revalidatePath("/admin/catalog");
  revalidatePath("/");
  if (code) revalidatePath(`/courses/${encodeURIComponent(code)}`);
}

export async function createProgramAction(_prev: FormState, form: FormData): Promise<FormState> {
  const actor = await requireRole("admin");
  const data = formToObject(form);
  const program = programInputSchema.safeParse(data);
  const source = sourceInputSchema.safeParse(data);
  if (!program.success || !source.success) return invalid(toFieldErrors(program.error, source.error));

  const result = await createProgram(getDb(), actor.id, program.data, source.data);
  if (!result.ok) return { status: "error", message: `errors.${result.error}`, fieldErrors: { slug: `errors.${result.error}` } };
  revalidateCatalog();
  return { status: "success", message: "common.saved" };
}

export async function saveCourseAction(_prev: FormState, form: FormData): Promise<FormState> {
  const actor = await requireRole("admin");
  const data = formToObject(form);
  const course = courseInputSchema.safeParse(data);
  const source = sourceInputSchema.safeParse(data);
  if (!course.success || !source.success) return invalid(toFieldErrors(course.error, source.error));

  const id = typeof data.id === "string" && data.id ? data.id : null;
  const db = getDb();
  const result = id
    ? await updateCourse(db, actor.id, id, course.data, source.data)
    : await createCourse(db, actor.id, course.data, source.data);
  if (!result.ok) {
    return {
      status: "error",
      message: `errors.${result.error}`,
      fieldErrors: result.error === "duplicateCode" ? { code: "errors.duplicateCode" } : undefined,
    };
  }
  revalidateCatalog(result.value.code);
  return { status: "success", message: id ? "common.saved" : "admin.course.created" };
}

export async function importCoursesAction(_prev: FormState, form: FormData): Promise<FormState> {
  const actor = await requireRole("admin");
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { status: "error", message: "errors.fileMissing" };
  if (file.size > MAX_IMPORT_BYTES) return { status: "error", message: "errors.fileTooLarge" };
  if (!file.name.toLowerCase().endsWith(".csv")) return { status: "error", message: "errors.fileType" };

  const data = formToObject(form);
  const source = sourceInputSchema.safeParse(data);
  if (!source.success) return invalid(toFieldErrors(source.error));
  const programId = typeof data.programId === "string" && data.programId ? data.programId : null;

  const { rows, errors } = parseCourseCsv(await file.text());
  if (rows.length === 0) {
    return {
      status: "error",
      message: "admin.import.noValidRows",
      importSummary: { created: 0, updated: 0, skipped: errors },
    };
  }

  const result = await importCourses(getDb(), actor.id, rows, source.data, programId);
  revalidateCatalog();
  return { status: "success", importSummary: { ...result, skipped: errors } };
}

export async function addOfferingAction(_prev: FormState, form: FormData): Promise<FormState> {
  const actor = await requireRole("admin");
  const data = formToObject(form);
  const offering = offeringInputSchema.safeParse(data);
  const source = sourceInputSchema.safeParse(data);
  if (!offering.success || !source.success) return invalid(toFieldErrors(offering.error, source.error));

  const result = await addOffering(getDb(), actor.id, offering.data, source.data);
  if (!result.ok) return { status: "error", message: `errors.${result.error}` };
  revalidateCatalog(typeof data.courseCode === "string" ? data.courseCode : undefined);
  return { status: "success", message: "admin.offering.created" };
}
