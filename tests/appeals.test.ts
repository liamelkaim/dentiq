// Appeals against takedowns: only the author, only for hidden items, one open at a time, admin decides. Synthetic data.
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase, type Database } from "@/db/client";
import { auditLog, resources, user } from "@/db/schema";
import { canAppeal, decideAppeal, hasOpenAppeal, listOpenAppeals, submitAppeal } from "@/server/appeals/service";
import { addOffering, createCourse } from "@/server/catalog/service";
import { courseInputSchema } from "@/server/catalog/validation";
import { createResource, moderateResource, reportInputSchema, reportResource, resourceInputSchema, type Viewer } from "@/server/resources/service";
import { createMemoryStorage } from "@/server/storage";

const v = (id: string, role: Viewer["role"] = "student"): Viewer => ({ id, role, emailVerified: true, approvalStatus: "approved" });
const admin = v("admin", "admin"), moderator = v("mod", "moderator"), alice = v("alice"), bob = v("bob");
const msg = "I think this decision was a mistake, the file is my own summary.";
let db: Database;
let rid: string;

beforeEach(async () => {
  db = await createTestDatabase();
  await db.insert(user).values([admin, moderator, alice, bob].map((x) => ({ id: x.id, name: x.id, email: `${x.id}@example.com`, emailVerified: true, role: x.role, approvalStatus: "approved" as const })));
  const course = await createCourse(db, "admin", courseInputSchema.parse({ code: "TEST 1001", titleFr: "Cours fictif" }), { sourceName: null, sourceUrl: null, sourceRetrievedOn: null });
  if (!course.ok) throw new Error(course.error);
  await addOffering(db, "admin", { courseId: course.value.id, academicYear: "2026-2027", term: "fall", professorNames: ["Prof"] }, { sourceName: null, sourceUrl: null, sourceRetrievedOn: null });
  const res = await createResource(db, createMemoryStorage(), alice, resourceInputSchema.parse({ courseId: course.value.id, offeringId: "", kind: "notes", title: "Notes fictives", rightsConfirmed: "on" }), { name: "n.pdf", bytes: new TextEncoder().encode("%PDF-1.4\nx\n%%EOF") });
  if (!res.ok) throw new Error(res.error);
  rid = res.value.id;
  await moderateResource(db, moderator, rid, "publish");
});

describe("reporting for patient information or a takedown request", () => {
  it.each(["patient_info", "takedown"])("accepts the reason %s and rejects an unknown one", async (reason) => {
    expect(reportInputSchema.safeParse({ resourceId: rid, reason }).success).toBe(true);
    expect(await reportResource(db, bob, reportInputSchema.parse({ resourceId: rid, reason }))).toMatchObject({ ok: true });
    expect(reportInputSchema.safeParse({ resourceId: rid, reason: "spam" }).success).toBe(false);
  });
});

describe("appeal", () => {
  it("is refused while the item is published, for other people, and for bad input", async () => {
    expect(await canAppeal(db, alice, "resource", rid)).toBe(false);
    expect(await submitAppeal(db, alice, { entityType: "resource", entityId: rid, message: msg })).toEqual({ ok: false, error: "notAllowed" });
    await moderateResource(db, moderator, rid, "hide");
    expect(await submitAppeal(db, bob, { entityType: "resource", entityId: rid, message: msg })).toEqual({ ok: false, error: "notFound" });
    expect(await submitAppeal(db, alice, { entityType: "resource", entityId: rid, message: "no" })).toEqual({ ok: false, error: "tooShort" });
    expect(await submitAppeal(db, alice, { entityType: "resource", entityId: rid, message: "x".repeat(1001) })).toEqual({ ok: false, error: "tooLong" });
    expect(await submitAppeal(db, alice, { entityType: "nope", entityId: rid, message: msg })).toEqual({ ok: false, error: "invalid" });
    expect(await submitAppeal(db, alice, { entityType: "resource", entityId: "not-a-uuid", message: msg })).toEqual({ ok: false, error: "invalid" });
  });

  it("is accepted once, then queued for administrators only", async () => {
    await moderateResource(db, moderator, rid, "hide");
    expect(await canAppeal(db, alice, "resource", rid)).toBe(true);
    expect(await submitAppeal(db, alice, { entityType: "resource", entityId: rid, message: msg })).toEqual({ ok: true });
    expect(await canAppeal(db, alice, "resource", rid)).toBe(false);
    expect(await hasOpenAppeal(db, alice, "resource", rid)).toBe(true); // the page shows "appeal sent" instead of the form
    expect(await hasOpenAppeal(db, bob, "resource", rid)).toBe(false);
    expect(await submitAppeal(db, alice, { entityType: "resource", entityId: rid, message: msg })).toEqual({ ok: false, error: "alreadyOpen" });
    expect(await listOpenAppeals(db, moderator)).toEqual([]);
    expect(await listOpenAppeals(db, alice)).toEqual([]);
    expect(await listOpenAppeals(db, admin)).toHaveLength(1);
  });

  it("is decided by an administrator only; upholding republishes, denying keeps it hidden; both are audited", async () => {
    await moderateResource(db, moderator, rid, "hide");
    await submitAppeal(db, alice, { entityType: "resource", entityId: rid, message: msg });
    const [first] = await listOpenAppeals(db, admin);
    const id = first!.id;
    expect(await decideAppeal(db, moderator, id, "upheld", null)).toEqual({ ok: false, error: "forbidden" });
    expect(await decideAppeal(db, admin, id, "denied", "Contains a patient photo.")).toEqual({ ok: true });
    expect((await db.select().from(resources).where(eq(resources.id, rid)))[0]!.status).toBe("hidden");
    expect(await decideAppeal(db, admin, id, "upheld", null)).toEqual({ ok: false, error: "notFound" });
    await submitAppeal(db, alice, { entityType: "resource", entityId: rid, message: msg });
    const [next] = await listOpenAppeals(db, admin);
    expect(await decideAppeal(db, admin, next!.id, "upheld", null)).toEqual({ ok: true });
    expect((await db.select().from(resources).where(eq(resources.id, rid)))[0]!.status).toBe("published");
    const actions = (await db.select().from(auditLog)).map((r) => r.action);
    expect(actions).toEqual(expect.arrayContaining(["appeal.submit", "appeal.denied", "appeal.upheld"]));
  });
});
