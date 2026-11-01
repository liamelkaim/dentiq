import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { excerpt } from "@/components/pass-ui";
import { PrivacyNote } from "@/components/study-ui";
import { Badge, ButtonLink, EmptyState, List, ListLinkRow, Notice, PageHeader, Panel, Section } from "@/components/ui";
import { getDb } from "@/db/client";
import { localized, type Locale } from "@/i18n/config";
import { requireUser } from "@/server/auth/session";
import { canAccessLibrary } from "@/server/resources/service";
import { getProgress, type MarkedQuestion } from "@/server/study/service";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("studyTools.progress"))("title") };
}

/** The student's own progress, from stored attempts only. With no activity it says so instead of showing zeros as results. */
export default async function ProgressPage() {
  const viewer = await requireUser();
  const t = await getTranslations("studyTools.progress");
  const root = await getTranslations("studyTools");
  const format = await getFormatter();
  const locale = (await getLocale()) as Locale;
  const back = { href: "/practice", label: root("title") };

  if (!canAccessLibrary(viewer)) {
    const r = await getTranslations("resources");
    return (
      <>
        <PageHeader title={t("title")} back={back} />
        <Notice tone="warning" title={r("noAccessTitle")}>
          {r("noAccessBody")}
        </Notice>
      </>
    );
  }

  const p = await getProgress(getDb(), viewer);
  if (!p.hasData) {
    return (
      <>
        <PageHeader title={t("title")} subtitle={t("subtitle")} back={back} />
        <EmptyState title={t("emptyTitle")} body={t("emptyBody")} action={<ButtonLink href="/practice/questions">{t("emptyAction")}</ButtonLink>} />
        <div className="mt-4">
          <PrivacyNote />
        </div>
      </>
    );
  }

  const scored = p.totals.correct + p.totals.partial + p.totals.incorrect;
  const tiles = [
    { label: t("tiles.answered"), value: p.totals.questionsAnswered },
    { label: t("tiles.attempts"), value: p.totals.attempts },
    { label: t("tiles.scored"), value: scored },
    { label: t("tiles.unscored"), value: p.totals.unscored },
  ];
  const markList = (items: MarkedQuestion[]) => (
    <List>
      {items.map((m) => (
        <ListLinkRow key={m.id} href={`/passes/${m.id}`} title={excerpt(m.questionText, 120)} subtitle={`${m.courseCode} · ${m.examAcademicYear}`} />
      ))}
    </List>
  );

  return (
    <>
      <PageHeader title={t("title")} subtitle={t("subtitle")} back={back} />

      <dl className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((tile) => (
          <Panel key={tile.label} className="px-4 py-3">
            <dt className="text-[13px] text-text-subtle">{tile.label}</dt>
            <dd className="text-[22px] font-semibold tabular-nums">{format.number(tile.value)}</dd>
          </Panel>
        ))}
      </dl>
      <p className="mb-6 text-[13px] text-text-subtle">{t("scoreNote")}</p>

      <Section title={t("byCourseTitle")}>
        {p.byCourse.length === 0 ? (
          <Panel className="px-4 py-5 text-[14px] text-text-muted">{t("byCourseEmpty")}</Panel>
        ) : (
          <List>
            {p.byCourse.map((c) => {
              const courseScored = c.correct + c.partial + c.incorrect;
              return (
                <li key={c.courseId} className="flex flex-col gap-1 px-4 py-3">
                  <p className="text-[15px] font-medium">
                    {c.code} <span className="font-normal text-text-subtle">· {localized(locale, c.titleFr, c.titleEn)}</span>
                  </p>
                  <p className="text-[13px] text-text-muted">
                    {t("courseLine", { answered: c.questionsAnswered, attempts: c.attempts })}
                    {" · "}
                    {courseScored > 0 ? t("courseScored", { correct: c.correct, partial: c.partial, scored: courseScored }) : t("courseNoScore")}
                    {c.unscored > 0 && ` · ${t("courseUnscored", { count: c.unscored })}`}
                  </p>
                  <p>
                    <Link href={`/practice/questions?course=${c.courseId}`} className="text-[13px] font-medium text-accent underline-offset-2 hover:underline">
                      {t("practiceCourse", { code: c.code })}
                    </Link>
                  </p>
                </li>
              );
            })}
          </List>
        )}
      </Section>

      <Section title={t("marksTitle")}>
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 flex items-center gap-2 px-1 text-[14px] font-semibold">
              {t("flagged")} <Badge>{p.marks.flagged}</Badge>
            </h3>
            {p.flagged.length === 0 ? <Panel className="px-4 py-4 text-[14px] text-text-muted">{t("flaggedEmpty")}</Panel> : markList(p.flagged)}
          </div>
          <div>
            <h3 className="mb-2 flex items-center gap-2 px-1 text-[14px] font-semibold">
              {t("reviewLater")} <Badge>{p.marks.reviewLater}</Badge>
            </h3>
            {p.reviewLater.length === 0 ? <Panel className="px-4 py-4 text-[14px] text-text-muted">{t("reviewLaterEmpty")}</Panel> : markList(p.reviewLater)}
          </div>
        </div>
      </Section>

      <Section title={t("cardsTitle")}>
        <Panel className="flex flex-col gap-1 px-4 py-3 text-[14px]">
          <p>{t("cardsPersonal", { count: p.cards.personal })}</p>
          <p>{t("cardsStarted", { count: p.cards.questionCardsStarted })}</p>
          <p>{t("cardsReviews", { count: p.cards.reviews })}</p>
        </Panel>
      </Section>

      <Section title={t("quizzesTitle")}>
        <Panel className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-[14px]">
          <p>{t("quizzesLine", { done: p.quizzes.completed, open: p.quizzes.inProgress })}</p>
          <ButtonLink href="/practice/quizzes" variant="secondary" size="sm">
            {t("quizHistory")}
          </ButtonLink>
        </Panel>
      </Section>
      <PrivacyNote />
    </>
  );
}
