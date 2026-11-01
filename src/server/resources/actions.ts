"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db/client";
import { requireUser } from "@/server/auth/session";
import { errorMessage, formObject, revalidateResources, toFieldErrors, type ResourceFormState } from "./form-helpers";
import {
  moderateResource,
  moderationActions,
  reportInputSchema,
  reportResource,
  resolveReport,
  setOfficial,
} from "./service";

// Document uploads are NOT server actions: see upload-handlers.ts and /api/uploads.

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
