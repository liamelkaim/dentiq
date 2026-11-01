import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { QuizIcon } from "@/components/icons";
import { QuizForm } from "@/components/study-forms";
import { ScopeFields } from "@/components/study-scope";
import { PrivacyNote } from "@/components/study-ui";
import { Badge, EmptyState, List, ListLinkRow, Notice, PageHeader, Panel, Section } from "@/components/ui";
import { getDb } from "@/db/client";
import { requireUser } from "@/server/auth/session";
import { canAccessLibrary } from "@/server/resources/service";
import { QUIZ_DEFAULT_COUNT, QUIZ_MAX_QUESTIONS } from "@/server/study/constants";
import { parseStudyScope } from "@/server/study/scope";
import { listQuizzes } from "@/server/study/service";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("studyTools.quizzes"))("title") };
}

export default async function QuizzesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const viewer = await requireUser();
  const t = await getTranslations("studyTools.quizzes");
  const root = await getTranslations("studyTools");
  const format = await getFormatter();
  const back = { href: "/practice", label: root("title") };

  if (!canAccessLibrary(viewer)) {
    const r = await getTranslations("resources");
    return (
      <>
        <PageHeader title={t("title")} back={back} />
        <Notice tone="warning" title={r("noAccessTitle")}>
          {r("noAccessBody")}
        </Notice>
      </>
    );
  }

  const scope = parseStudyScope(await searchParams);
  const history = await listQuizzes(getDb(), viewer);

  return (
    <>
      <PageHeader title={t("title")} subtitle={t("subtitle")} back={back} />
      <Panel className="p-4">
        <h2 className="mb-3 text-[16px] font-semibold">{t("newTitle")}</h2>
        <QuizForm defaultCount={QUIZ_DEFAULT_COUNT} maxCount={QUIZ_MAX_QUESTIONS}>
          <ScopeFields viewer={viewer} scope={scope} mode="quiz" idPrefix="qz" />
        </QuizForm>
      </Panel>
      <p className="mt-3 text-[13px] text-text-subtle">{t("scoreNote")}</p>

      <Section className="mt-8" title={t("historyTitle")}>
        {history.length === 0 ? (
          <EmptyState title={t("emptyTitle")} body={t("emptyBody")} />
        ) : (
          <List>
            {history.map((quiz) => {
              const answered = quiz.size - quiz.score.unanswered;
              return (
                <ListLinkRow
                  key={quiz.id}
                  href={`/practice/quizzes/${quiz.id}`}
                  leading={
                    <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-surface-muted text-text-muted">
                      <QuizIcon width={18} height={18} />
                    </span>
                  }
                  title={`${quiz.courseCode ?? t("courseRemoved")} · ${format.dateTime(quiz.createdAt, { dateStyle: "medium", timeStyle: "short" })}`}
                  subtitle={
                    quiz.completedAt
                      ? quiz.score.awaitingRating > 0
                        ? t("rowAwaiting", { count: quiz.score.awaitingRating })
                        : quiz.score.scored > 0
                        ? t("rowScore", { points: format.number(quiz.score.points, { maximumFractionDigits: 1 }), scored: quiz.score.scored, unscored: quiz.score.unscored })
                        : t("rowNoScore", { unscored: quiz.score.unscored })
                      : t("rowProgress", { answered, size: quiz.size })
                  }
                  meta={<Badge tone={quiz.completedAt ? "success" : "warning"}>{t(quiz.completedAt ? "statusDone" : "statusOpen")}</Badge>}
                />
              );
            })}
          </List>
        )}
      </Section>
      <div className="mt-4">
        <PrivacyNote />
      </div>
    </>
  );
}
