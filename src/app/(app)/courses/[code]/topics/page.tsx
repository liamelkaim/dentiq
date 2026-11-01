import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { CourseHeader, loadCourseByCode, loadCourseSummary } from "@/components/course-layout";
import { TagIcon } from "@/components/icons";
import { CreateTopicForm, RenameTopicForm } from "@/components/library-forms";
import { TopicsEmptyState } from "@/components/library-ui";
import { Badge, Button, List, ListLinkRow, Notice, Panel, Section } from "@/components/ui";
import { getDb } from "@/db/client";
import { requireUser } from "@/server/auth/session";
import { archiveTopicAction, moveTopicAction } from "@/server/library/actions";
import { listCourseTopics, topicItemCounts, topicLabel } from "@/server/library/topics";
import { canAccessLibrary, isModerator } from "@/server/resources/service";

type Params = Promise<{ code: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const course = await loadCourseByCode((await params).code);
  const t = await getTranslations("courseLayout");
  return { title: course ? `${t("topics")} · ${course.code}` : undefined };
}

/** A course's shared topic list. Everyone approved can browse it; moderators and admins manage it. */
export default async function CourseTopicsPage({ params }: { params: Params }) {
  const viewer = await requireUser();
  const course = await loadCourseByCode((await params).code);
  if (!course) notFound();

  const t = await getTranslations();
  const locale = await getLocale();
  const summary = await loadCourseSummary(viewer, course);
  const header = <CourseHeader course={summary} offeringCount={course.offerings.length} active="topics" />;

  if (!canAccessLibrary(viewer)) {
    return (
      <>
        {header}
        <Notice tone="warning" title={t("resources.noAccessTitle")}>
          {t("resources.noAccessBody")}
        </Notice>
      </>
    );
  }

  const db = getDb();
  const staff = isModerator(viewer);
  const [topics, counts] = await Promise.all([listCourseTopics(db, viewer, course.id, { includeArchived: staff }), topicItemCounts(db, viewer, course.id)]);
  const base = `/courses/${encodeURIComponent(course.code)}/topics`;
  const active = topics.filter((x) => !x.archived);

  return (
    <>
      {header}
      <p className="mb-5 max-w-2xl text-[14px] text-text-muted">{t("library.topics.intro")}</p>

      {active.length === 0 ? (
        <TopicsEmptyState staff={staff} />
      ) : (
        <List>
          {active.map((topic) => {
            const c = counts.get(topic.id) ?? { documents: 0, notes: 0, questions: 0 };
            return (
              <ListLinkRow
                key={topic.id}
                href={`${base}/${topic.id}`}
                leading={
                  <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-surface-muted text-text-muted">
                    <TagIcon width={18} height={18} />
                  </span>
                }
                title={topicLabel(topic, locale)}
                subtitle={t("library.topics.counts", c)}
              />
            );
          })}
        </List>
      )}

      {staff && (
        <Section className="mt-10" title={t("library.topics.manage")} description={t("library.topics.manageHelp")}>
          <div className="flex flex-col gap-4">
            <CreateTopicForm courseId={course.id} />
            {topics.length > 0 && (
              <Panel className="overflow-hidden">
                <ul className="divide-y divide-border">
                  {topics.map((topic, index) => (
                    <li key={topic.id}>
                      <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <p className="flex min-w-0 items-center gap-2 text-[15px] font-medium">
                          <span className="truncate">{topic.name}</span>
                          {topic.nameEn && <span className="truncate text-[13px] font-normal text-text-subtle">{topic.nameEn}</span>}
                          {topic.archived && <Badge>{t("library.topics.archived")}</Badge>}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <form action={moveTopicAction}>
                            <input type="hidden" name="topicId" value={topic.id} />
                            <input type="hidden" name="direction" value="up" />
                            <Button type="submit" variant="ghost" size="sm" disabled={index === 0} aria-label={t("library.topics.moveUp", { name: topic.name })}>
                              {t("library.topics.up")}
                            </Button>
                          </form>
                          <form action={moveTopicAction}>
                            <input type="hidden" name="topicId" value={topic.id} />
                            <input type="hidden" name="direction" value="down" />
                            <Button type="submit" variant="ghost" size="sm" disabled={index === topics.length - 1} aria-label={t("library.topics.moveDown", { name: topic.name })}>
                              {t("library.topics.down")}
                            </Button>
                          </form>
                          <form action={archiveTopicAction}>
                            <input type="hidden" name="topicId" value={topic.id} />
                            <input type="hidden" name="value" value={String(!topic.archived)} />
                            <Button
                              type="submit"
                              variant="secondary"
                              size="sm"
                              aria-label={t(topic.archived ? "library.topics.restoreNamed" : "library.topics.archiveNamed", { name: topic.name })}
                            >
                              {t(topic.archived ? "library.topics.restore" : "library.topics.archive")}
                            </Button>
                          </form>
                        </div>
                      </div>
                      <details className="border-t border-border">
                        <summary className="flex min-h-11 cursor-pointer list-none items-center px-4 text-[14px] font-medium text-accent marker:content-none sm:min-h-9 [&::-webkit-details-marker]:hidden">
                          {t("library.topics.rename")}
                        </summary>
                        <RenameTopicForm topicId={topic.id} name={topic.name} nameEn={topic.nameEn} />
                      </details>
                    </li>
                  ))}
                </ul>
              </Panel>
            )}
          </div>
        </Section>
      )}
    </>
  );
}
