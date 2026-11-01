import type { Metadata } from "next";
import { forbidden, notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { z } from "zod";
import { excerpt } from "@/components/pass-ui";
import { Badge, EmptyState, PageHeader, Panel } from "@/components/ui";
import { getDb } from "@/db/client";
import { requireUser } from "@/server/auth/session";
import { getQuestion, listQuestionRevisions } from "@/server/passes/service";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("passes.history"))("title") };
}

type Snapshot = Record<string, unknown>;
type SnapshotChoice = { position: number; text: string; proposedCorrect: boolean | null; verifiedCorrect: boolean | null };

const FIELDS = [
  "status",
  "answerStatus",
  "questionType",
  "examAcademicYear",
  "examTerm",
  "topic",
  "questionText",
  "explanation",
  "offeringId",
  "professorId",
  "proposedAnswerText",
  "verifiedAnswerText",
  "verificationNote",
  "confidence",
  "choices",
  "images",
] as const;

/** Which fields differ between a revision and the one before it. */
function changedFields(current: Snapshot, previous: Snapshot | null): string[] {
  if (!previous) return [];
  return FIELDS.filter((f) => JSON.stringify(current[f] ?? null) !== JSON.stringify(previous[f] ?? null));
}

const asChoices = (value: unknown): SnapshotChoice[] => (Array.isArray(value) ? (value as SnapshotChoice[]) : []);

/** Text badge, never a glyph or a color alone: the word carries the meaning. */
function Mark({ value, label }: { value: boolean | null; label: { correct: string; incorrect: string; none: string } }) {
  if (value === true) return <Badge tone="success">{label.correct}</Badge>;
  if (value === false) return <Badge tone="danger">{label.incorrect}</Badge>;
  return <span className="text-text-subtle">{label.none}</span>;
}

export default async function QuestionHistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireUser();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const db = getDb();
  const q = await getQuestion(db, viewer, id);
  if (!q) notFound();
  if (!q.canEdit && !q.canModerate) forbidden();

  const t = await getTranslations("passes.history");
  const markLabels = { correct: t("mark.correct"), incorrect: t("mark.incorrect"), none: t("mark.none") };
  const root = await getTranslations("passes");
  const format = await getFormatter();
  const revisions = await listQuestionRevisions(db, viewer, id);
  const unknown = (await getTranslations("resources.detail"))("unknownUser");

  return (
    <>
      <PageHeader back={{ href: `/passes/${q.id}`, label: excerpt(q.questionText, 40) }} title={t("title")} subtitle={t("subtitle")} />
      {revisions.length === 0 ? (
        <EmptyState title={t("empty")} />
      ) : (
        <ol className="flex flex-col gap-4">
          {revisions.map((rev, index) => {
            const snap = rev.snapshot as Snapshot;
            const previous = (revisions[index + 1]?.snapshot as Snapshot | undefined) ?? null;
            const changed = changedFields(snap, previous);
            const choices = asChoices(snap.choices);
            return (
              <li key={rev.revisionNumber}>
                <Panel className="p-4 sm:p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-[15px] font-semibold">{t("revision", { number: rev.revisionNumber })}</h2>
                    <Badge tone={snap.answerStatus === "verified" ? "success" : "neutral"}>{root(`answer.${snap.answerStatus === "verified" ? "verifiedBadge" : "proposedBadge"}`)}</Badge>
                    <span className="text-[13px] text-text-subtle">
                      {format.dateTime(rev.createdAt, { dateStyle: "medium", timeStyle: "short" })} · {t("by", { name: rev.changedByName ?? unknown })}
                    </span>
                  </div>
                  {rev.changeNote && <p className="mt-2 text-[14px]">{rev.changeNote}</p>}
                  {previous ? (
                    <p className="mt-2 text-[13px] text-text-muted">
                      {changed.length ? t("changed", { fields: changed.map((f) => t(`fields.${f}`)).join(", ") }) : t("noFieldChange")}
                    </p>
                  ) : (
                    <p className="mt-2 text-[13px] text-text-muted">{t("first")}</p>
                  )}
                  <details className="mt-3">
                    <summary className="cursor-pointer text-[13px] font-medium text-accent">{t("showState")}</summary>
                    <div className="mt-3 flex flex-col gap-2 text-[14px]">
                      <p>
                        <span className="text-text-subtle">{t("fields.examAcademicYear")}: </span>
                        {String(snap.examAcademicYear ?? "")}
                        {snap.examTerm ? ` · ${String(snap.examTerm)}` : ""}
                      </p>
                      <p className="whitespace-pre-line">{String(snap.questionText ?? "")}</p>
                      {choices.length > 0 && (
                        <table className="w-full text-left text-[13px]">
                          <caption className="sr-only">{t("fields.choices")}</caption>
                          <thead>
                            <tr className="text-text-subtle">
                              <th scope="col" className="py-1 pr-2 font-medium">
                                {t("fields.choices")}
                              </th>
                              <th scope="col" className="px-2 py-1 font-medium">
                                {t("proposed")}
                              </th>
                              <th scope="col" className="px-2 py-1 font-medium">
                                {t("verified")}
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {choices.map((c) => (
                              <tr key={c.position} className="border-t border-border">
                                <td className="py-1 pr-2 break-words">{c.text}</td>
                                <td className="px-2 py-1"><Mark value={c.proposedCorrect} label={markLabels} /></td>
                                <td className="px-2 py-1"><Mark value={c.verifiedCorrect} label={markLabels} /></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                      {snap.proposedAnswerText ? (
                        <p>
                          <span className="text-text-subtle">{t("proposed")}: </span>
                          {String(snap.proposedAnswerText)}
                        </p>
                      ) : null}
                      {snap.verifiedAnswerText ? (
                        <p>
                          <span className="text-text-subtle">{t("verified")}: </span>
                          {String(snap.verifiedAnswerText)}
                        </p>
                      ) : null}
                      {snap.verificationNote ? (
                        <p>
                          <span className="text-text-subtle">{t("basis")}: </span>
                          {String(snap.verificationNote)}
                        </p>
                      ) : null}
                    </div>
                  </details>
                </Panel>
              </li>
            );
          })}
        </ol>
      )}
    </>
  );
}
