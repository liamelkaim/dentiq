import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { CalendarEntryForm } from "@/components/calendar-forms";
import { Notice, PageHeader } from "@/components/ui";
import { getDb } from "@/db/client";
import { calendarEntryKinds } from "@/db/schema";
import { localized, type Locale } from "@/i18n/config";
import { requireUser } from "@/server/auth/session";
import { CALENDAR_ENTRIES_PER_USER_MAX } from "@/server/calendar/constants";
import { checkDate, isoDateIn } from "@/server/calendar/dates";
import { listCourseChoices } from "@/server/passes/queries";
import { canAccessLibrary } from "@/server/resources/service";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("calendar.form"))("newTitle") };
}

/** A blank form. The date is today, or the day the student came from (?date=), never anything guessed. */
export default async function NewEntryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const viewer = await requireUser();
  const t = await getTranslations("calendar");
  const back = { href: "/calendar", label: t("title") };
  if (!canAccessLibrary(viewer)) {
    const r = await getTranslations("resources");
    return (
      <>
        <PageHeader title={t("form.newTitle")} back={back} />
        <Notice tone="warning" title={r("noAccessTitle")}>
          {t("noAccess")}
        </Notice>
      </>
    );
  }
  const locale = (await getLocale()) as Locale;
  const requested = (await searchParams).date;
  const date = typeof requested === "string" && checkDate(requested) === "ok" ? requested : isoDateIn(new Date());
  const courses = (await listCourseChoices(getDb())).map((c) => ({ id: c.id, label: `${c.code} · ${localized(locale, c.titleFr, c.titleEn)}` }));
  return (
    <>
      <PageHeader title={t("form.newTitle")} back={back} />
      <CalendarEntryForm
        courses={courses}
        kinds={calendarEntryKinds}
        initial={{ title: "", date, time: null, courseId: null, kind: "other", note: null }}
        cancelHref="/calendar"
        maxEntries={CALENDAR_ENTRIES_PER_USER_MAX}
      />
    </>
  );
}
