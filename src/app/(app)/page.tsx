import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import type { ComponentType, SVGProps } from "react";
import { CourseCover } from "@/components/course-layout";
import {
  BookIcon,
  CardsIcon,
  ChartIcon,
  ChevronRightIcon,
  FileIcon,
  FlagIcon,
  FolderIcon,
  MicIcon,
  PassesIcon,
  SearchIcon,
  ShieldIcon,
  SparkleIcon,
} from "@/components/icons";
import { Badge, DescriptionList, EmptyState, List, ListRow, Notice, Panel, Section } from "@/components/ui";
import { getDb } from "@/db/client";
import { localized, type Locale } from "@/i18n/config";
import { hasRole } from "@/server/auth/roles";
import { requireUser } from "@/server/auth/session";
import { canAccessLibrary, isModerator, listCourseSummaries, listModerationQueue, listResources } from "@/server/resources/service";
import { listUsers } from "@/server/users/service";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("dashboard"))("title") };
}

const futureFeatures = [
  { key: "passes", icon: PassesIcon },
  { key: "flashcards", icon: CardsIcon },
  { key: "tutor", icon: SparkleIcon },
  { key: "recordings", icon: MicIcon },
] as const;

/** Decorative mountain ridges for the welcome banner (no image file). */
function Ridges() {
  return (
    <svg aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-3/4 w-full" viewBox="0 0 1200 300" preserveAspectRatio="none">
      <path d="M0 300 L0 190 L120 120 L210 170 L330 70 L450 160 L560 95 L690 175 L800 60 L930 150 L1040 100 L1200 170 L1200 300 Z" fill="var(--ridge-far)" />
      <path d="M0 300 L0 240 L150 185 L260 230 L400 160 L520 225 L660 175 L780 235 L900 180 L1050 230 L1200 200 L1200 300 Z" fill="var(--ridge-near)" />
    </svg>
  );
}

function QuickAction({
  href,
  label,
  icon: Icon,
}: {
  href: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}) {
  return (
    <Link href={href} className="group flex w-20 flex-col items-center gap-2 text-center sm:w-24">
      <span className="grid size-12 place-items-center rounded-full border border-border bg-surface text-accent shadow-card transition-colors group-hover:bg-accent-solid group-hover:text-on-accent sm:size-14">
        <Icon width={22} height={22} />
      </span>
      <span className="text-[12px] leading-tight font-medium text-text-muted group-hover:text-text">{label}</span>
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

  const [courses, recent, pending, queue] = await Promise.all([
    listCourseSummaries(db, user, { limit: 6 }),
    library ? listResources(db, user, { period: "all" }) : Promise.resolve([]),
    isAdmin ? listUsers(db, { approvalStatus: "pending" }) : Promise.resolve([]),
    listModerationQueue(db, user),
  ]);
  const recentPublished = recent
    .filter((r) => r.status === "published")
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 4);
  const firstName = user.name.split(" ")[0] || user.name;
  const today = format.dateTime(new Date(), { weekday: "long", day: "numeric", month: "long" });

  return (
    <>
      {/* Welcome banner */}
      <section
        aria-labelledby="welcome-title"
        className="relative mb-8 overflow-hidden rounded-[18px] border border-border px-5 pt-6 pb-7 sm:px-8 sm:pt-8 sm:pb-9"
        style={{ background: "linear-gradient(160deg, var(--hero-a), var(--hero-b))" }}
      >
        <Ridges />
        <div className="relative">
          <p className="text-[13px] font-medium text-text-subtle first-letter:uppercase">{today}</p>
          <h1 id="welcome-title" className="mt-1 text-[26px] leading-tight font-semibold tracking-[-0.02em] sm:text-[32px]">
            {t("home.welcome", { name: firstName })}
          </h1>
          <p className="mt-1 text-[15px] text-text-muted">{t("home.heroSubtitle")}</p>

          <form role="search" action={library ? "/resources" : "/courses"} className="relative mt-5 max-w-xl">
            <label htmlFor="home-search" className="sr-only">
              {t("home.searchLabel")}
            </label>
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 z-10 -translate-y-1/2 text-text-subtle" width={18} height={18} />
            <input
              id="home-search"
              name="q"
              type="search"
              maxLength={100}
              placeholder={library ? t("home.searchDocuments") : t("home.searchCourses")}
              className="h-12 w-full rounded-[12px] border border-border-strong bg-surface/90 pr-4 pl-10 text-[15px] shadow-card backdrop-blur placeholder:text-text-subtle focus:border-accent focus:outline-none"
            />
            {library && <input type="hidden" name="period" value="all" />}
          </form>

          <nav aria-label={t("nav.main")} className="mt-6 flex flex-wrap gap-2 sm:gap-4">
            <QuickAction href="/courses" label={t("home.quickCourses")} icon={BookIcon} />
            {library && <QuickAction href="/resources" label={t("home.quickResources")} icon={FolderIcon} />}
            {moderator && <QuickAction href="/moderation" label={t("home.quickModeration")} icon={FlagIcon} />}
            {isAdmin && <QuickAction href="/admin" label={t("home.quickAdmin")} icon={ShieldIcon} />}
          </nav>
        </div>
      </section>

      {user.approvalStatus === "pending" && (
        <Notice tone="warning" title={t("dashboard.pendingTitle")} className="mb-8">
          {t("dashboard.pendingBody")}
        </Notice>
      )}
      {user.approvalStatus === "rejected" && (
        <Notice tone="danger" title={t("dashboard.rejectedTitle")} className="mb-8">
          {t("dashboard.rejectedBody")}
        </Notice>
      )}

      <div className="grid gap-x-8 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          {/* Courses */}
          <Section
            title={t("home.myCourses")}
            actions={
              courses.length > 0 && (
                <Link href="/courses" className="inline-flex min-h-10 items-center text-[13px] font-medium text-accent hover:text-accent-hover sm:min-h-0">
                  {t("home.viewAll")}
                </Link>
              )
            }
          >
            {courses.length === 0 ? (
              <EmptyState title={t("home.coursesEmpty")} body={isAdmin ? t("dashboard.catalogEmptyAdmin") : undefined} />
            ) : (
              <ul className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
                {courses.map((course) => (
                  <li key={course.id}>
                    <Link
                      href={`/courses/${encodeURIComponent(course.code)}`}
                      className="group block overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface shadow-card transition-colors hover:border-border-strong"
                    >
                      <CourseCover code={course.code} className="h-24 rounded-none" />
                      <div className="p-4">
                        <p className="truncate text-[16px] font-semibold group-hover:text-accent">
                          {localized(locale, course.titleFr, course.titleEn)}
                        </p>
                        <p className="truncate text-[13px] text-text-subtle">
                          {course.currentOffering
                            ? [course.instructors.join(", "), `${course.currentOffering.academicYear} · ${t(`terms.${course.currentOffering.term}`)}`]
                                .filter(Boolean)
                                .join(" — ")
                            : t("home.noOffering")}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {course.documentCount !== null && <Badge tone={course.documentCount > 0 ? "accent" : "neutral"}>{t("home.documents", { count: course.documentCount })}</Badge>}
                          {course.yearOfStudy && <Badge>{t("courses.yearN", { year: course.yearOfStudy })}</Badge>}
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* Recently added documents (real uploads only) */}
          {library && (
            <Section title={t("home.recent")}>
              {recentPublished.length === 0 ? (
                <Panel className="px-4 py-6 text-center text-[14px] text-text-muted">{t("home.recentEmpty")}</Panel>
              ) : (
                <ul className="grid gap-3 sm:grid-cols-2">
                  {recentPublished.map((r) => (
                    <li key={r.id}>
                      <Link
                        href={`/study/${r.id}`}
                        className="group flex items-center gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-3 shadow-card transition-colors hover:border-border-strong"
                      >
                        <span className="grid size-11 shrink-0 place-items-center rounded-[10px] bg-accent-soft text-accent">
                          <FileIcon width={20} height={20} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] font-medium group-hover:text-accent">{r.title}</span>
                          <span className="block truncate text-[12px] text-text-subtle">
                            {r.courseCode} · {t(`resources.kinds.${r.kind}`)} · {format.relativeTime(r.createdAt)}
                          </span>
                        </span>
                        <ChevronRightIcon width={16} height={16} className="shrink-0 text-text-subtle" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          )}
        </div>

        <aside className="min-w-0">
          <Section title={t("dashboard.accountTitle")}>
            <DescriptionList
              stacked
              items={[
                { label: t("settings.role"), value: t(`roles.${user.role}`) },
                {
                  label: t("settings.status"),
                  value: (
                    <Badge tone={user.approvalStatus === "approved" ? "success" : user.approvalStatus === "pending" ? "warning" : "danger"}>
                      {t(`approval.${user.approvalStatus}`)}
                    </Badge>
                  ),
                },
                ...(isAdmin
                  ? [
                      {
                        label: t("admin.users"),
                        value: (
                          <Link href="/admin/users" className="font-medium text-accent hover:text-accent-hover">
                            {t("admin.pendingCount", { count: pending.length })}
                          </Link>
                        ),
                      },
                    ]
                  : []),
                ...(moderator
                  ? [
                      {
                        label: t("nav.moderation"),
                        value: (
                          <Link href="/moderation" className="font-medium text-accent hover:text-accent-hover">
                            {t("dashboard.reviewQueue", { count: queue.pending.length + queue.reports.length })}
                          </Link>
                        ),
                      },
                    ]
                  : []),
              ]}
            />
          </Section>

          {/* No activity data exists yet, so no chart — say so instead. */}
          <Section title={t("home.progressTitle")}>
            <Panel className="flex gap-3 p-4">
              <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-surface-muted text-text-subtle">
                <ChartIcon width={18} height={18} />
              </span>
              <div>
                <Badge>{t("nav.comingSoon")}</Badge>
                <p className="mt-1.5 text-[13px] text-text-muted">{t("home.progressBody")}</p>
              </div>
            </Panel>
          </Section>

          <Section title={t("dashboard.roadmapTitle")} description={t("dashboard.roadmapBody")}>
            <List>
              {futureFeatures.map(({ key, icon: Icon }) => (
                <ListRow key={key} className="justify-between">
                  <span className="flex items-center gap-2.5 text-[14px] text-text-muted">
                    <Icon width={17} height={17} className="text-text-subtle" />
                    {t(`nav.${key}`)}
                  </span>
                  <Badge>{t("common.planned")}</Badge>
                </ListRow>
              ))}
            </List>
          </Section>
        </aside>
      </div>
    </>
  );
}
