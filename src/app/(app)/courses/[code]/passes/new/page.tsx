import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { QuestionForm } from "@/components/pass-forms";
import { Notice, PageHeader } from "@/components/ui";
import { getDb } from "@/db/client";
import { localized, type Locale } from "@/i18n/config";
import { requireUser } from "@/server/auth/session";
import { getCourseByCode } from "@/server/catalog/service";
import { normalizeCourseCode } from "@/server/catalog/validation";
import { recentAcademicYears } from "@/server/passes/academic-year";
import { courseProfessors } from "@/server/passes/queries";
import { getPassSettings } from "@/server/passes/settings";
import { canAccessLibrary, isModerator } from "@/server/resources/service";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("passes.form"))("title") };
}

export default async function NewCoursePassPage({ params }: { params: Promise<{ code: string }> }) {
  const viewer = await requireUser();
  const db = getDb();
  const course = await getCourseByCode(db, normalizeCourseCode(decodeURIComponent((await params).code)));
  if (!course || course.archivedAt) notFound();

  const t = await getTranslations();
  const locale = (await getLocale()) as Locale;
  const listHref = `/courses/${encodeURIComponent(course.code)}/passes`;
  const back = { href: listHref, label: `${course.code} · ${t("passes.title")}` };

  if (!canAccessLibrary(viewer)) {
    return (
      <>
        <PageHeader back={back} title={t("passes.form.title")} />
        <Notice tone="warning" title={t("resources.noAccessTitle")}>
          {t("resources.noAccessBody")}
        </Notice>
      </>
    );
  }

  const [settings, professors] = await Promise.all([getPassSettings(db), courseProfessors(db, course.id)]);
  const offerings = course.offerings.map((o) => ({
    id: o.id,
    academicYear: o.academicYear,
    label: [t(`terms.${o.term}`), o.instructors.map((i) => i.fullName).join(", ")].filter(Boolean).join(" · "),
  }));

  return (
    <>
      <PageHeader back={back} title={t("passes.form.title")} subtitle={`${course.code} · ${localized(locale, course.titleFr, course.titleEn)}`} />
      <QuestionForm
        mode="new"
        courseId={course.id}
        offerings={offerings}
        professors={professors}
        recentYears={recentAcademicYears(8)}
        enabledTypes={settings.enabledQuestionTypes}
        maxImages={settings.images.maxPerQuestion}
        maxImageMB={Math.floor(settings.images.maxBytes / 1024 / 1024)}
        isModerator={isModerator(viewer)}
        cancelHref={listHref}
      />
    </>
  );
}
