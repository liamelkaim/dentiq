import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { CalendarEntryForm } from "@/components/calendar-forms";
import { PageHeader } from "@/components/ui";
import { getDb } from "@/db/client";
import { calendarEntryKinds } from "@/db/schema";
import { localized, type Locale } from "@/i18n/config";
import { requireUser } from "@/server/auth/session";
import { CALENDAR_ENTRIES_PER_USER_MAX } from "@/server/calendar/constants";
import { getEntry } from "@/server/calendar/service";
import { listCourseChoices } from "@/server/passes/queries";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("calendar.form"))("editTitle") };
}

/** Edit one of the viewer's OWN entries. Someone else's entry id gives a 404, exactly like a missing one. */
export default async function EditEntryPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireUser();
  const db = getDb();
  const entry = await getEntry(db, viewer, (await params).id);
  if (!entry) notFound();
  const t = await getTranslations("calendar");
  const locale = (await getLocale()) as Locale;
  const courses = (await listCourseChoices(db)).map((c) => ({ id: c.id, label: `${c.code} · ${localized(locale, c.titleFr, c.titleEn)}` }));
  return (
    <>
      <PageHeader title={t("form.editTitle")} back={{ href: "/calendar", label: t("title") }} />
      <CalendarEntryForm
        courses={courses}
        kinds={calendarEntryKinds}
        initial={{ id: entry.id, title: entry.title, date: entry.date, time: entry.time, courseId: entry.courseId, kind: entry.kind, note: entry.note }}
        cancelHref="/calendar"
        maxEntries={CALENDAR_ENTRIES_PER_USER_MAX}
      />
    </>
  );
}
