import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { CourseHeader, loadCourseByCode, loadCourseSummary } from "@/components/course-layout";
import { DocumentRow, NoteRow, PeriodSections, QuestionLinkRow } from "@/components/library-ui";
import { Badge, ButtonLink, EmptyState, List, Notice, PageHeader, Section } from "@/components/ui";
import { getDb } from "@/db/client";
import { requireUser } from "@/server/auth/session";
import { getTopicPage } from "@/server/library/links";
import { topicLabel } from "@/server/library/topics";
import { canAccessLibrary } from "@/server/resources/service";

type Params = Promise<{ code: string; id: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const viewer = await requireUser();
  const page = await getTopicPage(getDb(), viewer, (await params).id);
  return { title: page ? `${topicLabel(page.topic, await getLocale())} · ${page.topic.courseCode}` : undefined };
}

/** One topic of a course: documents, your own notes, and published exam questions, each labelled with its source. */
export default async function TopicPage({ params }: { params: Params }) {
  const viewer = await requireUser();
  const { code, id } = await params;
  const course = await loadCourseByCode(code);
  if (!course) notFound();
  if (!canAccessLibrary(viewer)) notFound();
  const page = await getTopicPage(getDb(), viewer, id);
  // A topic is only reachable through its own course's address.
  if (!page || page.topic.courseId !== course.id) notFound();

  const t = await getTranslations();
  const locale = await getLocale();
  const summary = await loadCourseSummary(viewer, course);
  const { topic, documents, notes, questions } = page;
  const name = topicLabel(topic, locale);
  const topicsHref = `/courses/${encodeURIComponent(course.code)}/topics`;
  const examItems = questions.map((q) => ({ ...q, period: q.category === "current" ? ("current" as const) : ("historical" as const) }));
  const newNoteHref = `/notes/new?course=${encodeURIComponent(course.code)}`;
  const anyLegacy = documents.some((d) => d.legacy) || questions.some((q) => q.legacy);

  return (
    <>
      <CourseHeader course={summary} offeringCount={course.offerings.length} active="topics" />
      <PageHeader
        back={{ href: topicsHref, label: t("library.topics.backToList") }}
        title={name}
        subtitle={
          <span className="mt-1 inline-flex flex-wrap items-center gap-1.5">
            <Badge>{t("library.source.topic")}</Badge>
            {topic.archived && <Badge tone="warning">{t("library.topics.archived")}</Badge>}
          </span>
        }
        actions={
          <ButtonLink href={newNoteHref} variant="secondary" size="sm">
            {t("library.notes.new")}
          </ButtonLink>
        }
      />

      <div className="mb-6 flex flex-col gap-3">
        {topic.archived && <Notice tone="warning">{t("library.topicPage.archivedNotice")}</Notice>}
        {anyLegacy && <Notice>{t("library.topicPage.legacyHelp")}</Notice>}
        <Notice>{t("library.related.onlyVisible")}</Notice>
      </div>

      <Section title={t("library.topicPage.documents", { count: documents.length })}>
        {documents.length === 0 ? (
          <EmptyState title={t("library.topicPage.noDocumentsTitle")} body={t("library.topicPage.noDocuments")} />
        ) : (
          <PeriodSections items={documents} render={(rows) => <List>{rows.map((d) => <DocumentRow key={d.id} d={d} />)}</List>} />
        )}
      </Section>

      <Section title={t("library.topicPage.notes", { count: notes.length })}>
        {notes.length === 0 ? (
          <EmptyState title={t("library.topicPage.noNotesTitle")} body={t("library.topicPage.noNotes")} />
        ) : (
          <>
            <PeriodSections items={notes} render={(rows) => <List>{rows.map((n) => <NoteRow key={n.id} n={n} />)}</List>} />
            <p className="mt-2 px-1 text-[13px] text-text-subtle">{t("library.related.notesPrivacy")}</p>
          </>
        )}
      </Section>

      <Section title={t("library.topicPage.questions", { count: questions.length })}>
        {questions.length === 0 ? (
          <EmptyState title={t("library.topicPage.noQuestionsTitle")} body={t("library.topicPage.noQuestions")} />
        ) : (
          <PeriodSections items={examItems} kind="exam" render={(rows) => <List>{rows.map((q) => <QuestionLinkRow key={q.id} q={q} />)}</List>} />
        )}
      </Section>
    </>
  );
}
