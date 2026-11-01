import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import type { ComponentType, SVGProps } from "react";
import { CalendarIcon, CardsIcon, ChartIcon, ChevronRightIcon, DownloadIcon, PassesIcon, QuizIcon, SparkleIcon } from "@/components/icons";
import { PrivacyNote } from "@/components/study-ui";
import { Notice, PageHeader, Panel } from "@/components/ui";
import { getDb } from "@/db/client";
import { requireUser } from "@/server/auth/session";
import { countEntries } from "@/server/calendar/service";
import { listQuestions } from "@/server/passes/service";
import { listCourseChoices } from "@/server/passes/queries";
import { canAccessLibrary } from "@/server/resources/service";
import { parseStudyScope } from "@/server/study/scope";
import { cardOverview, getProgress } from "@/server/study/service";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("studyTools"))("title") };
}

type Tile = { href: string; key: "practice" | "flashcards" | "quizzes" | "progress" | "calendar" | "analytics" | "tutor" | "export"; icon: ComponentType<SVGProps<SVGSVGElement>>; line: string };

/** The Study hub: one entry per tool, each with a real number (never an invented one). */
export default async function StudyHubPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const viewer = await requireUser();
  const t = await getTranslations("studyTools");

  if (!canAccessLibrary(viewer)) {
    const r = await getTranslations("resources");
    return (
      <>
        <PageHeader title={t("title")} subtitle={t("subtitle")} />
        <Notice tone="warning" title={r("noAccessTitle")}>
          {r("noAccessBody")}
        </Notice>
      </>
    );
  }

  const db = getDb();
  const scope = parseStudyScope(await searchParams);
  const [available, overview, progress, courseChoices, calendarCount] = await Promise.all([
    listQuestions(db, viewer, { publishedOnly: true, courseId: scope.course, limit: 1 }),
    cardOverview(db, viewer, { course: scope.course }),
    getProgress(db, viewer),
    scope.course ? listCourseChoices(db) : Promise.resolve([]),
    countEntries(db, viewer),
  ]);
  const course = scope.course ? courseChoices.find((c) => c.id === scope.course) : undefined;
  const query = course ? `?course=${course.id}` : "";

  const tiles: Tile[] = [
    { href: `/practice/questions${query}`, key: "practice", icon: PassesIcon, line: available.total > 0 ? t("hub.practiceLine", { count: available.total }) : t("hub.practiceNone") },
    {
      href: `/practice/flashcards${query}`,
      key: "flashcards",
      icon: CardsIcon,
      line: overview.generated + overview.personal > 0 ? t("hub.flashcardsLine", { due: overview.dueTotal, fresh: overview.newTotal }) : t("hub.flashcardsNone"),
    },
    { href: "/practice/quizzes" + query, key: "quizzes", icon: QuizIcon, line: progress.quizzes.completed + progress.quizzes.inProgress > 0 ? t("hub.quizzesLine", { count: progress.quizzes.completed }) : t("hub.quizzesNone") },
    { href: "/practice/progress", key: "progress", icon: ChartIcon, line: progress.hasData ? t("hub.progressLine", { count: progress.totals.attempts }) : t("hub.progressNone") },
    { href: "/calendar", key: "calendar", icon: CalendarIcon, line: t("hub.calendarLine", { count: calendarCount }) },
    { href: "/analytics", key: "analytics", icon: ChartIcon, line: t("hub.analyticsLine") },
    { href: "/tutor", key: "tutor", icon: SparkleIcon, line: t("hub.tutorLine") },
    { href: `/practice/export${query}`, key: "export", icon: DownloadIcon, line: t("hub.exportLine") },
  ];

  return (
    <>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      {course && (
        <p className="mb-4 text-[14px] text-text-muted">
          {t("hub.courseFilter", { code: course.code })}{" "}
          <Link href="/practice" className="font-medium text-accent underline-offset-2 hover:underline">
            {t("hub.clearCourse")}
          </Link>
        </p>
      )}
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map(({ href, key, icon: Icon, line }) => (
          <li key={key}>
            <Link href={href} className="block h-full rounded-[var(--radius-card)] focus-visible:outline-offset-2">
              <Panel className="flex h-full min-h-32 flex-col gap-2 p-4 transition-colors hover:bg-surface-hover sm:p-5">
                <span className="flex items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-accent-soft text-accent">
                    <Icon width={20} height={20} />
                  </span>
                  <span className="flex-1 text-[16px] font-semibold">{t(`hub.${key}.title`)}</span>
                  <ChevronRightIcon width={16} height={16} className="text-text-subtle" />
                </span>
                <span className="text-[14px] text-text-muted">{t(`hub.${key}.body`)}</span>
                <span className="mt-auto text-[13px] font-medium text-text">{line}</span>
              </Panel>
            </Link>
          </li>
        ))}
      </ul>
      <div className="mt-6">
        <PrivacyNote />
      </div>
    </>
  );
}
