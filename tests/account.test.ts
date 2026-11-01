// Profile, data export and account deletion. Fake data only (TEST courses, example.com accounts).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase, type Database } from "@/db/client";
import {
  account,
  auditLog,
  courseNotes,
  courseNoteVersions,
  courses,
  examQuestionChoices,
  examQuestionImages,
  examQuestions,
  resourceReports,
  resources,
  resourceVersions,
  session,
  studyAttempts,
  studyCalendarEntries,
  studyPersonalCards,
  studyQuestionCards,
  studyQuestionMarks,
  studyQuizItems,
  studyQuizzes,
  tutorUsage,
  user,
  verification,
} from "@/db/schema";
import { DELETE_UNSHARED_QUESTION_STATUSES } from "@/server/account/constants";
import { confirmationMatches, deleteAccount, isLastAdmin } from "@/server/account/delete";
import { buildAccountExport } from "@/server/account/export";
import { normalizeDisplayName, updateDisplayName } from "@/server/account/profile";
import { createMemoryStorage, type FileStorage } from "@/server/storage";

let db: Database;
let storage: FileStorage & { size(): number };
let courseId: string;

const A = "user-a";
const B = "user-b";
const PASSWORD_HASH_A = "scrypt$HASH-VALUE-OF-A-MUST-NEVER-LEAK";
const TOKEN_A = "SESSION-TOKEN-OF-A-MUST-NEVER-LEAK";
const PASSWORD_HASH_B = "scrypt$HASH-VALUE-OF-B";
const TOKEN_B = "SESSION-TOKEN-OF-B";

type Seed = {
  privateResource: string;
  pendingResource: string;
  publishedResource: string;
  pendingQuestion: string;
  rejectedQuestion: string;
  publishedQuestion: string;
  bQuestion: string;
  bResource: string;
  bNote: string;
};
let seed: Seed;

async function insertResource(owner: string, title: string, visibility: "private" | "shared", status: "pending" | "published", keyBase: string) {
  const [r] = await db.insert(resources).values({ courseId, kind: "notes", title, visibility, status, createdBy: owner }).returning({ id: resources.id });
  await storage.put(`resources/${keyBase}`, new Uint8Array([1, 2, 3]));
  await db.insert(resourceVersions).values({
    resourceId: r!.id,
    versionNumber: 1,
    storageKey: `resources/${keyBase}`,
    fileName: `${title}.pdf`,
    mimeType: "application/pdf",
    sizeBytes: 3,
    sha256: `sha-${keyBase}`,
    rightsConfirmed: true,
    uploadedBy: owner,
  });
  return r!.id;
}

async function insertQuestion(owner: string, text: string, status: "pending" | "published" | "rejected") {
  const [q] = await db
    .insert(examQuestions)
    .values({
      courseId,
      examAcademicYear: "2025-2026",
      questionType: "sc",
      questionText: text,
      rightsConfirmed: true,
      fingerprint: `fp-${text}`,
      status,
      contributedBy: owner,
      reviewNote: status === "rejected" ? "Reason shown to the contributor" : null,
      verifiedAt: null,
    })
    .returning({ id: examQuestions.id });
  await db.insert(examQuestionChoices).values({ questionId: q!.id, position: 1, text: `choice for ${text}`, proposedCorrect: true });
  return q!.id;
}

beforeEach(async () => {
  db = await createTestDatabase();
  storage = createMemoryStorage();
  await db.insert(user).values([
    { id: "admin-1", name: "Admin One", email: "admin1@example.com", emailVerified: true, role: "admin", approvalStatus: "approved" },
    { id: A, name: "Student A", email: "a@example.com", emailVerified: true, approvalStatus: "approved" },
    { id: B, name: "Student B", email: "b@example.com", emailVerified: true, approvalStatus: "approved" },
  ]);
  await db.insert(account).values([
    { id: "acc-a", accountId: A, providerId: "credential", userId: A, password: PASSWORD_HASH_A },
    { id: "acc-b", accountId: B, providerId: "credential", userId: B, password: PASSWORD_HASH_B },
  ]);
  await db.insert(session).values([
    { id: "s-a", token: TOKEN_A, userId: A, expiresAt: new Date(Date.now() + 1e7), ipAddress: "203.0.113.7", userAgent: "TestBrowser/1" },
    { id: "s-b", token: TOKEN_B, userId: B, expiresAt: new Date(Date.now() + 1e7) },
  ]);
  await db.insert(verification).values({ id: "v-a", identifier: "a@example.com", value: "verify-value", expiresAt: new Date(Date.now() + 1e7) });
  const [c] = await db.insert(courses).values({ code: "TEST 1000", titleFr: "Cours TEST" }).returning({ id: courses.id });
  courseId = c!.id;

  const privateResource = await insertResource(A, "A private doc", "private", "published", "a-private");
  const pendingResource = await insertResource(A, "A pending doc", "shared", "pending", "a-pending");
  const publishedResource = await insertResource(A, "A published doc", "shared", "published", "a-published");
  const bResource = await insertResource(B, "B private doc", "private", "published", "b-private");
  await db.insert(resourceReports).values([
    { resourceId: publishedResource, reporterId: A, reason: "other", details: "A report text" },
    { resourceId: bResource, reporterId: B, reason: "other", details: "B report text" },
  ]);

  const pendingQuestion = await insertQuestion(A, "A pending question", "pending");
  const rejectedQuestion = await insertQuestion(A, "A rejected question", "rejected");
  const publishedQuestion = await insertQuestion(A, "A published question", "published");
  const bQuestion = await insertQuestion(B, "B published question", "published");
  await storage.put("questions/a-pending-image", new Uint8Array([9]));
  await db.insert(examQuestionImages).values({
    questionId: pendingQuestion,
    position: 1,
    storageKey: "questions/a-pending-image",
    fileName: "a-image.png",
    mimeType: "image/png",
    sizeBytes: 1,
    sha256: "sha-image",
    uploadedBy: A,
  });

  const [noteA] = await db.insert(courseNotes).values({ courseId, ownerId: A, title: "A note", body: "A-NOTE-BODY" }).returning({ id: courseNotes.id });
  await db.insert(courseNoteVersions).values({ noteId: noteA!.id, versionNumber: 1, title: "A note", body: "A-NOTE-BODY", createdBy: A });
  const [noteB] = await db.insert(courseNotes).values({ courseId, ownerId: B, title: "B note", body: "B-NOTE-BODY" }).returning({ id: courseNotes.id });
  await db.insert(courseNoteVersions).values({ noteId: noteB!.id, versionNumber: 1, title: "B note", body: "B-NOTE-BODY", createdBy: B });

  for (const [uid, label] of [[A, "A"], [B, "B"]] as const) {
    await db.insert(studyAttempts).values({ userId: uid, questionId: publishedQuestion, mode: "practice", outcome: "unscored", answerBasis: "none", response: { text: `${label}-ANSWER` } });
    await db.insert(studyQuestionMarks).values({ userId: uid, questionId: publishedQuestion, flagged: true });
    await db.insert(studyQuestionCards).values({ userId: uid, questionId: publishedQuestion });
    await db.insert(studyPersonalCards).values({ userId: uid, front: `${label}-FRONT`, back: `${label}-BACK` });
    const [quiz] = await db.insert(studyQuizzes).values({ userId: uid, scope: { label }, requestedCount: 1 }).returning({ id: studyQuizzes.id });
    await db.insert(studyQuizItems).values({ quizId: quiz!.id, position: 1, questionId: publishedQuestion, response: { text: `${label}-QUIZ` } });
    await db.insert(studyCalendarEntries).values({ userId: uid, title: `${label}-EVENT`, entryDate: "2026-12-01" });
    await db.insert(tutorUsage).values({ userId: uid, usageDate: "2026-11-01", contextChars: 10, passageCount: 2 });
  }
  await db.insert(auditLog).values([
    { actorId: A, action: "note.create", entityType: "course_note", entityId: noteA!.id, metadata: { courseId } },
    { actorId: A, action: "resource.upload", entityType: "resource", entityId: privateResource, metadata: { sha256: "sha-a-private" } },
    { actorId: B, action: "note.create", entityType: "course_note", entityId: noteB!.id, metadata: { courseId } },
    { actorId: "admin-1", action: "user.approval.approved", entityType: "user", entityId: A },
    { actorId: "admin-1", action: "user.approval.approved", entityType: "user", entityId: B },
  ]);
  seed = { privateResource, pendingResource, publishedResource, pendingQuestion, rejectedQuestion, publishedQuestion, bQuestion, bResource, bNote: noteB!.id };
});

const exportJson = async (userId: string, options = {}) => {
  const result = await buildAccountExport(db, userId, options);
  if (!result.ok) throw new Error(result.error);
  return { text: result.value.json, data: JSON.parse(result.value.json) as Record<string, any>, filename: result.value.filename }; // eslint-disable-line @typescript-eslint/no-explicit-any
};

function allKeys(value: unknown, into = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => allKeys(v, into));
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) {
    into.add(k);
    allKeys(v, into);
  }
  return into;
}

describe("profile name", () => {
  it("normalizes whitespace and saves a valid name with an audit entry that holds no name", async () => {
    expect(normalizeDisplayName("  Ada   Lovelace \n")).toBe("Ada Lovelace");
    expect(await updateDisplayName(db, A, "  New   Name ")).toEqual({ ok: true, value: { name: "New Name" } });
    const [row] = await db.select({ name: user.name }).from(user).where(eq(user.id, A));
    expect(row!.name).toBe("New Name");
    const [entry] = await db.select().from(auditLog).where(eq(auditLog.action, "user.name.update"));
    expect(entry).toMatchObject({ actorId: A, entityId: A, metadata: null });
    expect(JSON.stringify(entry)).not.toContain("New Name");
  });

  it("rejects empty, too long and control-character names and never touches role or status", async () => {
    expect(await updateDisplayName(db, A, "   ")).toEqual({ ok: false, error: "nameRequired" });
    expect(await updateDisplayName(db, A, "x".repeat(121))).toEqual({ ok: false, error: "nameTooLong" });
    expect(await updateDisplayName(db, A, "bad\u0000name")).toEqual({ ok: false, error: "invalid" });
    expect(await updateDisplayName(db, "nobody", "Fine")).toEqual({ ok: false, error: "notFound" });
    const [row] = await db.select({ name: user.name, role: user.role, approvalStatus: user.approvalStatus }).from(user).where(eq(user.id, A));
    expect(row).toEqual({ name: "Student A", role: "student", approvalStatus: "approved" });
  });

  it("changes only the caller's own row", async () => {
    await updateDisplayName(db, A, "Renamed");
    const [b] = await db.select({ name: user.name }).from(user).where(eq(user.id, B));
    expect(b!.name).toBe("Student B");
  });
});

describe("data export", () => {
  it("contains the student's own rows from every user-owned table", async () => {
    const { data, filename } = await exportJson(A, { now: new Date("2026-11-01T12:00:00Z") });
    expect(filename).toBe("dentiq-my-data-2026-11-01.json");
    expect(data.schemaVersion).toBe(1);
    expect(data.exportedAt).toBe("2026-11-01T12:00:00.000Z");
    expect(data.profile).toMatchObject({ id: A, email: "a@example.com", name: "Student A", role: "student", approvalStatus: "approved" });
    expect(data.signIns.sessions).toHaveLength(1);
    expect(data.signIns.sessions[0]).toMatchObject({ ipAddress: "203.0.113.7", userAgent: "TestBrowser/1" });
    expect(data.signIns.methods).toEqual([expect.objectContaining({ providerId: "credential" })]);
    expect(data.documents.items.map((r: any) => r.title).sort()).toEqual(["A pending doc", "A private doc", "A published doc"]); // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(data.documents.uploadedFiles.map((v: any) => v.fileName).sort()).toEqual(["A pending doc.pdf", "A private doc.pdf", "A published doc.pdf"]); // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(data.documents.reportsFiled).toHaveLength(1);
    expect(data.examQuestions.items.map((q: any) => [q.questionText, q.status]).sort()).toEqual([ // eslint-disable-line @typescript-eslint/no-explicit-any
      ["A pending question", "pending"],
      ["A published question", "published"],
      ["A rejected question", "rejected"],
    ]);
    expect(data.examQuestions.items.find((q: any) => q.status === "rejected").reviewNote).toBe("Reason shown to the contributor"); // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(data.examQuestions.choices).toHaveLength(3);
    expect(data.examQuestions.images).toEqual([expect.objectContaining({ fileName: "a-image.png" })]);
    expect(data.notes.items).toEqual([expect.objectContaining({ title: "A note", body: "A-NOTE-BODY" })]);
    expect(data.notes.versions).toHaveLength(1);
    expect(data.study.attempts).toHaveLength(1);
    expect(data.study.marks).toHaveLength(1);
    expect(data.study.personalCards).toEqual([expect.objectContaining({ front: "A-FRONT" })]);
    expect(data.study.questionCards).toHaveLength(1);
    expect(data.study.quizzes).toHaveLength(1);
    expect(data.study.quizItems).toHaveLength(1);
    expect(data.calendar.entries).toEqual([expect.objectContaining({ title: "A-EVENT" })]);
    expect(data.tutorUsage.entries).toEqual([expect.objectContaining({ passageCount: 2, contextChars: 10 })]);
    expect(data.referenced.courses).toEqual([expect.objectContaining({ code: "TEST 1000" })]);
    expect(data.notIncluded.length).toBeGreaterThan(0);
  });

  it("never contains another student's rows or identifiers", async () => {
    const { text, data } = await exportJson(A);
    for (const forbidden of [B, "b@example.com", "Student B", "B-NOTE", "B-ANSWER", "B-FRONT", "B-BACK", "B-QUIZ", "B-EVENT", "B private doc", "B published question", "B report text", "admin-1", "Admin One", "admin1@example.com", seed.bResource, seed.bQuestion, seed.bNote]) {
      expect(text, forbidden).not.toContain(forbidden);
    }
    // And the mirror image: B's export has none of A's.
    const b = await exportJson(B);
    for (const forbidden of [A, "a@example.com", "A-NOTE", "A-ANSWER", "A-FRONT", "A-EVENT", "A private doc", "A published question", "A report text"]) {
      expect(b.text, forbidden).not.toContain(forbidden);
    }
    expect(data.profile.id).toBe(A);
  });

  it("never contains password hashes, session tokens, storage keys, file fingerprints or secret field names", async () => {
    const { text, data } = await exportJson(A);
    for (const secret of [PASSWORD_HASH_A, TOKEN_A, "HASH-VALUE", "SESSION-TOKEN", "resources/a-private", "questions/a-pending-image", "sha-a-private", "sha-image"]) {
      expect(text, secret).not.toContain(secret);
    }
    const keys = [...allKeys(data)].map((k) => k.toLowerCase());
    for (const banned of ["password", "token", "secret", "hash", "sha256", "storagekey", "accesstoken", "refreshtoken", "idtoken", "accountid"]) {
      expect(keys.filter((k) => k.includes(banned)), banned).toEqual([]);
    }
  });

  it("leaves moderator identities and the other people named in the account's audit trail out", async () => {
    await db.update(examQuestions).set({ reviewedBy: "admin-1", verifiedBy: "admin-1" }).where(eq(examQuestions.id, seed.publishedQuestion));
    const { text, data } = await exportJson(A);
    expect(text).not.toContain("admin-1");
    expect(data.activity.accountHistory).toEqual([{ action: "user.approval.approved", createdAt: expect.any(String) }]);
    expect(data.activity.yourActions.map((a: any) => a.action).sort()).toEqual(["note.create", "resource.upload"]); // eslint-disable-line @typescript-eslint/no-explicit-any
  });

  it("fails clearly instead of cutting the file short when a cap is exceeded", async () => {
    expect(await buildAccountExport(db, A, { maxRowsPerTable: 1 })).toEqual({ ok: false, error: "tooLarge" });
    expect(await buildAccountExport(db, A, { maxBytes: 100 })).toEqual({ ok: false, error: "tooLarge" });
    expect((await buildAccountExport(db, A, { maxRowsPerTable: 3 })).ok).toBe(true);
    expect(await buildAccountExport(db, "nobody")).toEqual({ ok: false, error: "notFound" });
  });
});

describe("account deletion", () => {
  it("requires the exact email as confirmation (case and spaces ignored) and deletes nothing otherwise", async () => {
    expect(confirmationMatches(" A@Example.com ", "a@example.com")).toBe(true);
    expect(confirmationMatches("b@example.com", "a@example.com")).toBe(false);
    expect(await deleteAccount(db, storage, A, "")).toEqual({ ok: false, error: "confirmationMismatch" });
    expect(await deleteAccount(db, storage, A, "DELETE")).toEqual({ ok: false, error: "confirmationMismatch" });
    expect(await deleteAccount(db, storage, "nobody", "a@example.com")).toEqual({ ok: false, error: "notFound" });
    expect(await db.$count(user, eq(user.id, A))).toBe(1);
    expect(await db.$count(courseNotes, eq(courseNotes.ownerId, A))).toBe(1);
    expect(storage.size()).toBe(5);
  });

  it("removes the student's private rows, files, sessions and sign-in records", async () => {
    const result = await deleteAccount(db, storage, A, "a@example.com");
    expect(result).toEqual({ ok: true, value: { filesDeleted: 3, filesFailed: 0 } });

    expect(await db.$count(user, eq(user.id, A))).toBe(0);
    expect(await db.$count(session, eq(session.userId, A))).toBe(0);
    expect(await db.$count(account, eq(account.userId, A))).toBe(0);
    expect(await db.$count(verification, eq(verification.identifier, "a@example.com"))).toBe(0);
    expect(await db.$count(courseNotes, eq(courseNotes.ownerId, A))).toBe(0);
    expect(await db.$count(studyAttempts, eq(studyAttempts.userId, A))).toBe(0);
    expect(await db.$count(studyQuestionMarks, eq(studyQuestionMarks.userId, A))).toBe(0);
    expect(await db.$count(studyQuestionCards, eq(studyQuestionCards.userId, A))).toBe(0);
    expect(await db.$count(studyPersonalCards, eq(studyPersonalCards.userId, A))).toBe(0);
    expect(await db.$count(studyQuizzes, eq(studyQuizzes.userId, A))).toBe(0);
    expect(await db.$count(studyCalendarEntries, eq(studyCalendarEntries.userId, A))).toBe(0);
    expect(await db.$count(tutorUsage, eq(tutorUsage.userId, A))).toBe(0);

    // Private resource and the upload still waiting for review: rows and files gone.
    const remainingResources = await db.select({ id: resources.id }).from(resources);
    expect(remainingResources.map((r) => r.id)).not.toContain(seed.privateResource);
    expect(remainingResources.map((r) => r.id)).not.toContain(seed.pendingResource);
    // Questions never published: rows and image gone.
    const remainingQuestions = (await db.select({ id: examQuestions.id }).from(examQuestions)).map((q) => q.id);
    expect(remainingQuestions).not.toContain(seed.pendingQuestion);
    expect(remainingQuestions).not.toContain(seed.rejectedQuestion);
    expect(await db.$count(examQuestionImages)).toBe(0);
    expect(await storage.get("resources/a-private")).toBeNull();
    expect(await storage.get("resources/a-pending")).toBeNull();
    expect(await storage.get("questions/a-pending-image")).toBeNull();
  });

  it("keeps published contributions but detaches them from the account", async () => {
    await deleteAccount(db, storage, A, "a@example.com");
    const [doc] = await db.select({ id: resources.id, createdBy: resources.createdBy, title: resources.title }).from(resources).where(eq(resources.id, seed.publishedResource));
    expect(doc).toMatchObject({ title: "A published doc", createdBy: null });
    const [version] = await db.select({ uploadedBy: resourceVersions.uploadedBy }).from(resourceVersions).where(eq(resourceVersions.resourceId, seed.publishedResource));
    expect(version!.uploadedBy).toBeNull();
    expect(await storage.get("resources/a-published")).not.toBeNull();
    const [q] = await db.select({ contributedBy: examQuestions.contributedBy, questionText: examQuestions.questionText }).from(examQuestions).where(eq(examQuestions.id, seed.publishedQuestion));
    expect(q).toEqual({ contributedBy: null, questionText: "A published question" });
    expect(await db.$count(examQuestionChoices, eq(examQuestionChoices.questionId, seed.publishedQuestion))).toBe(1);
    const [report] = await db.select({ reporterId: resourceReports.reporterId }).from(resourceReports).where(eq(resourceReports.resourceId, seed.publishedResource));
    expect(report!.reporterId).toBeNull();
    // Nothing in the database still names the account.
    const names = JSON.stringify([...(await db.select().from(resources)), ...(await db.select().from(examQuestions)), ...(await db.select().from(auditLog))]);
    expect(names).not.toContain(`"${A}"`);
    expect(names).not.toContain("a@example.com");
  });

  it("keeps a question that other students' study data already uses, detached", async () => {
    await db.update(examQuestions).set({ status: "pending" }).where(eq(examQuestions.id, seed.publishedQuestion));
    await deleteAccount(db, storage, A, "a@example.com");
    // B has an attempt, a mark, a card and a quiz item on it, so it must survive (and B keeps all of that).
    const [q] = await db.select({ contributedBy: examQuestions.contributedBy }).from(examQuestions).where(eq(examQuestions.id, seed.publishedQuestion));
    expect(q).toEqual({ contributedBy: null });
    expect(await db.$count(studyAttempts, eq(studyAttempts.userId, B))).toBe(1);
    expect(await db.$count(studyQuizItems)).toBe(1);
  });

  it("leaves every other student's data untouched", async () => {
    const before = await exportJson(B, { now: new Date("2026-11-01T00:00:00Z") });
    await deleteAccount(db, storage, A, "a@example.com");
    const after = await exportJson(B, { now: new Date("2026-11-01T00:00:00Z") });
    expect(after.data).toEqual(before.data);
    expect(await db.$count(user, eq(user.id, B))).toBe(1);
    expect(await db.$count(user, eq(user.id, "admin-1"))).toBe(1);
    expect(await storage.get("resources/b-private")).not.toBeNull();
    expect(await db.$count(account, eq(account.userId, B))).toBe(1);
    expect(await db.$count(session, eq(session.userId, B))).toBe(1);
  });

  it("writes one audit entry without personal data and scrubs audit rows about what was deleted", async () => {
    await deleteAccount(db, storage, A, "a@example.com");
    const [entry] = await db.select().from(auditLog).where(eq(auditLog.action, "account.delete"));
    expect(entry).toMatchObject({ actorId: null, entityType: "account", entityId: null });
    expect(entry!.metadata).toEqual({ privateDocumentsDeleted: 2, unpublishedQuestionsDeleted: 2, notesDeleted: 1, sharedDocumentsKept: 1, questionsKept: 1 });
    const everything = JSON.stringify(await db.select().from(auditLog));
    expect(everything).not.toContain(A);
    expect(everything).not.toContain("a@example.com");
    expect(everything).not.toContain("sha-a-private");
    // B's own rows keep their ids and actor.
    expect(await db.$count(auditLog, and(eq(auditLog.actorId, B), eq(auditLog.entityId, seed.bNote)))).toBe(1);
    // The admin's approval of B still names B.
    expect(await db.$count(auditLog, and(eq(auditLog.action, "user.approval.approved"), eq(auditLog.entityId, B)))).toBe(1);
  });

  it("records a failed file removal in the audit log and still deletes the account", async () => {
    const broken: FileStorage = { ...storage, delete: async (key) => { if (key === "resources/a-private") throw new Error("disk"); await storage.delete(key); } };
    const result = await deleteAccount(db, broken, A, "a@example.com");
    expect(result).toEqual({ ok: true, value: { filesDeleted: 2, filesFailed: 1 } });
    const [entry] = await db.select().from(auditLog).where(eq(auditLog.action, "account.delete.files_failed"));
    expect(entry!.metadata).toEqual({ storageKeys: ["resources/a-private"] });
    expect(await db.$count(user, eq(user.id, A))).toBe(0);
  });

  it("deletes the unshared statuses it documents and nothing else", () => {
    expect([...DELETE_UNSHARED_QUESTION_STATUSES].sort()).toEqual(["pending", "rejected"]);
  });
});

describe("last administrator", () => {
  it("refuses to delete the only approved administrator", async () => {
    expect(await isLastAdmin(db, "admin-1")).toBe(true);
    expect(await deleteAccount(db, storage, "admin-1", "admin1@example.com")).toEqual({ ok: false, error: "lastAdmin" });
    expect(await db.$count(user, eq(user.id, "admin-1"))).toBe(1);
  });

  it("does not count an unapproved or non-admin account as a second administrator", async () => {
    await db.insert(user).values({ id: "admin-2", name: "Admin Two", email: "admin2@example.com", role: "admin", approvalStatus: "pending" });
    await db.update(user).set({ role: "moderator" }).where(eq(user.id, B));
    expect(await isLastAdmin(db, "admin-1")).toBe(true);
    expect((await deleteAccount(db, storage, "admin-1", "admin1@example.com")).ok).toBe(false);
  });

  it("allows an administrator to delete the account when another approved administrator exists", async () => {
    await db.insert(user).values({ id: "admin-2", name: "Admin Two", email: "admin2@example.com", role: "admin", approvalStatus: "approved" });
    expect(await isLastAdmin(db, "admin-1")).toBe(false);
    expect((await deleteAccount(db, storage, "admin-1", "admin1@example.com")).ok).toBe(true);
    // ...and then the remaining one is the last.
    expect(await isLastAdmin(db, "admin-2")).toBe(true);
    expect(await deleteAccount(db, storage, "admin-2", "admin2@example.com")).toEqual({ ok: false, error: "lastAdmin" });
  });

  it("two administrators deleting themselves at the same moment: one is refused as the last administrator", async () => {
    await db.insert(user).values({ id: "admin-2", name: "Admin Two", email: "admin2@example.com", role: "admin", approvalStatus: "approved" });
    const results = await Promise.all([
      deleteAccount(db, storage, "admin-1", "admin1@example.com"),
      deleteAccount(db, storage, "admin-2", "admin2@example.com"),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, error: "lastAdmin" }]);
    expect(await db.$count(user, eq(user.role, "admin"))).toBe(1);
  });

  it("maps a deadlock or serialization failure to a retry message instead of throwing", async () => {
    for (const code of ["40P01", "40001"]) {
      const failing = { transaction: async () => { throw Object.assign(new Error("conflict"), { code }); } } as unknown as Database;
      expect(await deleteAccount(failing, storage, "admin-1", "admin1@example.com")).toEqual({ ok: false, error: "tryAgain" });
    }
    const other = { transaction: async () => { throw new Error("disk on fire"); } } as unknown as Database;
    await expect(deleteAccount(other, storage, "admin-1", "admin1@example.com")).rejects.toThrow("disk on fire");
  });

  it("locks the administrators and the account together, sorted by id (one consistent order)", () => {
    const guard = readFileSync(join(__dirname, "../src/server/users/admin-guard.ts"), "utf8");
    expect(guard).toContain('.orderBy(user.id)');
    expect(guard).toContain('.for("update")');
    const del = readFileSync(join(__dirname, "../src/server/account/delete.ts"), "utf8");
    expect(del).toContain("lockAdminsAnd(tx, userId)");
    expect(del).not.toMatch(/where\(eq\(user\.id, userId\)\)\.for\("update"\)/);
  });

  it("is never true for a student", async () => {
    expect(await isLastAdmin(db, A)).toBe(false);
  });
});
