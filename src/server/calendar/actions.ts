"use server";

// Server actions for the study calendar. Each one: check who is asking (requireUser), call the service (which checks
// approval, ownership, the date range and the per-student limit again), and return error CODES the screens translate
// (calendar.errors.*). Nothing here reads or writes another student's entries.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { requireUser } from "@/server/auth/session";
import { monthParam, parseIsoDate } from "./dates";
import { calendarErrorField } from "./errors";
import { createEntry, deleteEntry, updateEntry } from "./service";

export type CalendarFormState = {
  status: "idle" | "error";
  /** Error code, translated under calendar.errors. */
  message?: string;
  fieldErrors?: Record<string, string>;
};

function formToRaw(form: FormData): Record<string, string> {
  const raw: Record<string, string> = {};
  for (const [key, value] of form.entries()) if (typeof value === "string") raw[key] = value;
  return raw;
}

/** Where to go after saving: the month of the entry's date. */
function monthOf(date: string): string {
  const p = parseIsoDate(date);
  return p ? `/calendar?month=${monthParam({ year: p.year, month: p.month })}&day=${date}` : "/calendar";
}

export async function saveEntryAction(_prev: CalendarFormState, form: FormData): Promise<CalendarFormState> {
  const viewer = await requireUser();
  const raw = formToRaw(form);
  const db = getDb();
  const result = raw.id ? await updateEntry(db, viewer, raw.id, raw) : await createEntry(db, viewer, raw);
  if (!result.ok) {
    const field = calendarErrorField(result.error);
    return { status: "error", message: result.error, fieldErrors: field ? { [field]: result.error } : undefined };
  }
  revalidatePath("/calendar");
  revalidatePath("/");
  redirect(monthOf(raw.date ?? ""));
}

export async function deleteEntryAction(form: FormData): Promise<void> {
  const viewer = await requireUser();
  const id = form.get("id");
  if (typeof id === "string") await deleteEntry(getDb(), viewer, id);
  revalidatePath("/calendar");
  revalidatePath("/");
  redirect("/calendar");
}
