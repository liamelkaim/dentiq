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
import { getQuestion, listQuestions } from "@/server/passes/service";
import { getAnalytics } from "@/server/analytics/service";
import { canAccessLibrary, isModerator } from "@/server/resources/service";
import { AnswerBadge, CategoryBadge, ChoiceList, excerpt, hrefWith } from "./pass-ui";
import { Badge, Button, buttonClass, ButtonLink, cx, EmptyState, Field, Input, Notice, Panel, Select } from "./ui";

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
  const tTerms = await getTranslations("terms");
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

  // The selected question is previewed on the right (choices without answer marks; the full page reveals answers).
  const selectedParam = typeof search.sel === "string" ? search.sel : undefined;
  const selectedItem = result.items.find((i) => i.id === selectedParam) ?? result.items[0];
  const [detail, analytics] = await Promise.all([
    selectedItem ? getQuestion(db, viewer, selectedItem.id) : Promise.resolve(null),
    !course ? getAnalytics(db, viewer, locale) : Promise.resolve(null),
  ]);

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
                "flex min-h-11 min-w-0 flex-1 items-center justify-center rounded-[8px] px-2 py-1 text-center text-[13px] leading-tight font-medium sm:h-8 sm:flex-none sm:px-3 sm:whitespace-nowrap",
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
        <form method="get" action={basePath} className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 xl:grid-cols-4">
          {params.scope !== "all" && <input type="hidden" name="scope" value={params.scope} />}
          <Field label={t("filters.search")} htmlFor="pf-q" className="min-[480px]:col-span-2">
            <Input id="pf-q" name="q" defaultValue={params.q} maxLength={100} placeholder={t("filters.searchPlaceholder")} />
          </Field>
          {!course && (
            <Field label={t("filters.course")} htmlFor="pf-course" className="min-[480px]:col-span-2">
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
            <Field label={t("filters.offering")} htmlFor="pf-offering" className="min-[480px]:col-span-2">
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
          <div className="flex items-end gap-2 min-[480px]:col-span-2 xl:col-span-4">
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
        (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,8fr)]">
            <div className="flex min-w-0 flex-col gap-4">
              {analytics && (
                <Panel className="p-4">
                  <h2 className="mb-3 text-[17px] font-semibold">{t("queue.title")}</h2>
                  <dl className="divide-y divide-border text-[14px]">
                    {(
                      [
                        ["reviewLater", analytics.marks.reviewLater],
                        ["flagged", analytics.marks.flagged],
                      ] as const
                    ).map(([key, value]) => (
                      <div key={key} className="flex items-center justify-between py-2">
                        <dt className="text-text-muted">{t(`queue.${key}`)}</dt>
                        <dd className="font-semibold tabular-nums">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </Panel>
              )}
              <Panel className="overflow-hidden">
                <ul className="max-h-[720px] divide-y divide-border overflow-y-auto">
                  {result.items.map((item) => {
                    const active = item.id === selectedItem?.id;
                    return (
                      <li key={item.id}>
                        <Link
                          href={hrefWith(basePath, query, { sel: item.id, page: params.page > 1 ? String(params.page) : undefined })}
                          aria-current={active ? "true" : undefined}
                          className={cx(
                            "flex min-h-[72px] flex-col justify-center gap-1 border-l-[3px] px-4 py-3 transition-colors",
                            active ? "border-accent-solid bg-accent-soft" : "border-transparent hover:bg-surface-hover",
                          )}
                        >
                          <span className="line-clamp-2 text-[14px] font-medium">{excerpt(item.questionText, 110)}</span>
                          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-text-muted">
                            <span className="tabular-nums">{item.courseCode}</span>
                            <span>{item.examAcademicYear}</span>
                            <AnswerBadge status={item.answerStatus} />
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </Panel>
            </div>

            {detail && (
              <Panel className="min-w-0 self-start p-5">
                <article aria-label={excerpt(detail.questionText, 80)}>
                  <p className="text-[13px] text-text-muted">
                    {[detail.course.code, detail.examAcademicYear, detail.examTerm ? tTerms(detail.examTerm) : null].filter(Boolean).join(" · ")}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <Badge>{typeName(detail.type.key)}</Badge>
                    <AnswerBadge status={detail.answerStatus} />
                    <CategoryBadge category={detail.category} />
                  </div>
                  <h2 className="mt-4 text-[22px] leading-snug font-semibold whitespace-pre-line break-words">{detail.questionText}</h2>
                  {detail.images.length > 0 && (
                    <ul className="mt-4 grid grid-cols-2 gap-2">
                      {detail.images.map((image) => (
                        <li key={image.id}>
                          <a href={`/api/question-images/${image.id}`} target="_blank" rel="noopener" className="block rounded-[10px] border border-border bg-surface-muted p-1">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={`/api/question-images/${image.id}`} alt={image.altText ?? ""} className="max-h-48 w-full rounded-[8px] object-contain" />
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                  <ChoiceList choices={detail.choices} rule={detail.type.answer} />
                  <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                    <p className="text-[13px] text-text-muted">{t("preview.hint")}</p>
                    <ButtonLink href={`/passes/${detail.id}`}>{t("preview.open")}</ButtonLink>
                  </div>
                </article>
              </Panel>
            )}
          </div>
        )
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
