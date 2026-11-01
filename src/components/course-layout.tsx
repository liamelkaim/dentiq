// Reusable course layout: cover art, header with real stats, and section tabs.
// Tabs for features that don't exist yet (recordings) are shown disabled with a "Soon" label, never as links.
// The tutor tab is a real link: the page exists and says plainly whether the tutor is off.
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { getDb } from "@/db/client";
import { localized, type Locale } from "@/i18n/config";
import type { CurrentUser } from "@/server/auth/session";
import { getCourseByCode } from "@/server/catalog/service";
import { courseCodeFromSegment } from "@/server/catalog/validation";
import { listCourseSummaries, type CourseSummary } from "@/server/resources/service";
import { isTutorReady } from "@/server/tutor/service";
import { ChevronLeftIcon } from "./icons";
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

/** Picks one of the original cover motifs from the course code, so a course always keeps the same cover. */
function coverMotif(code: string): 0 | 1 | 2 {
  let h = 0;
  for (const ch of code) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (h % 3) as 0 | 1 | 2;
}

/** Decorative cover: original vector illustration (tooth, capsules or dental arch) on the brand gradient, with the course code. No photos. */
export function CourseCover({ code, className, compact = false }: { code: string; className?: string; compact?: boolean }) {
  const [prefix, number] = code.split(" ");
  const motif = coverMotif(code);
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
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 400 150" preserveAspectRatio="xMidYMid slice" fill="none">
        {motif === 0 && (
          <g fill="var(--cover-ink)" opacity="0.32">
            <path d="M262 22c-20-12-46-4-52 18-4 14 2 28 8 42 5 13 6 30 12 40 4 8 11 8 14-2 3-12 6-24 12-24s9 12 12 24c3 10 10 10 14 2 6-10 7-27 12-40 6-14 12-28 8-42-6-22-32-30-52-18-5 3-15 3-20 0Z" />
            <path d="M92 70c-14-8-32-2-36 13-3 10 1 20 5 29 4 9 4 21 8 28 3 6 8 6 10-1 2-8 4-17 8-17s6 9 8 17c2 7 7 7 10 1 4-7 4-19 8-28 4-9 8-19 5-29-4-15-22-21-36-13-3 2-10 2-14 0Z" opacity="0.7" />
          </g>
        )}
        {motif === 1 && (
          <g fill="var(--cover-ink)" opacity="0.3">
            <rect x="170" y="14" width="120" height="48" rx="24" transform="rotate(-24 230 38)" />
            <rect x="250" y="72" width="130" height="50" rx="25" transform="rotate(18 315 97)" opacity="0.7" />
            <rect x="60" y="82" width="110" height="44" rx="22" transform="rotate(-12 115 104)" opacity="0.55" />
            <rect x="190" y="104" width="90" height="38" rx="19" transform="rotate(32 235 123)" opacity="0.45" />
          </g>
        )}
        {motif === 2 && (
          <g stroke="var(--cover-ink)" strokeWidth="3" opacity="0.3" strokeLinecap="round">
            <path d="M70 120c0-62 56-92 130-92s130 30 130 92" />
            <path d="M104 120c0-44 38-66 96-66s96 22 96 66" opacity="0.7" />
            <path d="M136 132V96M170 132V80M200 132V76M230 132V80M264 132V96M104 132V108M296 132V108" strokeWidth="9" opacity="0.55" />
          </g>
        )}
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
  /** Small status label next to the name (the tutor says "Off" while it cannot answer). */
  badge?: string;
};

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]!.toUpperCase())
      .join("") || "?"
  );
}

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
  // Recordings has no page yet, so it is not shown at all.
  const tabs: Tab[] = [
    { key: "overview", href: base },
    { key: "notes", href: `${base}/notes` },
    { key: "passes", href: `${base}/passes` },
    { key: "topics", href: `${base}/topics` },
    // The Study hub (practice, flashcards, quizzes, progress, export) for this course.
    { key: "study", href: `/practice?course=${course.id}` },
    // Live page: the course is preselected; it states when the tutor is off and offers the source search.
    { key: "tutor", href: `/tutor?course=${encodeURIComponent(course.code)}`, badge: tutorReady ? undefined : t("nav.off") },
  ];
  const title = localized(locale, course.titleFr, course.titleEn);
  const instructor = course.instructors[0];

  return (
    <header className="mb-6">
      <nav aria-label={t("courseLayout.breadcrumb")} className="mb-5 flex items-center gap-2 px-1 text-[14px] text-text-muted">
        <Link href="/courses" className="inline-flex min-h-11 items-center gap-1.5 rounded-md hover:text-text sm:min-h-0">
          <ChevronLeftIcon width={16} height={16} />
          {t("nav.courses")}
        </Link>
        <span aria-hidden="true">/</span>
        <span className="truncate font-medium text-text">{title}</span>
      </nav>

      <div className="flex flex-col gap-5 px-1 sm:flex-row sm:items-center">
        <CourseCover code={course.code} className="h-[120px] w-full shrink-0 rounded-[12px] sm:h-[140px] sm:w-[205px]" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold tracking-wide text-text-subtle tabular-nums">{course.code}</p>
          <h1 className="text-[28px] leading-tight font-bold tracking-[-0.03em] text-mountain-title sm:text-[36px]">{title}</h1>
          <p className="mt-2 flex items-center gap-2.5 text-[15px] text-text-muted">
            <span className="sr-only">{t("courseLayout.currentOffering")}: </span>
            {instructor && (
              <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-accent-soft text-[11px] font-semibold text-accent">
                {initials(instructor)}
              </span>
            )}
            <span className="truncate">
              {course.currentOffering
                ? [course.instructors.join(", "), `${course.currentOffering.academicYear} · ${t(`terms.${course.currentOffering.term}`)}`].filter(Boolean).join(" · ")
                : t("home.noOffering")}
            </span>
          </p>
          <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[14px] text-text-muted">
            {course.documentCount !== null && (
              <div className="flex items-center gap-2">
                <dt className="sr-only">{t("courseLayout.notes")}</dt>
                <dd>{t("home.documents", { count: course.documentCount })}</dd>
              </div>
            )}
            <div className="flex items-center gap-2">
              <dt className="sr-only">{t("course.offerings")}</dt>
              <dd>{t("courseLayout.offerings", { count: offeringCount })}</dd>
            </div>
          </dl>
        </div>
        {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
      </div>

      <nav aria-label={t("courseLayout.tabs")} className="mt-6 -mx-4 overflow-x-auto overflow-y-hidden border-b border-border px-4 sm:mx-0 sm:px-1">
        <ul className="flex min-w-max gap-2">
          {tabs.map(({ key, href, badge }) => {
            const current = key === active;
            return (
              <li key={key}>
                <Link
                  href={href}
                  aria-current={current ? "page" : undefined}
                  className={cx(
                    "-mb-px flex h-12 items-center gap-2 border-b-[3px] px-4 text-[15px] transition-colors",
                    current ? "border-accent-solid font-semibold text-accent" : "border-transparent text-text-muted hover:text-text",
                  )}
                >
                  {t(key === "tutor" ? "nav.tutor" : `courseLayout.${key}`)}
                  {badge && (
                    <span className="rounded-full bg-surface-muted px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-text-subtle uppercase">{badge}</span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </header>
  );
}
