"use server";

// Server action for the tutor settings (administrators only). The flag it saves does nothing on its own: the tutor also
// needs a configured provider, and none exists. Messages returned to the form are translation keys.
import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { requireRole } from "@/server/auth/session";
import { tutorErrorKey } from "./errors";
import { updateTutorSettings } from "./settings";

export type TutorFormState = {
  status: "idle" | "success" | "error";
  /** Translation key. */
  message?: string;
};

/** A whole number typed in a form field, or null when it is empty or not a whole number. */
function wholeNumber(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string" || !/^\d{1,9}$/.test(value.trim())) return null;
  return Number(value.trim());
}

export async function updateTutorSettingsAction(_prev: TutorFormState, form: FormData): Promise<TutorFormState> {
  const viewer = await requireRole("admin");
  const dailyQuestionLimit = wholeNumber(form.get("dailyQuestionLimit"));
  const maxContextChars = wholeNumber(form.get("maxContextChars"));
  if (dailyQuestionLimit === null || maxContextChars === null) return { status: "error", message: tutorErrorKey("outOfRange") };

  const result = await updateTutorSettings(getDb(), viewer, {
    enabled: form.get("enabled") === "on",
    dailyQuestionLimit,
    maxContextChars,
  });
  if (!result.ok) return { status: "error", message: tutorErrorKey(result.error) };
  revalidatePath("/admin/tutor");
  revalidatePath("/tutor");
  revalidatePath("/", "layout");
  return { status: "success", message: "tutor.admin.saved" };
}
