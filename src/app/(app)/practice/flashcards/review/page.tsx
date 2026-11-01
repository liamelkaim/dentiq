import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { FlashcardReview, type ReviewCard } from "@/components/study-forms";
import { PrivacyNote } from "@/components/study-ui";
import { ButtonLink, EmptyState, Notice, PageHeader } from "@/components/ui";
import { getDb } from "@/db/client";
import { requireUser } from "@/server/auth/session";
import { canAccessLibrary } from "@/server/resources/service";
import { loadCardLabels } from "@/server/study/card-labels";
import { cardBack, cardFront } from "@/server/study/cards";
import { buildReveal } from "@/server/study/grading";
import { parseStudyScope } from "@/server/study/scope";
import { buildReviewQueue } from "@/server/study/service";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("studyTools.flashcards.review"))("title") };
}

/** A review session: the cards due now, then a few new ones. Cards from questions only use questions the viewer may study. */
export default async function ReviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const viewer = await requireUser();
  const t = await getTranslations("studyTools.flashcards");
  const back = { href: "/practice/flashcards", label: t("title") };

  if (!canAccessLibrary(viewer)) {
    const r = await getTranslations("resources");
    return (
      <>
        <PageHeader title={t("review.title")} back={back} />
        <Notice tone="warning" title={r("noAccessTitle")}>
          {r("noAccessBody")}
        </Notice>
      </>
    );
  }

  const [queue, labels] = await Promise.all([buildReviewQueue(getDb(), viewer, parseStudyScope(await searchParams)), loadCardLabels()]);
  if (queue.length === 0) {
    return (
      <>
        <PageHeader title={t("review.title")} back={back} />
        <EmptyState title={t("review.nothingTitle")} body={t("review.nothingBody")} action={<ButtonLink href="/practice/flashcards">{t("review.back")}</ButtonLink>} />
      </>
    );
  }

  const cards: ReviewCard[] = queue.map((item) =>
    item.kind === "question"
      ? {
          key: `q-${item.id}`,
          kind: "question",
          id: item.id,
          box: item.box,
          front: cardFront(item.question),
          back: cardBack(item.question, labels),
          images: item.question.images,
          basis: buildReveal(item.question).basis,
        }
      : { key: `p-${item.id}`, kind: "personal", id: item.id, box: item.box, front: item.front, back: item.back, images: [], basis: null },
  );

  return (
    <>
      <PageHeader title={t("review.title")} back={back} />
      <FlashcardReview cards={cards} />
      <div className="mt-4">
        <PrivacyNote />
      </div>
    </>
  );
}
