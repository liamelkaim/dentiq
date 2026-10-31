import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { UploadResourceForm } from "@/components/resource-forms";
import { Notice, PageHeader } from "@/components/ui";
import { getMaxFileBytes } from "@/server/resources/files";
import { getDb } from "@/db/client";
import { localized, type Locale } from "@/i18n/config";
import { requireUser } from "@/server/auth/session";
import { getCourseByCode } from "@/server/catalog/service";
import { normalizeCourseCode } from "@/server/catalog/validation";
import { canAccessLibrary, isModerator, latestOfferingByCourse } from "@/server/resources/service";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("resources.form"))("title") };
}

export default async function UploadPage({ params }: { params: Promise<{ code: string }> }) {
  const viewer = await requireUser();
  const db = getDb();
  const course = await getCourseByCode(db, normalizeCourseCode(decodeURIComponent((await params).code)));
  if (!course || course.archivedAt) notFound();

  const t = await getTranslations();
  const locale = (await getLocale()) as Locale;
  const back = { href: `/courses/${encodeURIComponent(course.code)}`, label: course.code };

  if (!canAccessLibrary(viewer)) {
    return (
      <>
        <PageHeader back={back} title={t("resources.form.title")} />
        <Notice tone="warning" title={t("resources.noAccessTitle")}>
          {t("resources.noAccessBody")}
        </Notice>
      </>
    );
  }

  const latest = (await latestOfferingByCourse(db, [course.id])).get(course.id) ?? null;
  const offerings = course.offerings.map((o) => ({
    id: o.id,
    label: [`${o.academicYear} · ${t(`terms.${o.term}`)}`, o.instructors.map((i) => i.fullName).join(", ")]
      .filter(Boolean)
      .join(" — "),
  }));

  return (
    <>
      <PageHeader back={back} title={t("resources.form.title")} subtitle={`${course.code} · ${localized(locale, course.titleFr, course.titleEn)}`} />
      <UploadResourceForm maxFileBytes={getMaxFileBytes()} courseId={course.id} offerings={offerings} defaultOfferingId={latest} isModerator={isModerator(viewer)} />
    </>
  );
}
