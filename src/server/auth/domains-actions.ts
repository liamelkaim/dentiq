"use server";

// Server action for Admin > Email domains (administrators only).
import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { requireRole } from "@/server/auth/session";
import { updateAllowedDomains } from "./domains";

export type DomainsFormState = { status: "idle" | "success" | "error"; message?: string };

export async function updateDomainsAction(_prev: DomainsFormState, form: FormData): Promise<DomainsFormState> {
  const viewer = await requireRole("admin");
  const raw = form.get("domains");
  const result = await updateAllowedDomains(getDb(), viewer, typeof raw === "string" ? raw : "");
  if (!result.ok) return { status: "error", message: result.error === "invalid" ? "admin.domains.invalid" : "admin.domains.forbidden" };
  revalidatePath("/admin/email");
  return { status: "success", message: "admin.domains.saved" };
}
