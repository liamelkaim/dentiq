import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { ActivityChart } from "@/components/analytics-ui";
import { PrivacyNote } from "@/components/study-ui";
import { Badge, ButtonLink, EmptyState, List, Notice, PageHeader, Panel, Section } from "@/components/ui";
import { getDb } from "@/db/client";
import { localized, type Locale } from "@/i18n/config";
import { requireUser } from "@/server/auth/session";
import { getAnalytics } from "@/server/analytics/service";
import { CALENDAR_TIME_ZONE } from "@/server/calendar/constants";
import { daysUntil } from "@/server/calendar/dates";
import { canAccessLibrary } from "@/server/resources/service";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("analytics"))("title") };
}

/**
 * Analytics from the student's own stored data only: answers, card reviews, quizzes, marks and calendar entries.
 * Every figure shows its denominator; unscored answers are never counted in an accuracy; a topic is named only above
 * a minimum sample. There is no cross-student data anywhere on this page.
 */
export default async function AnalyticsPage() {
  const viewer = await requireUser();
  const t = await getTranslations("analytics");
  const format = await getFormatter();
  const locale = (await getLocale()) as Locale;

  if (!canAccessLibrary(viewer)) {
    const r = await getTranslations("resources");
    return (
      <>
        <PageHeader title={t("title")} subtitle={t("subtitle")} />
        <Notice tone="warning" title={r("noAccessTitle")}>
          {t("noAccess")}
        </Notice>
      </>
    );
  }

  const a = await getAnalytics(getDb(), viewer, locale);

  if (!a.hasAnyData) {
    return (
      <>
        <PageHeader title={t("title")} subtitle={t("subtitle")} />
        <EmptyState title={t("empty.title")} body={t("empty.body")} action={<ButtonLink href="/practice">{t("empty.action")}</ButtonLink>} />
        <div className="mt-4">
          <PrivacyNote>{t("privacy")}</PrivacyNote>
        </div>
      </>
    );
  }

  const n = (value: number) => format.number(value);
  const day = (iso: string) => format.dateTime(new Date(`${iso}T12:00:00Z`), { weekday: "short", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const linkClass = "inline-flex min-h-11 items-center text-[14px] font-medium text-accent hover:text-accent-hover sm:min-h-0";
  const daysText = (iso: string) => {
    const d = daysUntil(a.today, iso);
    return d === 0 ? t("yourDates.today") : t("yourDates.inDays", { days: d });
  };
  const activityTotal = a.activity.answers + a.activity.reviews;
  const overall = a.totals.accuracy;

  return (
    <>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      {/* Activity */}
      <Section title={t("activity.title", { days: a.activity.dayCount })} description={t("activity.description", { zone: CALENDAR_TIME_ZONE })}>
        <Panel className="p-4 sm:p-5">
          {activityTotal === 0 ? (
            <p className="text-[14px] text-text-muted">{t("activity.none", { days: a.activity.dayCount })}</p>
          ) : (
            <>
              <p className="mb-3 text-[14px]">
                {t("activity.summary", { active: a.activity.activeDays, days: a.activity.dayCount, answers: a.activity.answers, reviews: a.activity.reviews })}
              </p>
              <ActivityChart days={a.activity.days} />
            </>
          )}
        </Panel>
      </Section>

      {/* Accuracy */}
      <Section title={t("accuracy.title")} description={t("accuracy.description")}>
        <Panel className="mb-3 p-4 sm:p-5">
          <p className="text-[13px] text-text-subtle">{t("accuracy.overall")}</p>
          {overall.percent === null ? (
            <p className="mt-1 text-[16px] font-semibold">{t("accuracy.noScore")}</p>
          ) : (
            <>
              <p className="mt-1 text-[28px] leading-none font-semibold tabular-nums">{t("accuracy.percent", { percent: overall.percent })}</p>
              <p className="mt-1.5 text-[14px] text-text-muted">{t("accuracy.points", { points: n(overall.points), scored: overall.scored })}</p>
            </>
          )}
          <p className="mt-2 text-[13px] text-text-subtle">
            {t("accuracy.volume", { attempts: a.totals.attempts, questions: a.totals.questionsAnswered })}
            {a.totals.unscored > 0 && ` · ${t("accuracy.unscored", { count: a.totals.unscored })}`}
          </p>
          <p className="mt-1 text-[13px] text-text-subtle">{t("accuracy.answered", { answered: a.inPool.answered, pool: a.questionPool })}</p>
        </Panel>
        {a.byCourse.length === 0 ? (
          <Panel className="px-4 py-5 text-[14px] text-text-muted">{t("accuracy.empty")}</Panel>
        ) : (
          <>
            <h3 className="mb-2 px-1 text-[14px] font-semibold">{t("accuracy.byCourse")}</h3>
            <List>
              {a.byCourse.map((c) => (
                <li key={c.courseId} className="flex flex-col gap-1 px-4 py-3">
                  <p className="text-[15px] font-medium">
                    {c.code} <span className="font-normal text-text-subtle">· {localized(locale, c.titleFr, c.titleEn)}</span>
                  </p>
                  <p className="text-[14px]">
                    {c.accuracy.percent === null ? (
                      t("accuracy.noScore")
                    ) : (
                      <>
                        <span className="font-semibold tabular-nums">{t("accuracy.percent", { percent: c.accuracy.percent })}</span>
                        <span className="text-text-muted"> · {t("accuracy.points", { points: n(c.accuracy.points), scored: c.accuracy.scored })}</span>
                      </>
                    )}
                  </p>
                  <p className="text-[13px] text-text-subtle">
                    {t("accuracy.volume", { attempts: c.attempts, questions: c.questionsAnswered })}
                    {c.unscored > 0 && ` · ${t("accuracy.unscored", { count: c.unscored })}`}
                  </p>
                </li>
              ))}
            </List>
          </>
        )}
      </Section>

      {/* Cards and marks */}
      <div className="grid grid-cols-1 gap-x-8 lg:grid-cols-2">
        <Section title={t("cards.title")} description={t("cards.description")}>
          <Panel className="flex flex-col gap-3 p-4">
            {a.cards.total === 0 ? (
              <p className="text-[14px] text-text-muted">{t("cards.none")}</p>
            ) : (
              <dl className="grid grid-cols-2 gap-3">
                <div>
                  <dt className="text-[13px] text-text-subtle">{t("cards.dueNow")}</dt>
                  <dd className="text-[14px]">
                    <span className="text-[22px] font-semibold tabular-nums">{n(a.cards.due)}</span>
                    <span className="block text-text-muted">{t("cards.dueLine", { due: a.cards.due, started: a.cards.started })}</span>
                  </dd>
                </div>
                <div>
                  <dt className="text-[13px] text-text-subtle">{t("cards.fresh")}</dt>
                  <dd className="text-[14px]">
                    <span className="text-[22px] font-semibold tabular-nums">{n(a.cards.fresh)}</span>
                    <span className="block text-text-muted">{t("cards.freshLine", { fresh: a.cards.fresh, total: a.cards.total })}</span>
                  </dd>
                </div>
              </dl>
            )}
            <Link href="/practice/flashcards" className={linkClass}>
              {t("cards.review")}
            </Link>
          </Panel>
        </Section>

        <Section title={t("marks.title")} description={t("marks.description")}>
          <Panel className="p-4">
            <dl className="grid grid-cols-2 gap-3">
              <div>
                <dt className="text-[13px] text-text-subtle">{t("marks.flagged")}</dt>
                <dd className="text-[14px]">
                  <span className="text-[22px] font-semibold tabular-nums">{n(a.inPool.flagged)}</span>
                  <span className="block text-text-muted">{t("marks.of", { count: a.inPool.flagged, pool: a.questionPool })}</span>
                </dd>
              </div>
              <div>
                <dt className="text-[13px] text-text-subtle">{t("marks.reviewLater")}</dt>
                <dd className="text-[14px]">
                  <span className="text-[22px] font-semibold tabular-nums">{n(a.inPool.reviewLater)}</span>
                  <span className="block text-text-muted">{t("marks.of", { count: a.inPool.reviewLater, pool: a.questionPool })}</span>
                </dd>
              </div>
            </dl>
          </Panel>
        </Section>
      </div>

      {/* Weakest topics: only above the minimum sample */}
      <Section title={t("topics.title")} description={t("topics.description", { min: a.topics.minSample })}>
        <Panel className="p-4">
          {!a.topics.enough ? (
            <p className="text-[14px] text-text-muted">
              {t("topics.notEnough", { min: a.topics.minSample })}
              {a.topics.topicsBelowMinimum > 0 && ` ${t("topics.belowMinimum", { count: a.topics.topicsBelowMinimum, min: a.topics.minSample })}`}
            </p>
          ) : a.topics.topics.length === 0 ? (
            <p className="text-[14px] text-text-muted">{t("topics.allFull", { min: a.topics.minSample })}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[28rem] text-left text-[14px]">
                <thead className="text-[13px] text-text-subtle">
                  <tr>
                    <th scope="col" className="py-1.5 pr-3 font-semibold">
                      {t("topics.topic")}
                    </th>
                    <th scope="col" className="py-1.5 pr-3 font-semibold">
                      {t("topics.course")}
                    </th>
                    <th scope="col" className="py-1.5 pr-3 text-right font-semibold">
                      {t("topics.accuracy")}
                    </th>
                    <th scope="col" className="py-1.5 text-right font-semibold">
                      {t("topics.scored")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {a.topics.topics.map((topic) => (
                    <tr key={topic.key} className="border-t border-border">
                      <th scope="row" className="py-2 pr-3 font-medium break-words">
                        {topic.label}
                      </th>
                      <td className="py-2 pr-3 text-text-muted">{topic.courseCode}</td>
                      <td className="py-2 pr-3 text-right font-semibold tabular-nums">{t("accuracy.percent", { percent: topic.accuracy.percent })}</td>
                      <td className="py-2 text-right tabular-nums">{n(topic.accuracy.scored)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {a.topics.enough && a.topics.topicsBelowMinimum > 0 && (
            <p className="mt-3 text-[13px] text-text-subtle">{t("topics.belowMinimum", { count: a.topics.topicsBelowMinimum, min: a.topics.minSample })}</p>
          )}
          {a.topics.scoredWithoutTopic > 0 && <p className="mt-2 text-[13px] text-text-subtle">{t("topics.withoutTopic", { count: a.topics.scoredWithoutTopic })}</p>}
        </Panel>
      </Section>

      {/* Quiz history */}
      <Section title={t("quizzes.title")} description={t("quizzes.description")}>
        {a.quizzes.completed.length === 0 ? (
          <Panel className="px-4 py-5 text-[14px] text-text-muted">{t("quizzes.empty")}</Panel>
        ) : (
          <List>
            {a.quizzes.completed.map((q) => (
              <li key={q.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium">
                    {format.dateTime(q.completedAt, { day: "numeric", month: "long", year: "numeric", timeZone: CALENDAR_TIME_ZONE })}
                    {q.courseCode && <span className="font-normal text-text-subtle"> · {q.courseCode}</span>}
                  </span>
                  <span className="block text-[13px] text-text-subtle">
                    {t("quizzes.size", { count: q.size })}
                    {q.unscored > 0 && ` · ${t("quizzes.unscored", { count: q.unscored })}`}
                  </span>
                </span>
                <span className="text-[14px]">
                  {q.percent === null ? (
                    <Badge>{t("quizzes.noScore")}</Badge>
                  ) : (
                    <span className="tabular-nums">{t("quizzes.line", { points: q.points, scored: q.scored, percent: q.percent })}</span>
                  )}
                </span>
              </li>
            ))}
          </List>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-x-4 px-1">
          {a.quizzes.completedCount > a.quizzes.completed.length && (
            <p className="text-[13px] text-text-subtle">{t("quizzes.shown", { shown: a.quizzes.completed.length, total: a.quizzes.completedCount })}</p>
          )}
          {a.quizzes.inProgress > 0 && <p className="text-[13px] text-text-subtle">{t("quizzes.open", { count: a.quizzes.inProgress })}</p>}
          <Link href="/practice/quizzes" className={linkClass}>
            {t("quizzes.history")}
          </Link>
        </div>
      </Section>

      {/* Calendar: only dates the student added */}
      <Section title={t("yourDates.title")} description={t("yourDates.description")}>
        <Panel className="flex flex-col gap-1.5 p-4 text-[14px]">
          {a.calendar.total === 0 ? (
            <p className="text-text-muted">{t("yourDates.none")}</p>
          ) : (
            <>
              <p>{t("yourDates.line", { upcoming: a.calendar.upcoming, total: a.calendar.total })}</p>
              {a.calendar.next && <p className="text-text-muted">{t("yourDates.next", { title: a.calendar.next.title, date: day(a.calendar.next.date), days: daysText(a.calendar.next.date) })}</p>}
              {a.calendar.nextExam && (
                <p className="text-text-muted">{t("yourDates.nextExam", { title: a.calendar.nextExam.title, date: day(a.calendar.nextExam.date), days: daysText(a.calendar.nextExam.date) })}</p>
              )}
            </>
          )}
          <Link href="/calendar" className={linkClass}>
            {t("yourDates.open")}
          </Link>
        </Panel>
      </Section>

      {/* What each number counts */}
      <Section title={t("definitions.title")}>
        <Panel className="p-4">
          <ul className="flex flex-col gap-3 text-[14px]">
            {(["attempt", "scored", "unscored", "fixed", "accuracy", "activeDay", "due"] as const).map((key) => (
              <li key={key} className="text-text-muted">
                {t(`definitions.${key}`)}
              </li>
            ))}
          </ul>
        </Panel>
      </Section>
      <PrivacyNote>{t("privacy")}</PrivacyNote>
    </>
  );
}
