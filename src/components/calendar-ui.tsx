// Display pieces of the study calendar (server-rendered; no client state). The month grid is a real table whose day
// cells are links, so it works with the keyboard alone, shows focus, and every cell has a full text label: nothing is
// conveyed by colour only (today is a filled circle AND "today" in the label; counts are numbers).
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import type { CalendarEntryKind } from "@/db/schema";
import { addMonths, buildMonthGrid, daysUntil, monthParam, parseIsoDate, type YearMonth } from "@/server/calendar/dates";
import type { CalendarEntry } from "@/server/calendar/service";
import { ChevronLeftIcon, ChevronRightIcon } from "./icons";
import { Badge, ButtonLink, cx, List } from "./ui";

export type CalendarView = "month" | "list" | null;

/** Link to a month (and optionally a selected day) of the calendar. */
export function calendarHref(opts: { month: YearMonth; day?: string | null; view?: CalendarView }): string {
  const params = new URLSearchParams({ month: monthParam(opts.month) });
  if (opts.day) params.set("day", opts.day);
  if (opts.view) params.set("view", opts.view);
  return `/calendar?${params.toString()}`;
}

const utcNoon = (iso: string) => {
  const p = parseIsoDate(iso)!;
  return new Date(Date.UTC(p.year, p.month - 1, p.day, 12));
};

/** Formats "YYYY-MM-DD" and "HH:MM" values in the user's language. Dates are calendar dates, so UTC avoids any shift. */
export function useCalendarFormat() {
  const format = useFormatter();
  return {
    date: (iso: string, options: { weekday?: "long" | "short"; day?: "numeric"; month?: "long" | "short" | "numeric"; year?: "numeric" } = { weekday: "long", day: "numeric", month: "long", year: "numeric" }) =>
      format.dateTime(utcNoon(iso), { ...options, timeZone: "UTC" }),
    month: ({ year, month }: YearMonth) => format.dateTime(new Date(Date.UTC(year, month - 1, 1, 12)), { month: "long", year: "numeric", timeZone: "UTC" }),
    time: (hhmm: string) => {
      const [h, m] = hhmm.split(":").map(Number);
      return format.dateTime(new Date(Date.UTC(2000, 0, 1, h, m)), { hour: "numeric", minute: "2-digit", timeZone: "UTC" });
    },
    /** Weekday names for the header, Monday first (2024-01-01 was a Monday). */
    weekdays: () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(Date.UTC(2024, 0, 1 + i, 12));
        return {
          short: format.dateTime(d, { weekday: "short", timeZone: "UTC" }),
          long: format.dateTime(d, { weekday: "long", timeZone: "UTC" }),
        };
      }),
  };
}

export function KindBadge({ kind }: { kind: CalendarEntryKind }) {
  const t = useTranslations("calendar.kinds");
  // The kind is always written out; the tone only reinforces it.
  return <Badge tone={kind === "exam" ? "danger" : kind === "assignment" ? "warning" : kind === "study_session" ? "accent" : "neutral"}>{t(kind)}</Badge>;
}

/** Label for rows that come from the schedule (a class) or from the university term data (term, reading week, exams). */
export function VirtualBadge({ entry }: { entry: CalendarEntry }) {
  const t = useTranslations("calendar.markers");
  const v = entry.virtual!;
  if (v.type === "class") return <Badge tone="accent">{t("class")}</Badge>;
  return (
    <>
      <Badge tone={entry.virtual?.markerKind === "exam_period" ? "danger" : "neutral"}>{t(v.markerKind ?? "break")}</Badge>
      {v.verified === false && <Badge tone="warning">{t("unverified")}</Badge>}
    </>
  );
}

/** "Today" / "In 3 days" for an entry that is today or later. Past entries get no text. */
export function DaysUntil({ today, date }: { today: string; date: string }) {
  const t = useTranslations("calendar.agenda");
  const days = daysUntil(today, date);
  if (days < 0) return null;
  return <>{t("daysUntil", { days })}</>;
}

export function MonthNav({ month, today, day, view }: { month: YearMonth; today: string; day: string | null; view: CalendarView }) {
  const t = useTranslations("calendar.nav");
  const cal = useCalendarFormat();
  const todayParts = parseIsoDate(today)!;
  const current = { year: todayParts.year, month: todayParts.month };
  const prev = addMonths(month, -1);
  const next = addMonths(month, 1);
  const isCurrent = current.year === month.year && current.month === month.month;
  const box = "grid size-11 place-items-center rounded-[10px] border border-border-strong bg-surface text-text hover:bg-surface-hover sm:size-10";
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <Link href={calendarHref({ month: prev, view })} aria-label={t("previous")} className={box}>
        <ChevronLeftIcon width={18} height={18} />
      </Link>
      <h2 className="min-w-0 flex-1 text-[18px] font-semibold first-letter:uppercase">{cal.month(month)}</h2>
      <Link href={calendarHref({ month: next, view })} aria-label={t("next")} className={box}>
        <ChevronRightIcon width={18} height={18} />
      </Link>
      {!isCurrent && (
        <ButtonLink href={calendarHref({ month: current, view })} variant="secondary" size="sm">
          {t("today")}
        </ButtonLink>
      )}
      <ViewToggle month={month} day={day} view={view} />
    </div>
  );
}

function ViewToggle({ month, day, view }: { month: YearMonth; day: string | null; view: CalendarView }) {
  const t = useTranslations("calendar.nav");
  const items: { key: "month" | "list"; label: string }[] = [
    { key: "month", label: t("month") },
    { key: "list", label: t("list") },
  ];
  return (
    <nav aria-label={t("views")} className="ml-auto flex overflow-hidden rounded-[10px] border border-border-strong">
      {items.map(({ key, label }) => {
        const active = view === key;
        return (
          <Link
            key={key}
            href={calendarHref({ month, day, view: key })}
            aria-current={active ? "true" : undefined}
            className={cx(
              "inline-flex h-11 items-center px-4 text-[14px] font-medium focus-visible:outline-offset-[-2px] sm:h-10",
              active ? "bg-accent-solid text-on-accent" : "bg-surface text-text-muted hover:bg-surface-hover",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

/** The month as a table: Monday first, today filled, each day a link that selects it. */
export function MonthGridView({
  month,
  today,
  entries,
  selectedDay,
  view,
}: {
  month: YearMonth;
  today: string;
  entries: CalendarEntry[];
  selectedDay: string | null;
  view: CalendarView;
}) {
  const t = useTranslations("calendar.grid");
  const cal = useCalendarFormat();
  const grid = buildMonthGrid(month.year, month.month);
  const byDay = new Map<string, CalendarEntry[]>();
  for (const e of entries) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]);
  // Phones show the list by default; the grid appears from the "sm" breakpoint, or everywhere when asked for.
  const visibility = view === "list" ? "hidden" : view === "month" ? "block" : "hidden sm:block";

  return (
    <div className={cx("mb-6 overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface shadow-card", visibility)}>
      <table className="w-full table-fixed border-collapse">
        <caption className="sr-only">{t("label", { month: cal.month(month) })}</caption>
        <thead>
          <tr>
            {cal.weekdays().map((w) => (
              <th key={w.long} scope="col" className="border-b border-border px-1 py-2 text-[12px] font-semibold text-text-subtle">
                <span aria-hidden="true">{w.short}</span>
                <span className="sr-only">{w.long}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.weeks.map((week) => (
            <tr key={week[0]!.iso}>
              {week.map((cell) => {
                if (!cell.inMonth) {
                  return (
                    <td key={cell.iso} className="h-14 border-t border-r border-border bg-surface-muted/50 p-1 align-top last:border-r-0 sm:h-24">
                      <span aria-hidden="true" className="text-[12px] text-text-subtle/60">
                        {cell.day}
                      </span>
                    </td>
                  );
                }
                const list = byDay.get(cell.iso) ?? [];
                const isToday = cell.iso === today;
                const selected = cell.iso === selectedDay;
                const label = cal.date(cell.iso);
                const cellLabel = isToday
                  ? t(selected ? "cellTodaySelected" : "cellToday", { date: label, count: list.length })
                  : t(selected ? "cellSelected" : "cell", { date: label, count: list.length });
                return (
                  <td key={cell.iso} className="h-14 border-t border-r border-border p-0 align-top last:border-r-0 sm:h-24">
                    <Link
                      href={calendarHref({ month, day: cell.iso, view })}
                      aria-label={cellLabel}
                      aria-current={isToday ? "date" : selected ? "true" : undefined}
                      className={cx(
                        "flex h-full min-h-11 w-full flex-col gap-0.5 p-1 text-left hover:bg-surface-hover focus-visible:outline-offset-[-2px]",
                        selected && "bg-accent-soft",
                      )}
                    >
                      <span
                        className={cx(
                          "inline-grid size-6 shrink-0 place-items-center rounded-full text-[13px] font-medium tabular-nums",
                          isToday ? "bg-accent-solid text-on-accent" : "text-text",
                          // Selected is shown by an outline and an underline (not colour alone) and announced in the label.
                          selected && !isToday && "ring-2 ring-accent",
                          selected && "underline decoration-2 underline-offset-2",
                        )}
                      >
                        {cell.day}
                      </span>
                      {list.length > 0 && (
                        <>
                          <span className="inline-flex w-fit rounded-md border border-border-strong bg-surface px-1 text-[11px] font-semibold tabular-nums sm:hidden">{list.length}</span>
                          <span className="hidden min-w-0 flex-col gap-0.5 sm:flex">
                            {list.slice(0, 2).map((e) => (
                              <span key={e.id} className="truncate rounded-sm bg-surface-muted px-1 text-[11px] leading-tight text-text">
                                {e.title}
                              </span>
                            ))}
                            {list.length > 2 && <span className="text-[11px] text-text-subtle">{t("more", { count: list.length - 2 })}</span>}
                          </span>
                        </>
                      )}
                    </Link>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Entries grouped by date, each with time, kind, course and an Edit link. */
export function AgendaList({ entries, today }: { entries: CalendarEntry[]; today: string }) {
  const t = useTranslations("calendar.agenda");
  const grid = useTranslations("calendar.grid");
  const cal = useCalendarFormat();
  const groups: { date: string; items: CalendarEntry[] }[] = [];
  for (const e of entries) {
    const last = groups[groups.length - 1];
    if (last && last.date === e.date) last.items.push(e);
    else groups.push({ date: e.date, items: [e] });
  }
  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <section key={group.date} aria-labelledby={`agenda-${group.date}`}>
          <h3 id={`agenda-${group.date}`} className="mb-1.5 flex flex-wrap items-baseline gap-x-2 px-1 text-[14px] font-semibold">
            <span className="first-letter:uppercase">{cal.date(group.date)}</span>
            {group.date === today && <Badge tone="accent">{grid("today")}</Badge>}
            {daysUntil(today, group.date) > 0 && (
              <span className="text-[13px] font-normal text-text-subtle">
                <DaysUntil today={today} date={group.date} />
              </span>
            )}
          </h3>
          <List>
            {group.items.map((e) => (
              <li key={e.id} className="flex min-h-14 items-center gap-3 px-4 py-3">
                <span className="w-20 shrink-0 text-[13px] text-text-muted tabular-nums">{e.time ? cal.time(e.time) : t("allDay")}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium break-words">{e.title}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-1.5">
                    {e.virtual ? <VirtualBadge entry={e} /> : <KindBadge kind={e.kind} />}
                    {e.courseCode && <span className="text-[13px] text-text-subtle">{e.courseCode}</span>}
                  </span>
                  {e.note && <span className="mt-1 block text-[13px] break-words whitespace-pre-line text-text-muted">{e.note}</span>}
                </span>
                {!e.virtual && (
                  <Link
                    href={`/calendar/${e.id}`}
                    aria-label={t("editLabel", { title: e.title })}
                    className="inline-flex h-11 shrink-0 items-center rounded-[10px] px-3 text-[14px] font-medium text-accent hover:bg-surface-muted sm:h-10"
                  >
                    {t("edit")}
                  </Link>
                )}
              </li>
            ))}
          </List>
        </section>
      ))}
    </div>
  );
}
