// Fake data only (TEST courses, example.com accounts). Topics, links, notes, versions, search and visibility.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase, type Database } from "@/db/client";
import { auditLog, courseNotes, courseNoteVersions, courseOfferings, courses, courseTopics, user } from "@/db/schema";
import { QUESTION_LINKS_PER_ITEM_MAX, SEARCH_RESULT_LIMIT, TOPICS_PER_ITEM_MAX } from "@/server/library/constants";
import { describeChange, diffLines } from "@/server/library/diff";
import { escapeLike, snippet } from "@/server/library/like";
import {
  addQuestionLink,
  getTopicPage,
  relatedForNote,
  relatedForQuestion,
  relatedForResource,
  removeQuestionLink,
  selectedTopicIds,
  setItemTopics,
} from "@/server/library/links";
import {
  createNote,
  getNote,
  getNoteVersionDiff,
  listNotes,
  listNoteVersions,
  noteEditSchema,
  noteInputSchema,
  restoreNoteVersion,
  updateNote,
} from "@/server/library/notes";
import { searchLibrary } from "@/server/library/search";
import {
  createTopic,
  getTopic,
  listCourseTopics,
  moveTopic,
  renameTopic,
  setTopicArchived,
  topicInputSchema,
  topicItemCounts,
  topicLabel,
} from "@/server/library/topics";
import { currentAcademicYear } from "@/server/passes/academic-year";
import { moderateQuestion, questionInputSchema, submitQuestion } from "@/server/passes/service";
import { createResource, resourceInputSchema, type Viewer } from "@/server/resources/service";
import { createMemoryStorage } from "@/server/storage";

const viewer = (id: string, role: Viewer["role"], approvalStatus: Viewer["approvalStatus"] = "approved"): Viewer => ({
  id,
  role,
  emailVerified: true,
  approvalStatus,
});
const alice = viewer("alice", "student");
const bob = viewer("bob", "student");
const mod = viewer("mod", "moderator");
const admin = viewer("admin", "admin");
const waiting = viewer("waiting", "student", "pending");

const enc = new TextEncoder();
const pdf = (body: string) => ({ name: "doc.pdf", bytes: enc.encode(`%PDF-1.4\n${body}\n%%EOF`) });
const storage = createMemoryStorage();

let db: Database;
let courseId: string;
let otherCourseId: string;
let oldOfferingId: string;
let newOfferingId: string;

const topicInput = (name: string, nameEn?: string) => topicInputSchema.parse({ name, nameEn });
const noteInput = (overrides: Record<string, unknown> = {}) => noteInputSchema.parse({ courseId, title: "Ma note", body: "Contenu", ...overrides });

async function topic(name: string, cid = courseId) {
  const r = await createTopic(db, mod, cid, topicInput(name));
  if (!r.ok) throw new Error(r.error);
  return r.value.id;
}
async function note(who: Viewer, overrides: Record<string, unknown> = {}) {
  const r = await createNote(db, who, noteInput(overrides));
  if (!r.ok) throw new Error(r.error);
  return r.value.id;
}
async function doc(who: Viewer, body: string, overrides: Record<string, unknown> = {}) {
  const input = resourceInputSchema.parse({ courseId, kind: "notes", title: "Document fictif", rightsConfirmed: "on", ...overrides });
  const r = await createResource(db, storage, who, input, pdf(body));
  if (!r.ok) throw new Error(r.error);
  return r.value.id;
}
async function question(who: Viewer, text: string, cid = courseId) {
  const input = questionInputSchema.parse({
    courseId: cid,
    examAcademicYear: currentAcademicYear(),
    questionType: "sc",
    questionText: text,
    rightsConfirmed: true,
    choices: [
      { text: "A", proposedCorrect: true },
      { text: "B", proposedCorrect: false },
    ],
  });
  const r = await submitQuestion(db, storage, who, input, []);
  if (!r.ok) throw new Error(r.error);
  return r.value.id;
}

beforeEach(async () => {
  db = await createTestDatabase();
  await db.insert(user).values(
    [alice, bob, mod, admin, waiting].map((v) => ({ id: v.id, name: v.id, email: `${v.id}@example.com`, emailVerified: true, role: v.role, approvalStatus: v.approvalStatus })),
  );
  const [c1, c2] = await db
    .insert(courses)
    .values([
      { code: "TEST 1001", titleFr: "Cours fictif un" },
      { code: "TEST 1002", titleFr: "Cours fictif deux" },
    ])
    .returning();
  courseId = c1!.id;
  otherCourseId = c2!.id;
  const [o1, o2] = await db
    .insert(courseOfferings)
    .values([
      { courseId, academicYear: "2024-2025", term: "fall" },
      { courseId, academicYear: "2025-2026", term: "fall" },
    ])
    .returning();
  oldOfferingId = o1!.id;
  newOfferingId = o2!.id;
});

describe("topic administration", () => {
  it("lets moderators and admins manage topics, and nobody else", async () => {
    for (const student of [alice, waiting]) {
      expect(await createTopic(db, student, courseId, topicInput("Anatomie"))).toEqual({ ok: false, error: "forbidden" });
    }
    const id = await topic("Anatomie");
    expect((await createTopic(db, admin, courseId, topicInput("Occlusion"))).ok).toBe(true);
    for (const student of [alice, bob]) {
      expect(await renameTopic(db, student, id, topicInput("Autre"))).toEqual({ ok: false, error: "forbidden" });
      expect(await setTopicArchived(db, student, id, true)).toEqual({ ok: false, error: "forbidden" });
      expect(await moveTopic(db, student, id, "down")).toEqual({ ok: false, error: "forbidden" });
    }
    const [row] = await db.select().from(courseTopics).where(eq(courseTopics.id, id));
    expect(row).toMatchObject({ name: "Anatomie", archivedAt: null });
    expect((await renameTopic(db, mod, id, topicInput("Anatomie dentaire", "Dental anatomy"))).ok).toBe(true);
    expect(topicLabel({ name: "Anatomie dentaire", nameEn: "Dental anatomy" }, "en")).toBe("Dental anatomy");
    expect(topicLabel({ name: "Anatomie dentaire", nameEn: null }, "en")).toBe("Anatomie dentaire");
    expect(topicLabel({ name: "Anatomie dentaire", nameEn: "Dental anatomy" }, "fr")).toBe("Anatomie dentaire");
  });

  it("refuses duplicate names ignoring case, and audits changes", async () => {
    await topic("Anatomie");
    expect(await createTopic(db, mod, courseId, topicInput("  anatomie "))).toEqual({ ok: false, error: "duplicateTopic" });
    expect((await createTopic(db, mod, otherCourseId, topicInput("Anatomie"))).ok).toBe(true);
    expect(topicInputSchema.safeParse({ name: "   " }).success).toBe(false);
    const actions = (await db.select().from(auditLog)).map((a) => a.action);
    expect(actions.filter((a) => a === "topic.create")).toHaveLength(2);
  });

  it("archives, restores and reorders; students only see active topics in order", async () => {
    const a = await topic("A");
    const b = await topic("B");
    const c = await topic("C");
    expect((await listCourseTopics(db, alice, courseId)).map((t) => t.name)).toEqual(["A", "B", "C"]);
    await moveTopic(db, mod, c, "up");
    expect((await listCourseTopics(db, alice, courseId)).map((t) => t.name)).toEqual(["A", "C", "B"]);
    await moveTopic(db, mod, a, "up"); // already first: nothing changes
    await moveTopic(db, mod, b, "down"); // already last
    expect((await listCourseTopics(db, alice, courseId)).map((t) => t.name)).toEqual(["A", "C", "B"]);
    await setTopicArchived(db, mod, c, true);
    expect((await listCourseTopics(db, alice, courseId)).map((t) => t.name)).toEqual(["A", "B"]);
    expect((await listCourseTopics(db, alice, courseId, { includeArchived: true })).map((t) => t.name)).toEqual(["A", "B"]);
    expect((await listCourseTopics(db, mod, courseId, { includeArchived: true })).map((t) => t.name)).toEqual(["A", "C", "B"]);
    await setTopicArchived(db, mod, c, false);
    expect((await listCourseTopics(db, alice, courseId)).map((t) => t.name)).toEqual(["A", "C", "B"]);
    expect(await listCourseTopics(db, waiting, courseId)).toEqual([]);
    expect(await getTopic(db, waiting, a)).toBeNull();
  });
});

describe("linking topics", () => {
  it("only the owner sets a note's topics, from the note's own course", async () => {
    const t = await topic("Anatomie");
    const other = await topic("Autre cours", otherCourseId);
    const n = await note(alice);
    expect(await setItemTopics(db, bob, "note", n, [t])).toEqual({ ok: false, error: "notFound" });
    expect(await setItemTopics(db, mod, "note", n, [t])).toEqual({ ok: false, error: "notFound" });
    expect(await setItemTopics(db, admin, "note", n, [t])).toEqual({ ok: false, error: "notFound" });
    expect(await setItemTopics(db, alice, "note", n, [other])).toEqual({ ok: false, error: "invalidTopics" });
    expect(await setItemTopics(db, alice, "note", n, ["2f5b0a08-0000-4000-8000-000000000000"])).toEqual({ ok: false, error: "invalidTopics" });
    expect((await setItemTopics(db, alice, "note", n, [t])).ok).toBe(true);
    expect((await relatedForNote(db, alice, n))!.topics.map((x) => x.name)).toEqual(["Anatomie"]);
    expect((await setItemTopics(db, alice, "note", n, [])).ok).toBe(true);
    expect((await relatedForNote(db, alice, n))!.topics).toEqual([]);
  });

  it("refuses a malformed topic id with invalidTopics instead of throwing (a tampered form is not a 500)", async () => {
    const t = await topic("Anatomie");
    const n = await note(alice);
    expect(await setItemTopics(db, alice, "note", n, ["not-a-uuid"])).toEqual({ ok: false, error: "invalidTopics" });
    expect(await setItemTopics(db, alice, "note", n, [t, "%"])).toEqual({ ok: false, error: "invalidTopics" });
    expect(await addQuestionLink(db, alice, "note", n, "not-a-uuid")).toMatchObject({ ok: false });
    expect((await setItemTopics(db, alice, "note", n, [t])).ok).toBe(true);
  });

  it("selectedTopicIds enforces the edit rule itself, so a private item's topics never leak", async () => {
    const t = await topic("Anatomie");
    const n = await note(alice, { topicIds: [t] });
    const mine = await doc(alice, "mine", { visibility: "private", title: "Privé" });
    await setItemTopics(db, alice, "resource", mine, [t]);
    expect(await selectedTopicIds(db, alice, "note", n)).toEqual([t]);
    expect(await selectedTopicIds(db, alice, "resource", mine)).toEqual([t]);
    for (const other of [bob, mod, admin, waiting]) {
      expect(await selectedTopicIds(db, other, "note", n), other.id).toEqual([]);
      expect(await selectedTopicIds(db, other, "resource", mine), other.id).toEqual([]);
    }
    expect(await selectedTopicIds(db, alice, "note", "not-a-uuid")).toEqual([]);
  });

  it("archived topics cannot be newly linked but existing links survive", async () => {
    const keep = await topic("Ancien");
    const added = await topic("Nouveau");
    const n = await note(alice, { topicIds: [keep] });
    await setTopicArchived(db, mod, keep, true);
    await setTopicArchived(db, mod, added, true);
    expect((await setItemTopics(db, alice, "note", n, [keep])).ok).toBe(true);
    expect(await setItemTopics(db, alice, "note", n, [keep, added])).toEqual({ ok: false, error: "invalidTopics" });
    expect((await relatedForNote(db, alice, n))!.topics).toEqual([expect.objectContaining({ name: "Ancien", archived: true })]);
  });

  it("limits topics per item", async () => {
    const ids: string[] = [];
    for (let i = 0; i <= TOPICS_PER_ITEM_MAX; i++) ids.push(await topic(`Sujet ${i}`));
    const n = await note(alice);
    expect(await setItemTopics(db, alice, "note", n, ids)).toEqual({ ok: false, error: "invalidTopics" });
    expect((await setItemTopics(db, alice, "note", n, ids.slice(0, TOPICS_PER_ITEM_MAX))).ok).toBe(true);
  });

  it("documents: the uploader or a moderator links topics; another student cannot; private documents stay private", async () => {
    const t = await topic("Anatomie");
    const shared = await doc(mod, "shared", { visibility: "shared" });
    const mine = await doc(alice, "mine", { visibility: "private", title: "Privé" });
    expect(await setItemTopics(db, alice, "resource", shared, [t])).toEqual({ ok: false, error: "notFound" });
    expect((await setItemTopics(db, mod, "resource", shared, [t])).ok).toBe(true);
    expect((await setItemTopics(db, alice, "resource", mine, [t])).ok).toBe(true);
    expect(await setItemTopics(db, bob, "resource", mine, [t])).toEqual({ ok: false, error: "notFound" });
    expect(await setItemTopics(db, mod, "resource", mine, [])).toEqual({ ok: false, error: "notFound" });
    expect(await relatedForResource(db, bob, mine)).toBeNull();
    expect((await relatedForResource(db, bob, shared))!.topics.map((x) => x.name)).toEqual(["Anatomie"]);
  });

  it("questions: contributors and moderators tag; others cannot", async () => {
    const t = await topic("Anatomie");
    const q = await question(mod, "Q publiée");
    expect(await setItemTopics(db, alice, "question", q, [t])).toEqual({ ok: false, error: "notFound" });
    expect((await setItemTopics(db, mod, "question", q, [t])).ok).toBe(true);
    expect((await relatedForQuestion(db, bob, q))!.topics.map((x) => x.name)).toEqual(["Anatomie"]);
  });
});

describe("links to questions and link visibility", () => {
  it("links only published questions of the same course", async () => {
    const n = await note(alice);
    const published = await question(mod, "Publiée");
    const pending = await question(alice, "En attente");
    const otherCourse = await question(mod, "Autre cours", otherCourseId);
    expect(await addQuestionLink(db, alice, "note", n, pending)).toEqual({ ok: false, error: "invalidQuestion" });
    expect(await addQuestionLink(db, alice, "note", n, otherCourse)).toEqual({ ok: false, error: "invalidQuestion" });
    expect(await addQuestionLink(db, bob, "note", n, published)).toEqual({ ok: false, error: "notFound" });
    expect((await addQuestionLink(db, alice, "note", n, published)).ok).toBe(true);
    expect((await addQuestionLink(db, alice, "note", n, published)).ok).toBe(true); // idempotent
    expect((await relatedForNote(db, alice, n))!.questions).toHaveLength(1);
    await moderateQuestion(db, mod, published, "hide", null);
    expect((await relatedForNote(db, alice, n))!.questions).toEqual([]);
    expect((await removeQuestionLink(db, alice, "note", n, published)).ok).toBe(true);
  });

  it("caps links per item", async () => {
    const n = await note(alice);
    for (let i = 0; i < QUESTION_LINKS_PER_ITEM_MAX; i++) {
      expect((await addQuestionLink(db, alice, "note", n, await question(mod, `Question numéro ${i} distincte ${"x".repeat(i)}`))).ok).toBe(true);
    }
    expect(await addQuestionLink(db, alice, "note", n, await question(mod, "Une de trop"))).toEqual({ ok: false, error: "tooManyLinks" });
  });

  it("never leaks a private note or private document through a question page", async () => {
    const q = await question(mod, "Question publiée");
    const privateNote = await note(alice, { title: "Secret d'Alice" });
    const privateDoc = await doc(alice, "privé", { visibility: "private", title: "Doc privé" });
    const sharedDoc = await doc(mod, "partagé", { visibility: "shared", title: "Doc partagé" });
    await addQuestionLink(db, alice, "note", privateNote, q);
    await addQuestionLink(db, alice, "resource", privateDoc, q);
    await addQuestionLink(db, mod, "resource", sharedDoc, q);

    const forAlice = (await relatedForQuestion(db, alice, q))!;
    expect(forAlice.notes.map((x) => x.title)).toEqual(["Secret d'Alice"]);
    expect(forAlice.documents.map((x) => x.title).sort()).toEqual(["Doc partagé", "Doc privé"]);

    for (const other of [bob, mod, admin]) {
      const seen = (await relatedForQuestion(db, other, q))!;
      expect(seen.notes).toEqual([]);
      expect(seen.documents.map((x) => x.title)).toEqual(["Doc partagé"]);
    }
    expect(await relatedForNote(db, bob, privateNote)).toBeNull();
    expect(await relatedForNote(db, admin, privateNote)).toBeNull();
  });

  it("does not show anything to a non-approved viewer, and hides pending questions' links", async () => {
    const q = await question(alice, "Mine pending");
    expect(await relatedForQuestion(db, bob, q)).toBeNull();
    expect(await relatedForQuestion(db, waiting, q)).toBeNull();
  });
});

describe("topic page", () => {
  it("lists documents, own notes and published questions, never someone else's private note or an unpublished question", async () => {
    const t = await topic("Anatomie");
    const aliceNote = await note(alice, { title: "Note d'Alice", topicIds: [t] });
    const bobNote = await note(bob, { title: "Note de Bob", topicIds: [t] });
    const published = await question(mod, "Publiée sur l'anatomie");
    const pending = await question(alice, "Question en attente");
    await setItemTopics(db, mod, "question", published, [t]);
    await setItemTopics(db, alice, "question", pending, [t]);
    const sharedDoc = await doc(mod, "d1", { visibility: "shared", title: "Doc partagé" });
    const privateDoc = await doc(alice, "d2", { visibility: "private", title: "Doc privé d'Alice" });
    await setItemTopics(db, mod, "resource", sharedDoc, [t]);
    await setItemTopics(db, alice, "resource", privateDoc, [t]);

    const asAlice = (await getTopicPage(db, alice, t))!;
    expect(asAlice.notes.map((n) => n.title)).toEqual(["Note d'Alice"]);
    expect(asAlice.documents.map((d) => d.title).sort()).toEqual(["Doc partagé", "Doc privé d'Alice"]);
    expect(asAlice.questions.map((q) => q.questionText)).toEqual(["Publiée sur l'anatomie"]);

    for (const other of [bob, mod, admin]) {
      const page = (await getTopicPage(db, other, t))!;
      expect(page.notes.map((n) => n.title)).toEqual(other.id === "bob" ? ["Note de Bob"] : []);
      expect(page.documents.map((d) => d.title)).toEqual(["Doc partagé"]);
      expect(page.questions.map((q) => q.questionText)).toEqual(["Publiée sur l'anatomie"]);
      expect(JSON.stringify(page)).not.toContain("Note d'Alice");
      expect(JSON.stringify(page)).not.toContain("Doc privé");
      expect(JSON.stringify(page)).not.toContain(aliceNote);
    }
    expect(bobNote).toBeTruthy();

    expect([...(await topicItemCounts(db, bob, courseId)).values()]).toEqual([{ documents: 1, notes: 1, questions: 1 }]);
    expect([...(await topicItemCounts(db, mod, courseId)).values()]).toEqual([{ documents: 1, notes: 0, questions: 1 }]);
    expect(await getTopicPage(db, waiting, t)).toBeNull();
  });

  it("keeps free-text topics readable: matching legacy documents and questions show up, flagged as legacy", async () => {
    const t = await topic("Anatomie");
    const legacyDoc = await doc(mod, "legacy", { visibility: "shared", topic: "anatomie", title: "Ancien document" });
    const linkedDoc = await doc(mod, "linked", { visibility: "shared", title: "Document lié" });
    await setItemTopics(db, mod, "resource", linkedDoc, [t]);
    const other = await doc(mod, "unrelated", { visibility: "shared", topic: "Anatomie du nez", title: "Autre" });
    const page = (await getTopicPage(db, bob, t))!;
    expect(page.documents.map((d) => [d.title, d.legacy]).sort()).toEqual([
      ["Ancien document", true],
      ["Document lié", false],
    ]);
    expect(page.documents.some((d) => d.id === other)).toBe(false);
    expect(legacyDoc).toBeTruthy();
    expect((await relatedForResource(db, bob, legacyDoc))!.legacyTopic).toBe("anatomie");
  });

  it("treats a topic whose name has wildcard characters literally when matching legacy text", async () => {
    const t = await topic("100%");
    await doc(mod, "w1", { visibility: "shared", topic: "100 pour cent", title: "Pas lié" });
    const page = (await getTopicPage(db, bob, t))!;
    expect(page.documents).toEqual([]);
  });
});

describe("notes and version history", () => {
  it("creates a note with version 1, private to the owner", async () => {
    const n = await note(alice, { title: "  Titre  ", body: "a\r\nb" });
    const got = (await getNote(db, alice, n))!;
    expect(got).toMatchObject({ title: "Titre", body: "a\nb", currentVersion: 1 });
    for (const other of [bob, mod, admin, waiting]) expect(await getNote(db, other, n)).toBeNull();
    expect(await listNotes(db, bob)).toEqual([]);
    expect((await listNotes(db, alice)).map((x) => x.id)).toEqual([n]);
    expect(await createNote(db, waiting, noteInput())).toEqual({ ok: false, error: "forbidden" });
    expect(await createNote(db, alice, noteInput({ offeringId: "2f5b0a08-0000-4000-8000-000000000000" }))).toEqual({ ok: false, error: "invalidOffering" });
    expect(noteInputSchema.safeParse({ courseId, title: " " }).success).toBe(false);
  });

  it("each save appends a version; unchanged saves and stale editors are refused", async () => {
    const n = await note(alice, { title: "V1", body: "ligne 1\nligne 2" });
    const edit = (over: Record<string, unknown>) => noteEditSchema.parse({ noteId: n, baseVersion: 1, title: "V1", body: "ligne 1\nligne 2", ...over });
    expect(await updateNote(db, alice, edit({}))).toEqual({ ok: false, error: "noChange" });
    expect(await updateNote(db, bob, edit({ body: "x" }))).toEqual({ ok: false, error: "notFound" });
    expect(await updateNote(db, mod, edit({ body: "x" }))).toEqual({ ok: false, error: "notFound" });
    const saved = await updateNote(db, alice, edit({ title: "V2", body: "ligne 1\nligne 2\nligne 3", changeNote: "ajout" }));
    expect(saved).toEqual({ ok: true, value: { versionNumber: 2 } });
    expect(await updateNote(db, alice, edit({ body: "autre" }))).toEqual({ ok: false, error: "versionConflict" });
    const versions = (await listNoteVersions(db, alice, n))!;
    expect(versions.map((v) => v.versionNumber)).toEqual([2, 1]);
    expect(versions[0]).toMatchObject({ title: "V2", changeNote: "ajout", authorName: "alice", isCurrent: true });
    expect(versions[0]!.change).toMatchObject({ titleChanged: true, bodyChanged: true, added: 1, removed: 0 });
    expect(await listNoteVersions(db, bob, n)).toBeNull();
    const diff = (await getNoteVersionDiff(db, alice, n, 2))!;
    expect(diff.titleChanged).toBe(true);
    expect(diff.body.ops.filter((o) => o.type === "add").map((o) => o.text)).toEqual(["ligne 3"]);
    expect(await getNoteVersionDiff(db, bob, n, 2)).toBeNull();
  });

  it("restores an old version as a NEW version, by the owner only", async () => {
    const n = await note(alice, { title: "Premier", body: "un" });
    await updateNote(db, alice, noteEditSchema.parse({ noteId: n, baseVersion: 1, title: "Second", body: "deux" }));
    for (const other of [bob, mod, admin, waiting]) {
      expect(await restoreNoteVersion(db, other, n, 1)).toEqual({ ok: false, error: "notFound" });
    }
    expect((await getNote(db, alice, n))!).toMatchObject({ title: "Second", body: "deux", currentVersion: 2 });
    expect(await restoreNoteVersion(db, alice, n, 2)).toEqual({ ok: false, error: "noChange" });
    expect(await restoreNoteVersion(db, alice, n, 9)).toEqual({ ok: false, error: "notFound" });
    expect(await restoreNoteVersion(db, alice, n, 1)).toEqual({ ok: true, value: { versionNumber: 3 } });
    expect((await getNote(db, alice, n))!).toMatchObject({ title: "Premier", body: "un", currentVersion: 3 });
    const versions = (await listNoteVersions(db, alice, n))!;
    expect(versions.map((v) => v.versionNumber)).toEqual([3, 2, 1]);
    expect(versions[0]).toMatchObject({ restoredFromVersion: 1, title: "Premier" });
    expect(versions.find((v) => v.versionNumber === 2)).toMatchObject({ title: "Second" }); // history is never rewritten
  });

  it("two saves from the same version: one wins, the other gets versionConflict (never a thrown error)", async () => {
    const n = await note(alice, { title: "Base", body: "un" });
    const edit = (body: string) => noteEditSchema.parse({ noteId: n, baseVersion: 1, title: "Base", body });
    const results = await Promise.all([updateNote(db, alice, edit("deux")), updateNote(db, alice, edit("trois"))]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, error: "versionConflict" }]);
    expect((await listNoteVersions(db, alice, n))!.map((v) => v.versionNumber)).toEqual([2, 1]);
    // Restoring while another save lands is the same: a conflict or a clean success, never an exception.
    const both = await Promise.all([restoreNoteVersion(db, alice, n, 1), updateNote(db, alice, noteEditSchema.parse({ noteId: n, baseVersion: 2, title: "Base", body: "quatre" }))]);
    expect(both.some((r) => r.ok)).toBe(true);
    const numbers = (await listNoteVersions(db, alice, n))!.map((v) => v.versionNumber);
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it("turns a duplicate version number from the database into versionConflict (save and restore)", async () => {
    const n = await note(alice, { title: "Base", body: "un" });
    // A version 2 exists although the note still says version 1: the situation a lost race leaves behind.
    await db.insert(courseNoteVersions).values({ noteId: n, versionNumber: 2, title: "Fantôme", body: "x", createdBy: "alice" });
    expect(await updateNote(db, alice, noteEditSchema.parse({ noteId: n, baseVersion: 1, title: "Base", body: "deux" }))).toEqual({ ok: false, error: "versionConflict" });
    expect(await restoreNoteVersion(db, alice, n, 2)).toEqual({ ok: false, error: "versionConflict" });
  });

  it("locks the note row while saving or restoring", () => {
    const source = readFileSync(join(__dirname, "../src/server/library/notes.ts"), "utf8");
    expect(source.match(/\.for\("update"\)/g)).toHaveLength(2);
  });

  it("audit entries never contain the note text", async () => {
    await note(alice, { title: "Titre confidentiel", body: "Texte confidentiel" });
    expect(JSON.stringify(await db.select().from(auditLog))).not.toMatch(/confidentiel/);
  });
});

describe("current and previous offerings", () => {
  it("derives the period of notes and documents from the offering, never from a stored value", async () => {
    await note(alice, { title: "Ancienne", offeringId: oldOfferingId });
    await note(alice, { title: "Récente", offeringId: newOfferingId });
    await note(alice, { title: "Générale" });
    const byTitle = Object.fromEntries((await listNotes(db, alice)).map((n) => [n.title, n.period]));
    expect(byTitle).toEqual({ Ancienne: "historical", Récente: "current", Générale: "general" });
    const t = await topic("Sujet");
    const oldDoc = await doc(mod, "old", { visibility: "shared", offeringId: oldOfferingId, title: "Doc ancien" });
    const newDoc = await doc(mod, "new", { visibility: "shared", offeringId: newOfferingId, title: "Doc récent" });
    await setItemTopics(db, mod, "resource", oldDoc, [t]);
    await setItemTopics(db, mod, "resource", newDoc, [t]);
    const page = (await getTopicPage(db, bob, t))!;
    expect(Object.fromEntries(page.documents.map((d) => [d.title, d.period]))).toEqual({ "Doc ancien": "historical", "Doc récent": "current" });
    // a newer offering moves the previous "current" material to historical without editing anything
    await db.insert(courseOfferings).values({ courseId, academicYear: "2026-2027", term: "fall" });
    const after = (await getTopicPage(db, bob, t))!;
    expect(Object.fromEntries(after.documents.map((d) => [d.title, d.period]))).toEqual({ "Doc ancien": "historical", "Doc récent": "historical" });
  });

  it("labels questions by exam year (current or previous year)", async () => {
    const q = await question(mod, "Question de l'année");
    const t = await topic("Sujet");
    await setItemTopics(db, mod, "question", q, [t]);
    expect((await getTopicPage(db, bob, t))!.questions[0]!.category).toBe("current");
  });
});

describe("search", () => {
  it("escapes ILIKE wildcards and backslashes", () => {
    expect(escapeLike("50%_off\\")).toBe("50\\%\\_off\\\\");
    expect(escapeLike("plain")).toBe("plain");
  });

  it("matches % and _ literally in notes, topics, documents and questions", async () => {
    await note(alice, { title: "Taux 50%", body: "rien" });
    await note(alice, { title: "Taux 5000", body: "rien" });
    await note(alice, { title: "snake_case", body: "rien" });
    await note(alice, { title: "snakeXcase", body: "rien" });
    await topic("Sujet 100%");
    await topic("Sujet 1000");
    const percent = await searchLibrary(db, alice, { q: "%" });
    expect(percent.notes.items.map((n) => n.title)).toEqual(["Taux 50%"]);
    expect(percent.topics.items.map((t) => t.name)).toEqual(["Sujet 100%"]);
    expect((await searchLibrary(db, alice, { q: "_" })).notes.items.map((n) => n.title)).toEqual(["snake_case"]);
    expect((await searchLibrary(db, alice, { q: "\\" })).notes.items).toEqual([]);
    expect((await searchLibrary(db, alice, { q: "e_c" })).notes.items.map((n) => n.title)).toEqual(["snake_case"]);
  });

  it("never returns another person's private note, and searches your own with a snippet", async () => {
    await note(alice, { title: "Note secrète", body: "Le mot unique zébrure se trouve ici, au milieu d'un long texte de révision sur la dentisterie restauratrice et ses nombreuses techniques." });
    const mine = await searchLibrary(db, alice, { q: "zébrure" });
    expect(mine.notes.total).toBe(1);
    expect(mine.notes.items[0]!.snippet).toContain("zébrure");
    expect(JSON.stringify(mine.notes.items[0])).not.toContain('"body"');
    for (const other of [bob, mod, admin]) {
      const found = await searchLibrary(db, other, { q: "zébrure" });
      expect(found.notes).toEqual({ items: [], total: 0 });
      expect((await searchLibrary(db, other, { q: "secrète" })).notes.total).toBe(0);
    }
    expect(await searchLibrary(db, waiting, { q: "zébrure" })).toMatchObject({ notes: { total: 0 }, documents: { total: 0 } });
  });

  it("filters by course, finds topics, and caps each source", async () => {
    for (let i = 0; i < SEARCH_RESULT_LIMIT + 3; i++) await note(alice, { title: `Révision ${i}` });
    await note(alice, { courseId: otherCourseId, title: "Révision autre cours" });
    await topic("Révision générale");
    await topic("Révision ailleurs", otherCourseId);
    const all = await searchLibrary(db, alice, { q: "Révision" });
    expect(all.notes.items).toHaveLength(SEARCH_RESULT_LIMIT);
    expect(all.notes.total).toBe(SEARCH_RESULT_LIMIT + 4);
    expect(all.topics.total).toBe(2);
    const one = await searchLibrary(db, alice, { q: "Révision", courseId: otherCourseId });
    expect(one.notes.items.map((n) => n.title)).toEqual(["Révision autre cours"]);
    expect(one.topics.items.map((t) => t.name)).toEqual(["Révision ailleurs"]);
    expect((await searchLibrary(db, alice, { q: "   " })).notes.total).toBe(0);
  });

  it("does not search archived topics or unpublished questions", async () => {
    const t = await topic("Archivé");
    await setTopicArchived(db, mod, t, true);
    await question(alice, "Question en attente zèbre");
    const r = await searchLibrary(db, alice, { q: "zèbre" });
    expect(r.questions.items).toEqual([]);
    expect((await searchLibrary(db, alice, { q: "Archivé" })).topics.items).toEqual([]);
  });
});

describe("text comparison", () => {
  it("diffs by line", () => {
    const d = diffLines("a\nb\nc", "a\nB\nc\nd");
    expect(d.ops).toEqual([
      { type: "same", text: "a" },
      { type: "del", text: "b" },
      { type: "add", text: "B" },
      { type: "same", text: "c" },
      { type: "add", text: "d" },
    ]);
    expect([d.added, d.removed]).toEqual([2, 1]);
    expect(diffLines("", "x")).toMatchObject({ added: 1, removed: 0 });
    expect(diffLines("x", "")).toMatchObject({ added: 0, removed: 1 });
    expect(diffLines("same", "same")).toMatchObject({ added: 0, removed: 0 });
  });

  it("skips huge comparisons instead of freezing", () => {
    const big = Array.from({ length: 50 }, (_, i) => `l${i}`).join("\n");
    const other = Array.from({ length: 50 }, (_, i) => `m${i}`).join("\n");
    expect(diffLines(big, other, 10)).toEqual({ ops: [], added: 0, removed: 0, tooLarge: true });
    expect(describeChange(null, { title: "t", body: "a\nb" })).toMatchObject({ added: 2, removed: 0 });
  });

  it("cuts a snippet around the match", () => {
    const text = `${"x ".repeat(100)}cible${" y".repeat(100)}`;
    const s = snippet(text, "CIBLE", 60);
    expect(s).toContain("cible");
    expect(s.length).toBeLessThanOrEqual(62);
    expect(snippet("court", "zz")).toBe("court");
  });
});

describe("notes in the database", () => {
  it("deleting the account removes its notes (private data goes with the owner)", async () => {
    await note(alice);
    await db.delete(user).where(eq(user.id, "alice"));
    expect(await db.select().from(courseNotes)).toEqual([]);
  });
});
