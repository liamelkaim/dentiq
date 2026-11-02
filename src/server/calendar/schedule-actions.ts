"use server";

// Server actions for the schedule page. Each checks who is asking and calls the service, which checks again.
import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { requireUser } from "@/server/auth/session";
import { checkRate } from "@/server/rate-limit/guard";
import { RATE_CALENDAR_IMPORT } from "@/server/rate-limit/limits";
import { ICS_MAX_BYTES } from "./ics";
import { createClassBlock, deleteClassBlock, importIcs, setFollowedCourse, type ImportSummary } from "./schedule-service";

export type ScheduleFormState = { status: "idle" | "error" | "success"; message?: string; summary?: ImportSummary };

const done = () => {
  revalidatePath("/calendar", "layout");
  revalidatePath("/");
};

export async function addClassBlockAction(_prev: ScheduleFormState, form: FormData): Promise<ScheduleFormState> {
  const viewer = await requireUser();
  const raw: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === "string") raw[k] = v;
  const result = await createClassBlock(getDb(), viewer, raw);
  if (!result.ok) return { status: "error", message: result.error };
  done();
  return { status: "success", message: "saved" };
}

export async function deleteClassBlockAction(form: FormData): Promise<void> {
  const viewer = await requireUser();
  const id = form.get("id");
  if (typeof id === "string") await deleteClassBlock(getDb(), viewer, id);
  done();
}

export async function followCourseAction(form: FormData): Promise<void> {
  const viewer = await requireUser();
  const id = form.get("courseId");
  if (typeof id === "string") await setFollowedCourse(getDb(), viewer, id, form.get("follow") === "1");
  done();
}

export async function importIcsAction(_prev: ScheduleFormState, form: FormData): Promise<ScheduleFormState> {
  const viewer = await requireUser();
  if (!(await checkRate(RATE_CALENDAR_IMPORT, viewer.id)).allowed) return { status: "error", message: "tooManyAttempts" };
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { status: "error", message: "nothingToImport" };
  if (file.size > ICS_MAX_BYTES) return { status: "error", message: "fileTooLarge" };
  const result = await importIcs(getDb(), viewer, await file.text());
  if (!result.ok) return { status: "error", message: result.error };
  done();
  return { status: "success", summary: result.value };
}
