import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";
import { AnswerBadge, AnswerPanel, CategoryBadge, ChoiceList, excerpt, ReviewStatusBadge } from "@/components/pass-ui";
import { GroupButton, ReportQuestionForm, ReviewForm, UnverifyForm, VerifyForm } from "@/components/pass-forms";
import { Badge, Button, ButtonLink, Notice, PageHeader, Panel, Section } from "@/components/ui";
import { getDb } from "@/db/client";
import { localized, type Locale } from "@/i18n/config";
import { requireUser } from "@/server/auth/session";
import { resolveQuestionReportAction } from "@/server/passes/actions";
import { findRepeats, getQuestion } from "@/server/passes/service";
import { getPassSettings } from "@/server/passes/settings";

type Params = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return {};
  const viewer = await requireUser();
  const q = await getQuestion(getDb(), viewer, id);
  return { title: q ? `${(await getTranslations("passes"))("question.title")} · ${q.course.code}` : undefined };
}

export default async function QuestionPage({ params, searchParams }: { params: Params; searchParams: Promise<Record<string, string | undefined>> }) {
  const viewer = await requireUser();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const db = getDb();
  const q = await getQuestion(db, viewer, id);
  if (!q) notFound();

  const t = await getTranslations("passes");
  const root = await getTranslations();
  const locale = (await getLocale()) as Locale;
  const format = await getFormatter();
  const flags = await searchParams;
  const date = (d: Date) => format.dateTime(d, { dateStyle: "medium" });
  const courseHref = `/courses/${encodeURIComponent(q.course.code)}/passes`;
  const [settings, repeats] = await Promise.all([getPassSettings(db), q.canModerate ? findRepeats(db, viewer, id) : Promise.resolve([])]);
  const typeName = q.type.known ? t(`types.${q.type.key}.name`) : t("types.unknown");
  const people = [q.professorName, ...q.instructors].filter((v, i, all): v is string => Boolean(v) && all.indexOf(v) === i);

  const facts = [
    q.course.code,
    q.examAcademicYear,
    q.examTerm ? root(`terms.${q.examTerm}`) : null,
    typeName,
    q.topic,
    people.length ? people.join(", ") : null,
    t(q.provenance === "released" ? "form.provenanceReleased" : "form.provenanceRecalled"),
    q.confidence ? t(q.confidence === "sure" ? "form.confidenceSure" : "form.confidenceUnsure") : null,
  ].filter(Boolean);

  return (
    <>
      <PageHeader
        back={{ href: courseHref, label: `${q.course.code} · ${t("title")}` }}
        title={excerpt(q.questionText, 90)}
        subtitle={localized(locale, q.course.titleFr, q.course.titleEn)}
        actions={
          <>
            {q.canEdit && (
              <ButtonLink href={`/passes/${q.id}/edit`} variant="secondary" size="sm">
                {t("question.edit")}
              </ButtonLink>
            )}
            {(q.canEdit || q.canModerate) && (
              <ButtonLink href={`/passes/${q.id}/history`} variant="ghost" size="sm">
                {t("question.history", { count: q.revisionCount })}
              </ButtonLink>
            )}
          </>
        }
      />

      <div className="mb-4 flex flex-col gap-3">
        {flags.submitted && (
          <Notice tone="success" title={t(q.status === "published" ? "question.submittedPublished" : "question.submittedTitle")}>
            {q.status === "published" ? null : t("question.submittedBody")}
            {flags.repeat && <p className="mt-1">{t("question.repeatNote")}</p>}
          </Notice>
        )}
        {flags.saved && <Notice tone="success">{t(flags.reset ? "question.savedReset" : "question.saved")}</Notice>}
        {q.status === "pending" && !flags.submitted && <Notice tone="warning">{t(q.canModerate ? "question.pendingModerator" : "question.pendingOwner")}</Notice>}
        {q.status === "rejected" && (
          <Notice tone="danger" title={t("question.rejected")}>
            {q.reviewNote ?? t("question.noReason")}
          </Notice>
        )}
        {q.status === "hidden" && <Notice>{t("question.hiddenNotice")}</Notice>}
        {q.duplicateOfId && (
          <Notice tone="accent">
            {t("question.duplicateOf")}{" "}
            <Link href={`/passes/${q.duplicateOfId}`} className="font-medium text-accent underline-offset-2 hover:underline">
              {t("question.seeOriginal")}
            </Link>
          </Notice>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Panel className="p-4 sm:p-6">
            <div className="mb-3 flex flex-wrap gap-1.5">
              <AnswerBadge status={q.answerStatus} />
              <ReviewStatusBadge status={q.status} />
              <CategoryBadge category={q.category} />
              {q.category === "previous" && <Badge>{t("category.previous")}</Badge>}
              {q.images.length > 0 && <Badge>{t("question.withImages", { count: q.images.length })}</Badge>}
            </div>
            <p className="mb-4 text-[13px] text-text-subtle">{facts.join(" · ")}</p>
            <p className="text-[17px] leading-relaxed whitespace-pre-line break-words">{q.questionText}</p>

            {q.images.length > 0 && (
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {q.images.map((image, i) => (
                  <li key={image.id}>
                    <a href={`/api/question-images/${image.id}`} target="_blank" rel="noopener" className="block rounded-[10px] border border-border bg-surface-muted p-1">
                      {/* eslint-disable-next-line @next/next/no-img-element -- private image behind an auth check */}
                      <img
                        src={`/api/question-images/${image.id}`}
                        alt={image.altText ?? t("question.imageAlt", { n: i + 1 })}
                        className="mx-auto block max-h-80 w-auto max-w-full rounded-md object-contain"
                      />
                    </a>
                  </li>
                ))}
              </ul>
            )}
            <ChoiceList choices={q.choices} rule={q.type.answer} />
          </Panel>

          <AnswerPanel question={q} date={date} />

          {q.canReport && (
            <details className="group rounded-[var(--radius-card)] border border-border bg-surface">
              <summary className="flex min-h-12 cursor-pointer list-none items-center px-4 text-[14px] font-medium text-text-muted marker:content-none [&::-webkit-details-marker]:hidden">
                {t("report.open")}
              </summary>
              <div className="border-t border-border p-1">
                <ReportQuestionForm questionId={q.id} />
              </div>
            </details>
          )}
        </div>

        {q.canModerate && (
          <aside aria-label={t("moderator.title")} className="flex min-w-0 flex-col gap-4 lg:self-start">
            <Panel className="flex flex-col gap-5 p-4 sm:p-5">
              <h2 className="text-[16px] font-semibold">{t("moderator.title")}</h2>
              <p className="text-[13px] text-text-subtle">
                {t("moderator.contributor", { name: q.contributorName ?? root("resources.detail.unknownUser") })}
              </p>

              <ReviewForm questionId={q.id} status={q.status} />

              <div className="border-t border-border pt-5">
                {q.canVerify ? (
                  <div className="flex flex-col gap-5">
                    {q.status === "rejected" || q.status === "hidden" ? (
                      <Notice>{t("verify.notVerifiable")}</Notice>
                    ) : (
                      <VerifyForm
                        // A new key whenever the stored answer changes resets the form to the saved values.
                        key={`${q.answerStatus}-${q.verification?.at?.toISOString() ?? "none"}`}
                        questionId={q.id}
                        rule={q.type.answer}
                        choices={q.choices}
                        proposedAnswerText={q.proposedAnswerText}
                        verifiedAnswerText={q.verifiedAnswerText}
                        verified={q.answerStatus === "verified"}
                        requireNote={settings.verification.requireNote}
                        minNoteLength={settings.verification.minNoteLength}
                      />
                    )}
                    {q.answerStatus === "verified" && (
                      <div className="border-t border-border pt-5">
                        <UnverifyForm questionId={q.id} requireNote={settings.verification.requireNote} minNoteLength={settings.verification.minNoteLength} />
                      </div>
                    )}
                  </div>
                ) : (
                  <Notice>{t("verify.notAllowed")}</Notice>
                )}
              </div>

              <div className="border-t border-border pt-5">
                <h3 className="text-[15px] font-semibold">{t("repeats.title")}</h3>
                <p className="mt-1 text-[13px] text-text-subtle">{t("repeats.help")}</p>
                {repeats.length === 0 ? (
                  <p className="mt-3 text-[14px] text-text-muted">{t("repeats.none")}</p>
                ) : (
                  <ul className="mt-3 flex flex-col gap-3">
                    {repeats.map((r) => (
                      <li key={r.id} className="rounded-[10px] border border-border p-3 text-[14px]">
                        <Link href={`/passes/${r.id}`} className="font-medium text-accent underline-offset-2 hover:underline">
                          {r.examAcademicYear}
                        </Link>{" "}
                        <span className="text-text-subtle">· {t(`status.${r.status === "published" ? "publishedLabel" : r.status}`)}</span>
                        {r.duplicateOfId ? (
                          <p className="mt-1 text-[13px] text-text-subtle">{t("repeats.alreadyGrouped")}</p>
                        ) : (
                          q.duplicateOfId !== r.id && (
                            <div className="mt-2">
                              <GroupButton questionId={q.id} canonicalId={r.id} label={t("repeats.groupUnder")} />
                            </div>
                          )
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {q.duplicateOfId && (
                  <div className="mt-3">
                    <GroupButton questionId={q.id} canonicalId={null} label={t("repeats.ungroup")} variant="ghost" />
                  </div>
                )}
              </div>

              <div className="border-t border-border pt-5">
                <h3 className="text-[15px] font-semibold">{t("moderator.reports", { count: q.openReports.length })}</h3>
                {q.openReports.length === 0 ? (
                  <p className="mt-2 text-[14px] text-text-muted">{t("moderator.noReports")}</p>
                ) : (
                  <ul className="mt-3 flex flex-col gap-3">
                    {q.openReports.map((r) => (
                      <li key={r.id} className="rounded-[10px] border border-border p-3 text-[14px]">
                        <p className="font-medium">{t(`report.reasons.${r.reason}`)}</p>
                        {r.details && <p className="mt-0.5 text-text-muted">{r.details}</p>}
                        <p className="mt-0.5 text-[12px] text-text-subtle">{date(r.createdAt)}</p>
                        <form action={resolveQuestionReportAction} className="mt-2 flex flex-col gap-2">
                          <input type="hidden" name="reportId" value={r.id} />
                          <input type="hidden" name="questionId" value={q.id} />
                          <input
                            name="note"
                            maxLength={500}
                            aria-label={t("moderator.resolveNote")}
                            placeholder={t("moderator.resolveNote")}
                            className="h-10 rounded-[var(--radius-control)] border border-border-strong bg-surface px-3 text-[14px]"
                          />
                          <div className="flex gap-2">
                            <Button type="submit" name="outcome" value="resolved" size="sm">
                              {t("moderator.resolve")}
                            </Button>
                            <Button type="submit" name="outcome" value="dismissed" variant="secondary" size="sm">
                              {t("moderator.dismiss")}
                            </Button>
                          </div>
                        </form>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Panel>
          </aside>
        )}
      </div>
      <Section className="mt-8" title={t("question.rightsTitle")}>
        <p className="px-1 text-[13px] text-text-subtle">{t("question.rightsNote")}</p>
      </Section>
    </>
  );
}
