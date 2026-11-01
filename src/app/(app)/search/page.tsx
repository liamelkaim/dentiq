import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { TagIcon } from "@/components/icons";
import { NoteRow } from "@/components/library-ui";
import { PassRow } from "@/components/pass-ui";
import { ResourceList } from "@/components/resource-list";
import { Badge, Button, EmptyState, Field, Input, List, ListLinkRow, Notice, PageHeader, Section, Select } from "@/components/ui";
import { getDb } from "@/db/client";
import { requireUser } from "@/server/auth/session";
import { SEARCH_QUERY_MAX, SEARCH_RESULT_LIMIT } from "@/server/library/constants";
import { cleanQuery, searchLibrary } from "@/server/library/search";
import { topicLabel } from "@/server/library/topics";
import { listCourseChoices } from "@/server/passes/queries";
import { canAccessLibrary } from "@/server/resources/service";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("search"))("title") };
}

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/**
 * Search across documents, your own notes, course topics and published exam questions, optionally within one course.
 * Each source keeps its own permission rules (src/server/library/search.ts), and every section names its source.
 */
export default async function SearchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const viewer = await requireUser();
  const t = await getTranslations("search");
  const locale = await getLocale();
  const params = await searchParams;
  const q = cleanQuery(first(params.q));

  if (!canAccessLibrary(viewer)) {
    const r = await getTranslations("resources");
    return (
      <>
        <PageHeader title={t("title")} />
        <Notice tone="warning" title={r("noAccessTitle")}>
          {r("noAccessBody")}
        </Notice>
      </>
    );
  }

  const db = getDb();
  const courses = await listCourseChoices(db);
  const course = courses.find((c) => c.code === first(params.course));

  const form = (
    <form method="get" role="search" aria-label={t("title")} className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,14rem)_auto] sm:items-end">
      <Field label={t("query")} htmlFor="search-q">
        <Input id="search-q" name="q" type="search" defaultValue={q} maxLength={SEARCH_QUERY_MAX} />
      </Field>
      <Field label={t("course")} htmlFor="search-course">
        <Select id="search-course" name="course" defaultValue={course?.code ?? ""}>
          <option value="">{t("allCourses")}</option>
          {courses.map((c) => (
            <option key={c.id} value={c.code}>
              {c.code}
            </option>
          ))}
        </Select>
      </Field>
      <Button type="submit">{t("submit")}</Button>
    </form>
  );

  if (!q) {
    return (
      <>
        <PageHeader title={t("title")} />
        {form}
        <EmptyState title={t("noQueryTitle")} body={t("noQueryBody")} />
      </>
    );
  }

  const results = await searchLibrary(db, viewer, { q, courseId: course?.id });
  const { documents, notes, topics, questions } = results;
  const passesTitle = (await getTranslations("passes"))("title");
  const courseParam = course ? `&course=${encodeURIComponent(course.code)}` : "";
  // The Passes page filters by course id; the notes page by course code.
  const passesCourseParam = course ? `&course=${course.id}` : "";
  const more = (total: number) => (total > SEARCH_RESULT_LIMIT ? <p className="mt-2 px-1 text-[13px] text-text-subtle">{t("capped", { shown: SEARCH_RESULT_LIMIT, total })}</p> : null);

  return (
    <>
      <PageHeader title={t("title")} subtitle={course ? t("forQueryInCourse", { q, course: course.code }) : t("forQuery", { q })} />
      {form}

      <Section title={t("documents", { count: documents.total })} actions={<Badge>{t("sourceDocuments")}</Badge>}>
        <ResourceList items={documents.items} emptyBody={t("noDocuments")} />
        {more(documents.total)}
      </Section>

      <Section title={t("notes", { count: notes.total })} actions={<Badge tone="accent">{t("sourceNotes")}</Badge>}>
        {notes.items.length === 0 ? (
          <EmptyState title={t("noNotesTitle")} body={t("noNotes")} />
        ) : (
          <>
            <List>
              {notes.items.map((n) => (
                <NoteRow key={n.id} n={n} showCourse={n.courseCode} subtitleExtra={n.snippet} />
              ))}
            </List>
            {more(notes.total)}
            {notes.total > SEARCH_RESULT_LIMIT && (
              <p className="mt-1 px-1 text-[14px]">
                <Link href={`/notes?q=${encodeURIComponent(q)}${courseParam}`} className="font-medium text-accent hover:text-accent-hover">
                  {t("allNotes", { count: notes.total })}
                </Link>
              </p>
            )}
          </>
        )}
      </Section>

      <Section title={t("topics", { count: topics.total })} actions={<Badge>{t("sourceTopics")}</Badge>}>
        {topics.items.length === 0 ? (
          <EmptyState title={t("noTopicsTitle")} body={t("noTopics")} />
        ) : (
          <>
            <List>
              {topics.items.map((topic) => (
                <ListLinkRow
                  key={topic.id}
                  href={`/courses/${encodeURIComponent(topic.courseCode)}/topics/${topic.id}`}
                  leading={
                    <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-surface-muted text-text-muted">
                      <TagIcon width={18} height={18} />
                    </span>
                  }
                  title={topicLabel(topic, locale)}
                  subtitle={topic.courseCode}
                />
              ))}
            </List>
            {more(topics.total)}
          </>
        )}
      </Section>

      <Section title={t("questions", { count: questions.total })} actions={<Badge>{t("sourceQuestions", { passes: passesTitle })}</Badge>}>
        {questions.items.length === 0 ? (
          <EmptyState title={t("noQuestionsTitle")} body={t("noQuestions")} />
        ) : (
          <>
            <List>
              {questions.items.map((item) => (
                <PassRow key={item.id} item={item} courseLabel={item.courseCode} />
              ))}
            </List>
            {questions.total > SEARCH_RESULT_LIMIT && (
              <p className="mt-3 text-[14px]">
                <Link href={`/passes?q=${encodeURIComponent(q)}${passesCourseParam}`} className="font-medium text-accent hover:text-accent-hover">
                  {t("allQuestions", { count: questions.total })}
                </Link>
              </p>
            )}
          </>
        )}
      </Section>
    </>
  );
}
