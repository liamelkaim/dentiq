import type { Database } from "@/db/client";
import { auditLog } from "@/db/schema";

export type DbExecutor = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];

export type AuditEntry = {
  actorId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
};

export async function writeAudit(db: DbExecutor, entry: AuditEntry): Promise<void> {
  await db.insert(auditLog).values({
    actorId: entry.actorId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    metadata: entry.metadata ?? null,
  });
}
