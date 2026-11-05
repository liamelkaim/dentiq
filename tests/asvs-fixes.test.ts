// Fixes from the ASVS review (docs/legal/asvs-review.md). Each test was written to fail before the fix.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase, type Database } from "@/db/client";
import { user } from "@/db/schema";
import { canAppeal, submitAppeal } from "@/server/appeals/service";
import * as limits from "@/server/rate-limit/limits";

const src = (...p: string[]) => readFileSync(join(process.cwd(), "src", ...p), "utf8");

describe("V2.4 anti-automation: uploads, reports and appeals are rate limited per user", () => {
  it("defines the rules", () => {
    expect(limits.RATE_UPLOAD).toMatchObject({ name: "upload" });
    expect(limits.RATE_REPORT).toMatchObject({ name: "report" });
    expect(limits.RATE_APPEAL).toMatchObject({ name: "appeal" });
    expect(limits.RATE_UPLOAD.limit).toBeLessThanOrEqual(30);
    expect(limits.RATE_REPORT.limit).toBeLessThanOrEqual(30);
    expect(limits.RATE_APPEAL.limit).toBeLessThanOrEqual(10);
  });
  it("the upload route checks the rule after the session and BEFORE reading the body", () => {
    const route = src("app", "api", "uploads", "[kind]", "route.ts");
    expect(route).toContain("checkRate(RATE_UPLOAD");
    expect(route.indexOf("checkRate(RATE_UPLOAD")).toBeGreaterThan(route.indexOf("getCurrentUser()"));
    expect(route.indexOf("checkRate(RATE_UPLOAD")).toBeLessThan(route.indexOf("readLimitedFormData("));
    expect(route).toContain("429");
  });
  it.each([
    ["resources/actions.ts", "RATE_REPORT"],
    ["passes/actions.ts", "RATE_REPORT"],
    ["appeals/actions.ts", "RATE_APPEAL"],
  ])("%s applies %s", (file, rule) => {
    expect(src("server", ...file.split("/"))).toContain(`checkRate(${rule}`);
  });
});

describe("V4.1 appeals follow the same approval rule as the rest of the library", () => {
  let db: Database;
  beforeEach(async () => {
    db = await createTestDatabase();
  });
  it("a member who is no longer approved cannot appeal", async () => {
    const v = { id: "u", role: "student" as const, emailVerified: true, approvalStatus: "rejected" as const };
    await db.insert(user).values({ id: "u", name: "u", email: "u@example.com", emailVerified: true, approvalStatus: "rejected" });
    expect(await canAppeal(db, v, "resource", "00000000-0000-4000-8000-000000000000")).toBe(false);
    expect(await submitAppeal(db, v, { entityType: "resource", entityId: "00000000-0000-4000-8000-000000000000", message: "x".repeat(20) })).toEqual({ ok: false, error: "forbidden" });
  });
});
