import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { CourseForm, OfferingForm } from "@/components/admin-forms";
import { CourseHeader, loadCourseByCode, loadCourseSummary } from "@/components/course-layout";
import { FolderIcon, PassesIcon } from "@/components/icons";
import { Badge, ButtonLink, DescriptionList, List, ListRow, Notice, Panel, Section } from "@/components/ui";
import { getDb } from "@/db/client";
import { localized, type Locale } from "@/i18n/config";
import { hasRole } from "@/server/auth/roles";
import { requireUser } from "@/server/auth/session";
import { listPrograms } from "@/server/catalog/service";
import { publishedQuestionCount } from "@/server/passes/queries";
import { canAccessLibrary } from "@/server/resources/service";

type Params = Promise<{ code: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const course = await loadCourseByCode((await params).code);
  return { title: course ? course.code : undefined };
}

export default async function CourseOverviewPage({ params }: { params: Params }) {
  const user = await requireUser();
  const course = await loadCourseByCode((await params).code);
  if (!course) notFound();

  const t = await getTranslations();
  const format = await getFormatter();
  const locale = (await getLocale()) as Locale;
  const isAdmin = hasRole(user, "admin");
  const [summary, programs] = await Promise.all([
    loadCourseSummary(user, course),
    isAdmin ? listPrograms(getDb()) : Promise.resolve([]),
  ]);
  const libraryAccess = canAccessLibrary(user);
  const passCount = libraryAccess ? await publishedQuestionCount(getDb(), user, course.id) : null;
  const passesHref = `/courses/${encodeURIComponent(course.code)}/passes`;
  const base = `/courses/${encodeURIComponent(course.code)}`;
  const notesHref = `${base}/notes`;

  const description = localized(locale, course.descriptionFr ?? "", course.descriptionEn);
  const showingOriginal = locale === "en" && !course.titleEn;
  const formatDay = (day: string) => format.dateTime(new Date(`${day}T12:00:00`), { dateStyle: "long" });

  // sourceUrl is validated as http(s) on input, so it is safe to render as a link.
  const sourceValue =
    course.sourceName || course.sourceUrl ? (
      <span>
        {course.sourceUrl ? (
          <a href={course.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-hover">
            {course.sourceName ?? course.sourceUrl}
          </a>
        ) : (
          course.sourceName
        )}
        {course.sourceRetrievedOn && (
          <span className="text-text-subtle"> — {t("course.retrievedOn", { date: formatDay(course.sourceRetrievedOn) })}</span>
        )}
      </span>
    ) : (
      <span className="text-text-subtle">{t("course.sourceUnknown")}</span>
    );

  const notSpecified = <span className="text-text-subtle">{t("course.notSpecified")}</span>;

  return (
    <>
      <CourseHeader course={summary} offeringCount={course.offerings.length} active="overview" />

      {showingOriginal && (
        <p className="-mt-2 mb-6">
          <Badge>{t("course.titleOriginal")}</Badge>
        </p>
      )}

      <div className="grid gap-x-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <Section title={t("course.details")}>
            <DescriptionList
              items={[
                { label: t("course.credits"), value: course.credits ? format.number(Number(course.credits)) : notSpecified },
                {
                  label: t("course.yearOfStudy"),
                  value: course.yearOfStudy ? t("courses.yearN", { year: course.yearOfStudy }) : notSpecified,
                },
                { label: t("course.typicalTerm"), value: course.typicalTerm ? t(`terms.${course.typicalTerm}`) : notSpecified },
                {
                  label: t("course.program"),
                  value: course.program ? localized(locale, course.program.nameFr, course.program.nameEn) : notSpecified,
                },
                { label: t("course.source"), value: sourceValue },
              ]}
            />
          </Section>

          {description && (
            <Section title={t("course.description")}>
              <Panel className="px-4 py-3 text-[15px] leading-relaxed whitespace-pre-line text-text">{description}</Panel>
            </Section>
          )}

          <Section title={t("course.offerings")} description={t("course.offeringsHelp")}>
            {course.offerings.length === 0 ? (
              <Panel className="px-4 py-6 text-center text-[14px] text-text-muted">{t("course.offeringsEmpty")}</Panel>
            ) : (
              <List>
                {course.offerings.map((offering) => (
                  <ListRow key={offering.id} className="flex-col items-start gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-[15px] font-medium tabular-nums">
                      {offering.academicYear} · {t(`terms.${offering.term}`)}
                    </span>
                    <span className="text-[14px] text-text-muted">
                      {offering.instructors.length > 0 ? (
                        offering.instructors.map((i) => i.fullName).join(", ")
                      ) : (
                        <span className="text-text-subtle">{t("course.noInstructors")}</span>
                      )}
                    </span>
                  </ListRow>
                ))}
              </List>
            )}
          </Section>
        </div>

        <aside className="min-w-0">
          <Section title={t("courseLayout.notes")}>
            {libraryAccess ? (
              <Panel className="flex flex-col gap-4 p-5">
                <div className="flex items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-accent-soft text-accent">
                    <FolderIcon />
                  </span>
                  <p className="text-[15px] font-medium">{t("home.documents", { count: summary.documentCount ?? 0 })}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <ButtonLink href={notesHref}>{t("courseLayout.seeNotes")}</ButtonLink>
                  {!course.archivedAt && (
                    <ButtonLink href={`/courses/${encodeURIComponent(course.code)}/upload`} variant="secondary">
                      {t("resources.upload")}
                    </ButtonLink>
                  )}
                  <ButtonLink href={`/notes?course=${encodeURIComponent(course.code)}`} variant="secondary">
                    {t("library.notes.title")}
                  </ButtonLink>
                  <ButtonLink href={`${base}/topics`} variant="secondary">
                    {t("courseLayout.topics")}
                  </ButtonLink>
                </div>
              </Panel>
            ) : (
              <Notice tone="warning" title={t("resources.noAccessTitle")}>
                {t("resources.noAccessBody")}
              </Notice>
            )}
          </Section>

          {libraryAccess && passCount !== null && (
            <Section title={t("passes.title")}>
              <Panel className="flex flex-col gap-4 p-5">
                <div className="flex items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-accent-soft text-accent">
                    <PassesIcon />
                  </span>
                  <div>
                    <p className="text-[15px] font-medium">{t("passes.browser.count", { count: passCount })}</p>
                    {passCount === 0 && <p className="text-[13px] text-text-muted">{t("passes.courseCard.empty")}</p>}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <ButtonLink href={passesHref}>{t("passes.courseCard.open")}</ButtonLink>
                  {passCount === 0 && !course.archivedAt && (
                    <ButtonLink href={`${passesHref}/new`} variant="secondary">
                      {t("passes.add")}
                    </ButtonLink>
                  )}
                </div>
              </Panel>
            </Section>
          )}
        </aside>
      </div>

      {isAdmin && (
        <Section title={t("nav.admin")}>
          <div className="flex flex-col gap-4">
            <OfferingForm courseId={course.id} courseCode={course.code} />
            <CourseForm
              programs={programs}
              course={{
                id: course.id,
                code: course.code,
                titleFr: course.titleFr,
                titleEn: course.titleEn,
                descriptionFr: course.descriptionFr,
                descriptionEn: course.descriptionEn,
                credits: course.credits,
                yearOfStudy: course.yearOfStudy,
                typicalTerm: course.typicalTerm,
                programId: course.programId,
                sourceName: course.sourceName,
                sourceUrl: course.sourceUrl,
                sourceRetrievedOn: course.sourceRetrievedOn,
              }}
            />
          </div>
        </Section>
      )}
    </>
  );
}
