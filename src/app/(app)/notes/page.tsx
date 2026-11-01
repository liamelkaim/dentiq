import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { NoteRow, PeriodSections } from "@/components/library-ui";
import { Button, ButtonLink, EmptyState, Field, Input, List, Notice, PageHeader, Select } from "@/components/ui";
import { getDb } from "@/db/client";
import { requireUser } from "@/server/auth/session";
import { SEARCH_QUERY_MAX } from "@/server/library/constants";
import { listNotes } from "@/server/library/notes";
import { listCourseChoices } from "@/server/passes/queries";
import { canAccessLibrary } from "@/server/resources/service";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("library.notes"))("title") };
}

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** The signed-in student's own notes, grouped into the current offering and previous offerings. Nobody else's notes appear. */
export default async function NotesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const viewer = await requireUser();
  const t = await getTranslations();
  const params = await searchParams;
  const q = first(params.q)?.trim().slice(0, SEARCH_QUERY_MAX) ?? "";
  const courseCode = first(params.course) ?? "";

  if (!canAccessLibrary(viewer)) {
    return (
      <>
        <PageHeader title={t("library.notes.title")} />
        <Notice tone="warning" title={t("resources.noAccessTitle")}>
          {t("resources.noAccessBody")}
        </Notice>
      </>
    );
  }

  const db = getDb();
  const courses = await listCourseChoices(db);
  const course = courses.find((c) => c.code === courseCode);
  const notes = await listNotes(db, viewer, { courseId: course?.id, q: q || undefined });
  const filtered = Boolean(course || q);
  const newHref = course ? `/notes/new?course=${encodeURIComponent(course.code)}` : "/notes/new";

  return (
    <>
      <PageHeader
        title={t("library.notes.title")}
        subtitle={t("library.notes.subtitle")}
        actions={<ButtonLink href={newHref}>{t("library.notes.new")}</ButtonLink>}
      />
      <Notice tone="accent" className="mb-6">
        {t("library.notes.privacy")}
      </Notice>

      <form method="get" role="search" aria-label={t("library.notes.filterLabel")} className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,16rem)_auto] sm:items-end">
        <Field label={t("library.notes.search")} htmlFor="notes-q">
          <Input id="notes-q" name="q" defaultValue={q} maxLength={SEARCH_QUERY_MAX} />
        </Field>
        <Field label={t("library.notes.course")} htmlFor="notes-course">
          <Select id="notes-course" name="course" defaultValue={course?.code ?? ""}>
            <option value="">{t("library.notes.allCourses")}</option>
            {courses.map((c) => (
              <option key={c.id} value={c.code}>
                {c.code}
              </option>
            ))}
          </Select>
        </Field>
        <Button type="submit" variant="secondary">
          {t("library.notes.filter")}
        </Button>
      </form>

      {notes.length === 0 ? (
        <EmptyState
          title={t(filtered ? "library.notes.noMatchTitle" : "library.notes.emptyTitle")}
          body={t(filtered ? "library.notes.noMatch" : "library.notes.emptyBody")}
          action={
            filtered ? undefined : (
              <ButtonLink href={newHref}>{t("library.notes.new")}</ButtonLink>
            )
          }
        />
      ) : (
        <PeriodSections items={notes} render={(rows) => <List>{rows.map((n) => <NoteRow key={n.id} n={n} showCourse={n.courseCode} />)}</List>} />
      )}
    </>
  );
}
