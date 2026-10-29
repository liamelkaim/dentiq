"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db/client";
import { approvalStatuses, roles } from "@/db/schema";
import { requireRole } from "@/server/auth/session";
import { setApprovalStatus, setUserRole } from "./service";

const approvalSchema = z.object({ userId: z.string().min(1), status: z.enum(approvalStatuses) });
const roleSchema = z.object({ userId: z.string().min(1), role: z.enum(roles) });

export async function setApprovalAction(form: FormData): Promise<void> {
  const actor = await requireRole("admin");
  const input = approvalSchema.parse({ userId: form.get("userId"), status: form.get("status") });
  await setApprovalStatus(getDb(), actor.id, input.userId, input.status);
  revalidatePath("/admin/users");
  revalidatePath("/admin");
}

export async function setRoleAction(form: FormData): Promise<void> {
  const actor = await requireRole("admin");
  const input = roleSchema.parse({ userId: form.get("userId"), role: form.get("role") });
  await setUserRole(getDb(), actor.id, input.userId, input.role);
  revalidatePath("/admin/users");
}
