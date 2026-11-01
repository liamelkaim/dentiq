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
  // The right panel shows the chosen day, or today when the month on screen is the current one.
  const panelDay = day ?? (month.year === todayParts.year && month.month === todayParts.month ? today : null);
  const shown = panelDay ? entries.filter((e) => e.date === panelDay) : entries;
  const format = await getFormatter();
  const monthLabel = format.dateTime(new Date(Date.UTC(month.year, month.month - 1, 1, 12)), { month: "long", year: "numeric", timeZone: "UTC" });
  const panelParts = panelDay ? parseIsoDate(panelDay) : null;
  const dayLabel = panelParts ? format.dateTime(new Date(Date.UTC(panelParts.year, panelParts.month - 1, panelParts.day, 12)), { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : "";

  return (
    <>
      <PageHeader title={t("title")} subtitle={t("subtitle")} actions={<ButtonLink href={addHref}>{t("nav.add")}</ButtonLink>} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="min-w-0 rounded-[var(--radius-card)] border border-border bg-surface p-4 shadow-card">
          <MonthNav month={month} today={today} day={day} view={view} />
          <MonthGridView month={month} today={today} entries={entries} selectedDay={day} view={view} />
        </div>

        <aside aria-label={panelDay ? t("agenda.titleDay", { date: dayLabel }) : t("agenda.titleMonth", { month: monthLabel })} className="min-w-0 rounded-[var(--radius-card)] border border-border bg-surface p-4 shadow-card">
          <h2 className="mb-3 text-[19px] leading-snug font-semibold">
            {panelDay ? t("agenda.titleDay", { date: dayLabel }) : t("agenda.titleMonth", { month: monthLabel })}
          </h2>
          {shown.length === 0 ? (
            <div className="flex flex-col items-start gap-3 rounded-[10px] border border-border bg-surface-muted/40 px-4 py-5 text-[14px] text-text-muted">
              <p>{panelDay ? t("agenda.emptyDay") : t("agenda.empty", { month: monthLabel })}</p>
            </div>
          ) : (
            <AgendaList entries={shown} today={today} />
          )}
          <div className="mt-4 flex flex-col gap-2">
            <ButtonLink href={`/calendar/new${panelDay ? `?date=${panelDay}` : ""}`}>+ {t("agenda.addOnDay")}</ButtonLink>
            {day && (
              <Link href={calendarHref({ month, view })} className="inline-flex min-h-11 items-center justify-center text-[14px] font-medium text-accent hover:text-accent-hover">
                {t("agenda.showMonth")}
              </Link>
            )}
          </div>
        </aside>
      </div>

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
