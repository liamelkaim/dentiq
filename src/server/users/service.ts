import { and, asc, eq, type SQL } from "drizzle-orm";
import type { Database } from "@/db/client";
import { user, type ApprovalStatus, type Role } from "@/db/schema";
import { writeAudit } from "@/server/audit";
import { isOnlyApprovedAdmin, isRetryableConflict, lockAdminsAnd } from "./admin-guard";
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

/**
 * Changes one account inside a transaction that first locks every administrator row and the target (see
 * admin-guard.ts). `leavesAdmin` says whether the change would stop the target from being an approved administrator;
 * if the target is the last one, the change is refused with "lastAdmin".
 */
async function changeAccount(
  db: Database,
  targetId: string,
  leavesAdmin: (current: { role: string; approvalStatus: string }) => boolean,
  apply: (tx: Pick<Database, "update">) => Promise<void>,
  audit: { actorId: string; action: string; metadata?: Record<string, unknown> },
): Promise<ServiceResult<null>> {
  try {
    return await db.transaction(async (tx) => {
      const locked = await lockAdminsAnd(tx, targetId);
      const target = locked.find((r) => r.id === targetId);
      if (!target) return { ok: false as const, error: "notFound" };
      if (leavesAdmin(target) && isOnlyApprovedAdmin(locked, targetId)) return { ok: false as const, error: "lastAdmin" };
      await apply(tx);
      await writeAudit(tx, { actorId: audit.actorId, action: audit.action, entityType: "user", entityId: targetId, metadata: audit.metadata });
      return { ok: true as const, value: null };
    });
  } catch (error) {
    if (isRetryableConflict(error)) return { ok: false, error: "tryAgain" };
    throw error;
  }
}

export async function setApprovalStatus(
  db: Database,
  actorId: string,
  targetId: string,
  status: ApprovalStatus,
): Promise<ServiceResult<null>> {
  // Admins can't change their own status — prevents accidentally locking yourself out.
  if (actorId === targetId) return { ok: false, error: "cannotChangeSelf" };
  return changeAccount(
    db,
    targetId,
    () => status !== "approved",
    async (tx) => {
      await tx.update(user).set({ approvalStatus: status, updatedAt: new Date() }).where(eq(user.id, targetId));
    },
    { actorId, action: `user.approval.${status}` },
  );
}

export async function setUserRole(
  db: Database,
  actorId: string,
  targetId: string,
  role: Role,
): Promise<ServiceResult<null>> {
  if (actorId === targetId) return { ok: false, error: "cannotChangeSelf" };
  return changeAccount(
    db,
    targetId,
    () => role !== "admin",
    async (tx) => {
      await tx.update(user).set({ role, updatedAt: new Date() }).where(eq(user.id, targetId));
    },
    { actorId, action: "user.role.set", metadata: { role } },
  );
}
