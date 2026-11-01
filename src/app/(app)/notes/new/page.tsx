import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { NoteForm } from "@/components/library-forms";
import { excerpt } from "@/components/pass-ui";
import { Button, EmptyState, Field, Notice, PageHeader, Select } from "@/components/ui";
import { getDb } from "@/db/client";
import { requireUser } from "@/server/auth/session";
import { getCourseByCode } from "@/server/catalog/service";
import { normalizeCourseCode } from "@/server/catalog/validation";
import { listCourseTopics, topicLabel } from "@/server/library/topics";
import { listCourseChoices } from "@/server/passes/queries";
import { getQuestion } from "@/server/passes/service";
import { canAccessLibrary, isModerator } from "@/server/resources/service";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("library.notes"))("new") };
}

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** Write a note. The course comes first (it decides the offerings and topics offered); `?question=` pre-links a published question. */
export default async function NewNotePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const viewer = await requireUser();
  const t = await getTranslations();
  const locale = await getLocale();
  const params = await searchParams;
  const back = { href: "/notes", label: t("library.notes.title") };

  if (!canAccessLibrary(viewer)) {
    return (
      <>
        <PageHeader back={back} title={t("library.notes.new")} />
        <Notice tone="warning" title={t("resources.noAccessTitle")}>
          {t("resources.noAccessBody")}
        </Notice>
      </>
    );
  }

  const db = getDb();
  const codeParam = first(params.course);
  const course = codeParam ? await getCourseByCode(db, normalizeCourseCode(decodeURIComponent(codeParam))) : null;

  if (!course || course.archivedAt) {
    const courses = await listCourseChoices(db);
    return (
      <>
        <PageHeader back={back} title={t("library.notes.new")} />
        {courses.length === 0 ? (
          <EmptyState title={t("library.notes.noCoursesTitle")} body={t("library.notes.noCourses")} />
        ) : (
          <form method="get" className="flex max-w-md flex-col gap-4">
            <p className="text-[14px] text-text-muted">{t("library.notes.pickCourseHelp")}</p>
            <Field label={t("library.notes.course")} htmlFor="note-course">
              <Select id="note-course" name="course" required defaultValue="">
                <option value="" disabled>
                  {t("library.notes.pickCourse")}
                </option>
                {courses.map((c) => (
                  <option key={c.id} value={c.code}>
                    {c.code}
                  </option>
                ))}
              </Select>
            </Field>
            <div>
              <Button type="submit">{t("library.notes.continue")}</Button>
            </div>
          </form>
        )}
      </>
    );
  }

  const topics = await listCourseTopics(db, viewer, course.id);
  const offerings = course.offerings.map((o) => ({
    id: o.id,
    label: [`${o.academicYear} · ${t(`terms.${o.term}`)}`, o.instructors.map((i) => i.fullName).join(", ")].filter(Boolean).join(" · "),
  }));

  // A question given in the address is only used when it is a published question of this same course the viewer can see.
  const questionId = first(params.question);
  const question = questionId ? await getQuestion(db, viewer, questionId) : null;
  const linked = question && question.status === "published" && question.course.id === course.id ? question : null;

  return (
    <>
      <PageHeader back={back} title={t("library.notes.new")} subtitle={course.code} />
      {linked && (
        <Notice tone="accent" className="mb-4">
          {t("library.notes.aboutQuestion", { question: excerpt(linked.questionText, 120) })}
        </Notice>
      )}
      <NoteForm
        mode="create"
        courseId={course.id}
        offerings={offerings}
        topics={topics.map((x) => ({ id: x.id, label: topicLabel(x, locale) }))}
        questionId={linked?.id}
        staffHref={isModerator(viewer) ? `/courses/${encodeURIComponent(course.code)}/topics` : undefined}
      />
    </>
  );
}
