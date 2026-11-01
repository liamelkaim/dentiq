import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";
import { QuestionLinkForm, TopicPickerForm } from "@/components/library-forms";
import { RelatedPanel } from "@/components/library-ui";
import { excerpt } from "@/components/pass-ui";
import { Badge, Button, ButtonLink, Notice, PageHeader, Panel } from "@/components/ui";
import { getDb } from "@/db/client";
import { localized, type Locale } from "@/i18n/config";
import { requireUser } from "@/server/auth/session";
import { QUESTION_PICKER_LIMIT } from "@/server/library/constants";
import { removeQuestionLinkAction } from "@/server/library/actions";
import { listLinkableQuestions, relatedForNote, selectedTopicIds } from "@/server/library/links";
import { getNote } from "@/server/library/notes";
import { listCourseTopics, topicLabel } from "@/server/library/topics";
import { isModerator } from "@/server/resources/service";

type Params = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return {};
  const note = await getNote(getDb(), await requireUser(), id);
  return { title: note?.title };
}

export default async function NotePage({ params }: { params: Params }) {
  const viewer = await requireUser();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const db = getDb();
  const note = await getNote(db, viewer, id);
  if (!note) notFound();

  const t = await getTranslations();
  const locale = (await getLocale()) as Locale;
  const format = await getFormatter();
  const [related, topics, selected, linkable] = await Promise.all([
    relatedForNote(db, viewer, id),
    listCourseTopics(db, viewer, note.courseId),
    selectedTopicIds(db, "note", id),
    listLinkableQuestions(db, viewer, note.courseId, QUESTION_PICKER_LIMIT),
  ]);
  const linkedIds = new Set((related?.questions ?? []).map((q) => q.id));
  const offering = note.offering ? `${note.offering.academicYear} · ${t(`terms.${note.offering.term}`)}` : null;
  const courseTitle = localized(locale, note.course.titleFr, note.course.titleEn);

  return (
    <>
      <PageHeader
        back={{ href: "/notes", label: t("library.notes.title") }}
        title={note.title}
        subtitle={`${note.course.code} · ${courseTitle}`}
        actions={
          <>
            <ButtonLink href={`/notes/${note.id}/edit`} variant="secondary" size="sm">
              {t("library.notes.edit")}
            </ButtonLink>
            <ButtonLink href={`/notes/${note.id}/history`} variant="ghost" size="sm">
              {t("library.notes.history", { count: note.currentVersion })}
            </ButtonLink>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <Badge tone="accent">{t("library.source.note")}</Badge>
        <Badge>{t("library.notes.version", { number: note.currentVersion })}</Badge>
        {note.period === "historical" && <Badge>{t("library.period.previousBadge")}</Badge>}
        <span className="text-[13px] text-text-subtle">
          {[offering ?? t("library.period.noOffering"), t("library.notes.updated", { date: format.dateTime(note.updatedAt, { dateStyle: "medium" }) })].join(" · ")}
        </span>
      </div>
      {note.period === "historical" && offering && (
        <Notice className="mb-4">{t("library.period.noteHistoricalNotice", { offering })}</Notice>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Panel className="min-w-0 p-4 sm:p-6">
          {note.body ? (
            <p className="text-[16px] leading-relaxed break-words whitespace-pre-wrap">{note.body}</p>
          ) : (
            <p className="text-[14px] text-text-muted">{t("library.notes.emptyBodyNote")}</p>
          )}
        </Panel>

        <aside aria-label={t("library.related.title")} className="min-w-0 lg:self-start">
          <RelatedPanel
            courseCode={note.course.code}
            topics={related?.topics ?? []}
            topicEditor={
              <TopicPickerForm
                target="note"
                id={note.id}
                topics={topics.map((x) => ({ id: x.id, label: topicLabel(x, locale) }))}
                selected={selected}
                staffHref={isModerator(viewer) ? `/courses/${encodeURIComponent(note.course.code)}/topics` : undefined}
              />
            }
            questions={related?.questions ?? []}
            questionActions={(q) => (
              <form action={removeQuestionLinkAction}>
                <input type="hidden" name="kind" value="note" />
                <input type="hidden" name="id" value={note.id} />
                <input type="hidden" name="questionId" value={q.id} />
                <Button type="submit" variant="ghost" size="sm" aria-label={t("library.links.removeNamed", { question: excerpt(q.questionText, 60) })}>
                  {t("library.links.remove")}
                </Button>
              </form>
            )}
            actions={
              <details>
                <summary className="flex min-h-11 cursor-pointer items-center text-[14px] font-medium text-accent sm:min-h-9">{t("library.links.linkQuestion")}</summary>
                <div className="pt-2">
                  <QuestionLinkForm
                    kind="note"
                    id={note.id}
                    questions={linkable.filter((q) => !linkedIds.has(q.id)).map((q) => ({ id: q.id, label: `${q.examAcademicYear} · ${excerpt(q.questionText, 70)}` }))}
                  />
                </div>
              </details>
            }
          />
        </aside>
      </div>
    </>
  );
}
