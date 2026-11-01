"use server";

// Server action for the retention page (administrators only). Nothing is deleted unless the confirmation box is ticked.
// Messages returned to the form are translation keys.
import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { requireRole } from "@/server/auth/session";
import { getStorage } from "@/server/storage";
import { runRetentionAsAdmin } from "./service";

export type RetentionFormState = {
  status: "idle" | "success" | "error";
  /** Translation key. */
  message?: string;
  /** Counts of the run that just finished (shown in the notice). */
  result?: { files: number; failed: number; noteVersions: number; orphans: number };
};

export async function applyRetentionAction(_prev: RetentionFormState, form: FormData): Promise<RetentionFormState> {
  const viewer = await requireRole("admin");
  if (form.get("confirm") !== "on") return { status: "error", message: "retention.errors.confirmRequired" };

  const outcome = await runRetentionAsAdmin(getDb(), getStorage(), viewer, { apply: true, deleteOrphans: form.get("deleteOrphans") === "on" });
  if (!outcome.ok) return { status: "error", message: "retention.errors.forbidden" };

  const r = outcome.value;
  revalidatePath("/admin/retention");
  return {
    status: "success",
    message: "retention.done",
    result: {
      files: r.questionImages.deleted + r.documentVersions.deleted,
      failed: r.questionImages.failed + r.documentVersions.failed + r.orphans.failed,
      noteVersions: r.noteVersions.deleted,
      orphans: r.orphans.deleted,
    },
  };
}
