import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { QuizRate, QuizTake } from "@/components/study-forms";
import { OutcomeBadge, PrivacyNote, QuestionBody, RevealPanel } from "@/components/study-ui";
import { ButtonLink, Notice, PageHeader, Panel, Section } from "@/components/ui";
import { getDb } from "@/db/client";
import { requireUser } from "@/server/auth/session";
import { canAccessLibrary } from "@/server/resources/service";
import { getQuiz, type QuizItemView } from "@/server/study/service";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("studyTools.quizzes"))("title") };
}

function yourChoiceOf(response: Record<string, unknown> | null | undefined) {
  if (!response) return undefined;
  return {
    selected: Array.isArray(response.selected) ? (response.selected as number[]) : undefined,
    verdicts: response.verdicts && typeof response.verdicts === "object" ? (response.verdicts as Record<string, boolean>) : undefined,
  };
}

/** Take a quiz (one question at a time, no feedback), or read its results once every question is answered. */
export default async function QuizPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireUser();
  if (!canAccessLibrary(viewer)) notFound();
  const quiz = await getQuiz(getDb(), viewer, (await params).id);
  if (!quiz) notFound();
  const t = await getTranslations("studyTools.quizzes");
  const format = await getFormatter();
  const back = { href: "/practice/quizzes", label: t("title") };
  const title = `${quiz.courseCode ?? t("courseRemoved")} · ${format.dateTime(quiz.createdAt, { dateStyle: "medium" })}`;

  if (!quiz.complete) {
    const remaining = quiz.items.filter((i) => !i.answered && i.question).map((i) => ({ id: i.id, question: i.question! }));
    return (
      <>
        <PageHeader title={title} subtitle={t("takeSubtitle")} back={back} />
        <QuizTake quizId={quiz.id} items={remaining} total={quiz.items.length} answeredBefore={quiz.items.filter((i) => i.answered).length} />
      </>
    );
  }

  const score = quiz.score!;
  const scoredItems = quiz.items.filter((i) => i.question && i.result && (i.result.outcome === "correct" || i.result.outcome === "incorrect" || i.result.outcome === "partial"));
  const awaiting = quiz.items.filter((i) => i.question && i.answered && i.result && i.result.outcome === null);
  const unscoredItems = quiz.items.filter((i) => i.question && i.result?.outcome === "unscored");
  const unavailable = quiz.items.filter((i) => !i.question);

  const renderItem = (item: QuizItemView) => {
    const result = item.result!;
    const q = item.question!;
    const response = result.response;
    return (
      <li key={item.id}>
        <Panel className="flex flex-col gap-3 p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-semibold text-text-subtle">{t("results.questionN", { n: item.position })}</span>
            <OutcomeBadge outcome={result.outcome} />
            {result.selfRating && <span className="text-[12px] text-text-subtle">{t("results.selfRated")}</span>}
          </div>
          <QuestionBody question={q} />
          {q.rule === "text" && typeof response?.text === "string" && response.text.trim() && (
            <div className="rounded-[10px] border border-border bg-surface-muted/50 p-3">
              <p className="text-[13px] font-semibold text-text-subtle">{t("results.yourAnswer")}</p>
              <p className="mt-1 text-[15px] break-words whitespace-pre-line">{response.text}</p>
            </div>
          )}
          {result.reveal && <RevealPanel reveal={result.reveal} rule={q.rule} yourChoice={yourChoiceOf(response)} />}
          {result.outcome === null && <QuizRate quizId={quiz.id} itemId={item.id} />}
        </Panel>
      </li>
    );
  };

  return (
    <>
      <PageHeader title={title} subtitle={t("resultsSubtitle")} back={back} actions={<ButtonLink href="/practice/quizzes" variant="secondary" size="sm">{t("newQuiz")}</ButtonLink>} />

      <Panel className="mb-6 p-5">
        <h2 className="text-[13px] font-semibold text-text-subtle">{t("results.scoreTitle")}</h2>
        {score.scored > 0 ? (
          <>
            <p className="mt-1 text-[28px] leading-tight font-semibold tabular-nums">
              {t("results.points", { points: format.number(score.points, { maximumFractionDigits: 1 }), scored: score.scored })}
              <span className="ml-2 text-[18px] font-medium text-text-muted">{score.percent}%</span>
            </p>
            <p className="mt-1 text-[14px] text-text-muted">{t("results.breakdown", { correct: score.correct, partial: score.partial, incorrect: score.incorrect })}</p>
          </>
        ) : (
          <p className="mt-1 text-[16px] font-medium">{t("results.noScore")}</p>
        )}
        <ul className="mt-3 flex flex-col gap-1 text-[13px] text-text-subtle">
          <li>{t("results.scoreRule")}</li>
          {score.unscored > 0 && <li>{t("results.unscoredCount", { count: score.unscored })}</li>}
          {score.awaitingRating > 0 && <li>{t("results.awaitingCount", { count: score.awaitingRating })}</li>}
          {unavailable.length > 0 && <li>{t("results.unavailableCount", { count: unavailable.length })}</li>}
        </ul>
      </Panel>

      {awaiting.length > 0 && (
        <Section title={t("results.awaitingTitle")} description={t("results.awaitingHelp")}>
          <ul className="flex flex-col gap-4">{awaiting.map(renderItem)}</ul>
        </Section>
      )}
      {scoredItems.length > 0 && (
        <Section title={t("results.scoredTitle")}>
          <ul className="flex flex-col gap-4">{scoredItems.map(renderItem)}</ul>
        </Section>
      )}
      {unscoredItems.length > 0 && (
        <Section title={t("results.unscoredTitle")} description={t("results.unscoredHelp")}>
          <ul className="flex flex-col gap-4">{unscoredItems.map(renderItem)}</ul>
        </Section>
      )}
      {unavailable.length > 0 && <Notice>{t("results.unavailableNote")}</Notice>}
      <div className="mt-4">
        <PrivacyNote />
      </div>
    </>
  );
}
