// Course-grounded tutor, database side: retrieval permissions, citations, official vs student labels, current vs
// previous offerings, the provider gate (no provider => no answer, no network), usage limits and admin settings.
// Fake data only (TEST courses, example.com accounts). A fake provider stands in where a real one would be: it runs
// in-process and makes no network call.
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDatabase, type Database } from "@/db/client";
import { auditLog, courseOfferings, courses, tutorUsage, user } from "@/db/schema";
import { createNote, noteInputSchema } from "@/server/library/notes";
import { createTopic, topicInputSchema } from "@/server/library/topics";
import { setItemTopics } from "@/server/library/links";
import { currentAcademicYear } from "@/server/passes/academic-year";
import { moderateQuestion, questionInputSchema, submitQuestion, verifyAnswer } from "@/server/passes/service";
import { createResource, moderateResource, resourceInputSchema, setOfficial, type Viewer } from "@/server/resources/service";
import { createMemoryStorage } from "@/server/storage";
import { DEFAULT_MAX_CONTEXT_CHARS, QUESTION_MAX_CHARS } from "@/server/tutor/constants";
import { NullProvider, type TutorAnswer, type TutorProvider, type TutorRequest } from "@/server/tutor/provider";
import { retrieveSources } from "@/server/tutor/retrieval";
import { askTutor, getTutorStatus, isTutorReady, questionsToday, reserveQuestion, searchSources, usageDay } from "@/server/tutor/service";
import { getTutorSettings, updateTutorSettings } from "@/server/tutor/settings";

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

const NOW = new Date("2026-11-01T15:00:00Z");

async function doc(who: Viewer, overrides: Record<string, unknown> = {}) {
  const input = resourceInputSchema.parse({ courseId, kind: "notes", title: "Document fictif", rightsConfirmed: "on", ...overrides });
  const r = await createResource(db, storage, who, input, pdf(String(overrides.title ?? "x") + Math.random()));
  if (!r.ok) throw new Error(r.error);
  return r.value.id;
}
async function publishedDoc(owner: Viewer, overrides: Record<string, unknown> = {}) {
  const id = await doc(owner, overrides);
  if (overrides.visibility !== "private") await moderateResource(db, mod, id, "publish");
  return id;
}
async function note(who: Viewer, overrides: Record<string, unknown> = {}) {
  const r = await createNote(db, who, noteInputSchema.parse({ courseId, title: "Ma note", body: "Contenu", ...overrides }));
  if (!r.ok) throw new Error(r.error);
  return r.value.id;
}
async function question(text: string, opts: { year?: string; verify?: boolean; status?: "publish" | "hide" | "reject" | null; cid?: string } = {}) {
  const input = questionInputSchema.parse({
    courseId: opts.cid ?? courseId,
    examAcademicYear: opts.year ?? currentAcademicYear(NOW),
    examTerm: "fall",
    questionType: "sc",
    questionText: text,
    rightsConfirmed: true,
    choices: [
      { text: "Réponse A", proposedCorrect: true },
      { text: "Réponse B", proposedCorrect: false },
    ],
  });
  const r = await submitQuestion(db, storage, alice, input, []);
  if (!r.ok) throw new Error(r.error);
  const id = r.value.id;
  const status = opts.status === undefined ? "publish" : opts.status;
  if (status === "publish") await moderateQuestion(db, mod, id, "publish", null);
  if (status === "hide") await moderateQuestion(db, mod, id, "hide", null);
  if (status === "reject") await moderateQuestion(db, mod, id, "reject", "Refusée pour le test");
  if (opts.verify) {
    const v = await verifyAnswer(db, mod, id, { choices: [true, false] }, "Vérifié avec le manuel de référence du cours");
    if (!v.ok) throw new Error(v.error);
  }
  return id;
}

const search = (who: Viewer, query: string, extra: Partial<Parameters<typeof retrieveSources>[2]> = {}) =>
  retrieveSources(db, who, { courseId, query, now: NOW, ...extra });
const ids = (r: Awaited<ReturnType<typeof search>>) => r.passages.map((p) => p.source.id);

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

afterEach(() => {
  vi.restoreAllMocks();
});

describe("retrieval: only what the viewer may see", () => {
  it("never returns another user's private note, and not even moderators or admins see it", async () => {
    await note(alice, { title: "Secret", body: "Le xylocaïne spécial d'Alice est noté ici." });
    expect(ids(await search(alice, "xylocaine"))).toHaveLength(1);
    for (const other of [bob, mod, admin, waiting]) expect(ids(await search(other, "xylocaine")), other.id).toEqual([]);
  });

  it("never returns another user's private document, but returns the owner's own", async () => {
    const aliceDoc = await publishedDoc(alice, { title: "Plan privé zirconium", visibility: "private" });
    const sharedByMod = await publishedDoc(mod, { title: "Plan partagé zirconium" });
    expect(ids(await search(alice, "zirconium")).sort()).toEqual([aliceDoc, sharedByMod].sort());
    expect(ids(await search(bob, "zirconium"))).toEqual([sharedByMod]);
    expect(ids(await search(admin, "zirconium"))).toEqual([sharedByMod]);
  });

  it("leaves out documents that are not published, even the viewer's own pending one", async () => {
    await doc(alice, { title: "Brouillon en attente platine" }); // student upload: pending
    const hidden = await publishedDoc(alice, { title: "Document masqué platine" });
    await moderateResource(db, mod, hidden, "hide");
    expect(ids(await search(alice, "platine"))).toEqual([]);
    expect(ids(await search(mod, "platine"))).toEqual([]);
  });

  it("returns only PUBLISHED questions with a VERIFIED answer", async () => {
    const good = await question("Quel est le rôle du fluorure stannique ?", { verify: true });
    await question("Question jamais publiée fluorure", { status: null, verify: true });
    await question("Question refusée fluorure", { status: "reject" });
    const hidden = await question("Question masquée fluorure", { verify: true });
    await moderateQuestion(db, mod, hidden, "hide", null);
    await question("Question publiée mais réponse seulement proposée fluorure"); // proposed answer
    const found = await search(alice, "fluorure");
    expect(ids(found)).toEqual([good]);
    expect(found.passages[0]!.source.answerStatus).toBe("verified");
    expect(found.passages[0]!.text).toContain("Réponse vérifiée");
    expect(found.stats.questions).toBe(1);
    // moderators get no extra access to non-published questions either
    expect(ids(await search(mod, "fluorure"))).toEqual([good]);
  });

  it("makes unverified answers retrievable only on request, always labelled unverified", async () => {
    const proposed = await question("Question avec réponse proposée seulement bismuth");
    expect(ids(await search(alice, "bismuth"))).toEqual([]);
    const withUnverified = await search(alice, "bismuth", { includeUnverified: true });
    expect(ids(withUnverified)).toEqual([proposed]);
    expect(withUnverified.passages[0]!.source.answerStatus).toBe("unverified");
    expect(withUnverified.passages[0]!.text).toContain("NON vérifiée");
    const en = await search(alice, "bismuth", { includeUnverified: true, locale: "en" });
    expect(en.passages[0]!.text).toContain("NOT verified");
  });

  it("gives nothing to accounts that are not approved, and is scoped to the selected course", async () => {
    await note(alice, { title: "Note", body: "Contenu sur le tungstène." });
    expect((await search(waiting, "tungstene")).passages).toEqual([]);
    expect(ids(await search(alice, "tungstene"))).toHaveLength(1);
    expect((await retrieveSources(db, alice, { courseId: otherCourseId, query: "tungstene", now: NOW })).passages).toEqual([]);
    expect((await retrieveSources(db, alice, { courseId: "00000000-0000-4000-8000-000000000000", query: "tungstene", now: NOW })).passages).toEqual([]);
    await question("Question de l'autre cours tungstène", { cid: otherCourseId, verify: true });
    expect((await search(alice, "tungstene")).stats.questions).toBe(0);
  });

  it("is accent- and case-insensitive on real data", async () => {
    await note(alice, { title: "Anesthésie", body: "Le nerf alvéolaire inférieur est bloqué lors de l'ANESTHÉSIE locale." });
    expect(ids(await search(alice, "anesthesie ALVEOLAIRE"))).toHaveLength(1);
    expect(ids(await search(alice, "anesthésie alvéolaire"))).toHaveLength(1);
  });

  it("returns nothing for an empty query or one with only filler words", async () => {
    await note(alice, { body: "le la de les" });
    expect((await search(alice, "   ")).passages).toEqual([]);
    expect((await search(alice, "le la de")).passages).toEqual([]);
  });
});

describe("citations and labels", () => {
  it("carries source type, title, course code, offering or year, and the in-app link", async () => {
    const noteId = await note(alice, { title: "Notes cobalt", body: "Le cobalt est utilisé dans les alliages.", offeringId: newOfferingId });
    const docId = await publishedDoc(mod, { title: "Plan cobalt", offeringId: newOfferingId, kind: "outline" });
    const qId = await question("Quel alliage contient du cobalt ?", { verify: true });
    const r = await search(alice, "cobalt");
    const by = Object.fromEntries(r.passages.map((p) => [p.source.type, p]));
    expect(by.note!.source).toMatchObject({ id: noteId, title: "Notes cobalt", courseCode: "TEST 1001", academicYear: "2025-2026", term: "fall", href: `/notes/${noteId}`, period: "current" });
    expect(by.document!.source).toMatchObject({ id: docId, title: "Plan cobalt", courseCode: "TEST 1001", academicYear: "2025-2026", term: "fall", href: `/resources/${docId}`, detail: "outline" });
    expect(by.question!.source).toMatchObject({ id: qId, courseCode: "TEST 1001", academicYear: currentAcademicYear(NOW), term: "fall", href: `/passes/${qId}`, detail: "recalled" });
    for (const p of r.passages) expect(p.id).toBe(`${p.source.type}:${p.source.id}#1`);
  });

  it("labels official, student-contributed and own material", async () => {
    const official = await publishedDoc(mod, { title: "Plan officiel iridium" });
    await setOfficial(db, mod, official, true);
    const student = await publishedDoc(alice, { title: "Résumé étudiant iridium" });
    const ownDoc = await publishedDoc(alice, { title: "Mon document iridium", visibility: "private" });
    const ownNote = await note(alice, { title: "Ma note iridium", body: "iridium" });
    const q = await question("Question iridium", { verify: true });
    const r = await search(alice, "iridium");
    const origin = (id: string) => r.passages.find((p) => p.source.id === id)!.source.origin;
    expect(origin(official)).toBe("official");
    expect(origin(student)).toBe("student");
    expect(origin(ownDoc)).toBe("own");
    expect(origin(ownNote)).toBe("own");
    expect(origin(q)).toBe("student"); // exam questions are student-contributed
    // official material ranks first when everything else is equal
    expect(r.passages[0]!.source.origin).toBe("official");
    // bob sees the official and the student documents as such, and none of alice's private items
    const forBob = await search(bob, "iridium");
    expect(forBob.passages.map((p) => p.source.origin).sort()).toEqual(["official", "student", "student"]);
  });

  it("matches documents on title, topic, description and linked topics, and says no text was read", async () => {
    const topic = await createTopic(db, mod, courseId, topicInputSchema.parse({ name: "Hémostase buccale" }));
    if (!topic.ok) throw new Error(topic.error);
    const id = await publishedDoc(mod, { title: "Plan de cours", description: "Objectifs de la session sur la parodontie." });
    await setItemTopics(db, mod, "resource", id, [topic.value.id]);
    const r = await search(alice, "parodontie hemostase");
    expect(ids(r)).toEqual([id]);
    expect(r.passages[0]!.basis).toBe("metadata");
    expect(r.stats.documents).toBe(1);
    expect(r.stats.documentsWithText).toBe(0);
  });
});

describe("current offering first, previous offerings only on request", () => {
  it("separates current from historical and labels them", async () => {
    const current = await publishedDoc(mod, { title: "Plan courant", description: "thallium", offeringId: newOfferingId });
    const old = await publishedDoc(mod, { title: "Ancien plan", description: "thallium thallium thallium", offeringId: oldOfferingId });
    const general = await publishedDoc(mod, { title: "Document général", description: "thallium" });

    const byDefault = await search(alice, "thallium");
    expect(ids(byDefault).sort()).toEqual([current, general].sort());
    expect(byDefault.stats.historicalSkipped).toBe(1);
    expect(byDefault.passages.every((p) => p.source.period === "current")).toBe(true);

    const both = await search(alice, "thallium", { includeHistorical: true });
    expect(both.passages.map((p) => p.source.period)).toEqual(["current", "current", "historical"]);
    expect(both.passages.at(-1)!.source).toMatchObject({ id: old, period: "historical", academicYear: "2024-2025" });
    expect(both.stats.historicalSkipped).toBe(0);
  });

  it("applies the same split to notes and to exam questions (by exam year)", async () => {
    const oldNote = await note(alice, { title: "Ancienne note", body: "palladium", offeringId: oldOfferingId });
    const newNote = await note(alice, { title: "Note récente", body: "palladium", offeringId: newOfferingId });
    const oldQ = await question("Question ancienne palladium", { year: "2023-2024", verify: true });
    const newQ = await question("Question récente palladium", { verify: true });
    expect(ids(await search(alice, "palladium")).sort()).toEqual([newNote, newQ].sort());
    const all = await search(alice, "palladium", { includeHistorical: true });
    expect(all.passages.slice(0, 2).map((p) => p.source.period)).toEqual(["current", "current"]);
    expect(all.passages.slice(2).map((p) => p.source.id).sort()).toEqual([oldNote, oldQ].sort());
    expect(all.passages.slice(2).every((p) => p.source.period === "historical")).toBe(true);
  });
});

describe("context budget", () => {
  it("never returns more passage text than the budget", async () => {
    for (let i = 0; i < 5; i++) await note(alice, { title: `Note ${i}`, body: `osmium ${"mot de remplissage ".repeat(40)}` });
    const unlimited = await search(alice, "osmium");
    expect(unlimited.passages.length).toBeGreaterThan(1);
    const limited = await search(alice, "osmium", { maxContextChars: 900 });
    expect(limited.passages.reduce((n, p) => n + p.text.length, 0)).toBeLessThanOrEqual(900);
    expect(limited.passages.length).toBeLessThan(unlimited.passages.length);
    expect(unlimited.passages.reduce((n, p) => n + p.text.length, 0)).toBeLessThanOrEqual(DEFAULT_MAX_CONTEXT_CHARS);
  });
});

// ---------- Provider gate ----------

class FakeProvider implements TutorProvider {
  readonly id = "fake";
  calls: TutorRequest[] = [];
  constructor(
    private readonly configured = true,
    private readonly behaviour: (request: TutorRequest) => TutorAnswer | Promise<TutorAnswer> = (r) => ({ text: "Réponse de test", citedPassageIds: r.passages.slice(0, 1).map((p) => p.id) }),
  ) {}
  isConfigured() {
    return this.configured;
  }
  async answer(request: TutorRequest) {
    this.calls.push(request);
    return this.behaviour(request);
  }
}

const setTutor = (patch: Parameters<typeof updateTutorSettings>[2]) => updateTutorSettings(db, admin, patch);

describe("provider gate: OFF unless the flag AND a configured provider", () => {
  it("is off by default and refuses, without retrieving, recording or fetching anything", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await note(alice, { body: "contenu sur le rhodium" });
    expect(await getTutorSettings(db)).toMatchObject({ enabled: false });
    expect((await getTutorStatus(db, new NullProvider())).state).toBe("off");
    expect(await askTutor(db, alice, { courseId, question: "rhodium ?", now: NOW }, new NullProvider())).toEqual({ ok: false, error: "off" });
    // a configured provider does not help while the flag is off
    const provider = new FakeProvider(true);
    expect(await askTutor(db, alice, { courseId, question: "rhodium ?", now: NOW }, provider)).toEqual({ ok: false, error: "off" });
    expect(provider.calls).toHaveLength(0);
    expect(await db.select().from(tutorUsage)).toHaveLength(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses when the flag is on but no provider is configured (NullProvider or a provider that is not configured)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await setTutor({ enabled: true });
    await note(alice, { body: "contenu sur le rhodium" });
    expect((await getTutorStatus(db, new NullProvider())).state).toBe("noProvider");
    expect(await isTutorReady(db, new NullProvider())).toBe(false);
    expect(await askTutor(db, alice, { courseId, question: "rhodium ?", now: NOW }, new NullProvider())).toEqual({ ok: false, error: "noProvider" });
    const unconfigured = new FakeProvider(false);
    expect(await askTutor(db, alice, { courseId, question: "rhodium ?", now: NOW }, unconfigured)).toEqual({ ok: false, error: "noProvider" });
    expect(unconfigured.calls).toHaveLength(0);
    expect(await db.select().from(tutorUsage)).toHaveLength(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("uses the default provider (none) when no provider is passed: today the tutor always refuses", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await setTutor({ enabled: true });
    expect(await isTutorReady(db)).toBe(false);
    expect(await askTutor(db, alice, { courseId, question: "rhodium ?", now: NOW })).toMatchObject({ ok: false });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("answers only with both, hands the provider only authorized passages, and returns its citations", async () => {
    await setTutor({ enabled: true });
    await note(alice, { title: "Note rhodium", body: "Le rhodium est un métal." });
    await note(bob, { title: "Note secrète de Bob", body: "Le rhodium de Bob est confidentiel." });
    const provider = new FakeProvider(true);
    const result = await askTutor(db, alice, { courseId, question: "Que sais-je du rhodium ?", locale: "fr", now: NOW }, provider);
    expect(result).toMatchObject({ ok: true, kind: "answer", usage: { usedToday: 1, dailyLimit: 10 } });
    expect(provider.calls).toHaveLength(1);
    expect(provider.calls[0]!.passages.map((p) => p.source.title)).toEqual(["Note rhodium"]);
    expect(JSON.stringify(provider.calls[0])).not.toContain("Bob");
    expect(await isTutorReady(db, provider)).toBe(true);
  });

  it("does not call the provider, or use quota, when no source matches", async () => {
    await setTutor({ enabled: true });
    const provider = new FakeProvider(true);
    expect(await askTutor(db, alice, { courseId, question: "Quelque chose d'absent des sources", now: NOW }, provider)).toMatchObject({ ok: true, kind: "noSources" });
    expect(provider.calls).toHaveLength(0);
    expect(await questionsToday(db, alice.id, NOW)).toBe(0);
  });

  it("checks access, the question and the course", async () => {
    await setTutor({ enabled: true });
    const provider = new FakeProvider(true);
    expect(await askTutor(db, waiting, { courseId, question: "x ?", now: NOW }, provider)).toEqual({ ok: false, error: "noAccess" });
    expect(await askTutor(db, alice, { courseId, question: "   ", now: NOW }, provider)).toEqual({ ok: false, error: "questionRequired" });
    expect(await askTutor(db, alice, { courseId, question: "a".repeat(QUESTION_MAX_CHARS + 1), now: NOW }, provider)).toEqual({ ok: false, error: "questionTooLong" });
    expect(await askTutor(db, alice, { courseId: "00000000-0000-4000-8000-000000000000", question: "x ?", now: NOW }, provider)).toEqual({ ok: false, error: "courseNotFound" });
    expect(provider.calls).toHaveLength(0);
  });

  it("refuses an answer that cites a passage it was not given (quota stays used: the provider ran)", async () => {
    await setTutor({ enabled: true });
    await note(alice, { body: "contenu sur le rhodium" });
    const provider = new FakeProvider(true, () => ({ text: "x", citedPassageIds: ["note:inconnu#1"] }));
    expect(await askTutor(db, alice, { courseId, question: "rhodium ?", now: NOW }, provider)).toEqual({ ok: false, error: "badCitations" });
    expect(await questionsToday(db, alice.id, NOW)).toBe(1);
  });
});

// ---------- Usage limits ----------

describe("usage limits", () => {
  it("allows exactly the daily limit per student, per day, and nobody else is affected", async () => {
    await setTutor({ enabled: true, dailyQuestionLimit: 2 });
    await note(alice, { body: "contenu sur le rhodium" });
    await note(bob, { body: "contenu sur le rhodium" });
    const provider = new FakeProvider(true);
    const ask = (who: Viewer, now = NOW) => askTutor(db, who, { courseId, question: "rhodium ?", now }, provider);
    expect((await ask(alice)).ok).toBe(true);
    expect((await ask(alice)).ok).toBe(true);
    expect(await ask(alice)).toEqual({ ok: false, error: "dailyLimit" });
    expect(provider.calls).toHaveLength(2);
    expect(await questionsToday(db, alice.id, NOW)).toBe(2);
    expect((await ask(bob)).ok).toBe(true); // another student has their own quota
    // the next day (in the app's time zone) starts again
    expect((await ask(alice, new Date(NOW.getTime() + 24 * 3600 * 1000))).ok).toBe(true);
    // usage rows hold counts only
    const rows = await db.select().from(tutorUsage).where(eq(tutorUsage.userId, alice.id));
    expect(rows).toHaveLength(3);
    expect(Object.keys(rows[0]!).sort()).toEqual(["contextChars", "courseId", "createdAt", "id", "passageCount", "usageDate", "userId"]);
    expect(rows[0]!.contextChars).toBeGreaterThan(0);
  });

  it("counts the day in the app time zone, not UTC", () => {
    expect(usageDay(new Date("2026-11-02T03:30:00Z"))).toBe("2026-11-01"); // still evening in Toronto
    expect(usageDay(new Date("2026-11-02T06:00:00Z"))).toBe("2026-11-02");
  });

  it("gives the unit back when the provider fails", async () => {
    await setTutor({ enabled: true, dailyQuestionLimit: 1 });
    await note(alice, { body: "contenu sur le rhodium" });
    const failing = new FakeProvider(true, () => {
      throw new Error("boom");
    });
    expect(await askTutor(db, alice, { courseId, question: "rhodium ?", now: NOW }, failing)).toEqual({ ok: false, error: "providerFailed" });
    expect(await questionsToday(db, alice.id, NOW)).toBe(0);
    expect((await askTutor(db, alice, { courseId, question: "rhodium ?", now: NOW }, new FakeProvider(true))).ok).toBe(true);
  });

  it("cannot be overrun by simultaneous questions", async () => {
    await setTutor({ enabled: true, dailyQuestionLimit: 2 });
    await note(alice, { body: "contenu sur le rhodium" });
    const provider = new FakeProvider(true);
    const results = await Promise.all(Array.from({ length: 6 }, () => askTutor(db, alice, { courseId, question: "rhodium ?", now: NOW }, provider)));
    expect(results.filter((r) => r.ok)).toHaveLength(2);
    expect(results.filter((r) => !r.ok && r.error === "dailyLimit")).toHaveLength(4);
    expect(provider.calls).toHaveLength(2);
    expect(await questionsToday(db, alice.id, NOW)).toBe(2);
  });

  it("reserveQuestion stops at the limit and the table refuses negative counts", async () => {
    expect(await reserveQuestion(db, alice.id, { limit: 1, courseId, contextChars: 10, passageCount: 1, now: NOW })).toEqual(expect.any(String));
    expect(await reserveQuestion(db, alice.id, { limit: 1, courseId, contextChars: 10, passageCount: 1, now: NOW })).toBeNull();
    await expect(db.insert(tutorUsage).values({ userId: bob.id, usageDate: "2026-11-01", contextChars: -1 })).rejects.toThrow();
  });

  it("sends the provider no more context than the configured budget", async () => {
    await setTutor({ enabled: true, maxContextChars: 1000 });
    for (let i = 0; i < 6; i++) await note(alice, { title: `Note ${i}`, body: `rhodium ${"mot de remplissage ".repeat(30)}` });
    const provider = new FakeProvider(true);
    expect((await askTutor(db, alice, { courseId, question: "rhodium ?", now: NOW }, provider)).ok).toBe(true);
    expect(provider.calls[0]!.passages.reduce((n, p) => n + p.text.length, 0)).toBeLessThanOrEqual(1000);
  });
});

// ---------- Settings ----------

describe("admin settings", () => {
  it("lets only administrators change them, validates, and audits", async () => {
    for (const who of [alice, mod, waiting]) expect(await updateTutorSettings(db, who, { enabled: true })).toEqual({ ok: false, error: "forbidden" });
    expect((await getTutorSettings(db)).enabled).toBe(false);
    expect(await updateTutorSettings(db, admin, { dailyQuestionLimit: 0 })).toEqual({ ok: false, error: "outOfRange" });
    expect(await updateTutorSettings(db, admin, { maxContextChars: 5 })).toEqual({ ok: false, error: "outOfRange" });
    expect(await updateTutorSettings(db, admin, { enabled: true, dailyQuestionLimit: 5, maxContextChars: 3000 })).toMatchObject({ ok: true });
    expect(await getTutorSettings(db)).toEqual({ enabled: true, dailyQuestionLimit: 5, maxContextChars: 3000 });
    const audit = (await db.select().from(auditLog)).filter((a) => a.action === "tutor.settings.update");
    expect(audit).toHaveLength(1);
    expect(audit[0]!.actorId).toBe("admin");
  });

  it("shows the flag as on but the tutor as not ready while no provider exists", async () => {
    await setTutor({ enabled: true });
    expect((await getTutorStatus(db)).state).toBe("noProvider");
  });
});

describe("plain search works without a provider", () => {
  it("returns passages with the tutor off", async () => {
    await note(alice, { body: "contenu sur le rhodium" });
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    expect((await getTutorStatus(db)).state).toBe("off");
    const r = await searchSources(db, alice, { courseId, query: "rhodium", now: NOW });
    expect(r.passages).toHaveLength(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
