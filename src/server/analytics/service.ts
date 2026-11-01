// Analytics: numbers computed ONLY from the viewer's own stored rows (attempts, card reviews, quizzes, marks, card
// schedules, calendar entries). Every query filters on `viewer.id`; there is no cross-student data anywhere, no
// benchmark and no estimate. Each figure comes with its denominator (see docs/calendar-analytics.md).
import { and, eq, gte, inArray, isNull, or } from "drizzle-orm";
import type { Database } from "@/db/client";
import { courseTopics, courses, examQuestions, questionTopics, studyAttempts, studyCardReviews, studyQuestionMarks } from "@/db/schema";
import { localized, type Locale } from "@/i18n/config";
import { CALENDAR_TIME_ZONE } from "@/server/calendar/constants";
import { isoDateIn } from "@/server/calendar/dates";
import { listEntries, type CalendarEntry } from "@/server/calendar/service";
import { canAccessLibrary, type Viewer } from "@/server/resources/service";
import { studyPool } from "@/server/study/questions";
import { cardOverview, getProgress, listQuizzes } from "@/server/study/service";
import { ANALYTICS_ACTIVITY_DAYS, ANALYTICS_QUIZ_HISTORY, WEAKEST_TOPICS_LIMIT, WEAKEST_TOPIC_MIN_SAMPLE } from "./constants";
import { accuracyOf, activityByDay, weakestTopics, type Accuracy, type ActivityDay, type TopicAnswer, type WeakestTopics } from "./aggregate";

export type CourseAccuracy = {
  courseId: string;
  code: string;
  titleFr: string;
  titleEn: string | null;
  /** Every recorded answer in the course, scored or not. */
  attempts: number;
  /** Different questions answered at least once. */
  questionsAnswered: number;
  unscored: number;
  correct: number;
  partial: number;
  incorrect: number;
  accuracy: Accuracy;
};

export type Analytics = {
  hasAnyData: boolean;
  today: string;
  activity: { days: ActivityDay[]; dayCount: number; activeDays: number; answers: number; reviews: number };
  totals: { attempts: number; questionsAnswered: number; scored: number; unscored: number; accuracy: Accuracy };
  /** Published questions the viewer may study (the denominator for "answered" and for marks). */
  questionPool: number;
  /**
   * The numerators that go with `questionPool`: only questions that are IN the pool are counted, so "X of N" never has
   * X above N (an answered or marked question can fall out of the pool, for example when it is no longer visible).
   */
  inPool: { answered: number; flagged: number; reviewLater: number };
  byCourse: CourseAccuracy[];
  cards: { total: number; started: number; due: number; fresh: number };
  marks: { flagged: number; reviewLater: number };
  topics: WeakestTopics & { scoredWithoutTopic: number };
  quizzes: { completed: { id: string; completedAt: Date; courseCode: string | null; size: number; scored: number; unscored: number; points: number; percent: number | null }[]; completedCount: number; inProgress: number };
  calendar: { total: number; upcoming: number; next: CalendarEntry | null; nextExam: CalendarEntry | null };
};

const SCORED = ["correct", "partial", "incorrect"] as const;

export async function getAnalytics(db: Database, viewer: Viewer, locale: Locale, now: Date = new Date()): Promise<Analytics> {
  const today = isoDateIn(now, CALENDAR_TIME_ZONE);
  const emptyAccuracy = accuracyOf({ correct: 0, partial: 0, incorrect: 0 });
  const empty: Analytics = {
    hasAnyData: false,
    today,
    activity: { days: activityByDay({ answers: [], reviews: [] }, today, ANALYTICS_ACTIVITY_DAYS), dayCount: ANALYTICS_ACTIVITY_DAYS, activeDays: 0, answers: 0, reviews: 0 },
    totals: { attempts: 0, questionsAnswered: 0, scored: 0, unscored: 0, accuracy: emptyAccuracy },
    questionPool: 0,
    inPool: { answered: 0, flagged: 0, reviewLater: 0 },
    byCourse: [],
    cards: { total: 0, started: 0, due: 0, fresh: 0 },
    marks: { flagged: 0, reviewLater: 0 },
    topics: { ...weakestTopics([], { minSample: WEAKEST_TOPIC_MIN_SAMPLE, limit: WEAKEST_TOPICS_LIMIT }), scoredWithoutTopic: 0 },
    quizzes: { completed: [], completedCount: 0, inProgress: 0 },
    calendar: { total: 0, upcoming: 0, next: null, nextExam: null },
  };
  if (!canAccessLibrary(viewer)) return empty;

  // Two days of slack so the day boundary in CALENDAR_TIME_ZONE never cuts the window; activityByDay drops the rest.
  const since = new Date(now.getTime() - (ANALYTICS_ACTIVITY_DAYS + 2) * 86_400_000);
  const published = eq(examQuestions.status, "published");

  const [progress, overview, poolIds, answeredRows, markRows, quizzes, entries, attemptStamps, reviewStamps, topicRows] = await Promise.all([
    getProgress(db, viewer),
    cardOverview(db, viewer, {}, now),
    studyPool(db, viewer, {}, { now }),
    db
      .selectDistinct({ id: studyAttempts.questionId })
      .from(studyAttempts)
      .innerJoin(examQuestions, eq(studyAttempts.questionId, examQuestions.id))
      .where(and(eq(studyAttempts.userId, viewer.id), published)),
    db
      .select({ id: studyQuestionMarks.questionId, flagged: studyQuestionMarks.flagged, reviewLater: studyQuestionMarks.reviewLater })
      .from(studyQuestionMarks)
      .innerJoin(examQuestions, eq(studyQuestionMarks.questionId, examQuestions.id))
      .where(and(eq(studyQuestionMarks.userId, viewer.id), published)),
    listQuizzes(db, viewer, 200),
    listEntries(db, viewer),
    db
      .select({ at: studyAttempts.createdAt })
      .from(studyAttempts)
      .innerJoin(examQuestions, eq(studyAttempts.questionId, examQuestions.id))
      .where(and(eq(studyAttempts.userId, viewer.id), published, gte(studyAttempts.createdAt, since))),
    db
      .select({ at: studyCardReviews.createdAt })
      .from(studyCardReviews)
      .leftJoin(examQuestions, eq(studyCardReviews.questionId, examQuestions.id))
      .where(and(eq(studyCardReviews.userId, viewer.id), gte(studyCardReviews.createdAt, since), or(isNull(studyCardReviews.questionId), published))),
    // Answers scored against a verified answer, with the topic of their question (linked course topics first).
    db
      .select({
        outcome: studyAttempts.outcome,
        courseId: examQuestions.courseId,
        courseCode: courses.code,
        freeTopic: examQuestions.topic,
        topicId: courseTopics.id,
        topicName: courseTopics.name,
        topicNameEn: courseTopics.nameEn,
      })
      .from(studyAttempts)
      .innerJoin(examQuestions, eq(studyAttempts.questionId, examQuestions.id))
      .innerJoin(courses, eq(examQuestions.courseId, courses.id))
      .leftJoin(questionTopics, eq(questionTopics.questionId, examQuestions.id))
      .leftJoin(courseTopics, eq(questionTopics.topicId, courseTopics.id))
      .where(and(eq(studyAttempts.userId, viewer.id), published, inArray(studyAttempts.outcome, [...SCORED]))),
  ]);

  const pool = new Set(poolIds);
  const activityDays = activityByDay({ answers: attemptStamps.map((r) => r.at), reviews: reviewStamps.map((r) => r.at) }, today, ANALYTICS_ACTIVITY_DAYS, CALENDAR_TIME_ZONE);

  const byCourse: CourseAccuracy[] = progress.byCourse.map((c) => ({
    courseId: c.courseId,
    code: c.code,
    titleFr: c.titleFr,
    titleEn: c.titleEn,
    attempts: c.attempts,
    questionsAnswered: c.questionsAnswered,
    unscored: c.unscored,
    correct: c.correct,
    partial: c.partial,
    incorrect: c.incorrect,
    accuracy: accuracyOf(c),
  }));

  // One row per (answer, linked topic). An answer on a question with no linked topic falls back to its free-text topic.
  const topicAnswers: TopicAnswer[] = [];
  let scoredWithoutTopic = 0;
  for (const row of topicRows) {
    const outcome = row.outcome as TopicAnswer["outcome"];
    if (row.topicId && row.topicName) {
      topicAnswers.push({ topicKey: `t:${row.topicId}`, label: localized(locale, row.topicName, row.topicNameEn), courseCode: row.courseCode, outcome });
      continue;
    }
    const free = row.freeTopic?.trim();
    if (free) topicAnswers.push({ topicKey: `f:${row.courseId}:${free.toLowerCase()}`, label: free, courseCode: row.courseCode, outcome });
    else scoredWithoutTopic += 1;
  }

  const completed = quizzes
    .filter((q) => q.completedAt)
    .slice(0, ANALYTICS_QUIZ_HISTORY)
    .map((q) => ({ id: q.id, completedAt: q.completedAt!, courseCode: q.courseCode, size: q.size, scored: q.score.scored, unscored: q.score.unscored, points: q.score.points, percent: q.score.percent }));

  const upcomingEntries = entries.filter((e) => e.date >= today);
  const attemptsTotal = progress.totals.attempts;
  const accuracy = accuracyOf(progress.totals);
  const startedPersonal = overview.personal - overview.personalNew;

  const analytics: Analytics = {
    hasAnyData: false,
    today,
    activity: {
      days: activityDays,
      dayCount: ANALYTICS_ACTIVITY_DAYS,
      activeDays: activityDays.filter((d) => d.total > 0).length,
      answers: activityDays.reduce((n, d) => n + d.answers, 0),
      reviews: activityDays.reduce((n, d) => n + d.reviews, 0),
    },
    totals: { attempts: attemptsTotal, questionsAnswered: progress.totals.questionsAnswered, scored: accuracy.scored, unscored: progress.totals.unscored, accuracy },
    questionPool: overview.generated,
    inPool: {
      answered: answeredRows.filter((r) => pool.has(r.id)).length,
      flagged: markRows.filter((m) => m.flagged && pool.has(m.id)).length,
      reviewLater: markRows.filter((m) => m.reviewLater && pool.has(m.id)).length,
    },
    byCourse,
    cards: { total: overview.generated + overview.personal, started: overview.generatedStarted + startedPersonal, due: overview.dueTotal, fresh: overview.newTotal },
    marks: progress.marks,
    topics: { ...weakestTopics(topicAnswers, { minSample: WEAKEST_TOPIC_MIN_SAMPLE, limit: WEAKEST_TOPICS_LIMIT }), scoredWithoutTopic },
    quizzes: { completed, completedCount: progress.quizzes.completed, inProgress: progress.quizzes.inProgress },
    calendar: {
      total: entries.length,
      upcoming: upcomingEntries.length,
      next: upcomingEntries[0] ?? null,
      nextExam: upcomingEntries.find((e) => e.kind === "exam") ?? null,
    },
  };
  // progress.hasData covers attempts, marks, started or personal cards, card reviews and quizzes.
  analytics.hasAnyData = progress.hasData || entries.length > 0;
  return analytics;
}
