"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db/client";
import { requireUser } from "@/server/auth/session";
import { getStorage } from "@/server/storage";
import {
  addVersion,
  createResource,
  moderateResource,
  moderationActions,
  reportInputSchema,
  reportResource,
  resolveReport,
  resourceInputSchema,
  setOfficial,
  versionInputSchema,
  type UploadFile,
} from "./service";

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

function errorMessage(code: string) {
  return errorKeys[code] ?? `errors.${code}`;
}

function toFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "form");
    out[field] ??= `errors.${knownFieldErrors.has(issue.message) ? issue.message : "invalid"}`;
  }
  return out;
}

async function readFile(form: FormData): Promise<UploadFile | null> {
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return null;
  return { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) };
}

function formObject(form: FormData) {
  return Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string"));
}

function revalidateResources(resourceId?: string) {
  revalidatePath("/resources");
  revalidatePath("/moderation");
  revalidatePath("/courses", "layout");
  if (resourceId) revalidatePath(`/resources/${resourceId}`);
}

export async function uploadResourceAction(_prev: ResourceFormState, form: FormData): Promise<ResourceFormState> {
  const viewer = await requireUser();
  const parsed = resourceInputSchema.safeParse(formObject(form));
  if (!parsed.success) return { status: "error", message: "errors.invalid", fieldErrors: toFieldErrors(parsed.error) };
  const file = await readFile(form);
  if (!file) return { status: "error", message: "errors.fileMissing", fieldErrors: { file: "errors.fileMissing" } };

  const result = await createResource(getDb(), getStorage(), viewer, parsed.data, file);
  if (!result.ok) {
    return { status: "error", message: errorMessage(result.error), duplicateOf: result.resourceId };
  }
  revalidateResources(result.value.id);
  redirect(`/resources/${result.value.id}`);
}

export async function addVersionAction(_prev: ResourceFormState, form: FormData): Promise<ResourceFormState> {
  const viewer = await requireUser();
  const parsed = versionInputSchema.safeParse(formObject(form));
  if (!parsed.success) return { status: "error", message: "errors.invalid", fieldErrors: toFieldErrors(parsed.error) };
  const file = await readFile(form);
  if (!file) return { status: "error", message: "errors.fileMissing", fieldErrors: { file: "errors.fileMissing" } };

  const result = await addVersion(getDb(), getStorage(), viewer, parsed.data.resourceId, file, parsed.data.changeNote);
  if (!result.ok) return { status: "error", message: errorMessage(result.error), duplicateOf: result.resourceId };
  revalidateResources(parsed.data.resourceId);
  return { status: "success", message: "resources.version.added" };
}

export async function reportResourceAction(_prev: ResourceFormState, form: FormData): Promise<ResourceFormState> {
  const viewer = await requireUser();
  const parsed = reportInputSchema.safeParse(formObject(form));
  if (!parsed.success) return { status: "error", message: "errors.invalid", fieldErrors: toFieldErrors(parsed.error) };
  const result = await reportResource(getDb(), viewer, parsed.data);
  if (!result.ok) return { status: "error", message: errorMessage(result.error) };
  revalidatePath("/moderation");
  return { status: "success", message: "resources.report.sent" };
}

const moderateSchema = z.object({
  resourceId: z.uuid(),
  action: z.enum(Object.keys(moderationActions) as [keyof typeof moderationActions]),
});

export async function moderateResourceAction(form: FormData): Promise<void> {
  const viewer = await requireUser();
  const input = moderateSchema.parse(formObject(form));
  await moderateResource(getDb(), viewer, input.resourceId, input.action);
  revalidateResources(input.resourceId);
}

export async function setOfficialAction(form: FormData): Promise<void> {
  const viewer = await requireUser();
  const input = z.object({ resourceId: z.uuid(), value: z.enum(["true", "false"]) }).parse(formObject(form));
  await setOfficial(getDb(), viewer, input.resourceId, input.value === "true");
  revalidateResources(input.resourceId);
}

export async function resolveReportAction(form: FormData): Promise<void> {
  const viewer = await requireUser();
  const input = z
    .object({
      reportId: z.uuid(),
      resourceId: z.uuid(),
      outcome: z.enum(["resolved", "dismissed"]),
      note: z.string().trim().max(500).optional(),
    })
    .parse(formObject(form));
  await resolveReport(getDb(), viewer, input.reportId, input.outcome, input.note || null);
  revalidateResources(input.resourceId);
}
