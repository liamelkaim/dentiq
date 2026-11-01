import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { SearchIcon } from "@/components/icons";
import { Badge, Button, buttonClass, EmptyState, List, ListLinkRow, PageHeader, Section, Select } from "@/components/ui";
import { getDb } from "@/db/client";
import { terms, type Term } from "@/db/schema";
import { localized, type Locale } from "@/i18n/config";
import { requireUser } from "@/server/auth/session";
import { countCourses, listCourses, listCourseYears } from "@/server/catalog/service";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("courses"))("title") };
}

type SearchParams = Promise<{ q?: string; year?: string; term?: string }>;

function parseFilters(params: Awaited<SearchParams>) {
  const q = typeof params.q === "string" ? params.q.slice(0, 100) : "";
  const yearNum = Number(params.year);
  const year = Number.isInteger(yearNum) && yearNum >= 1 && yearNum <= 8 ? yearNum : undefined;
  const term = (terms as readonly string[]).includes(params.term ?? "") ? (params.term as Term) : undefined;
  return { q, year, term };
}

export default async function CoursesPage({ searchParams }: { searchParams: SearchParams }) {
  await requireUser();
  const t = await getTranslations();
  const locale = (await getLocale()) as Locale;
  const filters = parseFilters(await searchParams);
  const db = getDb();
  const [courses, years, total] = await Promise.all([listCourses(db, filters), listCourseYears(db), countCourses(db)]);
  const filtered = Boolean(filters.q || filters.year || filters.term);

  // Group by year of study; courses without one go last.
  const groups = new Map<number | null, typeof courses>();
  for (const course of courses) {
    const key = course.yearOfStudy ?? null;
    groups.set(key, [...(groups.get(key) ?? []), course]);
  }

  return (
    <>
      <PageHeader title={t("courses.title")} subtitle={t("courses.subtitle")} />

      {total === 0 ? (
        <EmptyState title={t("courses.emptyTitle")} body={t("courses.emptyBody")} />
      ) : (
        <>
          <form role="search" className="mb-6 flex flex-col gap-2 sm:flex-row" action="/courses">
            <label htmlFor="q" className="sr-only">
              {t("courses.searchLabel")}
            </label>
            <div className="relative flex-1">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-subtle" width={18} height={18} />
              <input
                id="q"
                name="q"
                type="search"
                defaultValue={filters.q}
                placeholder={t("courses.searchPlaceholder")}
                maxLength={100}
                className="h-10 w-full rounded-[var(--radius-control)] border border-border-strong bg-surface pr-3 pl-9 text-[15px] placeholder:text-text-subtle focus:border-accent"
              />
            </div>
            <div className="flex gap-2">
              <label htmlFor="year" className="sr-only">
                {t("courses.year")}
              </label>
              <Select id="year" name="year" defaultValue={filters.year ?? ""} className="min-w-0 flex-1 sm:w-48 sm:flex-none">
                <option value="">{t("courses.anyYear")}</option>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {t("courses.yearN", { year: y })}
                  </option>
                ))}
              </Select>
              <label htmlFor="term" className="sr-only">
                {t("courses.term")}
              </label>
              <Select id="term" name="term" defaultValue={filters.term ?? ""} className="min-w-0 flex-1 sm:w-48 sm:flex-none">
                <option value="">{t("courses.anyTerm")}</option>
                {terms.map((term) => (
                  <option key={term} value={term}>
                    {t(`terms.${term}`)}
                  </option>
                ))}
              </Select>
              <Button type="submit" variant="secondary">
                {t("courses.filter")}
              </Button>
            </div>
          </form>

          <div className="mb-3 flex items-center justify-between px-1 text-[13px] text-text-subtle">
            <span aria-live="polite">{t("courses.results", { count: courses.length })}</span>
            {filtered && (
              <Link href="/courses" className={buttonClass("ghost", undefined, "sm")}>
                {t("courses.clear")}
              </Link>
            )}
          </div>

          {courses.length === 0 ? (
            <EmptyState title={t("courses.noMatchesTitle")} body={t("courses.noMatchesBody")} />
          ) : (
            [...groups.entries()].map(([year, items]) => (
              <Section key={year ?? "none"} title={year ? t("courses.yearN", { year }) : t("course.notSpecified")}>
                <List>
                  {items.map((course) => (
                    <ListLinkRow
                      key={course.id}
                      href={`/courses/${encodeURIComponent(course.code)}`}
                      title={localized(locale, course.titleFr, course.titleEn)}
                      subtitle={
                        <>
                          <span className="font-medium text-text-muted tabular-nums">{course.code}</span>
                          {course.typicalTerm && <> · {t(`terms.${course.typicalTerm}`)}</>}
                        </>
                      }
                      trailing={course.credits && <Badge>{t("courses.credits", { credits: Number(course.credits) })}</Badge>}
                    />
                  ))}
                </List>
              </Section>
            ))
          )}
        </>
      )}
    </>
  );
}
