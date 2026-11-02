"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { requireUser } from "@/server/auth/session";
import { saveOnboarding } from "./service";

export type OnboardingState = { status: "idle" | "error"; message?: string };

function text(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : "";
}

/** Saves the answers (or none, when the student skips) and goes to the dashboard. */
export async function onboardingAction(_prev: OnboardingState, form: FormData): Promise<OnboardingState> {
  const viewer = await requireUser();
  const skip = form.get("skip") !== null;
  const result = await saveOnboarding(
    getDb(),
    viewer.id,
    skip ? { university: "", programYear: "", semester: "" } : { university: text(form, "university"), programYear: text(form, "programYear"), semester: text(form, "semester") },
  );
  if (!result.ok) return { status: "error", message: result.error };
  redirect("/");
}
