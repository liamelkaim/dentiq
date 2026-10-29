import { and, asc, eq, type SQL } from "drizzle-orm";
import type { Database } from "@/db/client";
import { user, type ApprovalStatus, type Role } from "@/db/schema";
import { writeAudit } from "@/server/audit";
import type { ServiceResult } from "@/server/catalog/service";

export async function listUsers(db: Database, filters: { approvalStatus?: ApprovalStatus } = {}) {
  const conditions: SQL[] = [];
  if (filters.approvalStatus) conditions.push(eq(user.approvalStatus, filters.approvalStatus));
  return db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      role: user.role,
      approvalStatus: user.approvalStatus,
      createdAt: user.createdAt,
    })
    .from(user)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(user.createdAt))
    .limit(500);
}

export async function setApprovalStatus(
  db: Database,
  actorId: string,
  targetId: string,
  status: ApprovalStatus,
): Promise<ServiceResult<null>> {
  // Admins can't change their own status — prevents accidentally locking yourself out.
  if (actorId === targetId) return { ok: false, error: "cannotChangeSelf" };
  const [row] = await db
    .update(user)
    .set({ approvalStatus: status, updatedAt: new Date() })
    .where(eq(user.id, targetId))
    .returning({ id: user.id });
  if (!row) return { ok: false, error: "notFound" };
  await writeAudit(db, {
    actorId,
    action: `user.approval.${status}`,
    entityType: "user",
    entityId: targetId,
  });
  return { ok: true, value: null };
}

export async function setUserRole(
  db: Database,
  actorId: string,
  targetId: string,
  role: Role,
): Promise<ServiceResult<null>> {
  if (actorId === targetId) return { ok: false, error: "cannotChangeSelf" };
  const [row] = await db
    .update(user)
    .set({ role, updatedAt: new Date() })
    .where(eq(user.id, targetId))
    .returning({ id: user.id });
  if (!row) return { ok: false, error: "notFound" };
  await writeAudit(db, {
    actorId,
    action: "user.role.set",
    entityType: "user",
    entityId: targetId,
    metadata: { role },
  });
  return { ok: true, value: null };
}
