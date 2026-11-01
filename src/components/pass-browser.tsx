// The list of exam questions with its filters: used by the global /passes page and by each course's Passes tab.
// A course page shows ALL of the course's offerings by default and offers an offering filter.
import Link from "next/link";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { getDb } from "@/db/client";
import { localized, type Locale } from "@/i18n/config";
import type { CurrentUser } from "@/server/auth/session";
import { recentAcademicYears } from "@/server/passes/academic-year";
import { lastPageOf, paramsToQuery, parseBrowseParams, SCOPES, toQuestionFilters } from "@/server/passes/browse";
import { knownQuestionTypes } from "@/server/passes/question-types";
import { listCourseChoices, passFilterOptions } from "@/server/passes/queries";
import { listQuestions } from "@/server/passes/service";
import { canAccessLibrary, isModerator } from "@/server/resources/service";
import { hrefWith, PassRow } from "./pass-ui";
import { Button, buttonClass, ButtonLink, cx, EmptyState, Field, Input, List, Notice, Panel, Select } from "./ui";

type Props = {
  viewer: CurrentUser;
  /** "/passes" or "/courses/CODE/passes" */
  basePath: string;
  search: Record<string, string | string[] | undefined>;
  course?: { id: string; code: string };
  offerings?: { id: string; label: string }[];
  newHref: string;
};

export async function PassBrowser({ viewer, basePath, search, course, offerings = [], newHref }: Props) {
  const t = await getTranslations("passes");
  const locale = (await getLocale()) as Locale;

  if (!canAccessLibrary(viewer)) {
    return (
      <Notice tone="warning" title={(await getTranslations("resources"))("noAccessTitle")}>
        {(await getTranslations("resources"))("noAccessBody")}
      </Notice>
    );
  }

  const db = getDb();
  const moderator = isModerator(viewer);
  const params = parseBrowseParams(search, { moderator });
  const query = paramsToQuery(params);
  const [options, courseChoices, result] = await Promise.all([
    passFilterOptions(db, course?.id),
    course ? Promise.resolve([]) : listCourseChoices(db),
    listQuestions(db, viewer, toQuestionFilters(params, course?.id)),
  ]);

  // The last eight academic years, plus any older year that has questions (or is being filtered on).
  const years = [...new Set([...recentAcademicYears(8), ...options.years, ...(params.year ? [params.year] : [])])].sort().reverse();
  const filtersActive = Boolean(
    params.q || params.year || params.type || params.answer || params.status || params.course || params.offering || params.professor || params.topic,
  );
  // On the global view filtered to one course, offer the course's own Passes tab.
  const openCourse = !course && params.course ? courseChoices.find((c) => c.id === params.course) : undefined;
  const lastPage = lastPageOf(result.total);
  // A link to a page past the end (a shared link, or items removed since) goes to the last page instead of showing an
  // empty list whose "previous" link would only lead to another empty page.
  if (params.page > lastPage) redirect(hrefWith(basePath, query, { page: lastPage > 1 ? String(lastPage) : undefined }));
  const typeName = (key: string) => t(`types.${key}.name`);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <nav aria-label={t("category.label")} className="flex gap-1 rounded-[10px] bg-surface-muted p-1 sm:w-fit">
          {SCOPES.map((scope) => (
            <Link
              key={scope}
              href={hrefWith(basePath, query, { scope: scope === "all" ? undefined : scope, page: undefined })}
              aria-current={params.scope === scope ? "page" : undefined}
              className={cx(
                "flex h-11 flex-1 items-center justify-center rounded-[8px] px-3 text-[13px] font-medium whitespace-nowrap sm:h-8 sm:flex-none",
                params.scope === scope ? "bg-surface text-text shadow-card" : "text-text-subtle hover:text-text",
              )}
            >
              {t(`category.${scope}`)}
            </Link>
          ))}
        </nav>
        <div className="flex flex-wrap items-center gap-2">
          {openCourse && (
            <ButtonLink href={`/courses/${encodeURIComponent(openCourse.code)}/passes`} variant="secondary" size="sm">
              {t("browser.openInCourse", { code: openCourse.code })}
            </ButtonLink>
          )}
          {!course && (
            <ButtonLink href="/passes/mine" variant="ghost" size="sm">
              {t("mine.link")}
            </ButtonLink>
          )}
          <ButtonLink href={newHref} size="sm">
            {t("add")}
          </ButtonLink>
        </div>
      </div>

      <p className="-mt-2 text-[13px] text-text-subtle">{t(`category.help.${params.scope}`)}</p>

      <Panel className="p-4">
        <form method="get" action={basePath} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {params.scope !== "all" && <input type="hidden" name="scope" value={params.scope} />}
          <Field label={t("filters.search")} htmlFor="pf-q" className="col-span-2">
            <Input id="pf-q" name="q" defaultValue={params.q} maxLength={100} placeholder={t("filters.searchPlaceholder")} />
          </Field>
          {!course && (
            <Field label={t("filters.course")} htmlFor="pf-course" className="col-span-2">
              <Select id="pf-course" name="course" defaultValue={params.course ?? ""}>
                <option value="">{t("filters.allCourses")}</option>
                {courseChoices.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} · {localized(locale, c.titleFr, c.titleEn)}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {course && offerings.length > 0 && (
            <Field label={t("filters.offering")} htmlFor="pf-offering" className="col-span-2">
              <Select id="pf-offering" name="offering" defaultValue={params.offering ?? ""}>
                <option value="">{t("filters.allOfferings")}</option>
                {offerings.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label={t("filters.year")} htmlFor="pf-year">
            <Select id="pf-year" name="year" defaultValue={params.year ?? ""}>
              <option value="">{t("filters.allYears")}</option>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("filters.type")} htmlFor="pf-type">
            <Select id="pf-type" name="type" defaultValue={params.type ?? ""}>
              <option value="">{t("filters.allTypes")}</option>
              {knownQuestionTypes.map((k) => (
                <option key={k} value={k}>
                  {typeName(k)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("filters.answer")} htmlFor="pf-answer">
            <Select id="pf-answer" name="answer" defaultValue={params.answer ?? ""}>
              <option value="">{t("filters.anyAnswer")}</option>
              <option value="verified">{t("answer.verifiedBadge")}</option>
              <option value="proposed">{t("answer.proposedBadge")}</option>
            </Select>
          </Field>
          {course && options.professors.length > 0 && (
            <Field label={t("filters.professor")} htmlFor="pf-professor">
              <Select id="pf-professor" name="professor" defaultValue={params.professor ?? ""}>
                <option value="">{t("filters.allProfessors")}</option>
                {options.professors.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {options.topics.length > 0 && (
            <Field label={t("filters.topic")} htmlFor="pf-topic">
              <Select id="pf-topic" name="topic" defaultValue={params.topic ?? ""}>
                <option value="">{t("filters.allTopics")}</option>
                {options.topics.map((topic) => (
                  <option key={topic} value={topic}>
                    {topic}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {moderator && (
            <Field label={t("filters.status")} htmlFor="pf-status">
              <Select id="pf-status" name="status" defaultValue={params.status ?? ""}>
                <option value="">{t("filters.defaultStatus")}</option>
                {(["pending", "published", "rejected", "hidden"] as const).map((s) => (
                  <option key={s} value={s}>
                    {t(`status.${s === "published" ? "publishedLabel" : s}`)}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <div className="col-span-2 flex items-end gap-2 lg:col-span-4">
            <Button type="submit" size="sm">
              {t("filters.apply")}
            </Button>
            {filtersActive && (
              <Link href={hrefWith(basePath, { scope: query.scope })} className={buttonClass("ghost", undefined, "sm")}>
                {t("filters.reset")}
              </Link>
            )}
          </div>
        </form>
      </Panel>

      <p className="px-1 text-[13px] text-text-subtle" aria-live="polite">
        {t("browser.count", { count: result.total })}
      </p>

      {result.items.length === 0 ? (
        filtersActive || params.scope !== "all" ? (
          <EmptyState
            title={t("browser.noResults")}
            body={params.scope !== "all" && !filtersActive ? t(`browser.emptyScope.${params.scope}`) : t("browser.noResultsBody")}
            action={
              <Link href={basePath} className={buttonClass("secondary")}>
                {t("filters.reset")}
              </Link>
            }
          />
        ) : (
          <EmptyState
            title={t("browser.emptyTitle")}
            body={t("browser.emptyBody")}
            action={<ButtonLink href={newHref}>{t("add")}</ButtonLink>}
          />
        )
      ) : (
        <List>
          {result.items.map((item) => (
            <PassRow key={item.id} item={item} courseLabel={course ? undefined : item.courseCode} />
          ))}
        </List>
      )}

      {lastPage > 1 && (
        <nav aria-label={t("browser.pages")} className="flex items-center justify-between gap-3">
          {params.page > 1 ? (
            <Link href={hrefWith(basePath, query, { page: params.page - 1 > 1 ? String(params.page - 1) : undefined })} className={buttonClass("secondary", undefined, "sm")}>
              {t("browser.previous")}
            </Link>
          ) : (
            <span />
          )}
          <span className="text-[13px] text-text-subtle">{t("browser.pageOf", { page: params.page, total: lastPage })}</span>
          {params.page < lastPage ? (
            <Link href={hrefWith(basePath, query, { page: String(params.page + 1) })} className={buttonClass("secondary", undefined, "sm")}>
              {t("browser.next")}
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
