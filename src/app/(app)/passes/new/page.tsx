import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { BookIcon } from "@/components/icons";
import { EmptyState, List, ListLinkRow, Notice, PageHeader } from "@/components/ui";
import { getDb } from "@/db/client";
import { localized, type Locale } from "@/i18n/config";
import { requireUser } from "@/server/auth/session";
import { listCourseChoices } from "@/server/passes/queries";
import { canAccessLibrary } from "@/server/resources/service";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("passes.form"))("title") };
}

/** A question always belongs to a course, so adding one starts by picking the course. */
export default async function NewPassPage() {
  const viewer = await requireUser();
  const t = await getTranslations();
  const locale = (await getLocale()) as Locale;
  const back = { href: "/passes", label: t("passes.title") };

  if (!canAccessLibrary(viewer)) {
    return (
      <>
        <PageHeader back={back} title={t("passes.form.title")} />
        <Notice tone="warning" title={t("resources.noAccessTitle")}>
          {t("resources.noAccessBody")}
        </Notice>
      </>
    );
  }

  const courses = await listCourseChoices(getDb());
  return (
    <>
      <PageHeader back={back} title={t("passes.form.title")} subtitle={t("passes.form.pickCourse")} />
      {courses.length === 0 ? (
        <EmptyState title={t("passes.form.noCourses")} body={t("passes.form.noCoursesBody")} />
      ) : (
        <List>
          {courses.map((c) => (
            <ListLinkRow
              key={c.id}
              href={`/courses/${encodeURIComponent(c.code)}/passes/new`}
              leading={
                <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-surface-muted text-text-muted">
                  <BookIcon width={18} height={18} />
                </span>
              }
              title={localized(locale, c.titleFr, c.titleEn)}
              subtitle={c.code}
            />
          ))}
        </List>
      )}
    </>
  );
}
