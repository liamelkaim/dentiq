"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db/client";
import { requireRole, requireUser } from "@/server/auth/session";
import { checkRate } from "@/server/rate-limit/guard";
import { RATE_APPEAL } from "@/server/rate-limit/limits";
import { decideAppeal, submitAppeal } from "./service";

export type AppealFormState = { status: "idle" | "success" | "error"; message?: string };

export async function submitAppealAction(_prev: AppealFormState, form: FormData): Promise<AppealFormState> {
  const viewer = await requireUser();
  if (!(await checkRate(RATE_APPEAL, viewer.id)).allowed) return { status: "error", message: "errors.tooManyAttempts" };
  const result = await submitAppeal(getDb(), viewer, { entityType: form.get("entityType"), entityId: form.get("entityId"), message: form.get("message") });
  if (!result.ok) return { status: "error", message: `appeals.errors.${result.error}` };
  revalidatePath("/moderation");
  return { status: "success", message: "appeals.sent" };
}

/** The outcome is bound on the button (`decideAppealAction.bind(null, "upheld")`): React drops `name`/`value` on a button that has a server `formAction`, so the outcome cannot travel in the form data. */
export async function decideAppealAction(outcome: "upheld" | "denied", form: FormData): Promise<void> {
  const viewer = await requireRole("admin");
  const input = z.object({ appealId: z.uuid(), outcome: z.enum(["upheld", "denied"]), note: z.string().trim().max(500).optional() }).parse({ ...Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string")), outcome });
  await decideAppeal(getDb(), viewer, input.appealId, input.outcome, input.note || null);
  revalidatePath("/moderation");
  revalidatePath("/", "layout");
}
