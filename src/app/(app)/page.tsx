import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { CourseCover } from "@/components/course-layout";
import { BookIcon, CalendarIcon, ChartIcon, ChevronRightIcon, ClockIcon, FileIcon } from "@/components/icons";
import { EmptyState, Notice, Panel } from "@/components/ui";
import { getDb } from "@/db/client";
import { localized, type Locale } from "@/i18n/config";
import { getAnalytics } from "@/server/analytics/service";
import { hasRole } from "@/server/auth/roles";
import { CALENDAR_TIME_ZONE } from "@/server/calendar/constants";
import { isoDateIn } from "@/server/calendar/dates";
import { upcomingEntries } from "@/server/calendar/service";
import { requireUser } from "@/server/auth/session";
import { canAccessLibrary, isModerator, listCourseSummaries, listModerationQueue, listResources } from "@/server/resources/service";
import { listQuestionQueue } from "@/server/passes/service";
import { listUsers } from "@/server/users/service";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("dashboard"))("title") };
}

const LOOKAHEAD = 20;
const WEEK = 7;

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]!.toUpperCase())
      .join("") || "?"
  );
}

/** Card with the header used on every Home block: icon, title, optional link on the right. */
function Card({
  icon,
  title,
  titleId,
  action,
  children,
  className,
}: {
  icon: ReactNode;
  title: string;
  titleId: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Panel className={className} role="region" aria-labelledby={titleId}>
      <div className="p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id={titleId} className="flex items-center gap-3 text-[19px] font-semibold tracking-[-0.01em]">
            <span className="text-accent">{icon}</span>
            {title}
          </h2>
          {action}
        </div>
        {children}
      </div>
    </Panel>
  );
}

function CardLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="inline-flex min-h-11 items-center gap-1 text-[13px] font-medium text-accent hover:text-accent-hover sm:min-h-0">
      {children}
      <ChevronRightIcon width={14} height={14} />
    </Link>
  );
}

export default async function DashboardPage() {
  const user = await requireUser();
  const t = await getTranslations();
  const format = await getFormatter();
  const locale = (await getLocale()) as Locale;
  const db = getDb();
  const isAdmin = hasRole(user, "admin");
  const moderator = isModerator(user);
  const library = canAccessLibrary(user);

  const now = new Date();
  const calendarToday = isoDateIn(now, CALENDAR_TIME_ZONE);
  const [courses, recent, pending, queue, examQueue, analytics, entries] = await Promise.all([
    listCourseSummaries(db, user, { limit: 3 }),
    library ? listResources(db, user, { period: "all" }) : Promise.resolve([]),
    isAdmin ? listUsers(db, { approvalStatus: "pending" }) : Promise.resolve([]),
    listModerationQueue(db, user),
    listQuestionQueue(db, user),
    getAnalytics(db, user, locale, now),
    // Only entries the student wrote themselves; an empty list renders an empty state.
    upcomingEntries(db, user, calendarToday, LOOKAHEAD),
  ]);
  const recentPublished = recent
    .filter((r) => r.status === "published")
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 4);

  const firstName = user.name.split(" ")[0] || user.name;
  const hour = Number(new Intl.DateTimeFormat("en-CA", { hour: "numeric", hourCycle: "h23", timeZone: CALENDAR_TIME_ZONE }).format(now));
  const greetingKey = hour < 12 ? "greetingMorning" : hour < 18 ? "greetingAfternoon" : "greetingEvening";
  const todayLabel = format.dateTime(now, { weekday: "long", day: "numeric", month: "short" });

  const todays = entries.filter((e) => e.date === calendarToday);
  const later = entries.filter((e) => e.date !== calendarToday).slice(0, 4);

  // Real activity (answers and card reviews) for the last seven days.
  const week = analytics.activity.days.slice(-WEEK);
  const maxDay = Math.max(1, ...week.map((d) => d.total));
  const activeThisWeek = week.filter((d) => d.total > 0).length;
  const weekPercent = Math.round((activeThisWeek / WEEK) * 100);
  const RADIUS = 52;
  const CIRC = 2 * Math.PI * RADIUS;

  const reviewCount = queue.pending.length + queue.reports.length + examQueue.pending.length + examQueue.reports.length;

  return (
    <>
      {/* Greeting, sitting on the mountain band */}
      <section aria-labelledby="welcome-title" className="mb-7 min-h-[110px] px-1 lg:px-3">
        <h1 id="welcome-title" className="text-[32px] leading-[1.1] font-bold tracking-[-0.03em] text-mountain-title sm:text-[40px] lg:text-[46px]">
          {t(`home.${greetingKey}`)}, <span className="text-accent">{firstName}</span>
        </h1>
        <p className="mt-1 text-[18px] leading-snug text-text-muted sm:text-[22px] lg:text-[27px]">{t("home.tagline")}</p>
      </section>

      {user.approvalStatus === "pending" && (
        <Notice tone="warning" title={t("dashboard.pendingTitle")} className="mb-6">
          {t("dashboard.pendingBody")}
        </Notice>
      )}
      {user.approvalStatus === "rejected" && (
        <Notice tone="danger" title={t("dashboard.rejectedTitle")} className="mb-6">
          {t("dashboard.rejectedBody")}
        </Notice>
      )}
      {(pending.length > 0 || (moderator && reviewCount > 0)) && (
        <Notice tone="accent" title={t("home.attentionTitle")} className="mb-6">
          <span className="flex flex-wrap gap-x-5">
            {pending.length > 0 && (
              <Link href="/admin/users" className="font-medium text-accent hover:text-accent-hover">
                {t("admin.pendingCount", { count: pending.length })}
              </Link>
            )}
            {moderator && reviewCount > 0 && (
              <Link href="/moderation" className="font-medium text-accent hover:text-accent-hover">
                {t("dashboard.reviewQueue", { count: reviewCount })}
              </Link>
            )}
          </span>
        </Notice>
      )}

      <div className="flex flex-col gap-5">
        {/* Row 1: Today's plan and weekly activity */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.24fr)_minmax(0,1fr)]">
          <Card
            icon={<CalendarIcon width={28} height={28} />}
            title={t("home.todayPlan")}
            titleId="plan-title"
            action={<span className="text-[13px] text-text-muted first-letter:uppercase">{todayLabel}</span>}
          >
            {todays.length === 0 ? (
              <div className="rounded-[10px] border border-border bg-surface-muted/40 px-4 py-6 text-center">
                <p className="text-[14px] text-text-muted">{t("home.planEmpty")}</p>
                {library && (
                  <Link href="/calendar" className="mt-1 inline-flex min-h-11 items-center text-[13px] font-medium text-accent hover:text-accent-hover sm:min-h-0">
                    {t("home.planAdd")}
                  </Link>
                )}
              </div>
            ) : (
              <ul className="flex flex-col gap-2">
                {todays.slice(0, 4).map((e) => (
                  <li key={e.id}>
                    <Link
                      href={`/calendar/${e.id}`}
                      className="flex min-h-[46px] items-center gap-4 rounded-[10px] border border-border bg-surface-muted/40 px-3.5 transition-colors hover:border-border-strong"
                    >
                      <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-full border-2 border-text-subtle" />
                      <span className="min-w-0 flex-1 truncate text-[14px]">
                        {e.title}
                        {e.courseCode && <span className="text-text-muted"> · {e.courseCode}</span>}
                      </span>
                      <span className="shrink-0 text-[13px] text-text-muted">{e.time ?? t(`calendar.kinds.${e.kind}`)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card
            icon={<ChartIcon width={28} height={28} />}
            title={t("home.studyProgress")}
            titleId="progress-title"
            action={library && <CardLink href="/analytics">{t("home.viewAnalytics")}</CardLink>}
          >
            <div className="flex flex-col gap-4 rounded-[12px] border border-border bg-surface-muted/40 p-4 sm:flex-row sm:items-stretch">
              <div className="min-w-0 flex-1">
                <div className="flex h-[132px] items-end gap-2 border-b border-border pb-0" role="img" aria-label={t("home.chartLabel", { days: activeThisWeek })}>
                  {week.map((d, i) => {
                    const isToday = i === week.length - 1;
                    return (
                      <div key={d.date} className="flex h-full flex-1 flex-col justify-end">
                        <div
                          className={isToday ? "rounded-t-[4px] bg-accent-solid" : "rounded-t-[4px] bg-accent-solid/45"}
                          style={{ height: d.total === 0 ? "3px" : `${Math.max(8, Math.round((d.total / maxDay) * 100))}%` }}
                        />
                      </div>
                    );
                  })}
                </div>
                <div className="mt-2 flex gap-2" aria-hidden="true">
                  {week.map((d, i) => (
                    <span key={d.date} className={`flex-1 text-center text-[11px] ${i === week.length - 1 ? "font-medium text-accent" : "text-text-muted"}`}>
                      {format.dateTime(new Date(`${d.date}T12:00:00Z`), { weekday: "short", timeZone: "UTC" })}
                    </span>
                  ))}
                </div>
                {!analytics.hasAnyData && <p className="mt-2 text-[12px] text-text-subtle">{t("home.chartEmpty")}</p>}
              </div>
              <div className="flex shrink-0 flex-col items-center justify-center gap-1.5 sm:w-[150px]">
                <div className="relative size-[124px]">
                  <svg viewBox="0 0 124 124" className="size-full -rotate-90" aria-hidden="true">
                    <circle cx="62" cy="62" r={RADIUS} fill="none" stroke="var(--border-strong)" strokeWidth="9" />
                    <circle
                      cx="62"
                      cy="62"
                      r={RADIUS}
                      fill="none"
                      stroke="var(--accent-solid)"
                      strokeWidth="9"
                      strokeLinecap="round"
                      strokeDasharray={CIRC}
                      strokeDashoffset={CIRC * (1 - weekPercent / 100)}
                    />
                  </svg>
                  <span className="absolute inset-0 grid place-items-center text-[26px] font-bold tabular-nums">{weekPercent}%</span>
                </div>
                <p className="text-center text-[13px] leading-snug">
                  {t("home.activeDays")}
                  <br />
                  <span className="text-text-muted">{t("home.activeDaysCount", { count: activeThisWeek, total: WEEK })}</span>
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* Row 2: My courses */}
        <Card
          icon={<BookIcon width={28} height={28} />}
          title={t("home.myCourses")}
          titleId="courses-title"
          action={courses.length > 0 && <CardLink href="/courses">{t("home.viewAll")}</CardLink>}
        >
          {courses.length === 0 ? (
            <EmptyState title={t("home.coursesEmpty")} body={isAdmin ? t("dashboard.catalogEmptyAdmin") : undefined} />
          ) : (
            <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {courses.map((course) => {
                const instructor = course.instructors[0];
                return (
                  <li key={course.id}>
                    <Link
                      href={`/courses/${encodeURIComponent(course.code)}`}
                      className="group block rounded-[12px] border border-border bg-surface-muted/30 p-2.5 transition-colors hover:border-border-strong"
                    >
                      <CourseCover code={course.code} className="h-[130px] rounded-[10px] xl:h-[136px]" />
                      <div className="px-1.5 pt-3 pb-1">
                        <p className="truncate text-[16px] font-semibold group-hover:text-accent">
                          {localized(locale, course.titleFr, course.titleEn)}
                        </p>
                        <div className="mt-1.5 flex items-center justify-between gap-3">
                          <span className="flex min-w-0 items-center gap-2 text-[13px] text-text-muted">
                            {instructor ? (
                              <>
                                <span aria-hidden="true" className="grid size-5 shrink-0 place-items-center rounded-full bg-accent-soft text-[9px] font-semibold text-accent">
                                  {initials(instructor)}
                                </span>
                                <span className="truncate">{instructor}</span>
                              </>
                            ) : (
                              <span className="truncate">
                                {course.currentOffering
                                  ? `${course.currentOffering.academicYear} · ${t(`terms.${course.currentOffering.term}`)}`
                                  : t("home.noOffering")}
                              </span>
                            )}
                          </span>
                          {course.documentCount !== null && (
                            <span className="shrink-0 text-[12px] text-text-muted">{t("home.documents", { count: course.documentCount })}</span>
                          )}
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* Row 3: recently added and upcoming */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          {library && (
            <Card icon={<ClockIcon width={28} height={28} />} title={t("home.recent")} titleId="recent-title" action={<CardLink href="/resources">{t("home.viewAll")}</CardLink>}>
              {recentPublished.length === 0 ? (
                <p className="rounded-[10px] border border-border bg-surface-muted/40 px-4 py-6 text-center text-[14px] text-text-muted">{t("home.recentEmpty")}</p>
              ) : (
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {recentPublished.map((r) => (
                    <li key={r.id}>
                      <Link
                        href={`/study/${r.id}`}
                        className="group block overflow-hidden rounded-[10px] border border-border bg-surface-muted/30 transition-colors hover:border-border-strong"
                      >
                        <CourseCover code={r.courseCode} compact className="h-[84px] rounded-none" />
                        <span className="block px-2.5 pt-2 pb-2.5">
                          <span className="line-clamp-2 min-h-[2.5rem] text-[13px] leading-tight font-medium group-hover:text-accent">{r.title}</span>
                          <span className="mt-1 flex items-center gap-1 truncate text-[11px] text-text-muted">
                            <FileIcon width={12} height={12} className="shrink-0" />
                            <span className="truncate">{format.relativeTime(r.createdAt)}</span>
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          <Card
            icon={<CalendarIcon width={28} height={28} />}
            title={t("calendar.upcoming.title")}
            titleId="upcoming-title"
            className={library ? undefined : "lg:col-span-2"}
            action={library && <CardLink href="/calendar">{t("calendar.upcoming.open")}</CardLink>}
          >
            {later.length === 0 ? (
              <p className="rounded-[10px] border border-border bg-surface-muted/40 px-4 py-6 text-center text-[14px] text-text-muted">{t("home.upcomingEmpty")}</p>
            ) : (
              <ul className="divide-y divide-border rounded-[10px] border border-border bg-surface-muted/30">
                {later.map((e) => (
                  <li key={e.id}>
                    <Link href={`/calendar/${e.id}`} className="flex min-h-[48px] items-center gap-3 px-3 py-2 transition-colors hover:bg-surface-hover">
                      <span className="w-[52px] shrink-0 text-[13px] text-text-muted tabular-nums">
                        {e.time ?? format.dateTime(new Date(`${e.date}T12:00:00Z`), { day: "numeric", month: "short", timeZone: "UTC" })}
                      </span>
                      <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-accent-solid" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium">{e.title}</span>
                        <span className="block truncate text-[11px] text-text-muted">
                          {t(`calendar.kinds.${e.kind}`)}
                          {e.courseCode && ` · ${e.courseCode}`}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
