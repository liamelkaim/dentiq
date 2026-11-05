// Backup restore rehearsal on a local in-memory Postgres (PGlite): dump a migrated database holding synthetic rows,
// load the dump into a fresh server, check the data and constraints survived, and check migrations are rollback-safe
// (additive only). It proves the app's schema survives dump and restore; it does NOT prove the hosted provider's backups.
// See docs/legal/backup-restore-and-rollback.md.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { count, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { describe, expect, it } from "vitest";
import * as schema from "@/db/schema";

const folder = join(process.cwd(), "drizzle");

describe("dump and restore", () => {
  it("restores rows, keeps constraints, and migrating the restored copy again changes nothing", async () => {
    const source = new PGlite();
    const db = drizzle(source, { schema, casing: "snake_case" });
    await migrate(db, { migrationsFolder: folder });
    await db.insert(schema.user).values({ id: "u1", name: "TEST Student", email: "u1@example.com", emailVerified: true, approvalStatus: "approved" });
    await db.insert(schema.tutorConsents).values({ userId: "u1", version: 2, locale: "en" });
    await db.insert(schema.feedback).values({ userId: "u1", type: "idea", message: "Synthetic feedback", pagePath: "/", locale: "fr" });

    const dump = await source.dumpDataDir("none");
    await source.close();

    const restored = new PGlite({ loadDataDir: dump });
    const rdb = drizzle(restored, { schema, casing: "snake_case" });
    expect((await rdb.select({ n: count() }).from(schema.user))[0]!.n).toBe(1);
    expect((await rdb.select().from(schema.tutorConsents).where(eq(schema.tutorConsents.userId, "u1")))[0]).toMatchObject({ version: 2, locale: "en" });
    expect((await rdb.select({ n: count() }).from(schema.feedback))[0]!.n).toBe(1);
    // A constraint still holds after the restore (empty feedback text is refused by the database).
    await expect(rdb.insert(schema.feedback).values({ type: "bug", message: "   ", pagePath: "/", locale: "fr" })).rejects.toThrow();
    // Re-running the migrations on the restored copy is a no-op.
    await migrate(rdb, { migrationsFolder: folder });
    expect((await rdb.select({ n: count() }).from(schema.user))[0]!.n).toBe(1);
    await restored.close();
  }, 60_000);
});

describe("rollback safety of migrations", () => {
  const files = readdirSync(folder).filter((f) => f.endsWith(".sql")).sort();
  // Migrations that predate the additive-only rule and were already reviewed by hand are listed here with the reason.
  // Empty on purpose: any destructive statement in a NEW migration must fail this test and be discussed first.
  const reviewed = new Set<string>();
  it("no migration drops, renames or retypes anything", () => {
    const offenders = files.filter((f) => !reviewed.has(f) && /\bDROP\s+(TABLE|COLUMN|CONSTRAINT|INDEX)\b|\bRENAME\b|\bALTER\s+COLUMN\b.*\bTYPE\b/i.test(readFileSync(join(folder, f), "utf8")));
    expect(offenders).toEqual([]);
  });
});
