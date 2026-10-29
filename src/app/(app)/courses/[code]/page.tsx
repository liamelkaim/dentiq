import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { CourseForm, OfferingForm } from "@/components/admin-forms";
import { ResourceList } from "@/components/resource-list";
import { Badge, ButtonLink, cx, DescriptionList, List, ListRow, Notice, PageHeader, Panel, Section } from "@/components/ui";
import { getDb } from "@/db/client";
import { localized, type Locale } from "@/i18n/config";
import { hasRole } from "@/server/auth/roles";
import { requireUser } from "@/server/auth/session";
import { getCourseByCode, listPrograms } from "@/server/catalog/service";
import { normalizeCourseCode } from "@/server/catalog/validation";
import { canAccessLibrary, listResources } from "@/server/resources/service";

type Params = Promise<{ code: string }>;

async function loadCourse(params: Params) {
  const { code } = await params;
  return getCourseByCode(getDb(), normalizeCourseCode(decodeURIComponent(code)));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const course = await loadCourse(params);
  return { title: course ? course.code : undefined };
}

const periods = ["current", "historical", "all"] as const;

export default async function CoursePage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Promise<{ period?: string }>;
}) {
  const user = await requireUser();
  const course = await loadCourse(params);
  if (!course) notFound();
  const requested = (await searchParams).period;
  const period = periods.find((p) => p === requested) ?? "current";
  const libraryAccess = canAccessLibrary(user);
  const courseResources = libraryAccess ? await listResources(getDb(), user, { courseId: course.id, period }) : [];

  const t = await getTranslations();
  const format = await getFormatter();
  const locale = (await getLocale()) as Locale;
  const isAdmin = hasRole(user, "admin");
  const programs = isAdmin ? await listPrograms(getDb()) : [];

  const title = localized(locale, course.titleFr, course.titleEn);
  const description = localized(locale, course.descriptionFr ?? "", course.descriptionEn);
  const showingOriginal = locale === "en" && !course.titleEn;
  const formatDay = (day: string) => format.dateTime(new Date(`${day}T12:00:00`), { dateStyle: "long" });

  // sourceUrl is validated as http(s) on input, so it is safe to render as a link.
  const source = { name: course.sourceName, url: course.sourceUrl, retrievedOn: course.sourceRetrievedOn };
  const sourceValue =
    source.name || source.url ? (
      <span>
        {source.url ? (
          <a href={source.url} target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-hover">
            {source.name ?? source.url}
          </a>
        ) : (
          source.name
        )}
        {source.retrievedOn && <span className="text-text-subtle"> — {t("course.retrievedOn", { date: formatDay(source.retrievedOn) })}</span>}
      </span>
    ) : (
      <span className="text-text-subtle">{t("course.sourceUnknown")}</span>
    );

  const notSpecified = <span className="text-text-subtle">{t("course.notSpecified")}</span>;

  return (
    <>
      <PageHeader
        back={{ href: "/courses", label: t("courses.allCourses") }}
        title={title}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            <span className="font-medium tabular-nums">{course.code}</span>
            {showingOriginal && <Badge>{t("course.titleOriginal")}</Badge>}
          </span>
        }
      />

      <Section title={t("course.details")}>
        <DescriptionList
          items={[
            { label: t("course.credits"), value: course.credits ? format.number(Number(course.credits)) : notSpecified },
            { label: t("course.yearOfStudy"), value: course.yearOfStudy ? t("courses.yearN", { year: course.yearOfStudy }) : notSpecified },
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

      <Section
        title={t("resources.title")}
        actions={
          libraryAccess &&
          !course.archivedAt && (
            <ButtonLink href={`/courses/${encodeURIComponent(course.code)}/upload`} variant="secondary" size="sm">
              {t("resources.upload")}
            </ButtonLink>
          )
        }
      >
        {libraryAccess ? (
          <>
            <nav aria-label={t("resources.period.label")} className="mb-3 flex gap-1 rounded-[10px] bg-surface-muted p-0.5 sm:inline-flex">
              {periods.map((p) => (
                <Link
                  key={p}
                  href={`/courses/${encodeURIComponent(course.code)}?period=${p}`}
                  scroll={false}
                  aria-current={period === p ? "page" : undefined}
                  className={cx(
                    "flex h-8 flex-1 items-center justify-center rounded-[8px] px-3 text-[13px] font-medium",
                    period === p ? "bg-surface text-text shadow-card" : "text-text-subtle hover:text-text",
                  )}
                >
                  {t(`resources.period.${p}`)}
                </Link>
              ))}
            </nav>
            <ResourceList items={courseResources} showCourse={false} emptyBody={t("resources.emptyCourse")} />
            <p className="mt-2 px-1 text-[12px] text-text-subtle">{t("resources.periodHelp")}</p>
          </>
        ) : (
          <Notice tone="warning" title={t("resources.noAccessTitle")}>
            {t("resources.noAccessBody")}
          </Notice>
        )}
      </Section>

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
                  {offering.instructors.length > 0
                    ? offering.instructors.map((i) => i.fullName).join(", ")
                    : <span className="text-text-subtle">{t("course.noInstructors")}</span>}
                </span>
              </ListRow>
            ))}
          </List>
        )}
      </Section>

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
