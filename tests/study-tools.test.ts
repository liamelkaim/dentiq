// Study tools: pure rules (schedule, grading, CSV escaping, shuffle) and database behaviour (privacy between
// students, which questions are ever used, scoring only against verified answers, exports).
// Fake data only (TEST courses, example.com accounts).
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase, type Database } from "@/db/client";
import { courses, examQuestions, studyAttempts, studyQuestionCards, studyQuizzes, user } from "@/db/schema";
import { currentAcademicYear } from "@/server/passes/academic-year";
import { moderateQuestion, questionInputSchema, submitQuestion, verifyAnswer, type QuestionInput } from "@/server/passes/service";
import type { Viewer } from "@/server/resources/service";
import { createMemoryStorage } from "@/server/storage";
import { answerStatusWord, cardBack, cardFront, type CardLabels } from "@/server/study/cards";
import { PRACTICE_MAX_QUESTIONS, QUIZ_MAX_QUESTIONS } from "@/server/study/constants";
import { ankiField, ankiTag, guardCell, toDelimited } from "@/server/study/csv";
import { buildExport } from "@/server/study/export";
import {
  answerBasisOf,
  gradeResponse,
  hasUsableVerifiedAnswer,
  PARTIAL_CREDIT,
  scoreQuiz,
  validateResponse,
  type GradableQuestion,
} from "@/server/study/grading";
import { loadStudyQuestions, studyPool } from "@/server/study/questions";
import { INTERVAL_MINUTES, isDue, MAX_BOX, newSchedule, nextBox, nextSchedule, previewIntervalMinutes, type CardRatingValue } from "@/server/study/schedule";
import { parseCount, parseStudyScope, seededShuffle } from "@/server/study/scope";
import {
  answerQuizItem,
  buildReviewQueue,
  cardOverview,
  createPersonalCard,
  createQuiz,
  deletePersonalCard,
  getMarks,
  getPersonalCard,
  getProgress,
  getQuiz,
  listPersonalCards,
  listQuizzes,
  personalCardSchema,
  rateQuizItem,
  reviewCard,
  revealAnswer,
  setMark,
  submitAttempt,
  updatePersonalCard,
} from "@/server/study/service";

// ---------- Pure: schedule ----------

describe("flashcard schedule (Leitner boxes)", () => {
  const now = new Date("2026-11-01T12:00:00Z");
  const minutes = (m: number) => new Date(now.getTime() + m * 60_000);
  const at = (box: number) => ({ ...newSchedule(now), box });

  it("documents six boxes with fixed intervals: 10 min, 1, 3, 7, 14, 30 days", () => {
    expect(INTERVAL_MINUTES).toEqual([10, 1440, 4320, 10080, 20160, 43200]);
    expect(MAX_BOX).toBe(5);
  });

  it("starts new cards in box 0, due immediately, never reviewed", () => {
    expect(newSchedule(now)).toEqual({ box: 0, dueAt: now, lastReviewedAt: null, reviewCount: 0, lapseCount: 0 });
    expect(isDue(now, now)).toBe(true);
  });

  it("moves boxes as documented for every rating and every box", () => {
    const table: Record<CardRatingValue, number[]> = {
      again: [0, 0, 0, 0, 0, 0],
      hard: [0, 1, 1, 2, 3, 4],
      good: [1, 2, 3, 4, 5, 5],
      easy: [2, 3, 4, 5, 5, 5],
    };
    for (const [rating, expected] of Object.entries(table) as [CardRatingValue, number[]][]) {
      expect([0, 1, 2, 3, 4, 5].map((b) => nextBox(b, rating)), rating).toEqual(expected);
    }
  });

  it("schedules the next review after the NEW box's interval", () => {
    expect(nextSchedule(at(0), "good", now).dueAt).toEqual(minutes(1440)); // box 1: 1 day
    expect(nextSchedule(at(1), "good", now).dueAt).toEqual(minutes(3 * 1440)); // box 2: 3 days
    expect(nextSchedule(at(4), "easy", now).dueAt).toEqual(minutes(30 * 1440)); // box 5: 30 days
    expect(nextSchedule(at(5), "good", now).dueAt).toEqual(minutes(30 * 1440)); // capped at the top box
    expect(nextSchedule(at(3), "again", now).dueAt).toEqual(minutes(10)); // forgotten: 10 minutes
    expect(nextSchedule(at(0), "hard", now).dueAt).toEqual(minutes(10));
  });

  it("counts reviews and lapses (again from box 1 or higher only)", () => {
    const first = nextSchedule(newSchedule(now), "again", now);
    expect(first).toMatchObject({ reviewCount: 1, lapseCount: 0, lastReviewedAt: now });
    const learned = nextSchedule(at(2), "again", now);
    expect(learned).toMatchObject({ box: 0, lapseCount: 1, reviewCount: 1 });
    expect(nextSchedule({ ...at(2), lapseCount: 2, reviewCount: 7 }, "good", now)).toMatchObject({ lapseCount: 2, reviewCount: 8 });
  });

  it("does not change its input, and repairs an out-of-range box", () => {
    const current = at(2);
    const copy = structuredClone(current);
    nextSchedule(current, "easy", now);
    expect(current).toEqual(copy);
    expect(nextBox(99, "good")).toBe(5);
    expect(nextBox(-3, "good")).toBe(1);
  });

  it("previews the interval shown on each rating button", () => {
    expect([0, 1, 2, 3].map((b) => previewIntervalMinutes(b, "good"))).toEqual([1440, 4320, 10080, 20160]);
    expect(previewIntervalMinutes(4, "again")).toBe(10);
  });

  it("knows when a card is due", () => {
    expect(isDue(minutes(-1), now)).toBe(true);
    expect(isDue(minutes(1), now)).toBe(false);
  });
});

// ---------- Pure: CSV / TSV / Anki ----------

describe("export escaping", () => {
  it("prefixes cells that a spreadsheet would run as a formula", () => {
    for (const bad of ["=1+1", "+SUM(A1)", "-2+3", "@cmd", "=HYPERLINK(\"http://example.com\",\"x\")", "\t=1", "\r=1"]) {
      expect(guardCell(bad), bad).toBe(`'${bad}`);
    }
    for (const fine of ["Dent", "1+1", "a=b", "", " =x", "2025-2026", "C'est"]) expect(guardCell(fine), fine).toBe(fine);
  });

  it("guards every cell of a CSV and a TSV, and quotes only when needed", () => {
    const rows = [["a", "=2+2", 'say "hi"', "line\nbreak", "x,y"]];
    expect(toDelimited(rows, ",")).toBe('a,\'=2+2,"say ""hi""","line\nbreak","x,y"\r\n');
    expect(toDelimited([["a", "@x", "b\tc"]], "\t")).toBe("a\t'@x\t\"b\tc\"\n");
  });

  it("escapes HTML and line breaks for an Anki field, and tags cannot contain spaces", () => {
    expect(ankiField("a < b & c\nnext\tline")).toBe("a &lt; b &amp; c<br>next line");
    expect(ankiTag(" DMD 1234 ")).toBe("DMD_1234");
  });
});

// ---------- Pure: grading ----------

const choice = (position: number, verified: boolean | null, proposed: boolean | null = null) => ({ position, text: `Choix ${position}`, proposedCorrect: proposed, verifiedCorrect: verified });
const gq = (rule: GradableQuestion["rule"], answerStatus: "proposed" | "verified", choices: GradableQuestion["choices"], extra: Partial<GradableQuestion> = {}): GradableQuestion => ({
  rule,
  answerStatus,
  choices,
  proposedAnswerText: null,
  verifiedAnswerText: null,
  ...extra,
});

describe("grading", () => {
  const sc = gq("single", "verified", [choice(1, true), choice(2, false), choice(3, false)]);
  const mc = gq("multiple", "verified", [choice(1, true), choice(2, true), choice(3, false)]);
  const kprim = gq("perChoice", "verified", [choice(1, true), choice(2, false), choice(3, true), choice(4, false)]);
  const open = gq("text", "verified", [], { verifiedAnswerText: "Tissu conjonctif" });

  it("scores single choice, multiple choice and four true/false against the verified answer", () => {
    expect(gradeResponse(sc, { selected: [1] })).toEqual({ outcome: "correct", answerBasis: "verified" });
    expect(gradeResponse(sc, { selected: [2] })).toEqual({ outcome: "incorrect", answerBasis: "verified" });
    expect(gradeResponse(mc, { selected: [2, 1] }).outcome).toBe("correct");
    expect(gradeResponse(mc, { selected: [1] }).outcome).toBe("incorrect");
    expect(gradeResponse(mc, { selected: [1, 2, 3] }).outcome).toBe("incorrect");
    expect(gradeResponse(kprim, { verdicts: { "1": true, "2": false, "3": true, "4": false } }).outcome).toBe("correct");
    expect(gradeResponse(kprim, { verdicts: { "1": true, "2": true, "3": true, "4": false } }).outcome).toBe("incorrect");
  });

  it("scores an open question only from the student's own rating against a verified answer", () => {
    expect(gradeResponse(open, { selfRating: "got_it" }).outcome).toBe("correct");
    expect(gradeResponse(open, { selfRating: "partly" }).outcome).toBe("partial");
    expect(gradeResponse(open, { selfRating: "missed" }).outcome).toBe("incorrect");
    expect(gradeResponse(open, { text: "..." }).outcome).toBeNull(); // still waiting for the rating
  });

  it("NEVER scores against a proposal or a missing answer: unscored, even when the student 'matches' it", () => {
    const proposedSc = gq("single", "proposed", [choice(1, null, true), choice(2, null, false)]);
    expect(gradeResponse(proposedSc, { selected: [1] })).toEqual({ outcome: "unscored", answerBasis: "proposed" });
    expect(gradeResponse(proposedSc, { selected: [2] })).toEqual({ outcome: "unscored", answerBasis: "proposed" });
    const noAnswer = gq("single", "proposed", [choice(1, null), choice(2, null)]);
    expect(gradeResponse(noAnswer, { selected: [1] })).toEqual({ outcome: "unscored", answerBasis: "none" });
    const proposedOpen = gq("text", "proposed", [], { proposedAnswerText: "peut-être" });
    expect(gradeResponse(proposedOpen, { selfRating: "got_it" })).toEqual({ outcome: "unscored", answerBasis: "proposed" });
  });

  it("treats an incomplete 'verified' record as not verified instead of scoring it", () => {
    const broken = gq("single", "verified", [choice(1, true), choice(2, null)]);
    expect(hasUsableVerifiedAnswer(broken)).toBe(false);
    expect(gradeResponse(broken, { selected: [1] }).outcome).toBe("unscored");
    const twoCorrect = gq("single", "verified", [choice(1, true), choice(2, true)]);
    expect(answerBasisOf(twoCorrect)).not.toBe("verified");
    expect(answerBasisOf(gq("text", "verified", [], { verifiedAnswerText: "  " }))).toBe("none");
  });

  it("checks a response is complete and about real choices", () => {
    expect(validateResponse(sc, {}, { requireSelfRating: true })).toBe("answerRequired");
    expect(validateResponse(sc, { selected: [9] }, { requireSelfRating: true })).toBe("invalidAnswer");
    expect(validateResponse(sc, { selected: [1, 2] }, { requireSelfRating: true })).toBe("invalidAnswer");
    expect(validateResponse(sc, { selected: [2] }, { requireSelfRating: true })).toBeNull();
    expect(validateResponse(mc, { selected: [1, 1] }, { requireSelfRating: true })).toBe("invalidAnswer");
    expect(validateResponse(kprim, { verdicts: { "1": true } }, { requireSelfRating: true })).toBe("answerRequired");
    expect(validateResponse(kprim, { verdicts: { "1": true, "2": true, "3": true, "9": true } }, { requireSelfRating: true })).toBe("invalidAnswer");
    expect(validateResponse(open, {}, { requireSelfRating: true })).toBe("answerRequired");
    expect(validateResponse(open, {}, { requireSelfRating: false })).toBeNull();
  });
});

describe("quiz score", () => {
  it("counts only scored items, lists unscored apart, and never invents a percentage", () => {
    const none = scoreQuiz([
      { answered: true, outcome: "unscored" },
      { answered: true, outcome: "unscored" },
    ]);
    expect(none).toMatchObject({ scored: 0, unscored: 2, percent: null, points: 0 });

    const mixed = scoreQuiz([
      { answered: true, outcome: "correct" },
      { answered: true, outcome: "incorrect" },
      { answered: true, outcome: "partial" },
      { answered: true, outcome: "unscored" },
      { answered: true, outcome: null },
      { answered: false, outcome: null },
    ]);
    expect(mixed).toMatchObject({ scored: 3, correct: 1, incorrect: 1, partial: 1, unscored: 1, awaitingRating: 1, unanswered: 1 });
    expect(mixed.points).toBe(1 + PARTIAL_CREDIT);
    expect(mixed.percent).toBe(50);
  });
});

describe("scope helpers", () => {
  it("reads the scope strictly", () => {
    const course = crypto.randomUUID();
    expect(parseStudyScope({ course, year: "2025-2026", type: "sc", period: "current", mark: "flagged", topic: "Pulpe" })).toEqual({
      course,
      year: "2025-2026",
      type: "sc",
      period: "current",
      mark: "flagged",
      topic: "Pulpe",
    });
    expect(parseStudyScope({ course: "not-a-uuid", year: "2025-2027", type: "essay", period: "future", mark: "x" })).toEqual({
      course: undefined,
      topic: undefined,
      year: undefined,
      type: undefined,
      period: undefined,
      mark: undefined,
    });
  });

  it("limits counts to a maximum and falls back for junk", () => {
    expect(parseCount("500", 10, 50)).toBe(50);
    expect(parseCount("0", 10, 50)).toBe(10);
    expect(parseCount("abc", 10, 50)).toBe(10);
    expect(parseCount(undefined, 10, 50)).toBe(10);
    expect(parseCount("7", 10, 50)).toBe(7);
  });

  it("shuffles the same way for the same seed and keeps every item", () => {
    const items = Array.from({ length: 30 }, (_, i) => i);
    expect(seededShuffle(items, "seed-a")).toEqual(seededShuffle(items, "seed-a"));
    expect(seededShuffle(items, "seed-a")).not.toEqual(seededShuffle(items, "seed-b"));
    expect([...seededShuffle(items, "seed-a")].sort((a, b) => a - b)).toEqual(items);
    expect(items[0]).toBe(0); // input untouched
  });
});

describe("card text", () => {
  const labels: CardLabels = {
    verified: "Verified answer",
    proposedUnverified: "Proposed answer (NOT verified)",
    noAnswer: "No answer yet",
    trueWord: "True",
    falseWord: "False",
    explanation: "Explanation",
    source: "Source",
    recalled: "recalled",
    released: "released",
  };
  const base = { questionText: "Quelle structure ?", explanation: null, courseCode: "TEST 1001", examAcademicYear: "2025-2026", examTerm: "fall", provenance: "recalled" as const, topic: null };

  it("labels a proposal as unverified and never presents it as verified", () => {
    const proposed = { ...base, ...gq("single", "proposed", [choice(1, null, true), choice(2, null, false)]) };
    const back = cardBack(proposed, labels);
    expect(back).toContain("Proposed answer (NOT verified)");
    expect(back).not.toContain("Verified answer");
    expect(back).toContain("Source: TEST 1001, 2025-2026, fall (recalled)");
    expect(answerStatusWord(answerBasisOf(proposed))).toBe("proposed_unverified");
    expect(cardFront(proposed)).toBe("Quelle structure ?\n\nA. Choix 1\nB. Choix 2");
  });

  it("shows the verified answer, and says so when there is none", () => {
    const verified = { ...base, ...gq("single", "verified", [choice(1, true), choice(2, false)]) };
    expect(cardBack(verified, labels)).toContain("Verified answer\nA. Choix 1");
    const none = { ...base, ...gq("single", "proposed", [choice(1, null), choice(2, null)]) };
    expect(cardBack(none, labels)).toContain("No answer yet");
  });
});

// ---------- Database ----------

const thisYear = currentAcademicYear();
const viewer = (id: string, role: Viewer["role"], approved = true): Viewer => ({ id, role, emailVerified: true, approvalStatus: approved ? "approved" : "pending" });
const alice = viewer("alice", "student");
const bob = viewer("bob", "student");
const carol = viewer("carol", "student", false);
const mod = viewer("mod", "moderator");

const labels: CardLabels = {
  verified: "Verified answer",
  proposedUnverified: "Proposed answer (NOT verified)",
  noAnswer: "No answer yet",
  trueWord: "True",
  falseWord: "False",
  explanation: "Explanation",
  source: "Source",
  recalled: "recalled",
  released: "released",
};

let db: Database;
let storage: ReturnType<typeof createMemoryStorage>;
let courseId: string;
let otherCourseId: string;
let n = 0;

function input(overrides: Record<string, unknown> = {}): QuestionInput {
  n += 1;
  return questionInputSchema.parse({
    courseId,
    examAcademicYear: thisYear,
    questionType: "sc",
    questionText: `Question fictive numéro ${n} ?`,
    rightsConfirmed: true,
    choices: [
      { text: "Réponse A", proposedCorrect: true },
      { text: "Réponse B", proposedCorrect: false },
      { text: "Réponse C", proposedCorrect: false },
    ],
    ...overrides,
  });
}

/** A published question whose answer is only proposed. */
async function published(overrides: Record<string, unknown> = {}) {
  const result = await submitQuestion(db, storage, mod, input(overrides), []);
  if (!result.ok) throw new Error(result.error);
  return result.value.id;
}

/** A published question with a VERIFIED answer (choice A is correct by default). */
async function verified(overrides: Record<string, unknown> = {}, correct: boolean[] = [true, false, false]) {
  const id = await published(overrides);
  const r = await verifyAnswer(db, mod, id, { choices: correct }, "Vérifié avec le manuel de référence du cours");
  if (!r.ok) throw new Error(r.error);
  return id;
}

async function verifiedOpen(text = "Tissu conjonctif lâche") {
  const id = await published({ questionType: "open", questionText: `Décrivez la pulpe ${(n += 1)}.`, choices: [], proposedAnswerText: "à vérifier" });
  const r = await verifyAnswer(db, mod, id, { text }, "Vérifié avec le manuel de référence du cours");
  if (!r.ok) throw new Error(r.error);
  return id;
}

async function pending(overrides: Record<string, unknown> = {}) {
  const result = await submitQuestion(db, storage, alice, input(overrides), []);
  if (!result.ok) throw new Error(result.error);
  return result.value.id;
}

const card = (front: string, back = "Verso", extra: Record<string, unknown> = {}) => personalCardSchema.parse({ front, back, ...extra });

beforeEach(async () => {
  db = await createTestDatabase();
  storage = createMemoryStorage();
  await db.insert(user).values(
    [alice, bob, carol, mod].map((v) => ({ id: v.id, name: v.id, email: `${v.id}@example.com`, emailVerified: true, role: v.role, approvalStatus: v.approvalStatus })),
  );
  const [c1] = await db.insert(courses).values({ code: "TEST 1001", titleFr: "Cours fictif" }).returning();
  const [c2] = await db.insert(courses).values({ code: "TEST 2002", titleFr: "Autre cours fictif" }).returning();
  courseId = c1!.id;
  otherCourseId = c2!.id;
});

describe("which questions the study tools may use", () => {
  it("uses only published questions: pending, rejected and hidden ones never appear in the pool, a quiz or an export", async () => {
    const live = await verified({ questionText: "Question PUBLIEE visible ?" });
    const waiting = await pending({ questionText: "Question EN ATTENTE secrète ?" });
    const rejected = await pending({ questionText: "Question REFUSEE secrète ?" });
    await moderateQuestion(db, mod, rejected, "reject", "Pas conforme");
    const hidden = await published({ questionText: "Question MASQUEE secrète ?" });
    await moderateQuestion(db, mod, hidden, "hide", "Retirée");

    for (const who of [alice, bob, mod]) {
      expect(await studyPool(db, who, { course: courseId }), who.id).toEqual([live]);
      expect((await loadStudyQuestions(db, who, [live, waiting, rejected, hidden])).map((q) => q.id), who.id).toEqual([live]);
    }
    // Even the author of a pending question does not get it in the study tools.
    expect(await loadStudyQuestions(db, alice, [waiting])).toEqual([]);

    const quiz = await createQuiz(db, alice, { course: courseId }, 10);
    expect(quiz).toMatchObject({ ok: true, value: { size: 1, poolSize: 1 } });
    const exported = await buildExport(db, alice, { kind: "questions", format: "csv", scope: {} }, labels);
    const anki = await buildExport(db, alice, { kind: "anki", format: "tsv", scope: {} }, labels);
    for (const file of [exported, anki]) {
      if (!file.ok) throw new Error(file.error);
      expect(file.value.body).toContain("PUBLIEE");
      for (const secret of ["EN ATTENTE", "REFUSEE", "MASQUEE"]) expect(file.value.body).not.toContain(secret);
    }
  });

  it("gives nothing to accounts that are not approved", async () => {
    await verified();
    expect(await studyPool(db, carol, {})).toEqual([]);
    expect(await createQuiz(db, carol, { course: courseId }, 5)).toEqual({ ok: false, error: "noAccess" });
    expect(await createPersonalCard(db, carol, card("Recto"))).toEqual({ ok: false, error: "noAccess" });
    expect(await buildExport(db, carol, { kind: "questions", format: "csv", scope: {} }, labels)).toEqual({ ok: false, error: "noAccess" });
    expect(await getProgress(db, carol)).toMatchObject({ hasData: false });
  });

  it("filters by course, year, type, period and topic", async () => {
    const lastYear = `${Number(thisYear.slice(0, 4)) - 1}-${thisYear.slice(0, 4)}`;
    const a = await verified({ topic: "Pulpe" });
    const b = await verified({ examAcademicYear: lastYear });
    const c = await verified({ courseId: otherCourseId });
    const open = await verifiedOpen();
    expect(new Set(await studyPool(db, alice, { course: courseId }))).toEqual(new Set([a, b, open]));
    expect(await studyPool(db, alice, { course: courseId, year: lastYear })).toEqual([b]);
    expect(await studyPool(db, alice, { course: courseId, period: "previous" })).toEqual([b]);
    expect(await studyPool(db, alice, { course: courseId, type: "open" })).toEqual([open]);
    expect(await studyPool(db, alice, { course: courseId, topic: "pulpe" })).toEqual([a]);
    expect(await studyPool(db, alice, { course: otherCourseId })).toEqual([c]);
  });

  it("hides a verified answer until a moderator verified it, and never loads verifiedCorrect for a proposal", async () => {
    const proposed = await published();
    const [q] = await loadStudyQuestions(db, alice, [proposed]);
    expect(q!.answerStatus).toBe("proposed");
    expect(q!.choices.every((c) => c.verifiedCorrect === null)).toBe(true);
    expect(q!.choices.find((c) => c.proposedCorrect === true)).toBeDefined();
  });
});

describe("practice attempts", () => {
  it("scores against a verified answer and shows it", async () => {
    const id = await verified({}, [false, true, false]);
    const right = await submitAttempt(db, alice, { questionId: id, response: { selected: [2] } });
    expect(right).toMatchObject({ ok: true, value: { outcome: "correct", answerBasis: "verified" } });
    if (right.ok) expect(right.value.reveal.choices.filter((c) => c.correct).map((c) => c.position)).toEqual([2]);
    const wrong = await submitAttempt(db, alice, { questionId: id, response: { selected: [1] } });
    expect(wrong).toMatchObject({ ok: true, value: { outcome: "incorrect" } });
    const stored = await db.select().from(studyAttempts).where(eq(studyAttempts.userId, "alice"));
    expect(stored.map((a) => a.outcome).sort()).toEqual(["correct", "incorrect"]);
  });

  it("records a proposed-only answer as UNSCORED, whatever the student chose, and labels the reveal as a proposal", async () => {
    const id = await published(); // proposed answer: A
    for (const selected of [[1], [2]]) {
      const result = await submitAttempt(db, alice, { questionId: id, response: { selected } });
      expect(result).toMatchObject({ ok: true, value: { outcome: "unscored", answerBasis: "proposed" } });
      if (result.ok) expect(result.value.reveal.basis).toBe("proposed");
    }
    const rows = await db.select().from(studyAttempts);
    expect(rows.every((r) => r.outcome === "unscored" && r.answerBasis === "proposed")).toBe(true);
    const progress = await getProgress(db, alice);
    expect(progress.totals).toMatchObject({ attempts: 2, correct: 0, incorrect: 0, unscored: 2 });
  });

  it("records a question with no answer at all as unscored with nothing to reveal", async () => {
    const id = await published({ choices: [{ text: "A" }, { text: "B" }] });
    const result = await submitAttempt(db, alice, { questionId: id, response: { selected: [1] } });
    expect(result).toMatchObject({ ok: true, value: { outcome: "unscored", answerBasis: "none" } });
    if (result.ok) expect(result.value.reveal.choices.every((c) => c.correct === null)).toBe(true);
  });

  it("handles four true/false statements and open questions (self-rated)", async () => {
    const four = ["E1", "E2", "E3", "E4"].map((text) => ({ text }));
    const kid = await published({ questionType: "kprim", choices: four });
    await verifyAnswer(db, mod, kid, { choices: [true, false, true, false] }, "Vérifié avec le manuel de référence");
    expect(await submitAttempt(db, alice, { questionId: kid, response: { verdicts: { "1": true, "2": false, "3": true, "4": false } } })).toMatchObject({ value: { outcome: "correct" } });
    expect(await submitAttempt(db, alice, { questionId: kid, response: { verdicts: { "1": true, "2": true, "3": true, "4": false } } })).toMatchObject({ value: { outcome: "incorrect" } });
    expect(await submitAttempt(db, alice, { questionId: kid, response: { verdicts: { "1": true } } })).toEqual({ ok: false, error: "answerRequired" });

    const oid = await verifiedOpen();
    expect(await submitAttempt(db, alice, { questionId: oid, response: { text: "ma réponse" } })).toEqual({ ok: false, error: "answerRequired" });
    const rated = await submitAttempt(db, alice, { questionId: oid, response: { text: "ma réponse", selfRating: "partly" } });
    expect(rated).toMatchObject({ ok: true, value: { outcome: "partial", answerBasis: "verified" } });

    const unverifiedOpen = await published({ questionType: "open", questionText: "Question ouverte non vérifiée ?", choices: [], proposedAnswerText: "peut-être" });
    expect(await submitAttempt(db, alice, { questionId: unverifiedOpen, response: { selfRating: "got_it" } })).toMatchObject({ value: { outcome: "unscored", answerBasis: "proposed" } });
  });

  it("refuses questions the student may not see, and invalid answers", async () => {
    const waiting = await pending();
    expect(await submitAttempt(db, alice, { questionId: waiting, response: { selected: [1] } })).toEqual({ ok: false, error: "questionNotFound" });
    expect(await revealAnswer(db, bob, waiting)).toEqual({ ok: false, error: "questionNotFound" });
    const id = await verified();
    expect(await submitAttempt(db, alice, { questionId: id, response: { selected: [7] } })).toEqual({ ok: false, error: "invalidAnswer" });
    expect(await submitAttempt(db, alice, { questionId: id, response: {} })).toEqual({ ok: false, error: "answerRequired" });
    expect(await db.select().from(studyAttempts)).toEqual([]);
  });

  it("the database refuses a 'correct' attempt that was not scored against a verified answer", async () => {
    const id = await published();
    await expect(
      db.insert(studyAttempts).values({ userId: "alice", questionId: id, mode: "practice", outcome: "correct", answerBasis: "proposed", response: {} }),
    ).rejects.toThrow();
  });

  it("a question that is hidden later disappears from progress lists and counts", async () => {
    const id = await verified();
    await submitAttempt(db, alice, { questionId: id, response: { selected: [1] } });
    expect((await getProgress(db, alice)).totals.attempts).toBe(1);
    await moderateQuestion(db, mod, id, "hide", "Retirée");
    const after = await getProgress(db, alice);
    expect(after.totals.attempts).toBe(0);
    expect(after.byCourse).toEqual([]);
  });
});

describe("marks (flag and review later)", () => {
  it("are per student and only for questions the student may use", async () => {
    const id = await verified();
    expect(await setMark(db, alice, { questionId: id, flagged: true })).toEqual({ ok: true, value: { flagged: true, reviewLater: false } });
    expect(await setMark(db, alice, { questionId: id, reviewLater: true })).toEqual({ ok: true, value: { flagged: true, reviewLater: true } });
    expect((await getMarks(db, alice, [id])).get(id)).toEqual({ flagged: true, reviewLater: true });
    expect((await getMarks(db, bob, [id])).size).toBe(0);
    expect(await setMark(db, alice, { questionId: await pending(), flagged: true })).toEqual({ ok: false, error: "questionNotFound" });

    expect(await studyPool(db, alice, { course: courseId, mark: "flagged" })).toEqual([id]);
    expect(await studyPool(db, bob, { course: courseId, mark: "flagged" })).toEqual([]);
    const progress = await getProgress(db, alice);
    expect(progress.marks).toEqual({ flagged: 1, reviewLater: 1 });
    expect(progress.flagged.map((m) => m.id)).toEqual([id]);
    expect((await getProgress(db, bob)).marks).toEqual({ flagged: 0, reviewLater: 0 });
  });
});

describe("progress", () => {
  it("is honestly empty before any activity", async () => {
    const empty = await getProgress(db, alice);
    expect(empty.hasData).toBe(false);
    expect(empty.byCourse).toEqual([]);
    expect(empty.totals).toEqual({ attempts: 0, questionsAnswered: 0, correct: 0, partial: 0, incorrect: 0, unscored: 0 });
  });

  it("counts only real attempts, by course", async () => {
    const a = await verified();
    const b = await verified({ courseId: otherCourseId });
    await submitAttempt(db, alice, { questionId: a, response: { selected: [1] } });
    await submitAttempt(db, alice, { questionId: a, response: { selected: [2] } });
    await submitAttempt(db, alice, { questionId: b, response: { selected: [1] } });
    const p = await getProgress(db, alice);
    expect(p.hasData).toBe(true);
    expect(p.totals).toMatchObject({ attempts: 3, questionsAnswered: 2, correct: 2, incorrect: 1 });
    expect(p.byCourse.map((c) => [c.code, c.attempts, c.questionsAnswered, c.correct, c.incorrect])).toEqual([
      ["TEST 1001", 2, 1, 1, 1],
      ["TEST 2002", 1, 1, 1, 0],
    ]);
  });
});

describe("privacy between students", () => {
  it("one student never sees another's attempts, marks, progress, cards, schedule or quizzes", async () => {
    const q = await verified();
    // Alice builds up private data.
    await submitAttempt(db, alice, { questionId: q, response: { selected: [1] } });
    await setMark(db, alice, { questionId: q, flagged: true });
    const made = await createPersonalCard(db, alice, card("Recto secret d'Alice", "Verso secret"));
    if (!made.ok) throw new Error(made.error);
    await reviewCard(db, alice, { kind: "question", id: q, rating: "good" });
    const quiz = await createQuiz(db, alice, { course: courseId }, 5);
    if (!quiz.ok) throw new Error(quiz.error);

    // Bob sees none of it.
    expect(await getProgress(db, bob)).toMatchObject({ hasData: false, totals: { attempts: 0 }, marks: { flagged: 0 }, cards: { personal: 0, questionCardsStarted: 0, reviews: 0 }, quizzes: { completed: 0, inProgress: 0 } });
    expect((await getMarks(db, bob, [q])).size).toBe(0);
    expect(await listPersonalCards(db, bob)).toEqual([]);
    expect(await getPersonalCard(db, bob, made.value.id)).toBeNull();
    expect(await getQuiz(db, bob, quiz.value.id)).toBeNull();
    expect(await listQuizzes(db, bob)).toEqual([]);
    expect(await getQuiz(db, alice, quiz.value.id)).not.toBeNull();

    // Bob cannot change or use Alice's things by guessing ids.
    expect(await updatePersonalCard(db, bob, made.value.id, card("Piraté", "Piraté"))).toEqual({ ok: false, error: "cardNotFound" });
    expect(await deletePersonalCard(db, bob, made.value.id)).toEqual({ ok: false, error: "cardNotFound" });
    expect(await reviewCard(db, bob, { kind: "personal", id: made.value.id, rating: "easy" })).toEqual({ ok: false, error: "cardNotFound" });
    const items = (await getQuiz(db, alice, quiz.value.id))!.items;
    expect(await answerQuizItem(db, bob, { quizId: quiz.value.id, itemId: items[0]!.id, response: { selected: [1] } })).toEqual({ ok: false, error: "quizNotFound" });
    expect(await rateQuizItem(db, bob, { quizId: quiz.value.id, itemId: items[0]!.id, rating: "got_it" })).toEqual({ ok: false, error: "quizNotFound" });

    // Alice's card is intact, and exports never include it for Bob.
    expect((await getPersonalCard(db, alice, made.value.id))!.front).toBe("Recto secret d'Alice");
    for (const kind of ["cards", "progress", "anki", "questions"] as const) {
      const file = await buildExport(db, bob, { kind, format: "csv", scope: {} }, labels);
      if (!file.ok) throw new Error(file.error);
      expect(file.value.body, kind).not.toContain("secret d'Alice");
      expect(file.value.body, kind).not.toContain(made.value.id);
    }
    const bobProgress = await buildExport(db, bob, { kind: "progress", format: "csv", scope: {} }, labels);
    if (!bobProgress.ok) throw new Error(bobProgress.error);
    expect(bobProgress.value.body.replace("﻿", "").trim().split(/\r?\n/)).toHaveLength(1); // header only
    // Alice's own progress export has her attempt.
    const aliceProgress = await buildExport(db, alice, { kind: "progress", format: "csv", scope: {} }, labels);
    if (!aliceProgress.ok) throw new Error(aliceProgress.error);
    expect(aliceProgress.value.body.trim().split(/\r?\n/)).toHaveLength(2);
  });

  it("a moderator has no special access to a student's private study data", async () => {
    const q = await verified();
    await submitAttempt(db, alice, { questionId: q, response: { selected: [1] } });
    await createPersonalCard(db, alice, card("Carte privée d'Alice"));
    expect(await getProgress(db, mod)).toMatchObject({ hasData: false });
    expect(await listPersonalCards(db, mod)).toEqual([]);
    const cards = await buildExport(db, mod, { kind: "cards", format: "csv", scope: {} }, labels);
    if (!cards.ok) throw new Error(cards.error);
    expect(cards.value.body).not.toContain("Carte privée");
  });
});

describe("personal cards", () => {
  it("can be created, edited and deleted by their owner only", async () => {
    const made = await createPersonalCard(db, alice, card("Recto", "Verso", { courseId }));
    if (!made.ok) throw new Error(made.error);
    expect(await getPersonalCard(db, alice, made.value.id)).toMatchObject({ front: "Recto", back: "Verso", courseCode: "TEST 1001", box: 0, reviewCount: 0 });
    expect(await updatePersonalCard(db, alice, made.value.id, card("Recto 2", "Verso 2"))).toEqual({ ok: true, value: null });
    expect((await getPersonalCard(db, alice, made.value.id))!.front).toBe("Recto 2");
    expect(await deletePersonalCard(db, alice, made.value.id)).toEqual({ ok: true, value: null });
    expect(await getPersonalCard(db, alice, made.value.id)).toBeNull();
  });

  it("rejects empty text, unknown courses and an invalid id", async () => {
    expect(personalCardSchema.safeParse({ front: "  ", back: "x" }).success).toBe(false);
    expect(personalCardSchema.safeParse({ front: "x", back: "" }).success).toBe(false);
    expect(await createPersonalCard(db, alice, card("x", "y", { courseId: crypto.randomUUID() }))).toEqual({ ok: false, error: "courseNotFound" });
    expect(await getPersonalCard(db, alice, "not-a-uuid")).toBeNull();
  });
});

describe("flashcard review", () => {
  const now = new Date("2026-11-01T12:00:00Z");
  const later = (days: number) => new Date(now.getTime() + days * 86_400_000);

  it("builds cards from published questions only, and a new card is due at once", async () => {
    const live = await verified();
    await pending();
    const overview = await cardOverview(db, alice, { course: courseId }, now);
    expect(overview).toMatchObject({ generated: 1, generatedNew: 1, generatedDue: 0, dueTotal: 0, newTotal: 1, personal: 0 });
    const queue = await buildReviewQueue(db, alice, { course: courseId }, now);
    expect(queue.map((i) => i.id)).toEqual([live]);
  });

  it("schedules a reviewed card with the documented interval and stores it per student", async () => {
    const q = await verified();
    const result = await reviewCard(db, alice, { kind: "question", id: q, rating: "good" }, now);
    expect(result).toEqual({ ok: true, value: { box: 1, dueAt: later(1) } });
    const [state] = await db.select().from(studyQuestionCards).where(and(eq(studyQuestionCards.userId, "alice"), eq(studyQuestionCards.questionId, q)));
    expect(state).toMatchObject({ box: 1, reviewCount: 1, lapseCount: 0 });

    // Not due the same day, due after a day. Bob's card for the same question is still new.
    expect(await buildReviewQueue(db, alice, { course: courseId }, later(0.5))).toEqual([]);
    expect((await buildReviewQueue(db, alice, { course: courseId }, later(1))).map((i) => i.id)).toEqual([q]);
    expect((await buildReviewQueue(db, bob, { course: courseId }, later(0.5))).map((i) => i.id)).toEqual([q]);

    // Forgetting sends it back to box 0 with a lapse.
    expect(await reviewCard(db, alice, { kind: "question", id: q, rating: "good" }, later(1))).toMatchObject({ value: { box: 2 } });
    expect(await reviewCard(db, alice, { kind: "question", id: q, rating: "again" }, later(4))).toMatchObject({ value: { box: 0 } });
    const [after] = await db.select().from(studyQuestionCards).where(eq(studyQuestionCards.questionId, q));
    expect(after).toMatchObject({ box: 0, reviewCount: 3, lapseCount: 1 });
  });

  it("includes personal cards for their owner, with their own schedule", async () => {
    const made = await createPersonalCard(db, alice, card("Recto perso", "Verso perso"));
    if (!made.ok) throw new Error(made.error);
    const queue = await buildReviewQueue(db, alice, {}, new Date());
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ kind: "personal", front: "Recto perso" });
    expect(await buildReviewQueue(db, bob, {}, new Date())).toEqual([]);

    const reviewed = await reviewCard(db, alice, { kind: "personal", id: made.value.id, rating: "easy" }, now);
    expect(reviewed).toEqual({ ok: true, value: { box: 2, dueAt: later(3) } });
    expect(await buildReviewQueue(db, alice, {}, later(1))).toEqual([]);
    expect(await buildReviewQueue(db, alice, {}, later(3))).toHaveLength(1);
    expect((await getProgress(db, alice)).cards).toMatchObject({ personal: 1, reviews: 1 });
  });

  it("cannot review a card from a question the student may not use", async () => {
    const waiting = await pending();
    expect(await reviewCard(db, alice, { kind: "question", id: waiting, rating: "good" })).toEqual({ ok: false, error: "questionNotFound" });
    const live = await verified();
    await moderateQuestion(db, mod, live, "hide", "Retirée");
    expect(await reviewCard(db, alice, { kind: "question", id: live, rating: "good" })).toEqual({ ok: false, error: "questionNotFound" });
    expect(await buildReviewQueue(db, alice, {}, now)).toEqual([]);
  });

  it("caps a session: due cards first, then at most the allowed number of new ones", async () => {
    for (let i = 0; i < 14; i++) await published();
    const queue = await buildReviewQueue(db, alice, { course: courseId }, now);
    expect(queue).toHaveLength(10); // NEW_CARDS_PER_SESSION
  });
});

describe("quizzes", () => {
  async function takeAll(who: Viewer, quizId: string, answerFor: (position: number) => Record<string, unknown>) {
    const quiz = (await getQuiz(db, who, quizId))!;
    for (const item of quiz.items) {
      const result = await answerQuizItem(db, who, { quizId, itemId: item.id, response: answerFor(item.position) });
      if (!result.ok) throw new Error(result.error);
    }
  }

  it("caps the number of questions at the documented maximum and at what exists", async () => {
    await verified();
    await verified();
    const tooMany = await createQuiz(db, alice, { course: courseId }, 10_000);
    expect(tooMany).toMatchObject({ ok: true, value: { size: 2, poolSize: 2 } });
    if (!tooMany.ok) return;
    const [row] = await db.select().from(studyQuizzes);
    expect(row!.requestedCount).toBe(QUIZ_MAX_QUESTIONS);
    expect(QUIZ_MAX_QUESTIONS).toBeLessThanOrEqual(50);
    expect(PRACTICE_MAX_QUESTIONS).toBeLessThanOrEqual(50);
    expect(await createQuiz(db, alice, { course: courseId }, 1)).toMatchObject({ value: { size: 1 } });
  });

  it("needs a course and some published questions", async () => {
    expect(await createQuiz(db, alice, {}, 5)).toEqual({ ok: false, error: "courseRequired" });
    expect(await createQuiz(db, alice, { course: courseId }, 5)).toEqual({ ok: false, error: "noQuestions" });
    await pending();
    expect(await createQuiz(db, alice, { course: courseId }, 5)).toEqual({ ok: false, error: "noQuestions" });
  });

  it("scores only verified-answer items, lists unscored ones apart, and shows nothing before the end", async () => {
    const right = await verified({ questionText: "Quiz question juste ?" });
    const wrong = await verified({ questionText: "Quiz question ratée ?" });
    const proposedOnly = await published({ questionText: "Quiz question non vérifiée ?" });
    const made = await createQuiz(db, alice, { course: courseId }, 3);
    if (!made.ok) throw new Error(made.error);
    const quiz = (await getQuiz(db, alice, made.value.id))!;
    expect(quiz.complete).toBe(false);
    expect(quiz.score).toBeNull();
    expect(quiz.items.every((i) => i.result === null)).toBe(true); // no peeking while taking it

    const byQuestion = new Map(quiz.items.map((i) => [i.question!.id, i]));
    const answer = async (id: string, selected: number[]) =>
      answerQuizItem(db, alice, { quizId: made.value.id, itemId: byQuestion.get(id)!.id, response: { selected } });
    expect(await answer(right, [1])).toEqual({ ok: true, value: { complete: false } });
    expect(await answer(right, [1])).toEqual({ ok: false, error: "alreadyAnswered" });
    expect(await answer(wrong, [2])).toEqual({ ok: true, value: { complete: false } });
    expect((await getQuiz(db, alice, made.value.id))!.items.every((i) => i.result === null)).toBe(true);
    expect(await answer(proposedOnly, [1])).toEqual({ ok: true, value: { complete: true } }); // matches the proposal: still unscored

    const done = (await getQuiz(db, alice, made.value.id))!;
    expect(done.complete).toBe(true);
    expect(done.score).toMatchObject({ scored: 2, correct: 1, incorrect: 1, unscored: 1, percent: 50 });
    const unscored = done.items.find((i) => i.question!.id === proposedOnly)!;
    expect(unscored.result).toMatchObject({ outcome: "unscored", answerBasis: "proposed" });
    expect(unscored.result!.reveal!.basis).toBe("proposed");

    const history = await listQuizzes(db, alice);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ size: 3, score: { scored: 2, unscored: 1 } });
    expect(history[0]!.completedAt).not.toBeNull();
    // Each answer also lands in the attempts used by progress.
    expect((await getProgress(db, alice)).totals).toMatchObject({ attempts: 3, correct: 1, incorrect: 1, unscored: 1 });
  });

  it("gives no score when nothing has a verified answer (no fake 0%)", async () => {
    await published();
    const made = await createQuiz(db, alice, { course: courseId }, 5);
    if (!made.ok) throw new Error(made.error);
    await takeAll(alice, made.value.id, () => ({ selected: [1] }));
    const done = (await getQuiz(db, alice, made.value.id))!;
    expect(done.score).toMatchObject({ scored: 0, unscored: 1, percent: null, points: 0 });
  });

  it("an open question waits for the student's rating, which then counts against the verified answer", async () => {
    const open = await verifiedOpen();
    const made = await createQuiz(db, alice, { course: courseId }, 5);
    if (!made.ok) throw new Error(made.error);
    const item = (await getQuiz(db, alice, made.value.id))!.items[0]!;
    expect(await rateQuizItem(db, alice, { quizId: made.value.id, itemId: item.id, rating: "got_it" })).toEqual({ ok: false, error: "quizNotComplete" });
    expect(await answerQuizItem(db, alice, { quizId: made.value.id, itemId: item.id, response: { text: "ma réponse" } })).toEqual({ ok: true, value: { complete: true } });
    const waiting = (await getQuiz(db, alice, made.value.id))!;
    expect(waiting.score).toMatchObject({ scored: 0, awaitingRating: 1 });
    expect(waiting.items[0]!.result!.reveal!.basis).toBe("verified");

    expect(await rateQuizItem(db, alice, { quizId: made.value.id, itemId: item.id, rating: "partly" })).toEqual({ ok: true, value: null });
    expect(await rateQuizItem(db, alice, { quizId: made.value.id, itemId: item.id, rating: "got_it" })).toEqual({ ok: false, error: "cannotRate" });
    expect((await getQuiz(db, alice, made.value.id))!.score).toMatchObject({ scored: 1, partial: 1, points: PARTIAL_CREDIT, percent: 50 });
    expect(open).toBeTruthy();
  });

  it("an open question with only a proposed answer can never be rated into a score", async () => {
    await published({ questionType: "open", questionText: "Ouverte non vérifiée ?", choices: [], proposedAnswerText: "peut-être" });
    const made = await createQuiz(db, alice, { course: courseId }, 5);
    if (!made.ok) throw new Error(made.error);
    const item = (await getQuiz(db, alice, made.value.id))!.items[0]!;
    await answerQuizItem(db, alice, { quizId: made.value.id, itemId: item.id, response: { text: "x" } });
    expect(await rateQuizItem(db, alice, { quizId: made.value.id, itemId: item.id, rating: "got_it" })).toEqual({ ok: false, error: "cannotRate" });
    expect((await getQuiz(db, alice, made.value.id))!.score).toMatchObject({ scored: 0, unscored: 1, percent: null });
  });
});

describe("exports", () => {
  const body = async (kind: Parameters<typeof buildExport>[2]["kind"], format: "csv" | "tsv" = "csv", scope = {}) => {
    const file = await buildExport(db, alice, { kind, format, scope }, labels, new Date("2026-11-01T12:00:00Z"));
    if (!file.ok) throw new Error(file.error);
    return file.value;
  };

  it("escapes formulas in every kind of export", async () => {
    await published({ questionText: '=HYPERLINK("http://example.com","clic")', topic: "@sujet", choices: [{ text: "+1", proposedCorrect: true }, { text: "-2", proposedCorrect: false }] });
    await createPersonalCard(db, alice, card("=1+1", "@SUM(A1)"));

    const questions = await body("questions");
    expect(questions.body).toContain(`"'=HYPERLINK(""http://example.com"",""clic"")"`);
    expect(questions.body).toContain("'@sujet");
    const lines = questions.body.replace("﻿", "").split("\r\n").filter(Boolean);
    expect(lines).toHaveLength(2);
    // No cell of the file starts with a dangerous character after the guard.
    const cards = await body("cards");
    expect(cards.body).toContain("'=1+1");
    expect(cards.body).toContain("'@SUM(A1)");
    const anki = await body("anki", "tsv");
    expect(anki.body).not.toMatch(/(^|\t|\n)[=@]/);
    expect(anki.body).toContain("'=1+1");
  });

  it("includes source attribution and keeps verified answers apart from proposals", async () => {
    const v = await verified({ examTerm: "fall", provenance: "released", questionText: "Question vérifiée ?" }, [false, true, false]);
    const p = await published({ questionText: "Question proposée ?" });
    const file = await body("questions");
    expect(file.contentType).toBe("text/csv; charset=utf-8");
    expect(file.filename).toBe("dentiq-questions-2026-11-01.csv");
    const header = file.body.replace("﻿", "").split("\r\n")[0]!;
    for (const column of ["course_code", "exam_year", "exam_term", "source", "answer_status", "answer_verified", "answer_proposed_unverified"]) expect(header).toContain(column);

    const rows = file.body.replace("﻿", "").split("\r\n").slice(1).filter(Boolean);
    const verifiedRow = rows.find((r) => r.includes(v))!;
    expect(verifiedRow).toContain("TEST 1001");
    expect(verifiedRow).toContain(thisYear);
    expect(verifiedRow).toContain(",fall,released,");
    expect(verifiedRow).toContain(",verified,");
    const proposedRow = rows.find((r) => r.includes(p))!;
    expect(proposedRow).toContain(",proposed_unverified,");
    // For a proposal the verified column is empty and the proposal sits in its own column.
    expect(proposedRow).toMatch(/proposed_unverified,,"?A\. Réponse A/);
  });

  it("writes a plain tab-separated Anki file with Front, Back and Tags, marking unverified answers", async () => {
    await verified({ questionText: "Vérifiée ?" });
    await published({ questionText: "Proposée seulement ?" });
    const file = await body("anki", "csv"); // the format option is ignored: Anki is always tab separated
    expect(file.contentType).toBe("text/tab-separated-values; charset=utf-8");
    expect(file.filename).toMatch(/\.tsv$/);
    expect(file.body.startsWith("#separator:tab\n#html:true\n#tags column:3\n")).toBe(true);
    const rows = file.body.split("\n").filter((l) => l && !l.startsWith("#")).map((l) => l.split("\t"));
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.length === 3)).toBe(true);
    const proposed = rows.find((r) => r[0]!.includes("Proposée seulement"))!;
    expect(proposed[1]).toContain("NOT verified");
    expect(proposed[2]).toContain("unverified");
    expect(proposed[2]).toContain("TEST_1001");
    const ver = rows.find((r) => r[0]!.includes("Vérifiée"))!;
    expect(ver[1]).toContain("Verified answer");
    expect(ver[2]).not.toContain("unverified");
    expect(ver[0]).toContain("<br>");
  });

  it("follows the scope: another course's questions are left out", async () => {
    await published({ questionText: "Dans le cours un ?" });
    await published({ courseId: otherCourseId, questionText: "Dans le cours deux ?" });
    const one = await body("questions", "csv", { course: courseId });
    expect(one.body).toContain("cours un");
    expect(one.body).not.toContain("cours deux");
    const all = await body("questions");
    expect(all.body).toContain("cours deux");
  });

  it("exports only the student's own progress, never hidden questions", async () => {
    const id = await verified();
    await submitAttempt(db, alice, { questionId: id, response: { selected: [1] } });
    const mine = await body("progress");
    expect(mine.body.trim().split(/\r?\n/)).toHaveLength(2);
    expect(mine.body).toContain("correct");
    expect(mine.body).toContain(",verified,");
    await moderateQuestion(db, mod, id, "hide", "Retirée");
    expect((await body("progress")).body.trim().split(/\r?\n/)).toHaveLength(1);
  });

  it("exports published questions only, even for a moderator (no pending questions)", async () => {
    await pending({ questionText: "Question en attente du modérateur ?" });
    const file = await buildExport(db, mod, { kind: "questions", format: "csv", scope: {} }, labels);
    if (!file.ok) throw new Error(file.error);
    expect(file.value.body).not.toContain("en attente");
    expect(await db.select({ id: examQuestions.id }).from(examQuestions)).toHaveLength(1);
  });
});
