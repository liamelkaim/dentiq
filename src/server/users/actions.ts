"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db/client";
import { approvalStatuses, roles } from "@/db/schema";
import { requireRole } from "@/server/auth/session";
import { USER_ERROR_CODES } from "./errors";
import { setApprovalStatus, setUserRole } from "./service";

const approvalSchema = z.object({ userId: z.string().min(1), status: z.enum(approvalStatuses) });
const roleSchema = z.object({ userId: z.string().min(1), role: z.enum(roles) });

/** Back to the accounts list with the reason in the URL; the page shows it as a message (only known codes). */
function redirectWithError(code: string): never {
  const known = (USER_ERROR_CODES as readonly string[]).includes(code) ? code : "notFound";
  redirect(`/admin/users?show=all&error=${known}`);
}

export async function setApprovalAction(form: FormData): Promise<void> {
  const actor = await requireRole("admin");
  const input = approvalSchema.parse({ userId: form.get("userId"), status: form.get("status") });
  const result = await setApprovalStatus(getDb(), actor.id, input.userId, input.status);
  revalidatePath("/admin/users");
  revalidatePath("/admin");
  if (!result.ok) redirectWithError(result.error);
}

export async function setRoleAction(form: FormData): Promise<void> {
  const actor = await requireRole("admin");
  const input = roleSchema.parse({ userId: form.get("userId"), role: form.get("role") });
  const result = await setUserRole(getDb(), actor.id, input.userId, input.role);
  revalidatePath("/admin/users");
  if (!result.ok) redirectWithError(result.error);
}
