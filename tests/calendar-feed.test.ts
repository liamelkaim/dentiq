// Private calendar subscription: only a hash is stored, revoke works, one active link, unapproved members get nothing.
import { beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase, type Database } from "@/db/client";
import { calendarFeeds, user } from "@/db/schema";
import { activeFeedInfo, createFeed, resolveFeed, revokeFeed } from "@/server/calendar/feed";

let db: Database;
beforeEach(async () => {
  db = await createTestDatabase();
  await db.insert(user).values([
    { id: "a", name: "A", email: "a@example.com", emailVerified: true, approvalStatus: "approved" },
    { id: "b", name: "B", email: "b@example.com", emailVerified: true, approvalStatus: "pending" },
  ]);
});

describe("calendar feed", () => {
  it("stores only a hash and resolves the right member", async () => {
    const token = await createFeed(db, "a");
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const rows = await db.select().from(calendarFeeds);
    expect(JSON.stringify(rows)).not.toContain(token);
    expect(await resolveFeed(db, token)).toMatchObject({ id: "a", approvalStatus: "approved" });
    expect((await activeFeedInfo(db, "a"))!.lastUsedAt).toBeInstanceOf(Date);
  });
  it("a new link revokes the old one; revoking ends access; garbage tokens resolve to nothing", async () => {
    const first = await createFeed(db, "a");
    const second = await createFeed(db, "a");
    expect(await resolveFeed(db, first)).toBeNull();
    expect(await resolveFeed(db, second)).not.toBeNull();
    await revokeFeed(db, "a");
    expect(await resolveFeed(db, second)).toBeNull();
    expect(await activeFeedInfo(db, "a")).toBeNull();
    for (const bad of ["", "short", "x".repeat(43), "../".repeat(20)]) expect(await resolveFeed(db, bad)).toBeNull();
  });
  it("is private to its owner: another member's token never shows their data", async () => {
    const tokenB = await createFeed(db, "b");
    expect((await resolveFeed(db, tokenB))!.id).toBe("b");
  });
});
