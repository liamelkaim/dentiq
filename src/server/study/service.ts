// Study tools: business rules. Every function takes the database explicitly and the viewer, and EVERY query that
// touches personal data filters on `viewer.id`, so a student can only ever read or change their own attempts, marks,
// cards and quizzes. Exam questions are read only through ./questions.ts (published and visible to the viewer).
//
// Honesty rules (tested in tests/study-tools.test.ts):
//  - An answer is scored only against a VERIFIED answer; a proposal or no answer gives "unscored".
//  - Counts and scores come from stored attempts only: nothing is estimated, and with no data the pages say so.
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import {
  courses,
  examQuestions,
  studyAttempts,
  studyCardReviews,
  studyPersonalCards,
  studyQuestionCards,
  studyQuestionMarks,
  studyQuizItems,
  studyQuizzes,
  type AttemptMode,
  type AttemptOutcome,
  type SelfRating,
} from "@/db/schema";
import { canAccessLibrary, type Viewer } from "@/server/resources/service";
import { buildReveal, gradeResponse, outcomeForSelfRating, scoreQuiz, studyResponseSchema, validateResponse, type QuizScore, type Reveal, type StudyResponse } from "./grading";
import { NEW_CARDS_PER_SESSION, PERSONAL_CARD_TEXT_MAX, PERSONAL_CARDS_MAX, PROGRESS_LIST_LIMIT, QUIZ_HISTORY_LIMIT, QUIZ_MAX_QUESTIONS, REVIEW_SESSION_MAX } from "./constants";
import { loadStudyQuestions, studyPool, toPublicQuestion, type PublicQuestion, type StudyExecutor, type StudyQuestion } from "./questions";
import { isDue, newSchedule, nextSchedule, type CardRatingValue, type CardSchedule } from "./schedule";
import { seededShuffle, type StudyScope } from "./scope";

export type StudyResult<T> = { ok: true; value: T } | { ok: false; error: string };
const fail = (error: string) => ({ ok: false as const, error });

type Executor = StudyExecutor;

/** What is kept of an answer: only the fields that belong to the question's type. */
function cleanResponse(q: StudyQuestion, r: StudyResponse): Record<string, unknown> {
  switch (q.rule) {
    case "single":
    case "multiple":
      return { selected: [...new Set(r.selected ?? [])].sort((a, b) => a - b) };
    case "perChoice":
      return { verdicts: r.verdicts ?? {} };
    case "text":
      return { text: r.text?.trim() ?? "", ...(r.selfRating ? { selfRating: r.selfRating } : {}) };
  }
}

// ---------- Marks (flag, review later) ----------

export type Marks = { flagged: boolean; reviewLater: boolean };

export async function getMarks(db: Executor, viewer: Viewer, questionIds: readonly string[]): Promise<Map<string, Marks>> {
  if (questionIds.length === 0) return new Map();
  const rows = await db
    .select()
    .from(studyQuestionMarks)
    .where(and(eq(studyQuestionMarks.userId, viewer.id), inArray(studyQuestionMarks.questionId, [...questionIds])));
  return new Map(rows.map((r) => [r.questionId, { flagged: r.flagged, reviewLater: r.reviewLater }]));
}

export const markInputSchema = z.object({
  questionId: z.uuid(),
  flagged: z.boolean().optional(),
  reviewLater: z.boolean().optional(),
});

export async function setMark(db: Database, viewer: Viewer, input: z.output<typeof markInputSchema>): Promise<StudyResult<Marks>> {
  if (!canAccessLibrary(viewer)) return fail("noAccess");
  const [q] = await loadStudyQuestions(db, viewer, [input.questionId]);
  if (!q) return fail("questionNotFound");
  const current = (await getMarks(db, viewer, [q.id])).get(q.id) ?? { flagged: false, reviewLater: false };
  const next = { flagged: input.flagged ?? current.flagged, reviewLater: input.reviewLater ?? current.reviewLater };
  await db
    .insert(studyQuestionMarks)
    .values({ userId: viewer.id, questionId: q.id, ...next })
    .onConflictDoUpdate({ target: [studyQuestionMarks.userId, studyQuestionMarks.questionId], set: { ...next, updatedAt: new Date() } });
  return { ok: true, value: next };
}

// ---------- Practice ----------

export const attemptInputSchema = z.object({ questionId: z.uuid(), response: studyResponseSchema });

export type AttemptResult = { outcome: AttemptOutcome; answerBasis: "verified" | "proposed" | "none"; reveal: Reveal; marks: Marks };

/** Records one practice answer and returns what to show: the outcome and the (labelled) answer. */
export async function submitAttempt(db: Database, viewer: Viewer, input: z.output<typeof attemptInputSchema>, mode: AttemptMode = "practice"): Promise<StudyResult<AttemptResult>> {
  if (!canAccessLibrary(viewer)) return fail("noAccess");
  const [q] = await loadStudyQuestions(db, viewer, [input.questionId]);
  if (!q) return fail("questionNotFound");
  const problem = validateResponse(q, input.response, { requireSelfRating: true });
  if (problem) return fail(problem);

  const graded = gradeResponse(q, input.response);
  // Practice always has a self-rating for open questions, so the outcome is never pending here.
  const outcome = graded.outcome ?? "unscored";
  await db.insert(studyAttempts).values({
    userId: viewer.id,
    questionId: q.id,
    mode,
    outcome,
    answerBasis: graded.answerBasis,
    response: cleanResponse(q, input.response),
    selfRating: q.rule === "text" ? (input.response.selfRating ?? null) : null,
  });
  const marks = (await getMarks(db, viewer, [q.id])).get(q.id) ?? { flagged: false, reviewLater: false };
  return { ok: true, value: { outcome, answerBasis: graded.answerBasis, reveal: buildReveal(q), marks } };
}

/** Shows the answer of an open question before the student rates themselves. Records nothing. */
export async function revealAnswer(db: Database, viewer: Viewer, questionId: string): Promise<StudyResult<Reveal>> {
  if (!canAccessLibrary(viewer)) return fail("noAccess");
  const [q] = await loadStudyQuestions(db, viewer, [questionId]);
  if (!q) return fail("questionNotFound");
  return { ok: true, value: buildReveal(q) };
}

/** A shuffled, capped set of questions for a practice session or quiz. The shuffle is stable for the same seed. */
export async function pickQuestions(db: Database, viewer: Viewer, scope: StudyScope, count: number, seed: string): Promise<{ questions: StudyQuestion[]; poolSize: number }> {
  const pool = await studyPool(db, viewer, scope);
  const chosen = seededShuffle(pool, seed).slice(0, count);
  return { questions: await loadStudyQuestions(db, viewer, chosen), poolSize: pool.length };
}

export { toPublicQuestion };

// ---------- Personal cards ----------

const blankToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

export const personalCardSchema = z.object({
  front: z.string().trim().min(1, { message: "required" }).max(PERSONAL_CARD_TEXT_MAX),
  back: z.string().trim().min(1, { message: "required" }).max(PERSONAL_CARD_TEXT_MAX),
  courseId: z.preprocess(blankToNull, z.uuid().nullish()).transform((v) => v ?? null),
});
export type PersonalCardInput = z.output<typeof personalCardSchema>;

async function courseExists(db: Executor, courseId: string) {
  const [row] = await db.select({ id: courses.id }).from(courses).where(and(eq(courses.id, courseId), isNull(courses.archivedAt)));
  return Boolean(row);
}

export async function createPersonalCard(db: Database, viewer: Viewer, input: PersonalCardInput): Promise<StudyResult<{ id: string }>> {
  if (!canAccessLibrary(viewer)) return fail("noAccess");
  if (input.courseId && !(await courseExists(db, input.courseId))) return fail("courseNotFound");
  const [owned] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(studyPersonalCards).where(eq(studyPersonalCards.userId, viewer.id));
  if ((owned?.n ?? 0) >= PERSONAL_CARDS_MAX) return fail("tooManyCards");
  const [row] = await db.insert(studyPersonalCards).values({ userId: viewer.id, courseId: input.courseId, front: input.front, back: input.back }).returning({ id: studyPersonalCards.id });
  return { ok: true, value: { id: row!.id } };
}

export async function updatePersonalCard(db: Database, viewer: Viewer, id: string, input: PersonalCardInput): Promise<StudyResult<null>> {
  if (!canAccessLibrary(viewer)) return fail("noAccess");
  if (input.courseId && !(await courseExists(db, input.courseId))) return fail("courseNotFound");
  const updated = await db
    .update(studyPersonalCards)
    .set({ front: input.front, back: input.back, courseId: input.courseId })
    .where(and(eq(studyPersonalCards.id, id), eq(studyPersonalCards.userId, viewer.id)))
    .returning({ id: studyPersonalCards.id });
  return updated.length ? { ok: true, value: null } : fail("cardNotFound");
}

export async function deletePersonalCard(db: Database, viewer: Viewer, id: string): Promise<StudyResult<null>> {
  const deleted = await db
    .delete(studyPersonalCards)
    .where(and(eq(studyPersonalCards.id, id), eq(studyPersonalCards.userId, viewer.id)))
    .returning({ id: studyPersonalCards.id });
  return deleted.length ? { ok: true, value: null } : fail("cardNotFound");
}

const personalColumns = {
  id: studyPersonalCards.id,
  courseId: studyPersonalCards.courseId,
  courseCode: courses.code,
  front: studyPersonalCards.front,
  back: studyPersonalCards.back,
  box: studyPersonalCards.box,
  dueAt: studyPersonalCards.dueAt,
  reviewCount: studyPersonalCards.reviewCount,
  createdAt: studyPersonalCards.createdAt,
};

/** The student's own cards, newest first. */
export async function listPersonalCards(db: Database, viewer: Viewer, courseId?: string) {
  return db
    .select(personalColumns)
    .from(studyPersonalCards)
    .leftJoin(courses, eq(studyPersonalCards.courseId, courses.id))
    .where(and(eq(studyPersonalCards.userId, viewer.id), courseId ? eq(studyPersonalCards.courseId, courseId) : undefined))
    .orderBy(desc(studyPersonalCards.createdAt));
}

/** One of the student's own cards, or null (including when it belongs to someone else). */
export async function getPersonalCard(db: Database, viewer: Viewer, id: string) {
  if (!z.uuid().safeParse(id).success) return null;
  const [row] = await db
    .select(personalColumns)
    .from(studyPersonalCards)
    .leftJoin(courses, eq(studyPersonalCards.courseId, courses.id))
    .where(and(eq(studyPersonalCards.id, id), eq(studyPersonalCards.userId, viewer.id)));
  return row ?? null;
}

// ---------- Flashcard review ----------

export type ReviewItem =
  | { kind: "question"; id: string; box: number; question: StudyQuestion }
  | { kind: "personal"; id: string; box: number; front: string; back: string; courseCode: string | null };

export type CardOverview = {
  /** Cards that could be generated from published questions in the scope. */
  generated: number;
  generatedStarted: number;
  generatedNew: number;
  generatedDue: number;
  personal: number;
  personalNew: number;
  personalDue: number;
  /** Due now (started cards whose time has come) and never-seen cards, before the per-session limits. */
  dueTotal: number;
  newTotal: number;
};

/** Personal cards only take part when the scope is nothing but a course (they have no topic, year or type). */
const includesPersonal = (scope: StudyScope) => !scope.topic && !scope.year && !scope.type && !scope.period && !scope.mark;

async function cardCandidates(db: Database, viewer: Viewer, scope: StudyScope, now: Date) {
  const pool = await studyPool(db, viewer, scope, { now });
  const [states, personal] = await Promise.all([
    pool.length
      ? db.select().from(studyQuestionCards).where(and(eq(studyQuestionCards.userId, viewer.id), inArray(studyQuestionCards.questionId, pool)))
      : Promise.resolve([]),
    includesPersonal(scope)
      ? db
          .select()
          .from(studyPersonalCards)
          .where(and(eq(studyPersonalCards.userId, viewer.id), scope.course ? eq(studyPersonalCards.courseId, scope.course) : undefined))
      : Promise.resolve([]),
  ]);
  const stateByQuestion = new Map(states.map((s) => [s.questionId, s]));
  const dueStates = states.filter((s) => isDue(s.dueAt, now)).sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
  const newQuestions = pool.filter((id) => !stateByQuestion.has(id));
  const duePersonal = personal.filter((c) => c.reviewCount > 0 && isDue(c.dueAt, now)).sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
  const newPersonal = personal.filter((c) => c.reviewCount === 0).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  return { pool, states, dueStates, newQuestions, personal, duePersonal, newPersonal };
}

export async function cardOverview(db: Database, viewer: Viewer, scope: StudyScope, now: Date = new Date()): Promise<CardOverview> {
  if (!canAccessLibrary(viewer)) {
    return { generated: 0, generatedStarted: 0, generatedNew: 0, generatedDue: 0, personal: 0, personalNew: 0, personalDue: 0, dueTotal: 0, newTotal: 0 };
  }
  const c = await cardCandidates(db, viewer, scope, now);
  return {
    generated: c.pool.length,
    generatedStarted: c.states.length,
    generatedNew: c.newQuestions.length,
    generatedDue: c.dueStates.length,
    personal: c.personal.length,
    personalNew: c.newPersonal.length,
    personalDue: c.duePersonal.length,
    dueTotal: c.dueStates.length + c.duePersonal.length,
    newTotal: c.newQuestions.length + c.newPersonal.length,
  };
}

/**
 * The cards to review now: due cards first (oldest due first), then never-seen cards up to NEW_CARDS_PER_SESSION,
 * at most REVIEW_SESSION_MAX in all. Cards from questions are built only from questions the viewer may study.
 */
export async function buildReviewQueue(db: Database, viewer: Viewer, scope: StudyScope, now: Date = new Date()): Promise<ReviewItem[]> {
  if (!canAccessLibrary(viewer)) return [];
  const c = await cardCandidates(db, viewer, scope, now);

  type Slot = { kind: "question" | "personal"; id: string; box: number; dueAt: number };
  const due: Slot[] = [
    ...c.dueStates.map((s) => ({ kind: "question" as const, id: s.questionId, box: s.box, dueAt: s.dueAt.getTime() })),
    ...c.duePersonal.map((p) => ({ kind: "personal" as const, id: p.id, box: p.box, dueAt: p.dueAt.getTime() })),
  ].sort((a, b) => a.dueAt - b.dueAt);
  const fresh: Slot[] = [
    ...c.newPersonal.map((p) => ({ kind: "personal" as const, id: p.id, box: 0, dueAt: 0 })),
    ...c.newQuestions.map((id) => ({ kind: "question" as const, id, box: 0, dueAt: 0 })),
  ].slice(0, NEW_CARDS_PER_SESSION);
  const slots = [...due, ...fresh].slice(0, REVIEW_SESSION_MAX);

  const questions = await loadStudyQuestions(db, viewer, slots.filter((s) => s.kind === "question").map((s) => s.id));
  const byQuestion = new Map(questions.map((q) => [q.id, q]));
  const personalById = new Map(c.personal.map((p) => [p.id, p]));
  const codes = new Map<string, string>();
  const courseIds = [...new Set(c.personal.map((p) => p.courseId).filter((v): v is string => Boolean(v)))];
  if (courseIds.length) {
    for (const row of await db.select({ id: courses.id, code: courses.code }).from(courses).where(inArray(courses.id, courseIds))) codes.set(row.id, row.code);
  }

  const items: ReviewItem[] = [];
  for (const slot of slots) {
    if (slot.kind === "question") {
      const question = byQuestion.get(slot.id);
      if (question) items.push({ kind: "question", id: slot.id, box: slot.box, question });
    } else {
      const p = personalById.get(slot.id);
      if (p) items.push({ kind: "personal", id: p.id, box: slot.box, front: p.front, back: p.back, courseCode: p.courseId ? (codes.get(p.courseId) ?? null) : null });
    }
  }
  return items;
}

export const reviewInputSchema = z.object({
  kind: z.enum(["question", "personal"]),
  id: z.uuid(),
  rating: z.enum(["again", "hard", "good", "easy"]),
});

/** Applies a rating to a card (the schedule rule lives in ./schedule.ts) and logs the review. */
export async function reviewCard(db: Database, viewer: Viewer, input: z.output<typeof reviewInputSchema>, now: Date = new Date()): Promise<StudyResult<{ box: number; dueAt: Date }>> {
  if (!canAccessLibrary(viewer)) return fail("noAccess");
  const rating: CardRatingValue = input.rating;

  if (input.kind === "question") {
    const [q] = await loadStudyQuestions(db, viewer, [input.id]);
    if (!q) return fail("questionNotFound");
    return db.transaction(async (tx) => {
      const [state] = await tx
        .select()
        .from(studyQuestionCards)
        .where(and(eq(studyQuestionCards.userId, viewer.id), eq(studyQuestionCards.questionId, q.id)));
      const current: CardSchedule = state ?? newSchedule(now);
      const next = nextSchedule(current, rating, now);
      await tx
        .insert(studyQuestionCards)
        .values({ userId: viewer.id, questionId: q.id, ...next })
        .onConflictDoUpdate({ target: [studyQuestionCards.userId, studyQuestionCards.questionId], set: next });
      await tx.insert(studyCardReviews).values({ userId: viewer.id, questionId: q.id, rating, boxBefore: current.box, boxAfter: next.box, createdAt: now });
      return { ok: true as const, value: { box: next.box, dueAt: next.dueAt } };
    });
  }

  return db.transaction(async (tx) => {
    const [card] = await tx
      .select()
      .from(studyPersonalCards)
      .where(and(eq(studyPersonalCards.id, input.id), eq(studyPersonalCards.userId, viewer.id)));
    if (!card) return fail("cardNotFound");
    const next = nextSchedule(card, rating, now);
    await tx.update(studyPersonalCards).set(next).where(eq(studyPersonalCards.id, card.id));
    await tx.insert(studyCardReviews).values({ userId: viewer.id, personalCardId: card.id, rating, boxBefore: card.box, boxAfter: next.box, createdAt: now });
    return { ok: true as const, value: { box: next.box, dueAt: next.dueAt } };
  });
}

// ---------- Quizzes ----------

/** Creates a quiz of up to `count` (never more than QUIZ_MAX_QUESTIONS) published questions from the scope. */
export async function createQuiz(db: Database, viewer: Viewer, scope: StudyScope, count: number): Promise<StudyResult<{ id: string; size: number; poolSize: number }>> {
  if (!canAccessLibrary(viewer)) return fail("noAccess");
  if (!scope.course) return fail("courseRequired");
  const wanted = Math.min(Math.max(Math.trunc(count) || 1, 1), QUIZ_MAX_QUESTIONS);
  const pool = await studyPool(db, viewer, scope);
  if (pool.length === 0) return fail("noQuestions");
  const chosen = seededShuffle(pool, randomUUID()).slice(0, wanted);

  const id = await db.transaction(async (tx) => {
    const [quiz] = await tx
      .insert(studyQuizzes)
      .values({ userId: viewer.id, courseId: scope.course ?? null, scope: { ...scope }, requestedCount: wanted })
      .returning({ id: studyQuizzes.id });
    await tx.insert(studyQuizItems).values(chosen.map((questionId, i) => ({ quizId: quiz!.id, position: i + 1, questionId })));
    return quiz!.id;
  });
  return { ok: true, value: { id, size: chosen.length, poolSize: pool.length } };
}

export type QuizItemView = {
  id: string;
  position: number;
  answered: boolean;
  /** Null when the question is no longer published or visible; it is then skipped. */
  question: PublicQuestion | null;
  /** Only filled once the quiz is complete (so the quiz cannot be peeked at while it is being taken). */
  result: null | {
    response: Record<string, unknown> | null;
    outcome: AttemptOutcome | null;
    answerBasis: "verified" | "proposed" | "none" | null;
    selfRating: SelfRating | null;
    reveal: Reveal | null;
  };
};

export type QuizView = {
  id: string;
  createdAt: Date;
  completedAt: Date | null;
  scope: Record<string, unknown>;
  requestedCount: number;
  courseCode: string | null;
  complete: boolean;
  items: QuizItemView[];
  /** Null until the quiz is complete. */
  score: QuizScore | null;
};

/**
 * A quiz is complete when it was marked complete, or when no unanswered item can still be answered (items whose
 * question is no longer available do not hold it open). getQuiz and rateQuizItem both use THIS rule, so a quiz the
 * student sees as complete is always one they can rate.
 */
function quizIsComplete(completedAt: Date | null, items: readonly { answeredAt: Date | null; questionId: string }[], availableQuestionIds: ReadonlySet<string>): boolean {
  if (completedAt !== null) return true;
  return !items.some((i) => !i.answeredAt && availableQuestionIds.has(i.questionId));
}

/** One of the student's own quizzes, or null (including when it belongs to someone else). */
export async function getQuiz(db: Database, viewer: Viewer, id: string): Promise<QuizView | null> {
  if (!canAccessLibrary(viewer) || !z.uuid().safeParse(id).success) return null;
  const [row] = await db
    .select({ quiz: studyQuizzes, courseCode: courses.code })
    .from(studyQuizzes)
    .leftJoin(courses, eq(studyQuizzes.courseId, courses.id))
    .where(and(eq(studyQuizzes.id, id), eq(studyQuizzes.userId, viewer.id)));
  if (!row) return null;
  const items = await db.select().from(studyQuizItems).where(eq(studyQuizItems.quizId, id)).orderBy(asc(studyQuizItems.position));
  const questions = new Map((await loadStudyQuestions(db, viewer, items.map((i) => i.questionId))).map((q) => [q.id, q]));

  const complete = quizIsComplete(row.quiz.completedAt, items, new Set(questions.keys()));
  const views: QuizItemView[] = items.map((i) => {
    const q = questions.get(i.questionId) ?? null;
    return {
      id: i.id,
      position: i.position,
      answered: i.answeredAt !== null,
      question: q ? toPublicQuestion(q) : null,
      result: complete
        ? { response: i.response, outcome: i.outcome, answerBasis: i.answerBasis, selfRating: i.selfRating, reveal: q ? buildReveal(q) : null }
        : null,
    };
  });
  return {
    id: row.quiz.id,
    createdAt: row.quiz.createdAt,
    completedAt: row.quiz.completedAt,
    scope: row.quiz.scope,
    requestedCount: row.quiz.requestedCount,
    courseCode: row.courseCode,
    complete,
    items: views,
    score: complete ? scoreQuiz(items.map((i) => ({ answered: i.answeredAt !== null, outcome: i.outcome }))) : null,
  };
}

export const quizAnswerSchema = z.object({ quizId: z.uuid(), itemId: z.uuid(), response: studyResponseSchema });

/** Stores one quiz answer. Nothing is revealed until the quiz is complete. */
export async function answerQuizItem(db: Database, viewer: Viewer, input: z.output<typeof quizAnswerSchema>): Promise<StudyResult<{ complete: boolean }>> {
  if (!canAccessLibrary(viewer)) return fail("noAccess");
  const [row] = await db
    .select({ item: studyQuizItems, quiz: studyQuizzes })
    .from(studyQuizItems)
    .innerJoin(studyQuizzes, eq(studyQuizItems.quizId, studyQuizzes.id))
    .where(and(eq(studyQuizItems.id, input.itemId), eq(studyQuizItems.quizId, input.quizId), eq(studyQuizzes.userId, viewer.id)));
  if (!row) return fail("quizNotFound");
  if (row.item.answeredAt) return fail("alreadyAnswered");
  const [q] = await loadStudyQuestions(db, viewer, [row.item.questionId]);
  if (!q) return fail("questionNotFound");
  const problem = validateResponse(q, input.response, { requireSelfRating: false });
  if (problem) return fail(problem);

  const graded = gradeResponse(q, input.response);
  const now = new Date();
  const complete = await db.transaction(async (tx) => {
    // The answered-at guard makes a double submit a no-op instead of a second row.
    const updated = await tx
      .update(studyQuizItems)
      .set({ response: cleanResponse(q, input.response), outcome: graded.outcome, answerBasis: graded.answerBasis, answeredAt: now })
      .where(and(eq(studyQuizItems.id, row.item.id), isNull(studyQuizItems.answeredAt)))
      .returning({ id: studyQuizItems.id });
    if (updated.length === 0) return null;
    if (graded.outcome !== null) {
      await tx.insert(studyAttempts).values({
        userId: viewer.id,
        questionId: q.id,
        mode: "quiz",
        outcome: graded.outcome,
        answerBasis: graded.answerBasis,
        response: cleanResponse(q, input.response),
      });
    }
    const items = await tx.select().from(studyQuizItems).where(eq(studyQuizItems.quizId, row.quiz.id));
    const left = items.filter((i) => !i.answeredAt);
    // Items whose question is no longer available cannot be answered; they do not hold the quiz open.
    const stillAnswerable = left.length ? await loadStudyQuestions(tx, viewer, left.map((i) => i.questionId)) : [];
    const done = stillAnswerable.length === 0;
    if (done) await tx.update(studyQuizzes).set({ completedAt: now }).where(eq(studyQuizzes.id, row.quiz.id));
    return done;
  });
  if (complete === null) return fail("alreadyAnswered");
  return { ok: true, value: { complete } };
}

export const quizRatingSchema = z.object({ quizId: z.uuid(), itemId: z.uuid(), rating: z.enum(["got_it", "partly", "missed"]) });

/** The student's self-rating of an open question, once the quiz is complete and the question had a verified answer. */
export async function rateQuizItem(db: Database, viewer: Viewer, input: z.output<typeof quizRatingSchema>): Promise<StudyResult<null>> {
  if (!canAccessLibrary(viewer)) return fail("noAccess");
  const [row] = await db
    .select({ item: studyQuizItems, quiz: studyQuizzes })
    .from(studyQuizItems)
    .innerJoin(studyQuizzes, eq(studyQuizItems.quizId, studyQuizzes.id))
    .where(and(eq(studyQuizItems.id, input.itemId), eq(studyQuizItems.quizId, input.quizId), eq(studyQuizzes.userId, viewer.id)));
  if (!row) return fail("quizNotFound");
  if (!row.quiz.completedAt) {
    // Same derivation as getQuiz: the page shows the quiz as complete when nothing answerable is left, even though
    // completedAt was never written (a question was hidden meanwhile). It must then be possible to rate.
    const items = await db.select({ answeredAt: studyQuizItems.answeredAt, questionId: studyQuizItems.questionId }).from(studyQuizItems).where(eq(studyQuizItems.quizId, row.quiz.id));
    const open = items.filter((i) => !i.answeredAt);
    const available = open.length ? await loadStudyQuestions(db, viewer, open.map((i) => i.questionId)) : [];
    if (!quizIsComplete(null, items, new Set(available.map((q) => q.id)))) return fail("quizNotComplete");
  }
  if (!row.item.answeredAt || row.item.outcome !== null || row.item.answerBasis !== "verified") return fail("cannotRate");

  const outcome = outcomeForSelfRating(input.rating);
  const updated = await db.transaction(async (tx) => {
    const done = await tx
      .update(studyQuizItems)
      .set({ selfRating: input.rating, outcome })
      .where(and(eq(studyQuizItems.id, row.item.id), isNull(studyQuizItems.outcome)))
      .returning({ id: studyQuizItems.id });
    if (done.length === 0) return false;
    await tx.insert(studyAttempts).values({
      userId: viewer.id,
      questionId: row.item.questionId,
      mode: "quiz",
      outcome,
      answerBasis: "verified",
      response: { ...(row.item.response ?? {}), selfRating: input.rating },
      selfRating: input.rating,
    });
    return true;
  });
  return updated ? { ok: true, value: null } : fail("cannotRate");
}

/** The student's quizzes, newest first, each with the score computed from its stored answers. */
export async function listQuizzes(db: Database, viewer: Viewer, limit = QUIZ_HISTORY_LIMIT) {
  if (!canAccessLibrary(viewer)) return [];
  const quizzes = await db
    .select({ quiz: studyQuizzes, courseCode: courses.code })
    .from(studyQuizzes)
    .leftJoin(courses, eq(studyQuizzes.courseId, courses.id))
    .where(eq(studyQuizzes.userId, viewer.id))
    .orderBy(desc(studyQuizzes.createdAt))
    .limit(limit);
  if (quizzes.length === 0) return [];
  const items = await db
    .select({ quizId: studyQuizItems.quizId, answeredAt: studyQuizItems.answeredAt, outcome: studyQuizItems.outcome })
    .from(studyQuizItems)
    .where(inArray(studyQuizItems.quizId, quizzes.map((q) => q.quiz.id)));
  return quizzes.map(({ quiz, courseCode }) => {
    const own = items.filter((i) => i.quizId === quiz.id);
    return {
      id: quiz.id,
      createdAt: quiz.createdAt,
      completedAt: quiz.completedAt,
      courseCode,
      size: own.length,
      score: scoreQuiz(own.map((i) => ({ answered: i.answeredAt !== null, outcome: i.outcome }))),
    };
  });
}

// ---------- Progress ----------

export type CourseProgress = {
  courseId: string;
  code: string;
  titleFr: string;
  titleEn: string | null;
  attempts: number;
  questionsAnswered: number;
  correct: number;
  partial: number;
  incorrect: number;
  unscored: number;
};

export type MarkedQuestion = { id: string; courseCode: string; examAcademicYear: string; questionText: string; flagged: boolean; reviewLater: boolean };

export type Progress = {
  hasData: boolean;
  byCourse: CourseProgress[];
  totals: { attempts: number; questionsAnswered: number; correct: number; partial: number; incorrect: number; unscored: number };
  marks: { flagged: number; reviewLater: number };
  flagged: MarkedQuestion[];
  reviewLater: MarkedQuestion[];
  cards: { personal: number; questionCardsStarted: number; reviews: number };
  quizzes: { completed: number; inProgress: number };
};

const filterCount = (condition: ReturnType<typeof sql>) => sql<number>`count(*) filter (where ${condition})`.mapWith(Number);

/**
 * The student's own progress, from stored attempts only. Questions that are no longer published are left out, so
 * nothing about a hidden question is shown. With no activity `hasData` is false and every number is zero.
 */
export async function getProgress(db: Database, viewer: Viewer): Promise<Progress> {
  const empty: Progress = {
    hasData: false,
    byCourse: [],
    totals: { attempts: 0, questionsAnswered: 0, correct: 0, partial: 0, incorrect: 0, unscored: 0 },
    marks: { flagged: 0, reviewLater: 0 },
    flagged: [],
    reviewLater: [],
    cards: { personal: 0, questionCardsStarted: 0, reviews: 0 },
    quizzes: { completed: 0, inProgress: 0 },
  };
  if (!canAccessLibrary(viewer)) return empty;
  const a = studyAttempts;
  const published = eq(examQuestions.status, "published");

  const [byCourse, markRows, [personal], [started], [reviews], quizRows] = await Promise.all([
    db
      .select({
        courseId: courses.id,
        code: courses.code,
        titleFr: courses.titleFr,
        titleEn: courses.titleEn,
        attempts: sql<number>`count(*)`.mapWith(Number),
        questionsAnswered: sql<number>`count(distinct ${a.questionId})`.mapWith(Number),
        correct: filterCount(sql`${a.outcome} = 'correct'`),
        partial: filterCount(sql`${a.outcome} = 'partial'`),
        incorrect: filterCount(sql`${a.outcome} = 'incorrect'`),
        unscored: filterCount(sql`${a.outcome} = 'unscored'`),
      })
      .from(a)
      .innerJoin(examQuestions, eq(a.questionId, examQuestions.id))
      .innerJoin(courses, eq(examQuestions.courseId, courses.id))
      .where(and(eq(a.userId, viewer.id), published))
      .groupBy(courses.id, courses.code, courses.titleFr, courses.titleEn)
      .orderBy(asc(courses.code)),
    db
      .select({
        id: examQuestions.id,
        courseCode: courses.code,
        examAcademicYear: examQuestions.examAcademicYear,
        questionText: examQuestions.questionText,
        flagged: studyQuestionMarks.flagged,
        reviewLater: studyQuestionMarks.reviewLater,
      })
      .from(studyQuestionMarks)
      .innerJoin(examQuestions, eq(studyQuestionMarks.questionId, examQuestions.id))
      .innerJoin(courses, eq(examQuestions.courseId, courses.id))
      .where(and(eq(studyQuestionMarks.userId, viewer.id), published, or(eq(studyQuestionMarks.flagged, true), eq(studyQuestionMarks.reviewLater, true))))
      .orderBy(desc(studyQuestionMarks.updatedAt)),
    db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(studyPersonalCards).where(eq(studyPersonalCards.userId, viewer.id)),
    db
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(studyQuestionCards)
      .innerJoin(examQuestions, eq(studyQuestionCards.questionId, examQuestions.id))
      .where(and(eq(studyQuestionCards.userId, viewer.id), published)),
    db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(studyCardReviews).where(eq(studyCardReviews.userId, viewer.id)),
    db.select({ completedAt: studyQuizzes.completedAt }).from(studyQuizzes).where(eq(studyQuizzes.userId, viewer.id)),
  ]);

  const sum = (key: "attempts" | "questionsAnswered" | "correct" | "partial" | "incorrect" | "unscored") => byCourse.reduce((n, c) => n + c[key], 0);
  const flagged = markRows.filter((m) => m.flagged);
  const reviewLater = markRows.filter((m) => m.reviewLater);
  const progress: Progress = {
    hasData: false,
    byCourse,
    totals: {
      attempts: sum("attempts"),
      questionsAnswered: sum("questionsAnswered"),
      correct: sum("correct"),
      partial: sum("partial"),
      incorrect: sum("incorrect"),
      unscored: sum("unscored"),
    },
    marks: { flagged: flagged.length, reviewLater: reviewLater.length },
    flagged: flagged.slice(0, PROGRESS_LIST_LIMIT),
    reviewLater: reviewLater.slice(0, PROGRESS_LIST_LIMIT),
    cards: { personal: personal?.n ?? 0, questionCardsStarted: started?.n ?? 0, reviews: reviews?.n ?? 0 },
    quizzes: { completed: quizRows.filter((q) => q.completedAt).length, inProgress: quizRows.filter((q) => !q.completedAt).length },
  };
  progress.hasData =
    progress.totals.attempts > 0 ||
    progress.marks.flagged + progress.marks.reviewLater > 0 ||
    progress.cards.personal + progress.cards.questionCardsStarted + progress.cards.reviews > 0 ||
    quizRows.length > 0;
  return progress;
}

/** Courses that have published questions the viewer may study, for the scope pickers. */
export async function studyCourseChoices(db: Database, viewer: Viewer) {
  if (!canAccessLibrary(viewer)) return [];
  return db
    .selectDistinct({ id: courses.id, code: courses.code, titleFr: courses.titleFr, titleEn: courses.titleEn })
    .from(courses)
    .innerJoin(examQuestions, and(eq(examQuestions.courseId, courses.id), eq(examQuestions.status, "published")))
    .where(isNull(courses.archivedAt))
    .orderBy(asc(courses.code));
}

