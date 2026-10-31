// Fake course codes and synthetic files only.
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase, type Database } from "@/db/client";
import { auditLog, resources, resourceVersions, user } from "@/db/schema";
import { addOffering, createCourse } from "@/server/catalog/service";
import { courseInputSchema } from "@/server/catalog/validation";
import {
  addVersion,
  createResource,
  getDownload,
  getResource,
  listCourseSummaries,
  listFilterOptions,
  listModerationQueue,
  listResources,
  moderateResource,
  reportResource,
  resolveReport,
  resourceInputSchema,
  setOfficial,
  type Viewer,
} from "@/server/resources/service";
import { createMemoryStorage } from "@/server/storage";

const noSource = { sourceName: null, sourceUrl: null, sourceRetrievedOn: null };
const enc = new TextEncoder();
const pdf = (body: string) => ({ name: "notes.pdf", bytes: enc.encode(`%PDF-1.4\n${body}\n%%EOF`) });

const admin: Viewer = { id: "admin", role: "admin", emailVerified: true, approvalStatus: "approved" };
const moderator: Viewer = { id: "mod", role: "moderator", emailVerified: true, approvalStatus: "approved" };
const alice: Viewer = { id: "alice", role: "student", emailVerified: true, approvalStatus: "approved" };
const bob: Viewer = { id: "bob", role: "student", emailVerified: true, approvalStatus: "approved" };
const pendingStudent: Viewer = { id: "pending", role: "student", emailVerified: true, approvalStatus: "pending" };

let db: Database;
let storage: ReturnType<typeof createMemoryStorage>;
let courseId: string;
let oldOfferingId: string;
let newOfferingId: string;

function input(overrides: Record<string, unknown> = {}) {
  return resourceInputSchema.parse({
    courseId,
    offeringId: "",
    kind: "notes",
    title: "Notes fictives",
    topic: "Anatomie",
    rightsConfirmed: "on",
    ...overrides,
  });
}

async function upload(viewer: Viewer, body: string, overrides: Record<string, unknown> = {}) {
  const result = await createResource(db, storage, viewer, input(overrides), pdf(body));
  if (!result.ok) throw new Error(result.error);
  return result.value.id;
}

beforeEach(async () => {
  db = await createTestDatabase();
  storage = createMemoryStorage();
  await db.insert(user).values(
    [admin, moderator, alice, bob, pendingStudent].map((v) => ({
      id: v.id,
      name: v.id,
      email: `${v.id}@example.com`,
      emailVerified: v.emailVerified,
      role: v.role,
      approvalStatus: v.approvalStatus,
    })),
  );
  const course = await createCourse(db, "admin", courseInputSchema.parse({ code: "TEST 1001", titleFr: "Cours fictif" }), noSource);
  if (!course.ok) throw new Error(course.error);
  courseId = course.value.id;
  const old = await addOffering(db, "admin", { courseId, academicYear: "2025-2026", term: "fall", professorNames: ["Prof Ancien"] }, noSource);
  const current = await addOffering(db, "admin", { courseId, academicYear: "2026-2027", term: "fall", professorNames: ["Prof Nouveau"] }, noSource);
  if (!old.ok || !current.ok) throw new Error("offering setup failed");
  oldOfferingId = old.value.id;
  newOfferingId = current.value.id;
});

describe("uploading", () => {
  it("stores the file privately, creates version 1 and holds student uploads for review", async () => {
    const id = await upload(alice, "a");
    const [row] = await db.select().from(resources).where(eq(resources.id, id));
    expect(row).toMatchObject({ status: "pending", createdBy: "alice", isOfficial: false });
    const versions = await db.select().from(resourceVersions).where(eq(resourceVersions.resourceId, id));
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({ versionNumber: 1, mimeType: "application/pdf", rightsConfirmed: true });
    expect(storage.size()).toBe(1);
    expect(await db.select().from(auditLog).where(eq(auditLog.action, "resource.create"))).toHaveLength(1);
  });

  it("publishes moderator uploads directly and lets only moderators mark documents official", async () => {
    const official = await upload(moderator, "m", { isOfficial: "on", kind: "outline" });
    const studentTry = await upload(alice, "s", { isOfficial: "on" });
    const [m] = await db.select().from(resources).where(eq(resources.id, official));
    const [s] = await db.select().from(resources).where(eq(resources.id, studentTry));
    expect(m).toMatchObject({ status: "published", isOfficial: true });
    expect(s).toMatchObject({ status: "pending", isOfficial: false });
  });

  it("refuses uploads from accounts that are not approved", async () => {
    expect(await createResource(db, storage, pendingStudent, input(), pdf("p"))).toEqual({ ok: false, error: "forbidden" });
    expect(storage.size()).toBe(0);
  });

  it("requires the rights confirmation", () => {
    expect(resourceInputSchema.safeParse({ courseId, kind: "notes", title: "x" }).success).toBe(false);
  });

  it("rejects files whose content doesn't match an allowed type", async () => {
    const html = { name: "notes.pdf", bytes: enc.encode("<html><script>alert(1)</script></html>") };
    const exe = { name: "slides.pptx", bytes: enc.encode("MZ\x90\x00 fake executable") };
    expect(await createResource(db, storage, alice, input(), html)).toEqual({ ok: false, error: "fileType" });
    expect(await createResource(db, storage, alice, input(), exe)).toEqual({ ok: false, error: "fileType" });
    expect(await createResource(db, storage, alice, input(), { name: "empty.pdf", bytes: new Uint8Array() })).toEqual({
      ok: false,
      error: "fileMissing",
    });
    expect(storage.size()).toBe(0);
  });

  it("detects duplicate files and only links to the original when the uploader may see it", async () => {
    const first = await upload(alice, "same");
    // Bob can't see Alice's pending upload, so no link is given.
    expect(await createResource(db, storage, bob, input(), pdf("same"))).toEqual({ ok: false, error: "duplicateFile", resourceId: undefined });
    await moderateResource(db, moderator, first, "publish");
    expect(await createResource(db, storage, bob, input(), pdf("same"))).toEqual({ ok: false, error: "duplicateFile", resourceId: first });
  });

  it("rejects an offering that belongs to another course", async () => {
    const other = await createCourse(db, "admin", courseInputSchema.parse({ code: "TEST 2002", titleFr: "Autre" }), noSource);
    if (!other.ok) throw new Error(other.error);
    const result = await createResource(db, storage, alice, input({ courseId: other.value.id, offeringId: oldOfferingId }), pdf("x"));
    expect(result).toEqual({ ok: false, error: "invalidOffering" });
  });
});

describe("visibility and downloads", () => {
  it("hides pending uploads from other students but shows them to their author and moderators", async () => {
    const id = await upload(alice, "a");
    expect(await getResource(db, bob, id)).toBeNull();
    expect(await getResource(db, alice, id)).not.toBeNull();
    expect(await getResource(db, moderator, id)).not.toBeNull();
    expect((await listResources(db, bob)).map((r) => r.id)).toEqual([]);
    expect((await listResources(db, alice)).map((r) => r.id)).toEqual([id]);
  });

  it("gives no library access to unapproved accounts", async () => {
    const id = await upload(moderator, "m");
    expect(await listResources(db, pendingStudent)).toEqual([]);
    expect(await getResource(db, pendingStudent, id)).toBeNull();
    const [version] = await db.select().from(resourceVersions);
    expect(await getDownload(db, pendingStudent, version!.id)).toBeNull();
    expect(await getDownload(db, bob, version!.id)).toMatchObject({ mimeType: "application/pdf" });
  });

  it("blocks downloads of hidden and removed material for students, including the author", async () => {
    const id = await upload(alice, "a");
    await moderateResource(db, moderator, id, "publish");
    const [version] = await db.select().from(resourceVersions);
    await moderateResource(db, moderator, id, "remove");
    expect(await getDownload(db, bob, version!.id)).toBeNull();
    expect(await getDownload(db, alice, version!.id)).toBeNull();
    expect(await getDownload(db, moderator, version!.id)).not.toBeNull();
    expect(await getDownload(db, bob, "not-a-uuid")).toBeNull();
  });
});

describe("versions", () => {
  it("keeps every version and sends a student's new file back to review", async () => {
    const id = await upload(alice, "v1");
    await moderateResource(db, moderator, id, "publish");
    expect(await addVersion(db, storage, alice, id, pdf("v2"), "Corrections")).toEqual({ ok: true, value: { versionNumber: 2 } });

    const detail = await getResource(db, alice, id);
    expect(detail?.versions.map((v) => [v.versionNumber, v.changeNote])).toEqual([
      [2, "Corrections"],
      [1, null],
    ]);
    expect(detail?.status).toBe("pending");
    expect(storage.size()).toBe(2);
  });

  it("only lets the author or a moderator add versions", async () => {
    const id = await upload(alice, "v1");
    await moderateResource(db, moderator, id, "publish");
    expect(await addVersion(db, storage, bob, id, pdf("bob"), null)).toEqual({ ok: false, error: "forbidden" });
    expect(await addVersion(db, storage, moderator, id, pdf("mod"), null)).toEqual({ ok: true, value: { versionNumber: 2 } });
    expect((await getResource(db, bob, id))?.status).toBe("published");
  });

  it("refuses re-uploading an identical file as a new version", async () => {
    const id = await upload(alice, "v1");
    expect(await addVersion(db, storage, alice, id, pdf("v1"), null)).toMatchObject({ ok: false, error: "duplicateFile" });
  });
});

describe("current and historical material", () => {
  it("classifies resources by the course's most recent offering", async () => {
    const general = await upload(moderator, "g");
    const current = await upload(moderator, "c", { offeringId: newOfferingId });
    const historical = await upload(moderator, "h", { offeringId: oldOfferingId });

    const ids = async (period: "current" | "historical" | "all") =>
      (await listResources(db, bob, { courseId, period })).map((r) => r.id).sort();

    expect(await ids("current")).toEqual([general, current].sort());
    expect(await ids("historical")).toEqual([historical]);
    expect(await ids("all")).toHaveLength(3);
    expect((await getResource(db, bob, historical))?.period).toBe("historical");
  });

  it("filters by professor, academic year, term, topic, kind and text", async () => {
    const withNew = await upload(moderator, "n", { offeringId: newOfferingId, topic: "Occlusion", kind: "outline", title: "Plan de cours" });
    const withOld = await upload(moderator, "o", { offeringId: oldOfferingId, topic: "Anatomie" });

    const [profNew] = (await getResource(db, bob, withNew))!.instructors;
    expect(profNew).toBe("Prof Nouveau");

    const professorsList = await db.query.professors.findMany();
    const oldProf = professorsList.find((p) => p.fullName === "Prof Ancien")!;

    expect((await listResources(db, bob, { professorId: oldProf.id })).map((r) => r.id)).toEqual([withOld]);
    expect((await listResources(db, bob, { academicYear: "2026-2027" })).map((r) => r.id)).toEqual([withNew]);
    expect((await listResources(db, bob, { term: "fall" }))).toHaveLength(2);
    expect((await listResources(db, bob, { topic: "occlusion" })).map((r) => r.id)).toEqual([withNew]);
    expect((await listResources(db, bob, { kind: "outline" })).map((r) => r.id)).toEqual([withNew]);
    expect((await listResources(db, bob, { q: "plan" })).map((r) => r.id)).toEqual([withNew]);
  });
});

describe("moderation and reports", () => {
  it("restricts moderation to moderators and records it", async () => {
    const id = await upload(alice, "a");
    expect(await moderateResource(db, alice, id, "publish")).toEqual({ ok: false, error: "forbidden" });
    expect(await setOfficial(db, alice, id, true)).toEqual({ ok: false, error: "forbidden" });

    expect(await moderateResource(db, moderator, id, "publish")).toEqual({ ok: true, value: null });
    expect(await setOfficial(db, admin, id, true)).toEqual({ ok: true, value: null });
    const actions = (await db.select().from(auditLog)).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(["resource.publish", "resource.official.set"]));
  });

  it("lets members report published material once, and moderators resolve it", async () => {
    const id = await upload(moderator, "m");
    const report = { resourceId: id, reason: "incorrect" as const, details: "Erreur page 2" };
    expect(await reportResource(db, bob, report)).toEqual({ ok: true, value: null });
    expect(await reportResource(db, bob, report)).toEqual({ ok: false, error: "alreadyReported" });
    expect(await reportResource(db, pendingStudent, report)).toEqual({ ok: false, error: "notFound" });

    const queue = await listModerationQueue(db, moderator);
    expect(queue.reports).toHaveLength(1);
    expect(await listModerationQueue(db, bob)).toEqual({ pending: [], reports: [] });

    const reportId = queue.reports[0]!.id;
    expect(await resolveReport(db, bob, reportId, "resolved", null)).toEqual({ ok: false, error: "forbidden" });
    expect(await resolveReport(db, moderator, reportId, "resolved", "Corrigé")).toEqual({ ok: true, value: null });
    expect(await resolveReport(db, moderator, reportId, "dismissed", null)).toEqual({ ok: false, error: "notFound" });
    // Once resolved, the same person may report again.
    expect(await reportResource(db, bob, report)).toEqual({ ok: true, value: null });
  });

  it("lists pending uploads in the moderation queue", async () => {
    await upload(alice, "a");
    expect((await listModerationQueue(db, moderator)).pending).toHaveLength(1);
  });
});

describe("course summaries", () => {
  it("uses the most recent offering's instructors and counts only published documents", async () => {
    await upload(moderator, "published");
    await upload(alice, "pending");
    const [summary] = await listCourseSummaries(db, bob);
    expect(summary).toMatchObject({
      code: "TEST 1001",
      currentOffering: { academicYear: "2026-2027", term: "fall" },
      instructors: ["Prof Nouveau"],
      documentCount: 1,
    });
  });

  it("hides document counts from accounts without library access", async () => {
    await upload(moderator, "published");
    const [summary] = await listCourseSummaries(db, pendingStudent);
    expect(summary?.documentCount).toBeNull();
  });

  it("filters by course id and returns nothing for an empty list", async () => {
    expect(await listCourseSummaries(db, bob, { courseIds: [] })).toEqual([]);
    expect((await listCourseSummaries(db, bob, { courseIds: [courseId] })).map((c) => c.id)).toEqual([courseId]);
  });
});


describe("personal documents", () => {
  it("defaults legacy inputs to shared and rejects unknown visibility values", () => {
    expect(input().visibility).toBe("shared");
    expect(() => input({ visibility: "public" })).toThrow();
  });

  it("allows only the owner to read, preview and download, including against administrators", async () => {
    const id = await upload(alice, "private", { visibility: "private" });
    const own = await getResource(db, alice, id);
    expect(own).toMatchObject({ visibility: "private", canEdit: true, canModerate: false, canReport: false });
    const versionId = own!.versions[0]!.id;
    expect(await getDownload(db, alice, versionId)).not.toBeNull();
    for (const viewer of [bob, moderator, admin, pendingStudent]) {
      expect(await getResource(db, viewer, id)).toBeNull();
      expect(await getDownload(db, viewer, versionId)).toBeNull();
      expect(await listResources(db, viewer)).toEqual([]);
      expect(await listResources(db, viewer, { visibility: "private", status: "published" })).toEqual([]);
      expect(await addVersion(db, storage, viewer, id, pdf(`attack-${viewer.id}`), null)).toMatchObject({ ok: false });
    }
  });

  it("keeps private titles, topics and counts out of other people's searches", async () => {
    const id = await upload(alice, "search-private", { visibility: "private", title: "Private title", topic: "Private topic" });
    expect((await listResources(db, alice, { q: "Private title", visibility: "private" })).map(r => r.id)).toEqual([id]);
    expect(await listResources(db, alice, { visibility: "shared" })).toEqual([]);
    for (const viewer of [bob, moderator, admin]) {
      expect(await listResources(db, viewer, { q: "Private" })).toEqual([]);
      expect((await listFilterOptions(db, viewer)).topics).not.toContain("Private topic");
      expect((await listCourseSummaries(db, viewer))[0]?.documentCount).toBe(0);
    }
    expect((await listFilterOptions(db, alice)).topics).toContain("Private topic");
    expect((await listCourseSummaries(db, alice))[0]?.documentCount).toBe(1);
  });

  it("never sends private documents to moderation or allows a moderator to publish them", async () => {
    const id = await upload(alice, "private-moderation", { visibility: "private", isOfficial: true });
    expect((await getResource(db, alice, id))?.isOfficial).toBe(false);
    expect(await listModerationQueue(db, moderator)).toEqual({ pending: [], reports: [] });
    for (const action of ["publish", "hide", "remove"] as const) {
      expect(await moderateResource(db, admin, id, action)).toEqual({ ok: false, error: "notFound" });
    }
    expect(await setOfficial(db, admin, id, true)).toEqual({ ok: false, error: "notFound" });
    expect(await reportResource(db, alice, { resourceId: id, reason: "other", details: null })).toMatchObject({ ok: false });
  });

  it("keeps every new version private and immediately available to its owner", async () => {
    const id = await upload(alice, "personal-v1", { visibility: "private" });
    expect(await addVersion(db, storage, alice, id, pdf("personal-v2"), "Revision")).toMatchObject({ ok: true });
    const own = (await getResource(db, alice, id))!;
    expect(own.status).toBe("published");
    expect(own.versions).toHaveLength(2);
    for (const version of own.versions) {
      expect(await getDownload(db, alice, version.id)).not.toBeNull();
      expect(await getDownload(db, admin, version.id)).toBeNull();
    }
    expect((await listModerationQueue(db, moderator)).pending).toEqual([]);
  });

  it("does not disclose private file existence through duplicate detection", async () => {
    const aliceId = await upload(alice, "identical", { visibility: "private" });
    const bobId = await upload(bob, "identical", { visibility: "private" });
    expect(bobId).not.toBe(aliceId);
    const sharedId = await upload(moderator, "identical");
    expect(sharedId).not.toBe(aliceId);
    expect(await createResource(db, storage, alice, input({ visibility: "private" }), pdf("identical")))
      .toMatchObject({ ok: false, error: "duplicateFile", resourceId: aliceId });
  });

  it("preserves existing approval requirements for personal uploads", async () => {
    expect(await createResource(db, storage, pendingStudent, input({ visibility: "private" }), pdf("private-pending")))
      .toEqual({ ok: false, error: "forbidden" });
  });

  it("rejects invalid visibility at the database boundary", async () => {
    await expect(db.insert(resources).values({ courseId, kind: "notes", title: "TEST", visibility: "public" as "private" })).rejects.toThrow();
  });
});
