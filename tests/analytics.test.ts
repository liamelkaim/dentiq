// Analytics: pure aggregation rules (accuracy, activity per day, weakest topics with a minimum sample) and database
// behaviour (only the viewer's own rows, unscored answers excluded from accuracy, nothing invented when empty).
// Fake data only (TEST courses, example.com accounts).
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase, type Database } from "@/db/client";
import { courses, courseTopics, examQuestions, questionTopics, studyAttempts, studyCardReviews, studyPersonalCards, studyQuizzes, user } from "@/db/schema";
import { accuracyOf, activityByDay, lastDays, weakestTopics, type TopicAnswer } from "@/server/analytics/aggregate";
import { ANALYTICS_ACTIVITY_DAYS, WEAKEST_TOPIC_MIN_SAMPLE } from "@/server/analytics/constants";
import { getAnalytics } from "@/server/analytics/service";
import { currentAcademicYear } from "@/server/passes/academic-year";
import { questionInputSchema, submitQuestion, verifyAnswer, type QuestionInput } from "@/server/passes/service";
import type { Viewer } from "@/server/resources/service";
import { createEntry } from "@/server/calendar/service";
import { createMemoryStorage } from "@/server/storage";
import { createPersonalCard, personalCardSchema, setMark, submitAttempt } from "@/server/study/service";

// ---------- Pure ----------

describe("accuracy", () => {
  it("counts a partly right answer as half a point and divides by scored answers only", () => {
    expect(accuracyOf({ correct: 3, partial: 2, incorrect: 5 })).toEqual({ scored: 10, points: 4, percent: 40 });
    expect(accuracyOf({ correct: 1, partial: 0, incorrect: 2 })).toEqual({ scored: 3, points: 1, percent: 33 });
  });

  it("has no percentage (never a fake 0%) when nothing was scored", () => {
    expect(accuracyOf({ correct: 0, partial: 0, incorrect: 0 })).toEqual({ scored: 0, points: 0, percent: null });
  });
});

describe("activity per day", () => {
  const today = "2026-11-01";

  it("lists the last N days ending today, oldest first", () => {
    expect(lastDays(today, 3)).toEqual(["2026-10-30", "2026-10-31", "2026-11-01"]);
    expect(lastDays("2026-03-01", 2)).toEqual(["2026-02-28", "2026-03-01"]);
  });

  it("keeps days without activity as zero and ignores events outside the window", () => {
    const rows = activityByDay(
      {
        answers: [new Date("2026-11-01T15:00:00Z"), new Date("2026-11-01T16:00:00Z"), new Date("2026-10-30T15:00:00Z"), new Date("2026-09-01T15:00:00Z")],
        reviews: [new Date("2026-11-01T15:00:00Z"), new Date("2027-01-01T15:00:00Z")],
      },
      today,
      3,
      "America/Toronto",
    );
    expect(rows).toEqual([
      { date: "2026-10-30", answers: 1, reviews: 0, total: 1 },
      { date: "2026-10-31", answers: 0, reviews: 0, total: 0 },
      { date: "2026-11-01", answers: 2, reviews: 1, total: 3 },
    ]);
  });

  it("assigns an event to the day in the configured time zone", () => {
    // 02:00 UTC on 1 November is still 31 October (evening) in Toronto.
    const rows = activityByDay({ answers: [new Date("2026-11-01T02:00:00Z")], reviews: [] }, today, 2, "America/Toronto");
    expect(rows.map((r) => [r.date, r.answers])).toEqual([["2026-10-31", 1], ["2026-11-01", 0]]);
  });
});

describe("weakest topics", () => {
  const answers = (key: string, outcomes: TopicAnswer["outcome"][], courseCode = "TEST 1001"): TopicAnswer[] =>
    outcomes.map((outcome) => ({ topicKey: key, label: key, courseCode, outcome }));
  const options = { minSample: 5, limit: 3 };

  it("makes no claim below the minimum sample", () => {
    const result = weakestTopics([...answers("Pulpe", ["incorrect", "incorrect", "incorrect", "incorrect"]), ...answers("Email", ["incorrect"])], options);
    expect(result).toMatchObject({ enough: false, topics: [], topicsBelowMinimum: 2, topicsRanked: 0 });
    expect(weakestTopics([], options)).toMatchObject({ enough: false, topics: [], topicsBelowMinimum: 0 });
  });

  it("ranks a topic once it reaches exactly the minimum, lowest accuracy first", () => {
    const result = weakestTopics(
      [
        ...answers("Pulpe", ["correct", "incorrect", "incorrect", "incorrect", "correct"]),
        ...answers("Email", ["correct", "correct", "correct", "incorrect", "correct", "correct"]),
        ...answers("Dentine", ["incorrect", "incorrect", "incorrect", "incorrect", "incorrect"]),
        ...answers("Rare", ["incorrect", "incorrect"]),
      ],
      options,
    );
    expect(result.enough).toBe(true);
    expect(result.topics.map((t) => [t.label, t.accuracy.percent, t.accuracy.scored])).toEqual([
      ["Dentine", 0, 5],
      ["Pulpe", 40, 5],
      ["Email", 83, 6],
    ]);
    expect(result.topicsBelowMinimum).toBe(1);
    expect(result.topicsRanked).toBe(3);
  });

  it("does not call a topic weak when it is at 100%, and respects the limit", () => {
    const perfect = weakestTopics(answers("Pulpe", ["correct", "correct", "correct", "correct", "correct"]), options);
    expect(perfect).toMatchObject({ enough: true, topics: [], topicsRanked: 1 });
    const many = weakestTopics(["A", "B", "C", "D"].flatMap((k) => answers(k, ["incorrect", "incorrect", "incorrect", "incorrect", "correct"])), { minSample: 5, limit: 2 });
    expect(many.topics).toHaveLength(2);
  });

  it("keeps the same topic name in two courses apart", () => {
    const result = weakestTopics(
      [
        ...answers("f:a:pulpe", ["incorrect", "incorrect", "incorrect"], "TEST A"),
        ...answers("f:b:pulpe", ["incorrect", "incorrect", "incorrect"], "TEST B"),
      ],
      options,
    );
    expect(result).toMatchObject({ enough: false, topicsBelowMinimum: 2 });
  });
});

// ---------- Database ----------

const thisYear = currentAcademicYear();
const viewer = (id: string, role: Viewer["role"], approved = true): Viewer => ({ id, role, emailVerified: true, approvalStatus: approved ? "approved" : "pending" });
const alice = viewer("alice", "student");
const bob = viewer("bob", "student");
const carol = viewer("carol", "student", false);
const mod = viewer("mod", "moderator");
const now = new Date();

let db: Database;
let storage: ReturnType<typeof createMemoryStorage>;
let courseId: string;
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

async function published(overrides: Record<string, unknown> = {}) {
  const result = await submitQuestion(db, storage, mod, input(overrides), []);
  if (!result.ok) throw new Error(result.error);
  return result.value.id;
}

/** A published question with a verified answer: choice A is the right one. */
async function verified(overrides: Record<string, unknown> = {}) {
  const id = await published(overrides);
  const r = await verifyAnswer(db, mod, id, { choices: [true, false, false] }, "Vérifié avec le manuel de référence du cours");
  if (!r.ok) throw new Error(r.error);
  return id;
}

const answer = async (who: Viewer, questionId: string, selected: number) => {
  const r = await submitAttempt(db, who, { questionId, response: { selected: [selected] } });
  if (!r.ok) throw new Error(r.error);
  return r.value.outcome;
};

beforeEach(async () => {
  db = await createTestDatabase();
  storage = createMemoryStorage();
  await db.insert(user).values([alice, bob, carol, mod].map((v) => ({ id: v.id, name: v.id, email: `${v.id}@example.com`, emailVerified: true, role: v.role, approvalStatus: v.approvalStatus })));
  const [c] = await db.insert(courses).values({ code: "TEST 1001", titleFr: "Cours fictif" }).returning();
  courseId = c!.id;
});

describe("analytics: nothing invented", () => {
  it("is empty, with no numbers made up, for a student with no activity", async () => {
    await verified();
    const a = await getAnalytics(db, alice, "fr", now);
    expect(a.hasAnyData).toBe(false);
    expect(a.totals).toMatchObject({ attempts: 0, scored: 0, unscored: 0, accuracy: { scored: 0, percent: null } });
    expect(a.byCourse).toEqual([]);
    expect(a.activity.days).toHaveLength(ANALYTICS_ACTIVITY_DAYS);
    expect(a.activity).toMatchObject({ activeDays: 0, answers: 0, reviews: 0 });
    expect(a.topics).toMatchObject({ enough: false, topics: [] });
    expect(a.quizzes).toMatchObject({ completed: [], completedCount: 0 });
    expect(a.calendar).toEqual({ total: 0, upcoming: 0, next: null, nextExam: null });
    expect(a.cards.due).toBe(0);
  });

  it("gives nothing to an account that is not approved", async () => {
    await verified();
    expect((await getAnalytics(db, carol, "en", now)).hasAnyData).toBe(false);
  });
});

describe("analytics: only the viewer's own rows", () => {
  it("never mixes in another student's answers, marks, cards, reviews, quizzes or calendar entries", async () => {
    const q = await verified({ topic: "Pulpe" });
    await answer(alice, q, 1);
    await answer(bob, q, 2);
    await answer(bob, q, 2);
    await answer(bob, q, 3);
    await setMark(db, bob, { questionId: q, flagged: true });
    await createPersonalCard(db, bob, personalCardSchema.parse({ front: "Recto Bob", back: "Verso Bob" }));
    await createEntry(db, bob, { title: "TEST Examen de Bob", date: "2099-01-01", kind: "exam" });
    await db.insert(studyQuizzes).values({ userId: "bob", scope: {}, requestedCount: 1, completedAt: new Date() });

    const a = await getAnalytics(db, alice, "en", now);
    expect(a.totals).toMatchObject({ attempts: 1, scored: 1, unscored: 0, questionsAnswered: 1 });
    expect(a.totals.accuracy).toEqual({ scored: 1, points: 1, percent: 100 });
    expect(a.byCourse).toHaveLength(1);
    expect(a.byCourse[0]).toMatchObject({ code: "TEST 1001", attempts: 1, correct: 1, incorrect: 0 });
    expect(a.activity.answers).toBe(1);
    expect(a.marks).toEqual({ flagged: 0, reviewLater: 0 });
    expect(a.cards.total).toBe(1); // the one published question, no personal cards of Bob's
    expect(a.quizzes).toMatchObject({ completed: [], inProgress: 0 });
    expect(a.calendar).toEqual({ total: 0, upcoming: 0, next: null, nextExam: null });

    const b = await getAnalytics(db, bob, "en", now);
    expect(b.totals).toMatchObject({ attempts: 3, scored: 3 });
    expect(b.totals.accuracy.percent).toBe(0);
    expect(b.marks.flagged).toBe(1);
    expect(b.calendar).toMatchObject({ total: 1, upcoming: 1 });
    expect(b.cards.total).toBe(2);
  });

  it("counts only the viewer's own calendar entries and names the next exam they added", async () => {
    await createEntry(db, alice, { title: "TEST Séance", date: "2099-01-05", kind: "study_session" });
    await createEntry(db, alice, { title: "TEST Examen", date: "2099-01-10", kind: "exam" });
    await createEntry(db, alice, { title: "TEST Passé", date: "2001-01-10", kind: "exam" });
    await createEntry(db, bob, { title: "TEST Examen Bob", date: "2099-01-02", kind: "exam" });
    const a = await getAnalytics(db, alice, "fr", now);
    expect(a.calendar).toMatchObject({ total: 3, upcoming: 2 });
    expect(a.calendar.next?.title).toBe("TEST Séance");
    expect(a.calendar.nextExam?.title).toBe("TEST Examen");
    expect(a.hasAnyData).toBe(true);
  });

  it("counts card reviews as activity, but only the viewer's", async () => {
    const [mine] = await db.insert(studyPersonalCards).values({ userId: "alice", front: "R", back: "V" }).returning();
    const [theirs] = await db.insert(studyPersonalCards).values({ userId: "bob", front: "R", back: "V" }).returning();
    await db.insert(studyCardReviews).values([
      { userId: "alice", personalCardId: mine!.id, rating: "good", boxBefore: 0, boxAfter: 1 },
      { userId: "bob", personalCardId: theirs!.id, rating: "good", boxBefore: 0, boxAfter: 1 },
      { userId: "bob", personalCardId: theirs!.id, rating: "easy", boxBefore: 1, boxAfter: 3 },
    ]);
    const a = await getAnalytics(db, alice, "en", now);
    expect(a.activity).toMatchObject({ reviews: 1, answers: 0, activeDays: 1 });
    expect(a.activity.days[a.activity.days.length - 1]).toMatchObject({ reviews: 1, total: 1 });
  });
});

describe("analytics: unscored answers", () => {
  it("excludes unscored answers from accuracy and reports how many there are", async () => {
    const withAnswer = await verified();
    const proposalOnly = await published(); // answer only proposed, not verified
    await answer(alice, withAnswer, 1); // correct
    await answer(alice, withAnswer, 2); // incorrect
    expect(await answer(alice, proposalOnly, 1)).toBe("unscored"); // would "match" the proposal, still unscored
    expect(await answer(alice, proposalOnly, 3)).toBe("unscored");
    expect(await answer(alice, proposalOnly, 2)).toBe("unscored");

    const a = await getAnalytics(db, alice, "en", now);
    expect(a.totals).toMatchObject({ attempts: 5, scored: 2, unscored: 3, questionsAnswered: 2 });
    expect(a.totals.accuracy).toEqual({ scored: 2, points: 1, percent: 50 });
    expect(a.byCourse[0]).toMatchObject({ attempts: 5, unscored: 3, correct: 1, incorrect: 1, accuracy: { scored: 2, percent: 50 } });
    // Denominator for "answered": the published questions the student could study.
    expect(a.questionPool).toBe(2);
  });

  it("never shows more answered or marked questions than the pool it is shown against", async () => {
    const stays = await verified();
    const dropped = await verified();
    await answer(alice, stays, 1);
    await answer(alice, dropped, 1);
    await setMark(db, alice, { questionId: stays, flagged: true });
    await setMark(db, alice, { questionId: dropped, flagged: true, reviewLater: true });
    // The type of one question is later removed from the code: it is still published and still has answers, but the
    // study pool no longer offers it.
    await db.update(examQuestions).set({ questionType: "removed_type" }).where(eq(examQuestions.id, dropped));

    const a = await getAnalytics(db, alice, "en", now);
    expect(a.questionPool).toBe(1);
    expect(a.totals.questionsAnswered).toBe(2); // all different questions with a recorded answer
    expect(a.inPool).toEqual({ answered: 1, flagged: 1, reviewLater: 0 });
    expect(a.inPool.answered).toBeLessThanOrEqual(a.questionPool);
    expect(a.inPool.flagged).toBeLessThanOrEqual(a.questionPool);
    expect(a.inPool.reviewLater).toBeLessThanOrEqual(a.questionPool);
  });

  it("gives no percentage when every answer was unscored", async () => {
    const proposalOnly = await published();
    await answer(alice, proposalOnly, 1);
    const a = await getAnalytics(db, alice, "en", now);
    expect(a.totals.accuracy).toEqual({ scored: 0, points: 0, percent: null });
    expect(a.byCourse[0]!.accuracy.percent).toBeNull();
    expect(a.totals.unscored).toBe(1);
  });
});

describe("analytics: weakest topics need a minimum sample", () => {
  it("names no topic with fewer scored answers than the minimum, and names it at the minimum", async () => {
    expect(WEAKEST_TOPIC_MIN_SAMPLE).toBeGreaterThanOrEqual(2);
    const q = await verified({ topic: "Endodontie" });
    for (let i = 0; i < WEAKEST_TOPIC_MIN_SAMPLE - 1; i++) await answer(alice, q, 2);
    const below = await getAnalytics(db, alice, "en", now);
    expect(below.topics).toMatchObject({ enough: false, topics: [], topicsBelowMinimum: 1 });

    await answer(alice, q, 2);
    const at = await getAnalytics(db, alice, "en", now);
    expect(at.topics.enough).toBe(true);
    expect(at.topics.topics).toHaveLength(1);
    expect(at.topics.topics[0]).toMatchObject({ label: "Endodontie", courseCode: "TEST 1001", counts: { correct: 0, incorrect: WEAKEST_TOPIC_MIN_SAMPLE } });
    expect(at.topics.topics[0]!.accuracy).toMatchObject({ scored: WEAKEST_TOPIC_MIN_SAMPLE, percent: 0 });
  });

  it("does not use unscored answers or another student's answers to reach the minimum", async () => {
    const unverified = await published({ topic: "Parodontie" });
    for (let i = 0; i < WEAKEST_TOPIC_MIN_SAMPLE + 2; i++) await answer(alice, unverified, 2);
    const q = await verified({ topic: "Parodontie" });
    for (let i = 0; i < WEAKEST_TOPIC_MIN_SAMPLE + 2; i++) await answer(bob, q, 2);
    const a = await getAnalytics(db, alice, "en", now);
    expect(a.topics).toMatchObject({ enough: false, topics: [], topicsBelowMinimum: 0 });
  });

  it("uses the topics linked to a question first, and counts scored answers on questions without a topic apart", async () => {
    const linked = await verified({ topic: "Texte libre ignoré" });
    const [topic] = await db.insert(courseTopics).values({ courseId, name: "Pulpe", nameEn: "Pulp" }).returning();
    await db.insert(questionTopics).values({ questionId: linked, topicId: topic!.id });
    const untopiced = await verified();
    for (let i = 0; i < WEAKEST_TOPIC_MIN_SAMPLE; i++) await answer(alice, linked, 2);
    await answer(alice, untopiced, 2);

    const fr = await getAnalytics(db, alice, "fr", now);
    expect(fr.topics.topics.map((t) => t.label)).toEqual(["Pulpe"]);
    expect((await getAnalytics(db, alice, "en", now)).topics.topics.map((t) => t.label)).toEqual(["Pulp"]);
    expect(fr.topics.scoredWithoutTopic).toBe(1);
  });

  it("leaves out answers on questions that are no longer published", async () => {
    const q = await verified({ topic: "Occlusion" });
    for (let i = 0; i < WEAKEST_TOPIC_MIN_SAMPLE; i++) await answer(alice, q, 2);
    await db.update(examQuestions).set({ status: "hidden" }).where(eq(examQuestions.id, q));
    const a = await getAnalytics(db, alice, "en", now);
    expect(a.topics.enough).toBe(false);
    expect(a.totals.attempts).toBe(0);
  });
});

describe("analytics: activity", () => {
  it("puts today's answers in the last bar and ignores answers older than the window", async () => {
    const q = await verified();
    await answer(alice, q, 1);
    await answer(alice, q, 2);
    const old = new Date(now.getTime() - (ANALYTICS_ACTIVITY_DAYS + 10) * 86_400_000);
    await db.insert(studyAttempts).values({ userId: "alice", questionId: q, mode: "practice", outcome: "correct", answerBasis: "verified", response: { selected: [1] }, createdAt: old });
    const a = await getAnalytics(db, alice, "en", now);
    const last = a.activity.days[a.activity.days.length - 1]!;
    expect(last).toMatchObject({ answers: 2, reviews: 0, total: 2 });
    expect(a.activity).toMatchObject({ answers: 2, activeDays: 1, dayCount: ANALYTICS_ACTIVITY_DAYS });
    // The old answer still counts in the all-time totals, which say so with their own denominator.
    expect(a.totals.attempts).toBe(3);
  });
});
