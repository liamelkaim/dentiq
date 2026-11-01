import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { CourseCover } from "@/components/course-layout";
import { ChevronRightIcon, SearchIcon } from "@/components/icons";
import { Badge, Button, buttonClass, EmptyState, List, ListLinkRow, Select, cx } from "@/components/ui";
import { getDb } from "@/db/client";
import { terms, type Term } from "@/db/schema";
import { localized, type Locale } from "@/i18n/config";
import { requireUser } from "@/server/auth/session";
import { countCourses, listCourses, listCourseYears } from "@/server/catalog/service";
import { listCourseSummaries } from "@/server/resources/service";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("courses"))("title") };
}

type SearchParams = Promise<{ q?: string; year?: string; term?: string; view?: string }>;

function parseFilters(params: Awaited<SearchParams>) {
  const q = typeof params.q === "string" ? params.q.slice(0, 100) : "";
  const yearNum = Number(params.year);
  const year = Number.isInteger(yearNum) && yearNum >= 1 && yearNum <= 8 ? yearNum : undefined;
  const term = (terms as readonly string[]).includes(params.term ?? "") ? (params.term as Term) : undefined;
  const view: "grid" | "list" = params.view === "list" ? "list" : "grid";
  return { q, year, term, view };
}

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

export default async function CoursesPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  const t = await getTranslations();
  const locale = (await getLocale()) as Locale;
  const { view, ...filters } = parseFilters(await searchParams);
  const db = getDb();
  const [courses, years, total] = await Promise.all([listCourses(db, filters), listCourseYears(db), countCourses(db)]);
  const summaries = await listCourseSummaries(db, user, { courseIds: courses.map((c) => c.id) });
  const summaryById = new Map(summaries.map((s) => [s.id, s]));
  const filtered = Boolean(filters.q || filters.year || filters.term);

  /** Same page, one query parameter changed (the tabs and the view toggle keep the rest). */
  function href(next: { term?: Term | null; view?: "grid" | "list" }) {
    const params = new URLSearchParams();
    if (filters.q) params.set("q", filters.q);
    if (filters.year) params.set("year", String(filters.year));
    const nextTerm = next.term === undefined ? filters.term : (next.term ?? undefined);
    if (nextTerm) params.set("term", nextTerm);
    const nextView = next.view ?? view;
    if (nextView === "list") params.set("view", "list");
    const query = params.toString();
    return query ? `/courses?${query}` : "/courses";
  }

  const tabs: { key: string; label: string; term: Term | null }[] = [
    { key: "all", label: t("courses.allCourses"), term: null },
    ...terms.map((term) => ({ key: term, label: t(`terms.${term}`), term })),
  ];

  return (
    <>
      <header className="mb-6 min-h-[110px] px-1 lg:px-3">
        <h1 className="text-[34px] leading-[1.1] font-bold tracking-[-0.03em] text-mountain-title sm:text-[42px] lg:text-[46px]">{t("courses.title")}</h1>
        <p className="mt-1 text-[18px] leading-snug text-text-muted sm:text-[22px] lg:text-[27px]">{t("courses.subtitle")}</p>
      </header>

      {total === 0 ? (
        <EmptyState title={t("courses.emptyTitle")} body={t("courses.emptyBody")} />
      ) : (
        <div className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface shadow-card">
          {/* Toolbar: tabs on the left, filters and view toggle on the right */}
          <div className="flex flex-col gap-3 border-b border-border px-4 pt-3 lg:flex-row lg:items-end lg:justify-between">
            <nav aria-label={t("courses.term")} className="-mb-px flex gap-1 overflow-x-auto">
              {tabs.map((tab) => {
                const active = (filters.term ?? null) === tab.term;
                return (
                  <Link
                    key={tab.key}
                    href={href({ term: tab.term })}
                    aria-current={active ? "page" : undefined}
                    className={cx(
                      "inline-flex h-12 shrink-0 items-center border-b-2 px-4 text-[15px] transition-colors",
                      active ? "border-accent-solid font-semibold text-accent" : "border-transparent text-text-muted hover:text-text",
                    )}
                  >
                    {tab.label}
                  </Link>
                );
              })}
            </nav>
            <form role="search" action="/courses" className="flex flex-wrap items-center gap-2 pb-3 lg:flex-nowrap">
              {filters.term && <input type="hidden" name="term" value={filters.term} />}
              {view === "list" && <input type="hidden" name="view" value="list" />}
              <label htmlFor="q" className="sr-only">
                {t("courses.searchLabel")}
              </label>
              <div className="relative">
                <SearchIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-subtle" width={16} height={16} />
                <input
                  id="q"
                  name="q"
                  type="search"
                  defaultValue={filters.q}
                  placeholder={t("courses.searchPlaceholder")}
                  maxLength={100}
                  className="h-10 w-44 rounded-[var(--radius-control)] border border-border-strong bg-surface pr-3 pl-9 text-[14px] placeholder:text-text-subtle focus:border-accent"
                />
              </div>
              <label htmlFor="year" className="sr-only">
                {t("courses.year")}
              </label>
              <Select id="year" name="year" defaultValue={filters.year ?? ""} className="h-10 w-36! min-w-0 flex-none">
                <option value="">{t("courses.anyYear")}</option>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {t("courses.yearN", { year: y })}
                  </option>
                ))}
              </Select>
              <Button type="submit" variant="secondary">
                {t("courses.filter")}
              </Button>
              <div role="group" aria-label={t("courses.view")} className="flex gap-1">
                {(["grid", "list"] as const).map((v) => (
                  <Link
                    key={v}
                    href={href({ view: v })}
                    aria-label={t(`courses.view_${v}`)}
                    aria-current={view === v ? "true" : undefined}
                    className={cx(
                      "grid size-10 place-items-center rounded-[10px] border transition-colors",
                      view === v ? "border-accent-solid bg-accent-solid text-on-accent" : "border-border-strong text-text-muted hover:bg-surface-muted",
                    )}
                  >
                    {v === "grid" ? (
                      <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor" aria-hidden="true">
                        <rect x="2" y="2" width="6" height="6" rx="1.2" />
                        <rect x="10" y="2" width="6" height="6" rx="1.2" />
                        <rect x="2" y="10" width="6" height="6" rx="1.2" />
                        <rect x="10" y="10" width="6" height="6" rx="1.2" />
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                        <path d="M3 5h12M3 9h12M3 13h12" />
                      </svg>
                    )}
                  </Link>
                ))}
              </div>
            </form>
          </div>

          <div className="p-4">
            <div className="mb-3 flex items-center justify-between px-1 text-[13px] text-text-subtle">
              <span aria-live="polite">{t("courses.results", { count: courses.length })}</span>
              {filtered && (
                <Link href={view === "list" ? "/courses?view=list" : "/courses"} className={buttonClass("ghost", undefined, "sm")}>
                  {t("courses.clear")}
                </Link>
              )}
            </div>

            {courses.length === 0 ? (
              <EmptyState title={t("courses.noMatchesTitle")} body={t("courses.noMatchesBody")} />
            ) : view === "list" ? (
              <List>
                {courses.map((course) => (
                  <ListLinkRow
                    key={course.id}
                    href={`/courses/${encodeURIComponent(course.code)}`}
                    title={localized(locale, course.titleFr, course.titleEn)}
                    subtitle={
                      <>
                        <span className="font-medium text-text-muted tabular-nums">{course.code}</span>
                        {course.yearOfStudy && <> · {t("courses.yearN", { year: course.yearOfStudy })}</>}
                        {course.typicalTerm && <> · {t(`terms.${course.typicalTerm}`)}</>}
                      </>
                    }
                    trailing={course.credits && <Badge>{t("courses.credits", { credits: Number(course.credits) })}</Badge>}
                  />
                ))}
              </List>
            ) : (
              <ul className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                {courses.map((course) => {
                  const summary = summaryById.get(course.id);
                  const instructor = summary?.instructors[0];
                  const docs = summary?.documentCount ?? null;
                  const target = `/courses/${encodeURIComponent(course.code)}`;
                  return (
                    <li key={course.id} className="rounded-[14px] border border-border bg-surface-muted/30 p-3">
                      <Link href={target} className="group block">
                        <CourseCover code={course.code} className="h-[132px] rounded-[10px]" />
                        <div className="mt-3 flex items-start justify-between gap-3 px-1">
                          <p className="min-w-0 truncate text-[20px] leading-tight font-semibold group-hover:text-accent">
                            {localized(locale, course.titleFr, course.titleEn)}
                          </p>
                          {docs !== null && <span className="shrink-0 pt-1 text-[13px] text-text-muted">{t("home.documents", { count: docs })}</span>}
                        </div>
                      </Link>
                      <div className="mt-2 flex items-center gap-2.5 px-1 text-[14px] text-text-muted">
                        {instructor && (
                          <>
                            <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-accent-soft text-[11px] font-semibold text-accent">
                              {initials(instructor)}
                            </span>
                            <span className="truncate">{instructor}</span>
                          </>
                        )}
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-3 rounded-[12px] border border-border bg-surface-muted/40 px-3.5 py-2.5">
                        <span className="min-w-0 text-[13px] text-text-muted">
                          <span className="block font-medium tabular-nums text-text">{course.code}</span>
                          <span className="block truncate">
                            {[
                              course.yearOfStudy ? t("courses.yearN", { year: course.yearOfStudy }) : null,
                              course.typicalTerm ? t(`terms.${course.typicalTerm}`) : null,
                              course.credits ? t("courses.credits", { credits: Number(course.credits) }) : null,
                            ]
                              .filter(Boolean)
                              .join(" · ") || t("course.notSpecified")}
                          </span>
                        </span>
                        <Link href={target} className={cx(buttonClass("primary"), "shrink-0 gap-1")}>
                          {t("courses.open")}
                          <ChevronRightIcon width={16} height={16} />
                        </Link>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </>
  );
}
