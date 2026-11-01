// Display pieces for topics, notes and links. Server-compatible. Every row says what KIND of thing it is
// (document, private note, exam question), so a mixed list always shows its sources.
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import type { RelatedNote, RelatedQuestion, RelatedResource, RelatedTopic } from "@/server/library/links";
import { topicLabel } from "@/server/library/topics";
import { FileIcon, FolderIcon, PassesIcon } from "./icons";
import { AnswerBadge, excerpt } from "./pass-ui";
import { Badge, cx, EmptyState, ListLinkRow, List, Panel } from "./ui";

type Period = "current" | "historical" | "general";

// ---------- Current offering vs previous offerings ----------

/**
 * Splits items into "current offering" (the course's most recent offering, plus general material) and
 * "previous offerings", each with its label and a short explanation that older material may be outdated.
 * `kind="exam"` is for exam questions, whose period comes from the exam year instead of an offering.
 */
export function PeriodSections<T extends { period: Period }>({
  items,
  kind = "offering",
  render,
}: {
  items: T[];
  kind?: "offering" | "exam";
  render: (items: T[]) => ReactNode;
}) {
  const t = useTranslations("library.period");
  const current = items.filter((i) => i.period !== "historical");
  const historical = items.filter((i) => i.period === "historical");
  const groups = [
    { key: "current", rows: current },
    { key: "historical", rows: historical },
  ] as const;
  return (
    <div className="flex flex-col gap-5">
      {groups.map(({ key, rows }) => (
        <div key={key}>
          <div className="mb-2 px-1">
            <h3 className="text-[14px] font-semibold text-text">
              {t(`${kind}.${key}`)} <span className="font-normal text-text-subtle">({rows.length})</span>
            </h3>
            <p className="text-[13px] text-text-subtle">{t(`${kind}.${key}Help`)}</p>
          </div>
          {rows.length === 0 ? (
            <p className="rounded-[var(--radius-card)] border border-dashed border-border px-4 py-3 text-[14px] text-text-muted">{t(`${kind}.${key}Empty`)}</p>
          ) : (
            render(rows)
          )}
        </div>
      ))}
    </div>
  );
}

/** "2025-2026 · Automne", or a label saying there is no offering. */
export function useOfferingLabel() {
  const terms = useTranslations("terms");
  const t = useTranslations("library.period");
  return (row: { academicYear: string | null; term: string | null }) => (row.academicYear && row.term ? `${row.academicYear} · ${terms(row.term as "fall")}` : t("noOffering"));
}

// ---------- Rows ----------

const leadingIcon = (icon: ReactNode) => <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-surface-muted text-text-muted">{icon}</span>;

export function DocumentRow({ d, showCourse }: { d: RelatedResource & { legacy?: boolean }; showCourse?: string }) {
  const t = useTranslations();
  const offeringLabel = useOfferingLabel();
  return (
    <ListLinkRow
      href={`/resources/${d.id}`}
      leading={leadingIcon(<FileIcon width={18} height={18} />)}
      title={d.title}
      subtitle={[showCourse, t(`resources.kinds.${d.kind}`), offeringLabel(d)].filter(Boolean).join(" · ")}
      meta={
        <>
          <Badge>{t("library.source.document")}</Badge>
          {d.visibility === "private" && <Badge tone="accent">{t("resources.visibility.private")}</Badge>}
          {d.isOfficial && <Badge tone="accent">{t("resources.official")}</Badge>}
          {d.legacy && <Badge tone="warning">{t("library.topicPage.legacy")}</Badge>}
        </>
      }
    />
  );
}

export function NoteRow({ n, showCourse, subtitleExtra }: { n: { id: string; title: string; academicYear: string | null; term: string | null }; showCourse?: string; subtitleExtra?: string }) {
  const t = useTranslations("library");
  const offeringLabel = useOfferingLabel();
  return (
    <ListLinkRow
      href={`/notes/${n.id}`}
      leading={leadingIcon(<FolderIcon width={18} height={18} />)}
      title={n.title}
      subtitle={[showCourse, offeringLabel(n), subtitleExtra].filter(Boolean).join(" · ")}
      meta={
        <Badge tone="accent">{t("source.note")}</Badge>
      }
    />
  );
}

export function QuestionLinkRow({ q, showCourse }: { q: RelatedQuestion & { legacy?: boolean }; showCourse?: string }) {
  const t = useTranslations("library");
  const terms = useTranslations("terms");
  return (
    <ListLinkRow
      href={`/passes/${q.id}`}
      leading={leadingIcon(<PassesIcon width={18} height={18} />)}
      title={excerpt(q.questionText)}
      subtitle={[showCourse, t("period.examYear", { year: q.examAcademicYear }), q.examTerm ? terms(q.examTerm) : null].filter(Boolean).join(" · ")}
      meta={
        <>
          <Badge>{t("source.question")}</Badge>
          <AnswerBadge status={q.answerStatus} />
          {q.legacy && <Badge tone="warning">{t("topicPage.legacy")}</Badge>}
        </>
      }
    />
  );
}

// ---------- Topic chips and the Related panel ----------

export function TopicChips({ topics, courseCode }: { topics: RelatedTopic[]; courseCode: string }) {
  const locale = useLocale();
  const t = useTranslations("library.topics");
  return (
    <ul className="flex flex-wrap gap-2">
      {topics.map((topic) => (
        <li key={topic.id}>
          <Link
            href={`/courses/${encodeURIComponent(courseCode)}/topics/${topic.id}`}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-control)] border border-border-strong bg-surface px-3 text-[14px] font-medium text-text hover:bg-surface-hover sm:min-h-9"
          >
            {topicLabel(topic, locale)}
            {topic.archived && <span className="text-[12px] font-normal text-text-subtle">({t("archived")})</span>}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function SubHeading({ children }: { children: ReactNode }) {
  return <h3 className="mb-2 text-[14px] font-semibold text-text">{children}</h3>;
}

/**
 * "Related" panel for a document, note or question page. It only ever receives what the viewer may see
 * (see src/server/library/links.ts); the footer says so. Edit controls arrive as `topicEditor` and `actions`.
 */
export function RelatedPanel({
  courseCode,
  topics,
  legacyTopic,
  topicEditor,
  questions,
  documents,
  notes,
  questionActions,
  actions,
}: {
  courseCode: string;
  topics: RelatedTopic[];
  legacyTopic?: string | null;
  topicEditor?: ReactNode;
  questions?: RelatedQuestion[];
  documents?: RelatedResource[];
  notes?: RelatedNote[];
  /** Renders a control next to each linked question (for example "remove link"). */
  questionActions?: (question: RelatedQuestion) => ReactNode;
  actions?: ReactNode;
}) {
  const t = useTranslations("library.related");
  return (
    <Panel className="flex flex-col gap-5 p-4 sm:p-5">
      <h2 className="text-[16px] font-semibold">{t("title")}</h2>

      <div>
        <SubHeading>{t("topics")}</SubHeading>
        {topics.length > 0 ? <TopicChips topics={topics} courseCode={courseCode} /> : <p className="text-[14px] text-text-muted">{t("noTopics")}</p>}
        {legacyTopic && topics.length === 0 && (
          <p className="mt-2 text-[13px] text-text-subtle">
            <Badge tone="warning">{t("legacyBadge")}</Badge> <span className="ml-1">{t("legacyTopic", { topic: legacyTopic })}</span>
            <span className="mt-1 block">{t("legacyHelp")}</span>
          </p>
        )}
        {topicEditor && (
          <details className="mt-3">
            <summary className="flex min-h-11 cursor-pointer items-center text-[14px] font-medium text-accent sm:min-h-9">{t("editTopics")}</summary>
            <div className="pt-2">{topicEditor}</div>
          </details>
        )}
      </div>

      {questions && (
        <div>
          <SubHeading>{t("questions")}</SubHeading>
          {questions.length === 0 ? (
            <p className="text-[14px] text-text-muted">{t("noQuestions")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {questions.map((q) => (
                <li key={q.id} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                  <List className="min-w-0 flex-1">
                    <QuestionLinkRow q={q} />
                  </List>
                  {questionActions?.(q)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {documents && (
        <div>
          <SubHeading>{t("documents")}</SubHeading>
          {documents.length === 0 ? (
            <p className="text-[14px] text-text-muted">{t("noDocuments")}</p>
          ) : (
            <PeriodSections items={documents} render={(rows) => <List>{rows.map((d) => <DocumentRow key={d.id} d={d} />)}</List>} />
          )}
        </div>
      )}

      {notes && (
        <div>
          <SubHeading>{t("notes")}</SubHeading>
          {notes.length === 0 ? (
            <p className="text-[14px] text-text-muted">{t("noNotes")}</p>
          ) : (
            <PeriodSections items={notes} render={(rows) => <List>{rows.map((n) => <NoteRow key={n.id} n={n} />)}</List>} />
          )}
          <p className="mt-2 text-[13px] text-text-subtle">{t("notesPrivacy")}</p>
        </div>
      )}

      {actions}
      <p className={cx("border-t border-border pt-3 text-[12px] text-text-subtle")}>{t("onlyVisible")}</p>
    </Panel>
  );
}

export function TopicsEmptyState({ staff }: { staff: boolean }) {
  const t = useTranslations("library.topics");
  return <EmptyState title={t("emptyTitle")} body={staff ? t("emptyStaff") : t("emptyStudent")} />;
}
