import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { PersonalCardForm } from "@/components/study-forms";
import { Notice, PageHeader } from "@/components/ui";
import { getDb } from "@/db/client";
import { localized, type Locale } from "@/i18n/config";
import { requireUser } from "@/server/auth/session";
import { listCourseChoices } from "@/server/passes/queries";
import { canAccessLibrary } from "@/server/resources/service";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("studyTools.flashcards.form"))("newTitle") };
}

export default async function NewCardPage() {
  const viewer = await requireUser();
  const t = await getTranslations("studyTools.flashcards");
  const locale = (await getLocale()) as Locale;
  const back = { href: "/practice/flashcards", label: t("title") };
  if (!canAccessLibrary(viewer)) {
    const r = await getTranslations("resources");
    return (
      <>
        <PageHeader title={t("form.newTitle")} back={back} />
        <Notice tone="warning" title={r("noAccessTitle")}>
          {r("noAccessBody")}
        </Notice>
      </>
    );
  }
  const courses = (await listCourseChoices(getDb())).map((c) => ({ id: c.id, label: `${c.code} · ${localized(locale, c.titleFr, c.titleEn)}` }));
  return (
    <>
      <PageHeader title={t("form.newTitle")} back={back} />
      <PersonalCardForm courses={courses} />
    </>
  );
}
