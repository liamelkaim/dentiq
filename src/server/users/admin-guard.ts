// The "last approved administrator" rule, shared by account deletion and by role/approval changes.
//
// Two administrators acting at the same moment (deleting themselves, demoting each other) must not both succeed and
// leave the site with nobody who can run it. Every such transaction first locks the same rows in the same order:
// all administrator rows plus the target row, sorted by id (FOR UPDATE). Same order everywhere means no deadlock
// between them; the second transaction waits, then sees the first one's result and refuses.
import { eq, or } from "drizzle-orm";
import type { Database } from "@/db/client";
import { user } from "@/db/schema";

export type LockedUser = { id: string; email: string; role: string; approvalStatus: string };

/** Run inside `db.transaction`. Returns the locked rows (all administrators, plus the target) sorted by id. */
export async function lockAdminsAnd(tx: Pick<Database, "select">, targetId: string): Promise<LockedUser[]> {
  return tx
    .select({ id: user.id, email: user.email, role: user.role, approvalStatus: user.approvalStatus })
    .from(user)
    .where(or(eq(user.role, "admin"), eq(user.id, targetId)))
    .orderBy(user.id)
    .for("update");
}

export const isApprovedAdmin = (row: { role: string; approvalStatus: string }) => row.role === "admin" && row.approvalStatus === "approved";

/** True when some account other than `targetId` is an approved administrator (among the locked rows). */
export function hasOtherApprovedAdmin(locked: LockedUser[], targetId: string): boolean {
  return locked.some((r) => r.id !== targetId && isApprovedAdmin(r));
}

/** True when `target` is an approved administrator and no OTHER approved administrator exists among the locked rows. */
export function isOnlyApprovedAdmin(locked: LockedUser[], targetId: string): boolean {
  const target = locked.find((r) => r.id === targetId);
  return Boolean(target && isApprovedAdmin(target)) && !hasOtherApprovedAdmin(locked, targetId);
}

/** Postgres deadlock (40P01) or serialization failure (40001), also when the driver wraps it in `cause`. */
export function isRetryableConflict(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string } } | null;
  const code = e?.code ?? e?.cause?.code;
  return code === "40P01" || code === "40001";
}
