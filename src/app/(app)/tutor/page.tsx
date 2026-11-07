import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { AskForm } from "@/components/tutor-ask";
import { PassageCard } from "@/components/tutor-ui";
import { Badge, Button, EmptyState, Field, Input, Notice, PageHeader, Panel, Section, Select } from "@/components/ui";
import { getDb } from "@/db/client";
import { localized, type Locale } from "@/i18n/config";
import { requireUser } from "@/server/auth/session";
import { listCourseChoices } from "@/server/passes/queries";
import { checkRate } from "@/server/rate-limit/guard";
import { RATE_TUTOR_SEARCH } from "@/server/rate-limit/limits";
import { canAccessLibrary } from "@/server/resources/service";
import { QUESTION_MAX_CHARS } from "@/server/tutor/constants";
import { acceptConsentAction, withdrawConsentAction } from "@/server/tutor/actions";
import { hasTutorConsent } from "@/server/tutor/consent";
import { getTutorStatus, searchSources } from "@/server/tutor/service";
import type { Passage } from "@/server/tutor/types";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("tutor"))("title") };
}

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/**
 * The tutor page. It states honestly that the tutor is off (no provider, no budget) and offers what works today: a plain
 * search over the sources the student may open for one course. The search is labelled as a search, shows excerpts with
 * their sources, and never presents anything as an answer. The tutor state and the search are both read on the server.
 */
export default async function TutorPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const viewer = await requireUser();
  const t = await getTranslations("tutor");
  const locale = (await getLocale()) as Locale;

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
  const params = await searchParams;
  const [status, courses, consented] = await Promise.all([getTutorStatus(db), listCourseChoices(db), hasTutorConsent(db, viewer.id)]);
  const course = courses.find((c) => c.code === first(params.course));
  const q = (first(params.q) ?? "").trim().slice(0, QUESTION_MAX_CHARS);
  const includeHistorical = first(params.historical) === "1";
  // Only an actual source search counts (it reads every source of the course); opening the page does not.
  const searching = Boolean(course && q);
  const limited = searching && !(await checkRate(RATE_TUTOR_SEARCH, viewer.id)).allowed;
  const result = course && q && !limited ? await searchSources(db, viewer, { courseId: course.id, query: q, includeHistorical, locale }) : null;

  const current: Passage[] = result?.passages.filter((p) => p.source.period === "current") ?? [];
  const historical: Passage[] = result?.passages.filter((p) => p.source.period === "historical") ?? [];
  const badgeTone = status.state === "ready" ? "success" : "warning";

  return (
    <>
      <PageHeader title={t("title")} subtitle={t("subtitle")} actions={<Badge tone={badgeTone}>{t(`badge.${status.state}`)}</Badge>} />

      <Notice tone={status.state === "ready" ? "accent" : "warning"} title={t(`status.${status.state}.title`)} className="mb-8">
        {t(`status.${status.state}.body`)}
      </Notice>

      {status.state === "ready" && (
        <Section title={t("ask.title")} description={t("ask.description")}>
          {consented ? (
            <>
              <AskForm courses={courses.map((c) => ({ id: c.id, label: `${c.code} · ${localized(locale, c.titleFr, c.titleEn)}` }))} />
              <div className="mt-4 flex flex-wrap items-center gap-4">
                <a href="/tutor/history" className="inline-flex min-h-11 items-center text-[14px] font-medium text-accent hover:text-accent-hover">
                  {t("history.link")}
                </a>
                <form action={withdrawConsentAction}>
                  <Button type="submit" variant="ghost" size="sm">
                    {t("consent.withdraw")}
                  </Button>
                </form>
              </div>
            </>
          ) : (
            <Panel className="flex flex-col gap-3 p-4 sm:p-5">
              <h3 className="text-[16px] font-semibold">{t("consent.title")}</h3>
              <ul className="flex list-disc flex-col gap-2 pl-5 text-[14px] text-text-muted">
                {(["what", "who", "own", "wrong", "noClinical", "deleteHistory", "withdraw"] as const).map((k) => (
                  <li key={k}>{t(`consent.points.${k}`)}</li>
                ))}
              </ul>
              <form action={acceptConsentAction}>
                <Button type="submit">{t("consent.accept")}</Button>
              </form>
            </Panel>
          )}
        </Section>
      )}

      <Section title={t("search.title")} description={t("search.description")}>
        {courses.length === 0 ? (
          <EmptyState title={t("search.noCoursesTitle")} body={t("search.noCourses")} />
        ) : (
          <form method="get" role="search" aria-label={t("search.title")} className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] sm:items-start">
            <Field label={t("search.course")} htmlFor="tutor-course">
              <Select id="tutor-course" name="course" defaultValue={course?.code ?? ""} required>
                <option value="" disabled>
                  {t("search.chooseCourse")}
                </option>
                {courses.map((c) => (
                  <option key={c.id} value={c.code}>
                    {c.code} · {localized(locale, c.titleFr, c.titleEn)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("search.query")} htmlFor="tutor-q" hint={t("search.queryHint")}>
              <Input id="tutor-q" name="q" type="search" defaultValue={q} maxLength={QUESTION_MAX_CHARS} required aria-describedby="tutor-q-hint" />
            </Field>
            <label className="flex min-h-11 items-start gap-3 text-[14px] sm:col-span-2">
              <input type="checkbox" name="historical" value="1" defaultChecked={includeHistorical} className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]" aria-describedby="tutor-hist-hint" />
              <span>
                <span className="font-medium">{t("search.includeHistorical")}</span>
                <span id="tutor-hist-hint" className="block text-[13px] text-text-subtle">
                  {t("search.includeHistoricalHint")}
                </span>
              </span>
            </label>
            <div className="sm:col-span-2">
              <Button type="submit">{t("search.submit")}</Button>
            </div>
          </form>
        )}
      </Section>

      {limited && (
        <Notice tone="warning" title={t("search.tooManyTitle")}>
          {t("search.tooMany")}
        </Notice>
      )}

      {courses.length > 0 && !result && !limited && <EmptyState title={t("search.pickCourseTitle")} body={t("search.pickCourse")} />}

      {result && course && (
        <Section title={t("results.title")} description={t("results.forQuery", { q: result.query, course: course.code })}>
          <p className="mb-1 px-1 text-[15px] font-semibold" role="status">
            {t("results.count", { count: result.passages.length })}
          </p>
          <p className="mb-1 px-1 text-[13px] text-text-subtle">
            {t("results.scope", { documents: result.stats.documents, notes: result.stats.notes, questions: result.stats.questions })}
          </p>
          {result.stats.documents - result.stats.documentsWithText > 0 && <p className="mb-1 px-1 text-[13px] text-text-subtle">{t("results.documentsMetadata")}</p>}
          {result.stats.historicalSkipped > 0 && <p className="mb-3 px-1 text-[13px] text-text-subtle">{t("results.historicalSkipped", { count: result.stats.historicalSkipped })}</p>}

          {result.passages.length === 0 ? (
            <EmptyState title={t("results.noneTitle")} body={t("results.none")} />
          ) : (
            <div className="mt-3 flex flex-col gap-6">
              {current.length > 0 && (
                <div>
                  <h3 className="mb-2 px-1 text-[14px] font-semibold">{t("results.currentGroup")}</h3>
                  <ul className="flex flex-col gap-3">
                    {current.map((p) => (
                      <li key={p.id}>
                        <PassageCard passage={p} />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {historical.length > 0 && (
                <div>
                  <h3 className="mb-2 px-1 text-[14px] font-semibold">{t("results.historicalGroup")}</h3>
                  <ul className="flex flex-col gap-3">
                    {historical.map((p) => (
                      <li key={p.id}>
                        <PassageCard passage={p} />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </Section>
      )}

      <Section title={t("how.title")}>
        <Panel className="p-4 sm:p-5">
          <ul className="flex list-disc flex-col gap-2 pl-5 text-[14px] text-text-muted">
            <li>{t("how.sources")}</li>
            <li>{t("how.citations")}</li>
            <li>{t("how.current")}</li>
            <li>{t("how.limits", { limit: status.settings.dailyQuestionLimit, chars: status.settings.maxContextChars })}</li>
            <li>{t("how.privacy")}</li>
          </ul>
        </Panel>
      </Section>
    </>
  );
}
