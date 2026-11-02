import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { ClassBlockForm, IcsImportForm } from "@/components/schedule-forms";
import { Badge, Button, EmptyState, List, Notice, PageHeader, Panel, Section } from "@/components/ui";
import { getDb } from "@/db/client";
import { localized, type Locale } from "@/i18n/config";
import { requireUser } from "@/server/auth/session";
import { isoDateIn } from "@/server/calendar/dates";
import { deleteClassBlockAction, followCourseAction } from "@/server/calendar/schedule-actions";
import { getInstitution, listClassBlocks, listFollowedCourseIds, loadTermData } from "@/server/calendar/schedule-service";
import { listCourses } from "@/server/catalog/service";
import { getProfile } from "@/server/onboarding/service";
import { canAccessLibrary } from "@/server/resources/service";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("schedule"))("title") };
}

const TERM_OF_SEMESTER = { 1: "fall", 2: "winter", 3: "summer" } as const;

export default async function SchedulePage() {
  const viewer = await requireUser();
  const t = await getTranslations("schedule");
  const cal = await getTranslations("calendar");
  const locale = (await getLocale()) as Locale;
  const header = <PageHeader back={{ href: "/calendar", label: cal("title") }} title={t("title")} subtitle={t("subtitle")} />;
  if (!canAccessLibrary(viewer)) return <>{header}<Notice tone="warning">{cal("noAccess")}</Notice></>;

  const db = getDb();
  const today = isoDateIn(new Date());
  const [blocks, followed, profile, institution, catalog] = await Promise.all([listClassBlocks(db, viewer), listFollowedCourseIds(db, viewer), getProfile(db, viewer.id), getInstitution(db, viewer.id), listCourses(db)]);
  const { terms } = await loadTermData(db, viewer, today, `${Number(today.slice(0, 4)) + 1}-12-31`);
  const nextTerm = terms.find((x) => x.end >= today);
  const suggested = profile?.programYear
    ? catalog.filter((c) => c.yearOfStudy === profile.programYear && (!profile.semester || !c.typicalTerm || c.typicalTerm === TERM_OF_SEMESTER[profile.semester as 1 | 2 | 3]))
    : [];
  const courseLabel = (c: { code: string; titleFr: string; titleEn: string | null }) => `${c.code} · ${localized(locale, c.titleFr, c.titleEn)}`;
  const weekday = (n: number) => t(`weekdays.${n}`);

  return (
    <>
      {header}
      <div className="flex max-w-3xl flex-col gap-8">
        <Notice tone="warning" title={t("verifyTitle")}>
          {t("verifyBody")}
        </Notice>

        <Section title={t("terms.title")} description={institution ? t("terms.help") : t("terms.noPreset")}>
          {institution && !nextTerm ? (
            <Panel className="p-4 text-[14px] text-text-muted">{t("terms.none")}</Panel>
          ) : nextTerm ? (
            <Panel className="flex flex-wrap items-center gap-3 p-4 text-[14px]">
              <span className="font-medium">
                {t(`terms.names.${nextTerm.term}`)} {nextTerm.academicYear}
              </span>
              <span className="text-text-muted">
                {t("terms.range", { from: nextTerm.start, to: nextTerm.end })}
              </span>
              <Badge tone={nextTerm.verified ? "success" : "warning"}>{nextTerm.verified ? t("terms.verified") : t("terms.unverified")}</Badge>
            </Panel>
          ) : null}
        </Section>

        <Section title={t("blocks.title")}>
          {blocks.length === 0 ? (
            <EmptyState title={t("blocks.emptyTitle")} body={t("blocks.emptyBody")} />
          ) : (
            <List>
              {blocks.map((b) => (
                <li key={b.id} className="flex min-h-14 items-center gap-3 px-4 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-medium break-words">{b.title}</span>
                    <span className="block text-[13px] text-text-muted">
                      {weekday(b.weekday)} {b.startTime} - {b.endTime} · {t("terms.range", { from: b.validFrom, to: b.validTo })}
                      {b.courseCode ? ` · ${b.courseCode}` : ""}
                      {b.location ? ` · ${b.location}` : ""}
                    </span>
                  </span>
                  <form action={deleteClassBlockAction}>
                    <input type="hidden" name="id" value={b.id} />
                    <Button type="submit" variant="ghost" aria-label={t("blocks.deleteLabel", { title: b.title })}>
                      {t("blocks.delete")}
                    </Button>
                  </form>
                </li>
              ))}
            </List>
          )}
          <h3 className="mt-6 mb-2 text-[16px] font-semibold">{t("form.heading")}</h3>
          <ClassBlockForm courses={catalog.map((c) => ({ id: c.id, label: courseLabel(c) }))} defaultFrom={nextTerm?.start ?? today} defaultTo={nextTerm?.end ?? today} />
        </Section>

        <Section title={t("follow.title")} description={profile?.programYear ? t("follow.help", { year: profile.programYear }) : t("follow.noProfile")}>
          {suggested.length === 0 ? (
            <Panel className="p-4 text-[14px] text-text-muted">{t("follow.empty")}</Panel>
          ) : (
            <List>
              {suggested.map((c) => {
                const on = followed.includes(c.id);
                return (
                  <li key={c.id} className="flex min-h-14 items-center gap-3 px-4 py-3">
                    <span className="min-w-0 flex-1 text-[15px] break-words">{courseLabel(c)}</span>
                    <form action={followCourseAction}>
                      <input type="hidden" name="courseId" value={c.id} />
                      <input type="hidden" name="follow" value={on ? "0" : "1"} />
                      <Button type="submit" variant={on ? "secondary" : "primary"} size="sm">
                        {on ? t("follow.remove") : t("follow.add")}
                      </Button>
                    </form>
                  </li>
                );
              })}
            </List>
          )}
        </Section>

        <Section title={t("import.title")} description={t("import.help")}>
          <IcsImportForm />
          <p className="mt-3 text-[13px] text-text-subtle">
            <a href="/api/calendar-export?classes=1" download className="font-medium text-accent hover:text-accent-hover">
              {t("import.exportClasses")}
            </a>
          </p>
        </Section>
      </div>
    </>
  );
}
