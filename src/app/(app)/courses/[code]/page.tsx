import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { CourseForm, OfferingForm } from "@/components/admin-forms";
import { CourseHeader, loadCourseByCode, loadCourseSummary } from "@/components/course-layout";
import { BookIcon, CardsIcon, ChevronRightIcon, FolderIcon, PassesIcon, TagIcon, UsersIcon } from "@/components/icons";
import { Badge, ButtonLink, Notice, Panel, Section } from "@/components/ui";
import Link from "next/link";
import type { ReactNode } from "react";
import { getDb } from "@/db/client";
import { localized, type Locale } from "@/i18n/config";
import { hasRole } from "@/server/auth/roles";
import { requireUser } from "@/server/auth/session";
import { listPrograms } from "@/server/catalog/service";
import { publishedQuestionCount } from "@/server/passes/queries";
import { canAccessLibrary } from "@/server/resources/service";

type Params = Promise<{ code: string }>;

function OverviewCard({ icon, title, children, className }: { icon: ReactNode; title: string; children: ReactNode; className?: string }) {
  return (
    <Panel className={className}>
      <section className="p-5" aria-label={title}>
        <h2 className="mb-4 flex items-center gap-3 text-[19px] font-semibold tracking-[-0.01em]">
          <span className="text-accent">{icon}</span>
          {title}
        </h2>
        {children}
      </section>
    </Panel>
  );
}

function ResourceTile({ href, icon, value, label }: { href: string; icon: ReactNode; value: number | null; label: string }) {
  return (
    <Link href={href} className="flex min-h-[104px] flex-col justify-between rounded-[12px] border border-border bg-surface-muted/40 p-3.5 transition-colors hover:border-border-strong">
      <span className="flex items-start justify-between text-accent">
        {icon}
        <ChevronRightIcon width={16} height={16} className="text-text-muted" />
      </span>
      <span>
        {value !== null && <span className="block text-[22px] leading-none font-bold tabular-nums">{value}</span>}
        <span className="mt-1 block text-[13px] text-text-muted">{label}</span>
      </span>
    </Link>
  );
}

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
          <a href={course.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-2 hover:text-accent-hover">
            {course.sourceName ?? course.sourceUrl}
          </a>
        ) : (
          course.sourceName
        )}
        {course.sourceRetrievedOn && (
          <span className="text-text-subtle"> · {t("course.retrievedOn", { date: formatDay(course.sourceRetrievedOn) })}</span>
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

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        {/* Course overview: description and the facts the catalog actually holds */}
        <OverviewCard icon={<BookIcon width={26} height={26} />} title={t("course.overviewTitle")}>
          {description ? (
            <p className="text-[15px] leading-relaxed whitespace-pre-line text-text">{description}</p>
          ) : (
            <p className="text-[14px] text-text-muted">{t("course.descriptionEmpty")}</p>
          )}
          <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-border pt-5 sm:grid-cols-4">
            {[
              [t("course.credits"), course.credits ? format.number(Number(course.credits)) : null],
              [t("course.yearOfStudy"), course.yearOfStudy ? t("courses.yearN", { year: course.yearOfStudy }) : null],
              [t("course.typicalTerm"), course.typicalTerm ? t(`terms.${course.typicalTerm}`) : null],
              [t("course.program"), course.program ? localized(locale, course.program.nameFr, course.program.nameEn) : null],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-[12px] font-medium text-text-muted">{label}</dt>
                <dd className="mt-0.5 text-[14px] font-semibold">{value ?? notSpecified}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-[12px] text-text-muted">
            {t("course.source")}: {sourceValue}
          </p>
        </OverviewCard>

        {/* Course resources: real counts, each tile opens its page */}
        <OverviewCard icon={<PassesIcon width={26} height={26} />} title={t("course.resourcesTitle")}>
          {libraryAccess ? (
            <div className="grid grid-cols-2 gap-3">
              <ResourceTile href={notesHref} icon={<FolderIcon width={26} height={26} />} value={summary.documentCount ?? 0} label={t("courseLayout.notes")} />
              <ResourceTile href={passesHref} icon={<PassesIcon width={26} height={26} />} value={passCount ?? 0} label={t("passes.title")} />
              <ResourceTile href={`${base}/topics`} icon={<TagIcon width={26} height={26} />} value={null} label={t("courseLayout.topics")} />
              <ResourceTile href={`/practice?course=${course.id}`} icon={<CardsIcon width={26} height={26} />} value={null} label={t("nav.flashcards")} />
            </div>
          ) : (
            <Notice tone="warning" title={t("resources.noAccessTitle")}>
              {t("resources.noAccessBody")}
            </Notice>
          )}
          {libraryAccess && !course.archivedAt && (
            <div className="mt-4 flex flex-wrap gap-2">
              <ButtonLink href={`${base}/upload`} variant="secondary">
                {t("resources.upload")}
              </ButtonLink>
              {passCount === 0 && (
                <ButtonLink href={`${passesHref}/new`} variant="secondary">
                  {t("passes.add")}
                </ButtonLink>
              )}
            </div>
          )}
        </OverviewCard>

        {/* Offerings, with their instructors */}
        <OverviewCard icon={<UsersIcon width={26} height={26} />} title={t("course.offerings")} className="lg:col-span-2">
          <p className="mb-3 text-[13px] text-text-muted">{t("course.offeringsHelp")}</p>
          {course.offerings.length === 0 ? (
            <p className="rounded-[10px] border border-border bg-surface-muted/40 px-4 py-6 text-center text-[14px] text-text-muted">{t("course.offeringsEmpty")}</p>
          ) : (
            <ul className="divide-y divide-border rounded-[10px] border border-border bg-surface-muted/30">
              {course.offerings.map((offering) => (
                <li key={offering.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
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
                </li>
              ))}
            </ul>
          )}
        </OverviewCard>
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
