"use server";

// The Feedback form works for signed-in and signed-out visitors. Rate limited per user, or per trusted client address
// (one shared counter when no trusted address header exists), so it cannot be used to flood the administrator.
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { getDb } from "@/db/client";
import { getCurrentUser, requireRole } from "@/server/auth/session";
import { trustedIpHeaders } from "@/server/rate-limit/client-ip";
import { RATE_FEEDBACK, rateKey } from "@/server/rate-limit/limits";
import { consumeAttempt } from "@/server/rate-limit/service";
import { setFeedbackDone, submitFeedback } from "./service";

export type FeedbackState = { status: "idle" | "error" | "sent"; message?: string };

async function visitorKey(userId: string | null): Promise<string> {
  if (userId) return userId;
  const h = await headers();
  for (const name of trustedIpHeaders()) {
    const v = h.get(name)?.split(",")[0]?.trim();
    if (v) return `ip:${v.slice(0, 64)}`;
  }
  return "anonymous";
}

export async function submitFeedbackAction(_prev: FeedbackState, form: FormData): Promise<FeedbackState> {
  const viewer = await getCurrentUser();
  const key = await visitorKey(viewer?.id ?? null);
  const db = getDb();
  if (!(await consumeAttempt(db, rateKey(RATE_FEEDBACK, key), RATE_FEEDBACK.limit, RATE_FEEDBACK.windowSeconds)).allowed) return { status: "error", message: "tooMany" };
  const result = await submitFeedback(db, viewer?.id ?? null, {
    type: form.get("type"),
    message: form.get("message"),
    email: form.get("email"),
    pageUrl: form.get("pageUrl"),
    locale: await getLocale(),
  });
  if (!result.ok) return { status: "error", message: result.error };
  return { status: "sent" };
}

export async function markFeedbackAction(form: FormData): Promise<void> {
  const viewer = await requireRole("admin");
  await setFeedbackDone(getDb(), viewer, String(form.get("id") ?? ""), form.get("done") === "1");
  revalidatePath("/admin/feedback");
}
