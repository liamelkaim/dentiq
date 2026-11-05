// Private calendar subscription. The secret token appears once, in the link shown to the student; only its hash is kept.
import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { Database } from "@/db/client";
import { calendarFeeds, user } from "@/db/schema";
import { writeAudit } from "@/server/audit";
import type { Viewer } from "@/server/resources/service";

const hash = (token: string) => createHash("sha256").update(token).digest("hex");
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;

/** Revokes any active link and makes a new one. Returns the secret token; it cannot be read again. */
export async function createFeed(db: Database, userId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await db.transaction(async (tx) => {
    await tx.update(calendarFeeds).set({ revokedAt: new Date() }).where(and(eq(calendarFeeds.userId, userId), isNull(calendarFeeds.revokedAt)));
    await tx.insert(calendarFeeds).values({ userId, tokenHash: hash(token) });
    await writeAudit(tx, { actorId: userId, action: "calendar_feed.create", entityType: "user", entityId: userId });
  });
  return token;
}

export async function revokeFeed(db: Database, userId: string): Promise<void> {
  const rows = await db.update(calendarFeeds).set({ revokedAt: new Date() }).where(and(eq(calendarFeeds.userId, userId), isNull(calendarFeeds.revokedAt))).returning({ id: calendarFeeds.id });
  if (rows.length) await writeAudit(db, { actorId: userId, action: "calendar_feed.revoke", entityType: "user", entityId: userId });
}

export async function activeFeedInfo(db: Database, userId: string) {
  const [row] = await db.select({ createdAt: calendarFeeds.createdAt, lastUsedAt: calendarFeeds.lastUsedAt }).from(calendarFeeds).where(and(eq(calendarFeeds.userId, userId), isNull(calendarFeeds.revokedAt))).orderBy(desc(calendarFeeds.createdAt)).limit(1);
  return row ?? null;
}

/** The member a valid, unrevoked token belongs to, or null. Records the time of use. */
export async function resolveFeed(db: Database, token: string): Promise<Viewer | null> {
  if (!TOKEN_SHAPE.test(token)) return null;
  const [row] = await db
    .select({ feedId: calendarFeeds.id, id: user.id, role: user.role, emailVerified: user.emailVerified, approvalStatus: user.approvalStatus })
    .from(calendarFeeds)
    .innerJoin(user, eq(calendarFeeds.userId, user.id))
    .where(and(eq(calendarFeeds.tokenHash, hash(token)), isNull(calendarFeeds.revokedAt)));
  if (!row) return null;
  await db.update(calendarFeeds).set({ lastUsedAt: new Date() }).where(eq(calendarFeeds.id, row.feedId));
  return { id: row.id, role: row.role, emailVerified: row.emailVerified, approvalStatus: row.approvalStatus };
}
