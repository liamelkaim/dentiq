import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PracticeSession } from "@/components/study-forms";
import { ScopeFields } from "@/components/study-scope";
import { PrivacyNote } from "@/components/study-ui";
import { Button, ButtonLink, EmptyState, Field, Notice, PageHeader, Panel } from "@/components/ui";
import { getDb } from "@/db/client";
import { requireUser } from "@/server/auth/session";
import { canAccessLibrary } from "@/server/resources/service";
import { PRACTICE_DEFAULT_COUNT, PRACTICE_MAX_QUESTIONS } from "@/server/study/constants";
import { parseCount, parseStudyScope, scopeToQuery } from "@/server/study/scope";
import { getMarks, pickQuestions, toPublicQuestion } from "@/server/study/service";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("studyTools.practice"))("title") };
}

/**
 * Practice: pick a course (and optional filters), then answer published questions one by one. The shuffle is seeded
 * from the address, so a refresh keeps the same session; scoring and answers come from server actions.
 */
export default async function PracticePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const viewer = await requireUser();
  const t = await getTranslations("studyTools.practice");
  const root = await getTranslations("studyTools");
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

  const raw = await searchParams;
  const scope = parseStudyScope(raw);
  const rawCount = Array.isArray(raw.count) ? raw.count[0] : raw.count;
  const count = parseCount(rawCount, PRACTICE_DEFAULT_COUNT, PRACTICE_MAX_QUESTIONS);

  // A session starts once the setup form is submitted (it sends a count) or the address carries a seed; a link that only
  // names a course opens the setup form with that course already chosen.
  if (scope.course && (raw.count !== undefined || raw.seed !== undefined)) {
    const seedRaw = Array.isArray(raw.seed) ? raw.seed[0] : raw.seed;
    const seed = seedRaw && /^[A-Za-z0-9-]{8,64}$/.test(seedRaw) ? seedRaw : undefined;
    if (!seed) {
      const params = new URLSearchParams({ ...scopeToQuery(scope), count: String(count), seed: randomUUID() });
      redirect(`/practice/questions?${params.toString()}`);
    }

    const db = getDb();
    const { questions, poolSize } = await pickQuestions(db, viewer, scope, count, seed);
    if (questions.length === 0) {
      return (
        <>
          <PageHeader title={t("title")} subtitle={t("subtitle")} back={back} />
          <EmptyState title={t("noQuestionsTitle")} body={t("noQuestionsBody")} action={<ButtonLink href="/practice/questions">{t("changeScope")}</ButtonLink>} />
        </>
      );
    }
    const marks = await getMarks(db, viewer, questions.map((q) => q.id));
    return (
      <>
        <PageHeader title={t("title")} back={back} actions={<ButtonLink href="/practice/questions" variant="ghost" size="sm">{t("changeScope")}</ButtonLink>} />
        <PracticeSession key={seed} questions={questions.map(toPublicQuestion)} initialMarks={Object.fromEntries(marks)} poolSize={poolSize} />
      </>
    );
  }

  return (
    <>
      <PageHeader title={t("title")} subtitle={t("subtitle")} back={back} />
      <Panel className="p-4">
        <form method="get" action="/practice/questions" className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 xl:grid-cols-4">
          <ScopeFields viewer={viewer} scope={scope} mode="practice" />
          <Field label={t("count")} htmlFor="pr-count" hint={t("countHint", { max: PRACTICE_MAX_QUESTIONS })}>
            <input
              id="pr-count"
              name="count"
              type="number"
              inputMode="numeric"
              min={1}
              max={PRACTICE_MAX_QUESTIONS}
              defaultValue={PRACTICE_DEFAULT_COUNT}
              className="block h-11 w-full rounded-[var(--radius-control)] border border-border-strong bg-surface px-3 text-[15px] text-text focus:border-accent sm:h-10"
            />
          </Field>
          <div className="flex items-end min-[480px]:col-span-2 xl:col-span-4">
            <Button type="submit">{t("start")}</Button>
          </div>
        </form>
      </Panel>
      <div className="mt-4 flex flex-col gap-2">
        <p className="text-[13px] text-text-subtle">{t("setupNote")}</p>
        <PrivacyNote />
      </div>
    </>
  );
}
