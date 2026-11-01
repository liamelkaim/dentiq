// Pieces shared by the pass server actions (actions.ts) and the question upload handlers (upload-handlers.ts). Plain
// module, not "use server": a "use server" file may only export async functions.
import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { passErrorField, passErrorKey } from "./errors";

export type PassFormState = {
  status: "idle" | "success" | "error";
  /** Translation key. */
  message?: string;
  /** Field name -> translation key. */
  fieldErrors?: Record<string, string>;
  /** Existing question to point to (duplicates). */
  questionId?: string;
};

export const failure = (code: string, questionId?: string): PassFormState => {
  const field = passErrorField(code);
  return {
    status: "error",
    message: passErrorKey(code),
    fieldErrors: field ? { [field]: passErrorKey(code) } : undefined,
    questionId,
  };
};

export function zodFailure(error: z.ZodError): PassFormState {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "form");
    fieldErrors[field] ??= passErrorKey(issue.message);
  }
  return { status: "error", message: "passes.errors.invalid", fieldErrors };
}

export const text = (form: FormData, name: string) => {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
};

export function refresh(questionId?: string) {
  revalidatePath("/");
  revalidatePath("/passes", "layout");
  revalidatePath("/courses", "layout");
  revalidatePath("/moderation");
  if (questionId) revalidatePath(`/passes/${questionId}`);
}
