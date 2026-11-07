// Appeals against a moderator's decision. The author of a shared resource (hidden/removed) or exam question
// (hidden/rejected) may contest it once while the appeal is open. An administrator decides, and every step is audited.
// A decision in the author's favour republishes the item (an administrator may also leave a note).
import { and, asc, eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { contentAppeals, examQuestions, resources, user, type AppealEntityType } from "@/db/schema";
import { writeAudit } from "@/server/audit";
import { hasRole } from "@/server/auth/roles";
import { canAccessLibrary, type Viewer } from "@/server/resources/service";

export const APPEAL_MESSAGE_MIN = 10;
export const APPEAL_MESSAGE_MAX = 1000;

export type AppealResult = { ok: true } | { ok: false; error: "invalid" | "notFound" | "notAllowed" | "tooShort" | "tooLong" | "alreadyOpen" | "forbidden" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function target(db: Database, type: AppealEntityType, id: string) {
  if (type === "resource") {
    const [r] = await db.select({ owner: resources.createdBy, status: resources.status, visibility: resources.visibility }).from(resources).where(eq(resources.id, id));
    return r && r.visibility === "shared" ? { owner: r.owner, appealable: r.status === "hidden" || r.status === "removed" } : null;
  }
  const [q] = await db.select({ owner: examQuestions.contributedBy, status: examQuestions.status }).from(examQuestions).where(eq(examQuestions.id, id));
  return q ? { owner: q.owner, appealable: q.status === "rejected" } : null;
}

/** Does the viewer already have an open appeal for this item? (Shown instead of the form, so a sent appeal stays visible.) */
export async function hasOpenAppeal(db: Database, viewer: Viewer, type: AppealEntityType, id: string): Promise<boolean> {
  if (!canAccessLibrary(viewer)) return false;
  const open = await db.select({ id: contentAppeals.id }).from(contentAppeals).where(and(eq(contentAppeals.entityType, type), eq(contentAppeals.entityId, id), eq(contentAppeals.appellantId, viewer.id), eq(contentAppeals.status, "open")));
  return open.length > 0;
}

/** Can this viewer appeal this item right now? Used to show the button (the service re-checks on submit). */
export async function canAppeal(db: Database, viewer: Viewer, type: AppealEntityType, id: string): Promise<boolean> {
  if (!canAccessLibrary(viewer)) return false;
  const t = await target(db, type, id);
  if (!t || t.owner !== viewer.id || !t.appealable) return false;
  return !(await hasOpenAppeal(db, viewer, type, id));
}

export async function submitAppeal(db: Database, viewer: Viewer, input: { entityType: unknown; entityId: unknown; message: unknown }): Promise<AppealResult> {
  if (!canAccessLibrary(viewer)) return { ok: false, error: "forbidden" };
  const type = input.entityType === "resource" || input.entityType === "question" ? input.entityType : null;
  const id = typeof input.entityId === "string" && UUID.test(input.entityId) ? input.entityId : null;
  if (!type || !id) return { ok: false, error: "invalid" };
  const message = (typeof input.message === "string" ? input.message : "").replace(/\r\n/g, "\n").trim();
  if (message.length < APPEAL_MESSAGE_MIN) return { ok: false, error: "tooShort" };
  if (message.length > APPEAL_MESSAGE_MAX) return { ok: false, error: "tooLong" };
  const t = await target(db, type, id);
  if (!t || t.owner !== viewer.id) return { ok: false, error: "notFound" };
  if (!t.appealable) return { ok: false, error: "notAllowed" };
  try {
    const [row] = await db.insert(contentAppeals).values({ entityType: type, entityId: id, appellantId: viewer.id, message }).returning({ id: contentAppeals.id });
    await writeAudit(db, { actorId: viewer.id, action: "appeal.submit", entityType: "content_appeal", entityId: row!.id, metadata: { target: type } });
  } catch (error) {
    const e = error as { code?: string; cause?: { code?: string } };
    if (e?.code === "23505" || e?.cause?.code === "23505") return { ok: false, error: "alreadyOpen" };
    throw error;
  }
  return { ok: true };
}

export async function listOpenAppeals(db: Database, viewer: Viewer) {
  if (!hasRole(viewer, "admin")) return [];
  return db
    .select({
      id: contentAppeals.id,
      entityType: contentAppeals.entityType,
      entityId: contentAppeals.entityId,
      message: contentAppeals.message,
      createdAt: contentAppeals.createdAt,
      appellantName: user.name,
    })
    .from(contentAppeals)
    .leftJoin(user, eq(contentAppeals.appellantId, user.id))
    .where(eq(contentAppeals.status, "open"))
    .orderBy(asc(contentAppeals.createdAt))
    .limit(200);
}

export async function decideAppeal(db: Database, viewer: Viewer, appealId: string, outcome: "upheld" | "denied", note: string | null): Promise<AppealResult> {
  if (!hasRole(viewer, "admin")) return { ok: false, error: "forbidden" };
  if (!UUID.test(appealId)) return { ok: false, error: "invalid" };
  const cleanNote = note?.trim().slice(0, 500) || null;
  return db.transaction(async (tx) => {
    const [appeal] = await tx
      .update(contentAppeals)
      .set({ status: outcome, decidedBy: viewer.id, decidedAt: new Date(), decisionNote: cleanNote })
      .where(and(eq(contentAppeals.id, appealId), eq(contentAppeals.status, "open")))
      .returning({ entityType: contentAppeals.entityType, entityId: contentAppeals.entityId });
    if (!appeal) return { ok: false, error: "notFound" } as const;
    if (outcome === "upheld") {
      if (appeal.entityType === "resource") await tx.update(resources).set({ status: "published" }).where(eq(resources.id, appeal.entityId));
      else await tx.update(examQuestions).set({ status: "published", reviewedBy: viewer.id, reviewedAt: new Date() }).where(eq(examQuestions.id, appeal.entityId));
    }
    await writeAudit(tx, { actorId: viewer.id, action: `appeal.${outcome}`, entityType: "content_appeal", entityId: appealId, metadata: { target: appeal.entityType, targetId: appeal.entityId } });
    return { ok: true } as const;
  });
}
