import { eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { user } from "@/db/schema";
import { writeAudit } from "@/server/audit";
import type { ServiceResult } from "@/server/catalog/service";
import { PROFILE_NAME_MAX } from "./constants";

/** Collapses runs of whitespace and trims. Control characters are refused by the caller's check. */
export function normalizeDisplayName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

/** Changes the viewer's own display name. Only the name can change here; role, status and email cannot. */
export async function updateDisplayName(db: Database, userId: string, raw: string): Promise<ServiceResult<{ name: string }>> {
  if (/[\u0000-\u001f\u007f]/.test(raw.replace(/\s/g, " "))) return { ok: false, error: "invalid" };
  const name = normalizeDisplayName(raw);
  if (!name) return { ok: false, error: "nameRequired" };
  if (name.length > PROFILE_NAME_MAX) return { ok: false, error: "nameTooLong" };
  const [row] = await db.update(user).set({ name, updatedAt: new Date() }).where(eq(user.id, userId)).returning({ id: user.id });
  if (!row) return { ok: false, error: "notFound" };
  // The audit entry records that a change happened, never the name itself.
  await writeAudit(db, { actorId: userId, action: "user.name.update", entityType: "user", entityId: userId });
  return { ok: true, value: { name } };
}
