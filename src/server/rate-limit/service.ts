// Shared rate limiting in the database. A fixed window per key: the first attempt opens a window, attempts inside it are
// counted, and once the window has passed the next attempt opens a new one. The whole decision is ONE atomic statement
// (INSERT ... ON CONFLICT DO UPDATE), so concurrent requests, even on different serverless instances, serialize on the
// row and can never exceed the limit. Nothing here is per instance: it works on serverless with no paid service.
// Keys are opaque strings like "export:<user id>"; no content is stored. Limits for each feature: ./limits.ts.
import { sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import { rateLimits } from "@/db/schema";
import { CLEANUP_CHANCE } from "./limits";

export type AttemptResult = {
  allowed: boolean;
  /** Attempts counted in the current window, including this one (never above limit + 1). */
  count: number;
  /** Seconds until the window ends and a new attempt is accepted again. */
  retryAfterSeconds: number;
};

export type AttemptOptions = {
  /** The clock; tests pass a fixed time. Production uses the application clock. */
  now?: Date;
  /** 0 to 1: how likely this call is to also delete expired rows. Tests pass 0 or 1. */
  cleanupChance?: number;
};

/**
 * Records one attempt for `key` and says whether it is allowed (at most `limit` per `windowSeconds`).
 * An attempt over the limit is refused and does NOT extend the window, so a retry loop cannot lock itself out for ever.
 */
export async function consumeAttempt(db: Database, key: string, limit: number, windowSeconds: number, options: AttemptOptions = {}): Promise<AttemptResult> {
  if (!key) throw new Error("rate limit key is required");
  if (!Number.isInteger(limit) || limit < 1) throw new Error("rate limit must be a positive integer");
  if (!Number.isInteger(windowSeconds) || windowSeconds < 1) throw new Error("rate limit window must be a positive number of seconds");

  const now = options.now ?? new Date();
  const nowSql = sql`${now.toISOString()}::timestamptz`;
  // True when the stored window has fully passed (then this attempt opens a new window).
  const expired = sql`${rateLimits.windowStart} + ${rateLimits.windowSeconds} * interval '1 second' <= ${nowSql}`;

  const [row] = await db
    .insert(rateLimits)
    .values({ key, windowStart: now, windowSeconds, count: 1 })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        windowStart: sql`case when ${expired} then ${nowSql} else ${rateLimits.windowStart} end`,
        windowSeconds: sql`case when ${expired} then ${windowSeconds}::integer else ${rateLimits.windowSeconds} end`,
        // Capped at limit + 1 so the number cannot grow without bound while someone keeps retrying.
        count: sql`case when ${expired} then 1 else least(${rateLimits.count} + 1, ${limit + 1}) end`,
      },
    })
    .returning({ count: rateLimits.count, windowStart: rateLimits.windowStart, windowSeconds: rateLimits.windowSeconds });

  if (!row) throw new Error("rate limit upsert returned no row");
  const endsAt = row.windowStart.getTime() + row.windowSeconds * 1000;
  const result: AttemptResult = {
    allowed: row.count <= limit,
    count: row.count,
    retryAfterSeconds: Math.max(1, Math.ceil((endsAt - now.getTime()) / 1000)),
  };

  // Housekeeping rides along on a small share of calls, so no scheduler is needed. A failure here never blocks the request.
  if (Math.random() < (options.cleanupChance ?? CLEANUP_CHANCE)) {
    await cleanupExpiredRateLimits(db, now).catch(() => 0);
  }
  return result;
}

/** Same as consumeAttempt, reduced to the yes/no answer. */
export async function allowAttempt(db: Database, key: string, limit: number, windowSeconds: number, options: AttemptOptions = {}): Promise<boolean> {
  return (await consumeAttempt(db, key, limit, windowSeconds, options)).allowed;
}

/** Deletes every counter whose window has passed (it could not block anything any more). Returns how many were removed. */
export async function cleanupExpiredRateLimits(db: Database, now: Date = new Date()): Promise<number> {
  const removed = await db
    .delete(rateLimits)
    .where(sql`${rateLimits.windowStart} + ${rateLimits.windowSeconds} * interval '1 second' <= ${now.toISOString()}::timestamptz`)
    .returning({ key: rateLimits.key });
  return removed.length;
}
