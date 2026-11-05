"use server";

// Server action for the tutor settings (administrators only). The flag it saves does nothing on its own: the tutor also
// needs a configured provider, and none exists. Messages returned to the form are translation keys.
import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { requireRole, requireUser } from "@/server/auth/session";
import { getLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { checkRate } from "@/server/rate-limit/guard";
import { RATE_TUTOR_ASK } from "@/server/rate-limit/limits";
import { acceptTutorConsent, withdrawTutorConsent } from "./consent";
import { deleteAllConversations, deleteConversation } from "./conversations";
import { askTutor } from "./service";
import type { Passage } from "./types";

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
  const dailyTokenLimit = wholeNumber(form.get("dailyTokenLimit"));
  const dailyCostCapMicros = wholeNumber(form.get("dailyCostCapMicros"));
  if (dailyQuestionLimit === null || maxContextChars === null || dailyTokenLimit === null || dailyCostCapMicros === null) return { status: "error", message: tutorErrorKey("outOfRange") };

  const result = await updateTutorSettings(getDb(), viewer, {
    enabled: form.get("enabled") === "on",
    dailyQuestionLimit,
    maxContextChars,
    dailyTokenLimit,
    dailyCostCapMicros,
  });
  if (!result.ok) return { status: "error", message: tutorErrorKey(result.error) };
  revalidatePath("/admin/tutor");
  revalidatePath("/tutor");
  revalidatePath("/", "layout");
  return { status: "success", message: "tutor.admin.saved" };
}

// ---------- Asking, consent and saved conversations (any approved member; the tutor itself is off unless ready) ----------

export type AskState = {
  status: "idle" | "error" | "answer" | "noSources";
  /** Translation key under tutor.errors.* */
  message?: string;
  text?: string;
  citations?: { passageId: string; title: string; href: string; origin: string }[];
  passages?: Passage[];
  conversationId?: string | null;
  usage?: { usedToday: number; dailyLimit: number };
};

export async function askTutorAction(_prev: AskState, form: FormData): Promise<AskState> {
  const viewer = await requireUser();
  if (!(await checkRate(RATE_TUTOR_ASK, viewer.id)).allowed) return { status: "error", message: tutorErrorKey("tooFast") };
  const locale = (await getLocale()) === "en" ? "en" : "fr";
  const conversationId = String(form.get("conversationId") ?? "") || null;
  const result = await askTutor(getDb(), viewer, {
    courseId: String(form.get("courseId") ?? ""),
    question: String(form.get("question") ?? ""),
    locale,
    includeHistorical: form.get("historical") === "1",
    conversationId,
  });
  if (!result.ok) return { status: "error", message: tutorErrorKey(result.error) };
  if (result.kind === "noSources") return { status: "noSources" };
  revalidatePath("/tutor", "layout");
  const cited = new Set(result.answer.citedPassageIds);
  return {
    status: "answer",
    text: result.answer.text,
    citations: result.passages.filter((p) => cited.has(p.id)).map((p) => ({ passageId: p.id, title: p.source.title, href: p.source.href, origin: p.source.origin })),
    passages: result.passages,
    conversationId: result.conversationId,
    usage: result.usage,
  };
}

export async function acceptConsentAction(): Promise<void> {
  const viewer = await requireUser();
  await acceptTutorConsent(getDb(), viewer.id, await getLocale());
  revalidatePath("/tutor", "layout");
}

export async function withdrawConsentAction(): Promise<void> {
  const viewer = await requireUser();
  await withdrawTutorConsent(getDb(), viewer.id);
  revalidatePath("/tutor", "layout");
}

export async function deleteConversationAction(form: FormData): Promise<void> {
  const viewer = await requireUser();
  await deleteConversation(getDb(), viewer.id, String(form.get("id") ?? ""));
  revalidatePath("/tutor", "layout");
  redirect("/tutor/history");
}

export async function deleteAllConversationsAction(): Promise<void> {
  const viewer = await requireUser();
  await deleteAllConversations(getDb(), viewer.id);
  revalidatePath("/tutor", "layout");
  redirect("/tutor/history");
}
