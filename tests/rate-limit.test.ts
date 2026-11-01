// Shared rate limiting in the database (src/server/rate-limit) and Better Auth's database-backed limiter.
// Fake addresses only (example.com, documentation IP ranges).
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase, type Database } from "@/db/client";
import { authRateLimit, rateLimits } from "@/db/schema";
import { createAuth } from "@/server/auth/auth";
import { KNOWN_IP_HEADERS, trustedIpHeaders } from "@/server/rate-limit/client-ip";
import { rateKey, RATE_ACCOUNT_DELETE, RATE_ACCOUNT_EXPORT, RATE_CALENDAR_EXPORT, RATE_SEARCH, RATE_STUDY_EXPORT, RATE_TUTOR_SEARCH } from "@/server/rate-limit/limits";
import { allowAttempt, cleanupExpiredRateLimits, consumeAttempt } from "@/server/rate-limit/service";

let db: Database;
const T0 = new Date("2026-01-01T12:00:00.000Z");
const at = (seconds: number) => new Date(T0.getTime() + seconds * 1000);
const quiet = { cleanupChance: 0 };

beforeEach(async () => {
  db = await createTestDatabase();
});

describe("allowAttempt", () => {
  it("allows the configured number of attempts per window and then refuses", async () => {
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await allowAttempt(db, "k", 3, 60, { now: at(i), ...quiet }));
    expect(results).toEqual([true, true, true, false]);
  });

  it("reports how long to wait and does not extend the window when refusing", async () => {
    await consumeAttempt(db, "k", 1, 60, { now: T0, ...quiet });
    const refused = await consumeAttempt(db, "k", 1, 60, { now: at(10), ...quiet });
    expect(refused).toMatchObject({ allowed: false, retryAfterSeconds: 50 });
    // Hammering does not push the end of the window out.
    for (let i = 0; i < 5; i++) await consumeAttempt(db, "k", 1, 60, { now: at(20 + i), ...quiet });
    expect((await consumeAttempt(db, "k", 1, 60, { now: at(30), ...quiet })).retryAfterSeconds).toBe(30);
    // The counter stays bounded while someone keeps retrying.
    const [row] = await db.select().from(rateLimits).where(eq(rateLimits.key, "k"));
    expect(row?.count).toBe(2);
    // And the next window opens on time.
    expect(await allowAttempt(db, "k", 1, 60, { now: at(60), ...quiet })).toBe(true);
  });

  it("opens a new window once the old one has passed", async () => {
    expect(await allowAttempt(db, "k", 2, 10, { now: at(0), ...quiet })).toBe(true);
    expect(await allowAttempt(db, "k", 2, 10, { now: at(1), ...quiet })).toBe(true);
    expect(await allowAttempt(db, "k", 2, 10, { now: at(2), ...quiet })).toBe(false);
    expect(await allowAttempt(db, "k", 2, 10, { now: at(10), ...quiet })).toBe(true);
    expect(await allowAttempt(db, "k", 2, 10, { now: at(11), ...quiet })).toBe(true);
    expect(await allowAttempt(db, "k", 2, 10, { now: at(12), ...quiet })).toBe(false);
  });

  it("keeps every key separate", async () => {
    expect(await allowAttempt(db, "export:user-a", 1, 60, { now: T0, ...quiet })).toBe(true);
    expect(await allowAttempt(db, "export:user-a", 1, 60, { now: at(1), ...quiet })).toBe(false);
    expect(await allowAttempt(db, "export:user-b", 1, 60, { now: at(1), ...quiet })).toBe(true);
    expect(await allowAttempt(db, "search:user-a", 1, 60, { now: at(1), ...quiet })).toBe(true);
  });

  it("cannot exceed the limit under concurrent calls", async () => {
    const results = await Promise.all(Array.from({ length: 40 }, () => allowAttempt(db, "burst", 10, 60, { now: T0, ...quiet })));
    expect(results.filter(Boolean)).toHaveLength(10);
    const [row] = await db.select().from(rateLimits).where(eq(rateLimits.key, "burst"));
    expect(row?.count).toBe(11);
  });

  it("rejects nonsense input instead of silently allowing everything", async () => {
    await expect(allowAttempt(db, "", 1, 60)).rejects.toThrow();
    await expect(allowAttempt(db, "k", 0, 60)).rejects.toThrow();
    await expect(allowAttempt(db, "k", 1, 0)).rejects.toThrow();
    await expect(allowAttempt(db, "k", 1.5, 60)).rejects.toThrow();
  });
});

describe("cleanup", () => {
  it("deletes only counters whose window has passed", async () => {
    await allowAttempt(db, "short", 5, 10, { now: T0, ...quiet });
    await allowAttempt(db, "long", 5, 3600, { now: T0, ...quiet });
    expect(await cleanupExpiredRateLimits(db, at(5))).toBe(0);
    expect(await cleanupExpiredRateLimits(db, at(10))).toBe(1);
    expect((await db.select().from(rateLimits)).map((r) => r.key)).toEqual(["long"]);
    expect(await cleanupExpiredRateLimits(db, at(3600))).toBe(1);
    expect(await db.select().from(rateLimits)).toHaveLength(0);
  });

  it("runs by itself on some calls (no scheduler needed)", async () => {
    for (let i = 0; i < 20; i++) await allowAttempt(db, `old-${i}`, 5, 10, { now: T0, ...quiet });
    expect(await db.select().from(rateLimits)).toHaveLength(20);
    await allowAttempt(db, "fresh", 5, 10, { now: at(60), cleanupChance: 1 });
    expect((await db.select().from(rateLimits)).map((r) => r.key)).toEqual(["fresh"]);
  });

  it("still remembers a key that was cleaned up as a fresh start", async () => {
    await allowAttempt(db, "k", 1, 10, { now: T0, ...quiet });
    await cleanupExpiredRateLimits(db, at(10));
    expect(await allowAttempt(db, "k", 1, 10, { now: at(11), ...quiet })).toBe(true);
  });
});

describe("limits", () => {
  it("every rule is sane and keys never collide between features", () => {
    const rules = [RATE_ACCOUNT_EXPORT, RATE_ACCOUNT_DELETE, RATE_SEARCH, RATE_TUTOR_SEARCH, RATE_STUDY_EXPORT, RATE_CALENDAR_EXPORT];
    for (const rule of rules) {
      expect(Number.isInteger(rule.limit) && rule.limit >= 1).toBe(true);
      expect(Number.isInteger(rule.windowSeconds) && rule.windowSeconds >= 1).toBe(true);
    }
    expect(new Set(rules.map((r) => rateKey(r, "u1"))).size).toBe(rules.length);
  });
});

describe("trusted client IP header", () => {
  it("trusts nothing by default, so a forged header cannot dodge the limit", () => {
    expect(trustedIpHeaders({})).toEqual([]);
    expect(trustedIpHeaders({ NODE_ENV: "production" })).toEqual([]);
  });

  it("trusts x-forwarded-for on Vercel, where the platform overwrites it", () => {
    expect(trustedIpHeaders({ VERCEL: "1" })).toEqual(["x-forwarded-for"]);
  });

  it("follows TRUSTED_IP_HEADER, but only for known header names", () => {
    expect(trustedIpHeaders({ TRUSTED_IP_HEADER: "x-real-ip" })).toEqual(["x-real-ip"]);
    expect(trustedIpHeaders({ TRUSTED_IP_HEADER: " X-Forwarded-For " })).toEqual(["x-forwarded-for"]);
    expect(trustedIpHeaders({ TRUSTED_IP_HEADER: "none", VERCEL: "1" })).toEqual([]);
    expect(trustedIpHeaders({ TRUSTED_IP_HEADER: "x-evil-header" })).toEqual([]);
    for (const name of KNOWN_IP_HEADERS) expect(trustedIpHeaders({ TRUSTED_IP_HEADER: name })).toEqual([name]);
  });
});

describe("Better Auth limiter on database storage", () => {
  const attempt = (auth: ReturnType<typeof createAuth>, headers: Record<string, string>) =>
    auth.handler(
      new Request("http://localhost:3000/api/auth/sign-in/email", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:3000", ...headers },
        body: JSON.stringify({ email: "nobody@example.com", password: "wrong-password-123" }),
      }),
    );

  it("counts in the auth_rate_limit table, limits sign-in per client IP and keeps other IPs free", async () => {
    const auth = createAuth(db, { nextjs: false, rateLimitEnabled: true, ipHeaders: ["x-forwarded-for"], mailer: { send: async () => {} } });
    const statuses = [];
    for (let i = 0; i < 7; i++) statuses.push((await attempt(auth, { "x-forwarded-for": "203.0.113.7" })).status);
    // 5 per minute on /sign-in/email: the first five reach the handler (wrong password: 401), then 429.
    expect(statuses.slice(0, 5).every((s) => s !== 429)).toBe(true);
    expect(statuses.slice(5)).toEqual([429, 429]);
    expect((await attempt(auth, { "x-forwarded-for": "203.0.113.8" })).status).not.toBe(429);

    const rows = await db.select().from(authRateLimit);
    expect(rows.map((r) => r.key).sort()).toEqual(["203.0.113.7|/sign-in/email", "203.0.113.8|/sign-in/email"]);
  });

  it("with no trusted header, a forged x-forwarded-for does not buy a fresh counter", async () => {
    const auth = createAuth(db, { nextjs: false, rateLimitEnabled: true, ipHeaders: [], mailer: { send: async () => {} } });
    // NODE_ENV is "test" here, which falls back to localhost for everyone; production would use one shared bucket.
    // Either way the forged values must not create separate counters.
    const statuses = [];
    for (let i = 0; i < 7; i++) statuses.push((await attempt(auth, { "x-forwarded-for": `198.51.100.${i}` })).status);
    expect(statuses.slice(5)).toEqual([429, 429]);
    const rows = await db.select().from(authRateLimit);
    expect(rows).toHaveLength(1);
  });

  it("is off when disabled (development and tests keep working without counters)", async () => {
    const auth = createAuth(db, { nextjs: false, rateLimitEnabled: false, mailer: { send: async () => {} } });
    for (let i = 0; i < 8; i++) expect((await attempt(auth, {})).status).not.toBe(429);
    expect(await db.select().from(authRateLimit)).toHaveLength(0);
  });
});
