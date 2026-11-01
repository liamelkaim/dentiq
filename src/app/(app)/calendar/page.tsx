import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { AgendaList, calendarHref, MonthGridView, MonthNav, type CalendarView } from "@/components/calendar-ui";
import { PrivacyNote } from "@/components/study-ui";
import { buttonClass, ButtonLink, EmptyState, Notice, PageHeader, Panel, Section } from "@/components/ui";
import { getDb } from "@/db/client";
import { requireUser } from "@/server/auth/session";
import { daysInMonth, checkDate, formatIso, isoDateIn, parseIsoDate, parseMonthParam } from "@/server/calendar/dates";
import { countEntries, listEntries } from "@/server/calendar/service";
import { canAccessLibrary } from "@/server/resources/service";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("calendar"))("title") };
}

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/**
 * The student's own calendar. Month and selected day come from the URL, so every state is a plain link and the page
 * is fully server-rendered. It never shows an entry the student did not write.
 */
export default async function CalendarPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const viewer = await requireUser();
  const t = await getTranslations("calendar");

  if (!canAccessLibrary(viewer)) {
    const r = await getTranslations("resources");
    return (
      <>
        <PageHeader title={t("title")} subtitle={t("subtitle")} />
        <Notice tone="warning" title={r("noAccessTitle")}>
          {t("noAccess")}
        </Notice>
      </>
    );
  }

  const params = await searchParams;
  const today = isoDateIn(new Date());
  const todayParts = parseIsoDate(today)!;
  const month = parseMonthParam(first(params.month)) ?? { year: todayParts.year, month: todayParts.month };
  const viewParam = first(params.view);
  const view: CalendarView = viewParam === "month" || viewParam === "list" ? viewParam : null;
  const dayParam = first(params.day);
  const parsedDay = dayParam && checkDate(dayParam) === "ok" ? parseIsoDate(dayParam) : null;
  const day = parsedDay && parsedDay.year === month.year && parsedDay.month === month.month ? dayParam! : null;

  const db = getDb();
  const total = await countEntries(db, viewer);
  const addHref = `/calendar/new${day ? `?date=${day}` : ""}`;

  if (total === 0) {
    return (
      <>
        <PageHeader title={t("title")} subtitle={t("subtitle")} />
        <EmptyState title={t("empty.title")} body={t("empty.body")} action={<ButtonLink href="/calendar/new">{t("empty.action")}</ButtonLink>} />
        <div className="mt-4">
          <PrivacyNote>{t("privacy")}</PrivacyNote>
        </div>
      </>
    );
  }

  const entries = await listEntries(db, viewer, {
    from: formatIso(month.year, month.month, 1),
    to: formatIso(month.year, month.month, daysInMonth(month.year, month.month)),
  });
  const shown = day ? entries.filter((e) => e.date === day) : entries;
  const format = await getFormatter();
  const monthLabel = format.dateTime(new Date(Date.UTC(month.year, month.month - 1, 1, 12)), { month: "long", year: "numeric", timeZone: "UTC" });
  const dayLabel = day ? format.dateTime(new Date(Date.UTC(parsedDay!.year, parsedDay!.month - 1, parsedDay!.day, 12)), { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : "";

  return (
    <>
      <PageHeader title={t("title")} subtitle={t("subtitle")} actions={<ButtonLink href={addHref}>{t("nav.add")}</ButtonLink>} />
      <MonthNav month={month} today={today} day={day} view={view} />
      <MonthGridView month={month} today={today} entries={entries} selectedDay={day} view={view} />

      <Section title={day ? t("agenda.titleDay", { date: dayLabel }) : t("agenda.titleMonth", { month: monthLabel })}>
        {shown.length === 0 ? (
          <Panel className="flex flex-col items-start gap-3 px-4 py-5 text-[14px] text-text-muted">
            <p>{day ? t("agenda.emptyDay") : t("agenda.empty", { month: monthLabel })}</p>
            {day && (
              <Link href={`/calendar/new?date=${day}`} className="inline-flex min-h-11 items-center font-medium text-accent hover:text-accent-hover">
                {t("agenda.addOnDay")}
              </Link>
            )}
          </Panel>
        ) : (
          <AgendaList entries={shown} today={today} />
        )}
        {day && (
          <p className="mt-3 flex flex-wrap gap-x-4">
            <Link href={calendarHref({ month, view })} className="inline-flex min-h-11 items-center text-[14px] font-medium text-accent hover:text-accent-hover">
              {t("agenda.showMonth")}
            </Link>
            {shown.length > 0 && (
              <Link href={`/calendar/new?date=${day}`} className="inline-flex min-h-11 items-center text-[14px] font-medium text-accent hover:text-accent-hover">
                {t("agenda.addOnDay")}
              </Link>
            )}
          </p>
        )}
      </Section>

      <Section title={t("export.title")}>
        <Panel className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-xl text-[14px] text-text-muted">{t("export.body")}</p>
          {/* A file download, not a page: a plain link so the browser saves it instead of navigating. */}
          <a href="/api/calendar-export" download className={buttonClass("secondary", "shrink-0")}>
            {t("export.action")}
          </a>
        </Panel>
      </Section>
      <PrivacyNote>{t("privacy")}</PrivacyNote>
    </>
  );
}
