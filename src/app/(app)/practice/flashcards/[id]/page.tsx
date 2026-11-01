import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { PersonalCardForm } from "@/components/study-forms";
import { PageHeader } from "@/components/ui";
import { getDb } from "@/db/client";
import { localized, type Locale } from "@/i18n/config";
import { requireUser } from "@/server/auth/session";
import { listCourseChoices } from "@/server/passes/queries";
import { getPersonalCard } from "@/server/study/service";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("studyTools.flashcards.form"))("editTitle") };
}

/** Edit one of the viewer's OWN cards. Someone else's card id gives a 404, like a missing one. */
export default async function EditCardPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireUser();
  const db = getDb();
  const card = await getPersonalCard(db, viewer, (await params).id);
  if (!card) notFound();
  const t = await getTranslations("studyTools.flashcards");
  const locale = (await getLocale()) as Locale;
  const courses = (await listCourseChoices(db)).map((c) => ({ id: c.id, label: `${c.code} · ${localized(locale, c.titleFr, c.titleEn)}` }));
  return (
    <>
      <PageHeader title={t("form.editTitle")} back={{ href: "/practice/flashcards", label: t("title") }} />
      <PersonalCardForm courses={courses} initial={{ id: card.id, front: card.front, back: card.back, courseId: card.courseId }} />
    </>
  );
}
