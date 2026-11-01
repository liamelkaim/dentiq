// Reusable course layout: cover art, header with real stats, and section tabs.
// Tabs for features that don't exist yet (recordings) are shown disabled with a "Soon" label, never as links.
// The tutor tab is a real link: the page exists and says plainly whether the tutor is off.
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import type { ComponentType, ReactNode, SVGProps } from "react";
import { getDb } from "@/db/client";
import { localized, type Locale } from "@/i18n/config";
import type { CurrentUser } from "@/server/auth/session";
import { getCourseByCode } from "@/server/catalog/service";
import { courseCodeFromSegment } from "@/server/catalog/validation";
import { listCourseSummaries, type CourseSummary } from "@/server/resources/service";
import { isTutorReady } from "@/server/tutor/service";
import { BookIcon, CardsIcon, ChevronLeftIcon, FolderIcon, MicIcon, PassesIcon, SparkleIcon, TagIcon } from "./icons";
import { cx } from "./ui";

type CourseDetail = NonNullable<Awaited<ReturnType<typeof getCourseByCode>>>;

/** Loads a course from a URL segment like "DEMO%201001". Null (so the page answers 404) for a malformed segment. */
export async function loadCourseByCode(codeParam: string) {
  const code = courseCodeFromSegment(codeParam);
  return code === null ? null : getCourseByCode(getDb(), code);
}

/** Header data for a course. Archived courses aren't in the summaries, so fall back to the record itself. */
export async function loadCourseSummary(viewer: CurrentUser, course: CourseDetail): Promise<CourseSummary> {
  const [summary] = await listCourseSummaries(getDb(), viewer, { courseIds: [course.id] });
  if (summary) return summary;
  const latest = course.offerings[0];
  return {
    id: course.id,
    code: course.code,
    titleFr: course.titleFr,
    titleEn: course.titleEn,
    yearOfStudy: course.yearOfStudy,
    typicalTerm: course.typicalTerm,
    currentOffering: latest ? { academicYear: latest.academicYear, term: latest.term } : null,
    instructors: latest ? latest.instructors.map((i) => i.fullName) : [],
    documentCount: null,
  };
}

/** Decorative cover: brand gradient with the course code. No photos — we only show assets we have rights to. */
export function CourseCover({ code, className, compact = false }: { code: string; className?: string; compact?: boolean }) {
  const [prefix, number] = code.split(" ");
  return (
    <div
      aria-hidden="true"
      className={cx("relative overflow-hidden rounded-[12px]", className)}
      style={{ background: "linear-gradient(140deg, var(--cover-a), var(--cover-b))" }}
    >
      <div
        className="absolute inset-0 opacity-60"
        style={{ background: "radial-gradient(circle at 85% 15%, rgb(255 255 255 / 0.22), transparent 55%)" }}
      />
      <svg className="absolute right-0 bottom-0 h-full w-2/3 opacity-40" viewBox="0 0 120 80" preserveAspectRatio="none">
        <path d="M0 80 L30 45 L48 60 L72 28 L95 52 L120 34 L120 80 Z" fill="var(--ridge-far)" />
      </svg>
      <span
        className={cx(
          "absolute font-bold tracking-tight",
          compact ? "bottom-1.5 left-2 text-[11px]" : "bottom-3 left-4 text-[13px]",
        )}
        style={{ color: "var(--cover-ink)" }}
      >
        {prefix}
        {number && <span className="font-medium"> {number}</span>}
      </span>
    </div>
  );
}

type Tab = {
  key: "overview" | "notes" | "passes" | "topics" | "study" | "tutor";
  href: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** Small status label next to the name (the tutor says "Off" while it cannot answer). */
  badge?: string;
};
const futureTabs = [{ key: "recordings", icon: MicIcon }] as const;

export async function CourseHeader({
  course,
  offeringCount,
  active,
  actions,
}: {
  course: CourseSummary;
  offeringCount: number;
  active: Tab["key"];
  actions?: ReactNode;
}) {
  const t = await getTranslations();
  const locale = (await getLocale()) as Locale;
  const base = `/courses/${encodeURIComponent(course.code)}`;
  const tutorReady = await isTutorReady(getDb());
  const tabs: Tab[] = [
    { key: "overview", href: base, icon: BookIcon },
    { key: "notes", href: `${base}/notes`, icon: FolderIcon },
    { key: "passes", href: `${base}/passes`, icon: PassesIcon },
    { key: "topics", href: `${base}/topics`, icon: TagIcon },
    // The Study hub (practice, flashcards, quizzes, progress, export) for this course.
    { key: "study", href: `/practice?course=${course.id}`, icon: CardsIcon },
    // Live page: the course is preselected; it states when the tutor is off and offers the source search.
    { key: "tutor", href: `/tutor?course=${encodeURIComponent(course.code)}`, icon: SparkleIcon, badge: tutorReady ? undefined : t("nav.off") },
  ];
  const offeringLine = course.currentOffering
    ? [
        course.instructors.join(", "),
        `${course.currentOffering.academicYear} · ${t(`terms.${course.currentOffering.term}`)}`,
      ]
        .filter(Boolean)
        .join(" · ")
    : t("home.noOffering");

  return (
    <header className="mb-6">
      <Link
        href="/courses"
        className="mb-3 -ml-1 inline-flex min-h-11 items-center gap-0.5 rounded-md px-1 text-[13px] font-medium text-accent hover:text-accent-hover sm:min-h-0"
      >
        <ChevronLeftIcon width={16} height={16} />
        {t("courses.allCourses")}
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <CourseCover code={course.code} compact className="size-16 shrink-0 sm:size-20" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold tracking-wide text-text-subtle tabular-nums">{course.code}</p>
          <h1 className="text-[24px] leading-tight font-semibold tracking-[-0.02em] sm:text-[28px]">
            {localized(locale, course.titleFr, course.titleEn)}
          </h1>
          <p className="mt-0.5 text-[14px] text-text-muted">
            <span className="sr-only">{t("courseLayout.currentOffering")}: </span>
            {offeringLine}
          </p>
        </div>
        <dl className="flex shrink-0 gap-5 text-[13px] sm:text-right">
          {course.documentCount !== null && (
            <div>
              <dt className="sr-only">{t("courseLayout.notes")}</dt>
              <dd className="font-medium">{t("home.documents", { count: course.documentCount })}</dd>
            </div>
          )}
          <div>
            <dt className="sr-only">{t("course.offerings")}</dt>
            <dd className="font-medium">{t("courseLayout.offerings", { count: offeringCount })}</dd>
          </div>
        </dl>
        {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
      </div>

      <nav aria-label={t("courseLayout.tabs")} className="mt-5 -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="flex min-w-max gap-1 border-b border-border">
          {tabs.map(({ key, href, icon: Icon, badge }) => {
            const current = key === active;
            return (
              <li key={key}>
                <Link
                  href={href}
                  aria-current={current ? "page" : undefined}
                  className={cx(
                    "-mb-px flex h-11 items-center gap-2 border-b-2 px-3 text-[14px] font-medium transition-colors",
                    current ? "border-accent text-text" : "border-transparent text-text-subtle hover:text-text",
                  )}
                >
                  <Icon width={16} height={16} className={current ? "text-accent" : undefined} />
                  {t(key === "tutor" ? "nav.tutor" : `courseLayout.${key}`)}
                  {badge && (
                    <span className="rounded-full bg-surface-muted px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-text-subtle uppercase">{badge}</span>
                  )}
                </Link>
              </li>
            );
          })}
          {futureTabs.map(({ key, icon: Icon }) => (
            <li key={key}>
              <span
                aria-disabled="true"
                title={t("courseLayout.soonLabel", { feature: t(`nav.${key}`) })}
                className="-mb-px flex h-11 cursor-not-allowed items-center gap-2 border-b-2 border-transparent px-3 text-[14px] text-text-subtle/70"
              >
                <Icon width={16} height={16} />
                {t(`nav.${key}`)}
                <span className="rounded-full bg-surface-muted px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase">
                  {t("nav.soon")}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
