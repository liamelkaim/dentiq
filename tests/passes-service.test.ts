// Fake data only (TEST course, example.com accounts, synthetic images). Exam years are computed from today's
// date so the tests keep working as time passes.
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase, type Database } from "@/db/client";
import {
  auditLog,
  courseOfferings,
  courses,
  examQuestionChoices,
  examQuestionImages,
  examQuestions,
  offeringInstructors,
  professors,
  user,
} from "@/db/schema";
import { currentAcademicYear, parseAcademicYear } from "@/server/passes/academic-year";
import { updatePassSettings } from "@/server/passes/settings";
import {
  editQuestion,
  findRepeats,
  getQuestion,
  getQuestionImageDownload,
  listQuestionQueue,
  listQuestionRevisions,
  listQuestions,
  markDuplicate,
  moderateQuestion,
  questionInputSchema,
  reportQuestion,
  resolveQuestionReport,
  submitQuestion,
  unverifyAnswer,
  verifyAnswer,
  type ImageUpload,
  type QuestionInput,
} from "@/server/passes/service";
import type { Viewer } from "@/server/resources/service";
import { createMemoryStorage } from "@/server/storage";

const thisYear = currentAcademicYear();
const start = parseAcademicYear(thisYear)!;
const lastYear = `${start - 1}-${start}`;
const olderYear = `${start - 2}-${start - 1}`;

const viewer = (id: string, role: Viewer["role"], approved = true): Viewer => ({
  id,
  role,
  emailVerified: true,
  approvalStatus: approved ? "approved" : "pending",
});
const alice = viewer("alice", "student");
const bob = viewer("bob", "student");
const carol = viewer("carol", "student", false); // not approved yet
const mod = viewer("mod", "moderator");
const admin = viewer("admin", "admin");

const png = (extra = 1) => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, extra, 2, 3]);
const image = (name = "radio.png", bytes = png(), altText: string | null = "Radiographie panoramique"): ImageUpload => ({ name, bytes, altText });

let db: Database;
let storage: ReturnType<typeof createMemoryStorage>;
let courseId: string;
let otherCourseId: string;
let offeringThis: string;
let offeringLast: string;
let professorId: string;

function input(overrides: Record<string, unknown> = {}): QuestionInput {
  return questionInputSchema.parse({
    courseId,
    examAcademicYear: thisYear,
    questionType: "sc",
    questionText: "Quelle structure forme le plafond de la cavité buccale ?",
    rightsConfirmed: true,
    choices: [
      { text: "Le palais", proposedCorrect: true },
      { text: "La langue", proposedCorrect: false },
      { text: "Le plancher buccal", proposedCorrect: false },
    ],
    ...overrides,
  });
}

async function submit(who: Viewer, overrides: Record<string, unknown> = {}, images: ImageUpload[] = []) {
  const result = await submitQuestion(db, storage, who, input(overrides), images);
  if (!result.ok) throw new Error(`submit failed: ${result.error}`);
  return result.value.id;
}

/** A published question, ready for review and verification tests. */
const published = (overrides: Record<string, unknown> = {}) => submit(mod, overrides);

async function row(id: string) {
  const [q] = await db.select().from(examQuestions).where(eq(examQuestions.id, id));
  return q!;
}
const choicesOf = (id: string) =>
  db.select().from(examQuestionChoices).where(eq(examQuestionChoices.questionId, id)).orderBy(examQuestionChoices.position);

beforeEach(async () => {
  db = await createTestDatabase();
  storage = createMemoryStorage();
  await db.insert(user).values(
    [alice, bob, carol, mod, admin].map((v) => ({
      id: v.id,
      name: v.id,
      email: `${v.id}@example.com`,
      emailVerified: true,
      role: v.role,
      approvalStatus: v.approvalStatus,
    })),
  );
  const [course] = await db.insert(courses).values({ code: "TEST 1001", titleFr: "Cours fictif" }).returning();
  const [other] = await db.insert(courses).values({ code: "TEST 2002", titleFr: "Autre cours fictif" }).returning();
  courseId = course!.id;
  otherCourseId = other!.id;
  const [o1] = await db.insert(courseOfferings).values({ courseId, academicYear: thisYear, term: "fall" }).returning();
  const [o2] = await db.insert(courseOfferings).values({ courseId, academicYear: lastYear, term: "fall" }).returning();
  offeringThis = o1!.id;
  offeringLast = o2!.id;
  const [prof] = await db.insert(professors).values({ fullName: "Prof Fictif" }).returning();
  professorId = prof!.id;
  await db.insert(offeringInstructors).values({ offeringId: offeringLast, professorId });
});

describe("submitting a question", () => {
  it("holds a student's question for review, with its first revision and an audit entry", async () => {
    const id = await submit(alice);
    expect(await row(id)).toMatchObject({ status: "pending", answerStatus: "proposed", contributedBy: "alice", questionType: "sc" });
    expect((await choicesOf(id)).map((c) => [c.position, c.text, c.proposedCorrect, c.verifiedCorrect])).toEqual([
      [1, "Le palais", true, null],
      [2, "La langue", false, null],
      [3, "Le plancher buccal", false, null],
    ]);
    expect(await listQuestionRevisions(db, alice, id)).toHaveLength(1);
    expect(await db.select().from(auditLog).where(eq(auditLog.action, "question.submit"))).toHaveLength(1);
  });

  it("publishes a moderator's or administrator's question directly (answer still only proposed)", async () => {
    for (const who of [mod, admin]) {
      const id = await submit(who, { questionText: `Question de ${who.id} ?` });
      expect(await row(id)).toMatchObject({ status: "published", answerStatus: "proposed", reviewedBy: who.id });
    }
  });

  it("refuses accounts that are not approved, and stores nothing", async () => {
    expect(await submitQuestion(db, storage, carol, input())).toEqual({ ok: false, error: "forbidden", questionId: undefined });
    expect(await db.select().from(examQuestions)).toEqual([]);
  });

  it("requires the rights confirmation", () => {
    expect(questionInputSchema.safeParse({ ...input(), rightsConfirmed: false }).success).toBe(false);
    expect(questionInputSchema.safeParse({ ...input(), rightsConfirmed: undefined }).success).toBe(false);
  });

  it("keeps the real exam year, term, offering and professor", async () => {
    const id = await submit(alice, { examAcademicYear: lastYear, examTerm: "fall", offeringId: offeringLast, professorId, topic: "Anatomie" });
    expect(await row(id)).toMatchObject({ examAcademicYear: lastYear, examTerm: "fall", offeringId: offeringLast, professorId, topic: "Anatomie" });
  });

  it("checks each question type's own rules", async () => {
    const bad: [Record<string, unknown>, string][] = [
      [{ choices: [{ text: "Seul" }] }, "choiceCount"],
      [{ choices: [{ text: "A", proposedCorrect: true }, { text: "B", proposedCorrect: true }] }, "answerCount"],
      [{ questionType: "kprim", choices: [{ text: "A" }, { text: "B" }, { text: "C" }] }, "choiceCount"],
      [{ questionType: "open", choices: [{ text: "A" }, { text: "B" }] }, "choiceCount"],
      [{ questionType: "essay", choices: [] }, "unknownType"],
    ];
    for (const [overrides, error] of bad) {
      expect(await submitQuestion(db, storage, alice, input(overrides)), error).toMatchObject({ ok: false, error });
    }
    expect(await db.select().from(examQuestions)).toEqual([]);
  });

  it("accepts all the supported kinds", async () => {
    const four = ["Énoncé 1", "Énoncé 2", "Énoncé 3", "Énoncé 4"].map((text, i) => ({ text, proposedCorrect: i % 2 === 0 }));
    await submit(alice, { questionType: "mc", questionText: "Plusieurs réponses ?", choices: [{ text: "A", proposedCorrect: true }, { text: "B", proposedCorrect: true }] });
    await submit(alice, { questionType: "kprim", questionText: "Quatre énoncés ?", choices: four });
    const openId = await submit(alice, { questionType: "open", questionText: "Décrivez la pulpe.", choices: [], proposedAnswerText: "Tissu conjonctif" });
    expect(await row(openId)).toMatchObject({ proposedAnswerText: "Tissu conjonctif" });
    expect(await choicesOf(openId)).toEqual([]);
  });

  it("rejects exam years that haven't happened, and placements that don't fit", async () => {
    expect(await submitQuestion(db, storage, alice, input({ examAcademicYear: `${start + 1}-${start + 2}` }))).toMatchObject({ error: "futureExamYear" });
    expect(await submitQuestion(db, storage, alice, input({ offeringId: offeringLast }))).toMatchObject({ error: "offeringYearMismatch" });
    expect(await submitQuestion(db, storage, alice, input({ courseId: otherCourseId, offeringId: offeringThis }))).toMatchObject({ error: "invalidOffering" });
    expect(await submitQuestion(db, storage, alice, input({ professorId: crypto.randomUUID() }))).toMatchObject({ error: "invalidProfessor" });
    expect(await submitQuestion(db, storage, alice, input({ courseId: crypto.randomUUID() }))).toMatchObject({ error: "courseNotFound" });
  });

  it("limits how many questions one student can have waiting", async () => {
    await updatePassSettings(db, admin, { limits: { maxPendingPerUser: 1 } });
    await submit(alice, { questionText: "Première ?" });
    expect(await submitQuestion(db, storage, alice, input({ questionText: "Deuxième ?" }))).toMatchObject({ error: "tooManyPending" });
    await submit(mod, { questionText: "Un modérateur n'est pas limité ?" });
    await submit(mod, { questionText: "Ni deux fois ?" });
  });
});

describe("image-based questions", () => {
  it("lets any kind of question carry images, kept in private storage", async () => {
    const id = await submit(alice, {}, [image("a.png"), image("b.jpg", new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 9, 9]), null)]);
    const rows = await db.select().from(examQuestionImages).where(eq(examQuestionImages.questionId, id)).orderBy(examQuestionImages.position);
    expect(rows.map((r) => [r.position, r.mimeType, r.altText])).toEqual([
      [1, "image/png", "Radiographie panoramique"],
      [2, "image/jpeg", null],
    ]);
    expect(rows.every((r) => /^questions\/[0-9a-f-]+$/.test(r.storageKey))).toBe(true);
    expect(storage.size()).toBe(2);
    const open = await submit(alice, { questionType: "open", questionText: "Que voyez-vous ?", choices: [] }, [image("c.png", png(7))]);
    expect(await db.select().from(examQuestionImages).where(eq(examQuestionImages.questionId, open))).toHaveLength(1);
  });

  it("accepts only real PNG or JPEG pictures", async () => {
    const html = { name: "radio.png", bytes: new TextEncoder().encode("<html><script>alert(1)</script></html>") };
    const pdf = { name: "doc.pdf", bytes: new TextEncoder().encode("%PDF-1.4\n%%EOF") };
    const svg = { name: "x.svg", bytes: new TextEncoder().encode("<svg onload='x'/>") };
    for (const bad of [html, pdf, svg, { name: "vide.png", bytes: new Uint8Array() }]) {
      expect(await submitQuestion(db, storage, alice, input(), [bad])).toMatchObject({ ok: false });
    }
    expect(storage.size()).toBe(0);
    expect(await db.select().from(examQuestions)).toEqual([]);
  });

  it("enforces the image limits from the settings", async () => {
    await updatePassSettings(db, admin, { images: { maxPerQuestion: 1, maxBytes: 100 * 1024 } });
    expect(await submitQuestion(db, storage, alice, input(), [image("a.png"), image("b.png", png(5))])).toMatchObject({ error: "tooManyImages" });
    const big = new Uint8Array(150 * 1024);
    big.set(png());
    expect(await submitQuestion(db, storage, alice, input(), [image("big.png", big)])).toMatchObject({ error: "fileTooLarge" });
    expect(storage.size()).toBe(0);
  });

  it("shows an image only to people who may see its question; removed images only to moderators", async () => {
    const id = await submit(alice, {}, [image()]);
    const [img] = await db.select().from(examQuestionImages).where(eq(examQuestionImages.questionId, id));
    expect(await getQuestionImageDownload(db, alice, img!.id)).toMatchObject({ mimeType: "image/png" });
    expect(await getQuestionImageDownload(db, mod, img!.id)).not.toBeNull();
    expect(await getQuestionImageDownload(db, bob, img!.id)).toBeNull(); // still pending
    expect(await getQuestionImageDownload(db, carol, img!.id)).toBeNull();
    expect(await getQuestionImageDownload(db, bob, "not-a-uuid")).toBeNull();

    await moderateQuestion(db, mod, id, "publish", null);
    expect(await getQuestionImageDownload(db, bob, img!.id)).not.toBeNull();

    // Removing an image hides it from students but keeps the file and the row for the history.
    await editQuestion(db, storage, mod, id, {}, "Image retirée", { removeIds: [img!.id] });
    expect(await getQuestionImageDownload(db, bob, img!.id)).toBeNull();
    expect(await getQuestionImageDownload(db, mod, img!.id)).not.toBeNull();
    expect(storage.size()).toBe(1);
    expect((await getQuestion(db, bob, id))!.images).toEqual([]);
  });
});

describe("what people can see", () => {
  it("shows a pending question only to its contributor and moderators", async () => {
    const id = await submit(alice);
    expect(await getQuestion(db, alice, id)).not.toBeNull();
    expect(await getQuestion(db, mod, id)).not.toBeNull();
    expect(await getQuestion(db, bob, id)).toBeNull();
    expect(await getQuestion(db, carol, id)).toBeNull();
  });

  it("shows published questions to approved members but not to unapproved accounts", async () => {
    const id = await published();
    expect(await getQuestion(db, bob, id)).not.toBeNull();
    expect(await getQuestion(db, carol, id)).toBeNull();
    expect((await listQuestions(db, carol)).items).toEqual([]);
  });

  it("keeps contributors anonymous to other students", async () => {
    const id = await submit(alice);
    await moderateQuestion(db, mod, id, "publish", null);
    expect((await getQuestion(db, bob, id))!.contributorName).toBeNull();
    expect((await getQuestion(db, alice, id))!.contributorName).toBeNull();
    expect((await getQuestion(db, mod, id))!.contributorName).toBe("alice");
  });

  it("hides taken-down questions from everyone but moderators, and shows rejected ones to their author with the reason", async () => {
    const hidden = await submit(alice, { questionText: "Cachée ?" });
    await moderateQuestion(db, mod, hidden, "hide", null);
    expect(await getQuestion(db, alice, hidden)).toBeNull();
    expect(await getQuestion(db, mod, hidden)).not.toBeNull();

    const rejected = await submit(alice, { questionText: "Rejetée ?" });
    await moderateQuestion(db, mod, rejected, "reject", "Hors sujet pour ce cours");
    expect((await getQuestion(db, alice, rejected))!.reviewNote).toBe("Hors sujet pour ce cours");
    expect(await getQuestion(db, bob, rejected)).toBeNull();
  });
});

describe("browsing and filtering", () => {
  it("derives current-year and previous-year from the exam year", async () => {
    await published({ questionText: "Cette année ?", examAcademicYear: thisYear });
    await published({ questionText: "L'an passé ?", examAcademicYear: lastYear });
    await published({ questionText: "Il y a deux ans ?", examAcademicYear: olderYear });

    const current = await listQuestions(db, bob, { category: "current" });
    expect(current.items.map((i) => i.examAcademicYear)).toEqual([thisYear]);
    const previous = await listQuestions(db, bob, { category: "previous" });
    expect(previous.items.map((i) => i.examAcademicYear)).toEqual([lastYear, olderYear]);
    expect(previous.items.every((i) => i.category === "previous")).toBe(true);
    expect((await listQuestions(db, bob)).total).toBe(3);

    // The same stored questions look different a year later, with no data change.
    const nextYear = new Date(Date.UTC(start + 1, 9, 15));
    const later = await listQuestions(db, bob, { category: "current", now: nextYear });
    expect(later.items).toEqual([]);
    expect((await listQuestions(db, bob, { category: "previous", now: nextYear })).total).toBe(3);
  });

  it("filters by professor (explicit or through the offering), type, answer status, topic and text", async () => {
    await published({ questionText: "Avec professeur ?", examAcademicYear: lastYear, offeringId: offeringLast });
    await published({ questionText: "Professeur direct ?", professorId, topic: "Occlusion" });
    await published({ questionText: "Sans professeur ?", questionType: "open", choices: [] });

    const byProfessor = await listQuestions(db, bob, { professorId });
    expect(byProfessor.items.map((i) => i.questionText).sort()).toEqual(["Avec professeur ?", "Professeur direct ?"]);
    expect((await listQuestions(db, bob, { questionType: "open" })).total).toBe(1);
    expect((await listQuestions(db, bob, { topic: "occlusion" })).total).toBe(1);
    expect((await listQuestions(db, bob, { q: "sans" })).total).toBe(1);
    expect((await listQuestions(db, bob, { q: "%" })).total).toBe(0); // wildcards are plain characters
    expect((await listQuestions(db, bob, { answerStatus: "verified" })).total).toBe(0);
  });

  it("lets students see their own waiting questions but not use the status filter to see others'", async () => {
    await submit(alice, { questionText: "À moi ?" });
    await submit(bob, { questionText: "À Bob ?" });
    expect((await listQuestions(db, alice)).items.map((i) => i.questionText)).toEqual(["À moi ?"]);
    expect((await listQuestions(db, alice, { status: "pending" })).items.map((i) => i.questionText)).toEqual(["À moi ?"]);
    expect((await listQuestions(db, mod, { status: "pending" })).total).toBe(2);
  });

  it("pages through results", async () => {
    for (let i = 1; i <= 5; i++) await published({ questionText: `Question numéro ${i} ?` });
    const page = await listQuestions(db, bob, { limit: 2, offset: 2 });
    expect(page.items).toHaveLength(2);
    expect(page.total).toBe(5);
  });
});

describe("review", () => {
  it("lets only moderators and admins review, and a rejection needs a reason", async () => {
    const id = await submit(alice);
    expect(await moderateQuestion(db, alice, id, "publish", null)).toMatchObject({ error: "forbidden" });
    expect(await moderateQuestion(db, mod, id, "reject", "  ")).toMatchObject({ error: "noteRequired" });
    expect(await moderateQuestion(db, mod, id, "publish", null)).toEqual({ ok: true, value: { status: "published" } });
    expect(await moderateQuestion(db, admin, id, "hide", null)).toEqual({ ok: true, value: { status: "hidden" } });
    const actions = (await db.select().from(auditLog)).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(["question.publish", "question.hide"]));
  });
});

describe("verifying answers", () => {
  const verifySc = (id: string, who: Viewer = mod, note: string | null = "Vérifié dans le manuel de référence") =>
    verifyAnswer(db, who, id, { choices: [true, false, false] }, note);

  it("lets moderators and admins verify, keeping the proposed answer separate", async () => {
    const id = await published();
    expect((await getQuestion(db, bob, id))!.choices.map((c) => c.verifiedCorrect)).toEqual([null, null, null]);
    expect(await verifySc(id, mod)).toEqual({ ok: true, value: { answerStatus: "verified" } });

    const q = await row(id);
    expect(q).toMatchObject({ answerStatus: "verified", verifiedBy: "mod", verificationNote: "Vérifié dans le manuel de référence" });
    expect(q.verifiedAt).toBeInstanceOf(Date);
    const seen = (await getQuestion(db, bob, id))!;
    expect(seen.choices.map((c) => [c.proposedCorrect, c.verifiedCorrect])).toEqual([[true, true], [false, false], [false, false]]);
    expect(seen.verification?.note).toBe("Vérifié dans le manuel de référence");

    const other = await published({ questionText: "Autre question ?" });
    expect(await verifySc(other, admin)).toMatchObject({ ok: true });
  });

  it("can record a verified answer that disagrees with the student's proposal, without erasing the proposal", async () => {
    const id = await published();
    await verifyAnswer(db, mod, id, { choices: [false, true, false] }, "Le manuel indique la langue pour cet énoncé");
    const view = (await getQuestion(db, bob, id))!;
    expect(view.choices.map((c) => [c.proposedCorrect, c.verifiedCorrect])).toEqual([[true, false], [false, true], [false, false]]);
  });

  it("refuses students, unapproved accounts and anyone without the right role", async () => {
    const id = await published();
    for (const who of [alice, bob, carol]) expect(await verifySc(id, who), who.id).toMatchObject({ error: "forbidden" });
    expect((await row(id)).answerStatus).toBe("proposed");
  });

  it("requires a note explaining the basis", async () => {
    const id = await published();
    expect(await verifySc(id, mod, null)).toMatchObject({ error: "noteRequired" });
    expect(await verifySc(id, mod, "   ")).toMatchObject({ error: "noteRequired" });
    expect(await verifySc(id, mod, "ok")).toMatchObject({ error: "noteTooShort" });
    expect((await row(id)).answerStatus).toBe("proposed");
  });

  it("requires a complete, valid answer for the type", async () => {
    const sc = await published();
    expect(await verifyAnswer(db, mod, sc, { choices: [true, true, false] }, "Une note suffisamment longue")).toMatchObject({ error: "answerCount" });
    expect(await verifyAnswer(db, mod, sc, { choices: [true, false] }, "Une note suffisamment longue")).toMatchObject({ error: "answerIncomplete" });
    const open = await published({ questionType: "open", questionText: "Décrivez ...", choices: [] });
    expect(await verifyAnswer(db, mod, open, { text: " " }, "Une note suffisamment longue")).toMatchObject({ error: "answerIncomplete" });
    expect(await verifyAnswer(db, mod, open, { text: "La pulpe est un tissu conjonctif." }, "Source: manuel de référence")).toMatchObject({ ok: true });
    expect(await row(open)).toMatchObject({ answerStatus: "verified", verifiedAnswerText: "La pulpe est un tissu conjonctif.", proposedAnswerText: null });
  });

  it("won't verify a rejected or hidden question", async () => {
    const id = await submit(alice);
    await moderateQuestion(db, mod, id, "reject", "Pas pertinent");
    expect(await verifySc(id)).toMatchObject({ error: "notVerifiable" });
  });

  it("can take a verification back, keeping the history", async () => {
    const id = await published();
    await verifySc(id);
    expect(await unverifyAnswer(db, mod, id, null)).toMatchObject({ error: "noteRequired" });
    expect(await unverifyAnswer(db, bob, id, "Une note suffisamment longue")).toMatchObject({ error: "forbidden" });
    expect(await unverifyAnswer(db, mod, id, "Erreur découverte dans la source")).toMatchObject({ ok: true });
    expect(await row(id)).toMatchObject({ answerStatus: "proposed", verifiedBy: null, verifiedAt: null });
    expect((await choicesOf(id)).map((c) => c.verifiedCorrect)).toEqual([null, null, null]);
    const history = await listQuestionRevisions(db, mod, id);
    expect(history.map((h) => h.changeNote)).toEqual(["Erreur découverte dans la source", "Vérifié dans le manuel de référence", null]);
    expect(await unverifyAnswer(db, mod, id, "Encore une note valable")).toMatchObject({ error: "notVerified" });
  });
});

describe("changing the policy later never loses or alters existing data", () => {
  it("keeps answers verified under the old policy exactly as they were", async () => {
    const id = await published();
    await verifyAnswer(db, mod, id, { choices: [true, false, false] }, "Vérifié par un modérateur");
    const before = await row(id);
    const choicesBefore = await choicesOf(id);

    await updatePassSettings(db, admin, { verification: { allowedRoles: ["admin"], requireNote: false } });

    expect(await row(id)).toEqual(before);
    expect(await choicesOf(id)).toEqual(choicesBefore);
    const view = (await getQuestion(db, bob, id))!;
    expect(view.answerStatus).toBe("verified");
    expect(view.verification?.note).toBe("Vérifié par un modérateur");
    expect(view.canVerify).toBe(false);
    expect((await getQuestion(db, admin, id))!.canVerify).toBe(true);
  });

  it("applies a new verification policy to the next verifications", async () => {
    const id = await published();
    await updatePassSettings(db, admin, { verification: { allowedRoles: ["admin"] } });
    expect(await verifyAnswer(db, mod, id, { choices: [true, false, false] }, "Une note suffisamment longue")).toMatchObject({ error: "forbidden" });
    expect(await verifyAnswer(db, admin, id, { choices: [true, false, false] }, "Une note suffisamment longue")).toMatchObject({ ok: true });

    await updatePassSettings(db, admin, { verification: { requireNote: false } });
    const next = await published({ questionText: "Sans note ?" });
    expect(await verifyAnswer(db, admin, next, { choices: [true, false, false] }, null)).toMatchObject({ ok: true });
  });

  it("stops accepting a switched-off type for new questions, but keeps existing ones fully usable", async () => {
    const open = await published({ questionType: "open", questionText: "Décrivez l'émail.", choices: [], proposedAnswerText: "Tissu minéralisé" });
    await updatePassSettings(db, admin, { enabledQuestionTypes: ["sc", "mc", "kprim"] });

    expect(await submitQuestion(db, storage, alice, input({ questionType: "open", questionText: "Autre ?", choices: [] }))).toMatchObject({ error: "typeNotEnabled" });
    const view = (await getQuestion(db, bob, open))!;
    expect(view).toMatchObject({ questionText: "Décrivez l'émail.", proposedAnswerText: "Tissu minéralisé" });
    expect(view.type).toMatchObject({ key: "open", known: true });
    expect((await listQuestions(db, bob, { questionType: "open" })).total).toBe(1);
    // Corrections to an existing question of that type still work.
    expect(await editQuestion(db, storage, mod, open, { topic: "Histologie" }, null)).toMatchObject({ ok: true });
    expect(await verifyAnswer(db, mod, open, { text: "Tissu minéralisé de l'émail" }, "Source: manuel de référence")).toMatchObject({ ok: true });
    // Switching an existing question TO the disabled type is a new use of it, and is refused.
    const sc = await published({ questionText: "Un choix simple ?" });
    expect(await editQuestion(db, storage, mod, sc, { questionType: "open", choices: [] }, null)).toMatchObject({ error: "typeNotEnabled" });
  });

  it("keeps a question whose type was retired from the code readable", async () => {
    const id = await published();
    await db.update(examQuestions).set({ questionType: "legacy_type" }).where(eq(examQuestions.id, id));
    const view = (await getQuestion(db, bob, id))!;
    expect(view.type).toMatchObject({ key: "legacy_type", known: false });
    expect(view.choices).toHaveLength(3);
    expect((await listQuestions(db, bob)).total).toBe(1);
    // It can't be silently re-verified under rules that no longer exist.
    expect(await verifyAnswer(db, mod, id, { choices: [true, false, false] }, "Une note suffisamment longue")).toMatchObject({ error: "unknownType" });
    expect((await row(id)).questionType).toBe("legacy_type");
  });
});

describe("editing", () => {
  const verified = async () => {
    const id = await submit(alice);
    await moderateQuestion(db, mod, id, "publish", null);
    await verifyAnswer(db, mod, id, { choices: [true, false, false] }, "Vérifié dans le manuel de référence");
    return id;
  };

  it("resets a verified answer to 'proposed' when the wording changes, and keeps the old state in history", async () => {
    const id = await verified();
    const result = await editQuestion(db, storage, alice, id, { questionText: "Quelle structure forme le toit de la bouche ?" }, "Reformulation");
    expect(result).toEqual({ ok: true, value: { answerReset: true, status: "pending" } });
    expect(await row(id)).toMatchObject({ answerStatus: "proposed", verifiedBy: null, verifiedAt: null, verificationNote: null, status: "pending" });
    expect((await choicesOf(id)).map((c) => c.verifiedCorrect)).toEqual([null, null, null]);

    const history = await listQuestionRevisions(db, mod, id);
    expect(history).toHaveLength(3); // submitted, verified, then the edit
    const verifiedState = history.find((h) => (h.snapshot as { answerStatus: string }).answerStatus === "verified");
    expect(verifiedState).toBeDefined();
    expect((verifiedState!.snapshot.choices as { verifiedCorrect: boolean | null }[]).map((c) => c.verifiedCorrect)).toEqual([true, false, false]);
  });

  it("resets the verification when choices or images change, but not for a new topic", async () => {
    const withTopic = await verified();
    expect(await editQuestion(db, storage, mod, withTopic, { topic: "Anatomie" }, null)).toMatchObject({ value: { answerReset: false } });
    expect((await row(withTopic)).answerStatus).toBe("verified");

    const choiceEdit = await editQuestion(db, storage, mod, withTopic, { choices: [{ text: "Le palais dur", proposedCorrect: true }, { text: "La langue", proposedCorrect: null }, { text: "Le plancher buccal", proposedCorrect: null }] }, null);
    expect(choiceEdit).toMatchObject({ value: { answerReset: true } });

    const second = await published({ questionText: "Autre énoncé vérifié ?" });
    await verifyAnswer(db, mod, second, { choices: [true, false, false] }, "Vérifié dans le manuel de référence");
    expect(await editQuestion(db, storage, mod, second, {}, null, { add: [image()] })).toMatchObject({ value: { answerReset: true } });
  });

  it("keeps a verified answer when only the student's proposal changes on a moderator edit", async () => {
    const id = await published();
    await verifyAnswer(db, mod, id, { choices: [true, false, false] }, "Vérifié dans le manuel de référence");
    const same = [{ text: "Le palais", proposedCorrect: false }, { text: "La langue", proposedCorrect: true }, { text: "Le plancher buccal", proposedCorrect: false }];
    expect(await editQuestion(db, storage, mod, id, { choices: same }, null)).toMatchObject({ value: { answerReset: false, status: "published" } });
    expect((await choicesOf(id)).map((c) => [c.proposedCorrect, c.verifiedCorrect])).toEqual([[false, true], [true, false], [false, false]]);
  });

  it("sends a student's edit of a published question back to review; moderators keep the status", async () => {
    const id = await submit(alice);
    await moderateQuestion(db, mod, id, "publish", null);
    expect(await editQuestion(db, storage, alice, id, { topic: "Anatomie" }, null)).toMatchObject({ value: { status: "pending" } });
    await moderateQuestion(db, mod, id, "publish", null);
    expect(await editQuestion(db, storage, mod, id, { topic: "Occlusion" }, null)).toMatchObject({ value: { status: "published" } });
  });

  it("lets a student fix and resubmit a rejected question, but only their own", async () => {
    const id = await submit(alice);
    await moderateQuestion(db, mod, id, "reject", "Énoncé incomplet");
    expect(await editQuestion(db, storage, bob, id, { topic: "x" }, null)).toMatchObject({ error: "notFound" });
    const hidden = await submit(alice, { questionText: "Autre ?" });
    await moderateQuestion(db, mod, hidden, "hide", null);
    expect(await editQuestion(db, storage, alice, hidden, { topic: "x" }, null)).toMatchObject({ error: "notFound" });
    expect(await editQuestion(db, storage, alice, id, { questionText: "Énoncé complet : quelle structure ?" }, "Corrigé")).toMatchObject({ value: { status: "pending" } });
    expect((await row(id)).reviewNote).toBeNull();
  });

  it("applies the type rules again after an edit, and blocks an edit that duplicates another question", async () => {
    const id = await published();
    expect(await editQuestion(db, storage, mod, id, { choices: [{ text: "Seul", proposedCorrect: null }] }, null)).toMatchObject({ error: "choiceCount" });
    const other = await published({ questionText: "Une autre question ?" });
    expect(await editQuestion(db, storage, mod, other, { questionText: input().questionText, choices: input().choices }, null)).toMatchObject({ error: "duplicateQuestion", questionId: id });
  });

  it("shows the change history only to moderators and the contributor", async () => {
    const id = await submit(alice);
    await editQuestion(db, storage, alice, id, { topic: "Anatomie" }, "Ajout du sujet");
    expect((await listQuestionRevisions(db, alice, id)).map((h) => h.changeNote)).toEqual(["Ajout du sujet", null]);
    expect(await listQuestionRevisions(db, mod, id)).toHaveLength(2);
    expect(await listQuestionRevisions(db, bob, id)).toEqual([]);
  });
});

describe("duplicates", () => {
  it("blocks the same wording in the same exam year (even with shuffled choices), and points to it only if visible", async () => {
    const first = await submit(alice);
    const shuffled = [...input().choices].reverse();
    expect(await submitQuestion(db, storage, bob, input({ choices: shuffled }))).toEqual({ ok: false, error: "duplicateQuestion", questionId: undefined });
    expect(await submitQuestion(db, storage, alice, input({ choices: shuffled }))).toEqual({ ok: false, error: "duplicateQuestion", questionId: first });
    await moderateQuestion(db, mod, first, "publish", null);
    expect(await submitQuestion(db, storage, bob, input())).toEqual({ ok: false, error: "duplicateQuestion", questionId: first });
  });

  it("allows a repeat in another exam year and reports it", async () => {
    const first = await published({ examAcademicYear: lastYear });
    const result = await submitQuestion(db, storage, bob, input({ examAcademicYear: thisYear }));
    expect(result).toMatchObject({ ok: true, value: { repeatsOf: [first] } });
    const second = (result as { value: { id: string } }).value.id;
    expect((await findRepeats(db, mod, second)).map((r) => r.id)).toEqual([first]);
    expect(await findRepeats(db, bob, second)).toEqual([]);
  });

  it("lets a moderator group repeats under one canonical question, which hides the repeat from lists", async () => {
    const original = await published({ examAcademicYear: lastYear });
    const repeat = await published({ examAcademicYear: thisYear });
    expect(await markDuplicate(db, alice, repeat, original)).toMatchObject({ error: "forbidden" });
    expect(await markDuplicate(db, mod, repeat, repeat)).toMatchObject({ error: "sameQuestion" });
    expect(await markDuplicate(db, mod, repeat, original)).toEqual({ ok: true, value: null });
    expect((await listQuestions(db, bob)).items.map((i) => i.id)).toEqual([original]);
    expect((await listQuestions(db, bob, { includeDuplicates: true })).total).toBe(2);
    expect(await markDuplicate(db, mod, original, repeat)).toMatchObject({ error: "canonicalIsDuplicate" });
    // A question that others point to can't itself be turned into a repeat.
    const third = await published({ questionText: "Une troisième question ?" });
    expect(await markDuplicate(db, mod, original, third)).toMatchObject({ error: "hasDuplicates" });
    // Clearing the link brings the question back into the lists.
    expect(await markDuplicate(db, mod, repeat, null)).toEqual({ ok: true, value: null });
    expect((await listQuestions(db, bob)).total).toBe(3);
  });

  it("won't group questions from different courses", async () => {
    const a = await published();
    const b = await submit(mod, { courseId: otherCourseId, questionText: "Autre cours ?" });
    expect(await markDuplicate(db, mod, a, b)).toMatchObject({ error: "notFound" });
  });
});

describe("reports and the review queue", () => {
  it("lets approved members report a published question once, and moderators resolve it", async () => {
    const id = await published();
    const report = { questionId: id, reason: "wrong_answer" as const, details: "La source dit autre chose" };
    expect(await reportQuestion(db, bob, report)).toEqual({ ok: true, value: null });
    expect(await reportQuestion(db, bob, report)).toMatchObject({ error: "alreadyReported" });
    expect(await reportQuestion(db, carol, report)).toMatchObject({ error: "notFound" });

    const queue = await listQuestionQueue(db, mod);
    expect(queue.reports).toHaveLength(1);
    expect(queue.reports[0]!.excerpt).toContain("Quelle structure");
    expect((await getQuestion(db, mod, id))!.openReports).toHaveLength(1);
    expect((await getQuestion(db, bob, id))!.openReports).toEqual([]);

    const reportId = queue.reports[0]!.id;
    expect(await resolveQuestionReport(db, bob, reportId, "resolved", null)).toMatchObject({ error: "forbidden" });
    expect(await resolveQuestionReport(db, mod, reportId, "resolved", "Corrigé")).toEqual({ ok: true, value: null });
    expect(await resolveQuestionReport(db, mod, reportId, "dismissed", null)).toMatchObject({ error: "notFound" });
    expect(await reportQuestion(db, bob, report)).toEqual({ ok: true, value: null });
  });

  it("doesn't allow reporting a question that isn't published", async () => {
    const id = await submit(alice);
    expect(await reportQuestion(db, alice, { questionId: id, reason: "other", details: null })).toMatchObject({ error: "forbidden" });
  });

  it("lists waiting questions for moderators only", async () => {
    await submit(alice);
    expect((await listQuestionQueue(db, mod)).pending).toHaveLength(1);
    expect(await listQuestionQueue(db, alice)).toEqual({ pending: [], reports: [] });
  });
});
