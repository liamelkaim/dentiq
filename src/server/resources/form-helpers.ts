// Pieces shared by the resource server actions (actions.ts) and the upload handlers (upload-handlers.ts). Plain module,
// not "use server": a "use server" file may only export async functions.
import { revalidatePath } from "next/cache";
import type { z } from "zod";

/** Messages are translation keys; forms translate them. */
export type ResourceFormState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string>;
  duplicateOf?: string;
};

const errorKeys: Record<string, string> = {
  fileTooLarge: "errors.uploadTooLarge",
  fileType: "errors.uploadType",
  fileMissing: "errors.fileMissing",
};
const knownFieldErrors = new Set(["required", "rightsRequired"]);

export function errorMessage(code: string) {
  return errorKeys[code] ?? `errors.${code}`;
}

export function toFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "form");
    out[field] ??= `errors.${knownFieldErrors.has(issue.message) ? issue.message : "invalid"}`;
  }
  return out;
}

export function formObject(form: FormData) {
  return Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string"));
}

export function revalidateResources(resourceId?: string) {
  revalidatePath("/");
  revalidatePath("/study", "layout");
  revalidatePath("/resources");
  revalidatePath("/moderation");
  revalidatePath("/courses", "layout");
  if (resourceId) revalidatePath(`/resources/${resourceId}`);
}
