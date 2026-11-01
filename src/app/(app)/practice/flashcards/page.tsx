import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { CardsIcon } from "@/components/icons";
import { ScopeFields } from "@/components/study-scope";
import { PrivacyNote } from "@/components/study-ui";
import { excerpt } from "@/components/pass-ui";
import { Badge, Button, ButtonLink, EmptyState, List, ListLinkRow, Notice, PageHeader, Panel, Section } from "@/components/ui";
import { getDb } from "@/db/client";
import { requireUser } from "@/server/auth/session";
import { canAccessLibrary } from "@/server/resources/service";
import { NEW_CARDS_PER_SESSION, REVIEW_SESSION_MAX } from "@/server/study/constants";
import { INTERVAL_MINUTES } from "@/server/study/schedule";
import { parseStudyScope, scopeToQuery } from "@/server/study/scope";
import { cardOverview, listPersonalCards } from "@/server/study/service";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("studyTools.flashcards"))("title") };
}

export default async function FlashcardsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const viewer = await requireUser();
  const t = await getTranslations("studyTools.flashcards");
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

  const db = getDb();
  const scope = parseStudyScope(await searchParams);
  const [overview, personal] = await Promise.all([cardOverview(db, viewer, scope), listPersonalCards(db, viewer, scope.course)]);
  const reviewHref = `/practice/flashcards/review?${new URLSearchParams(scopeToQuery(scope)).toString()}`;
  const nothing = overview.generated + overview.personal === 0;
  const stats = [
    { label: t("stats.due"), value: overview.dueTotal },
    { label: t("stats.new"), value: overview.newTotal },
    { label: t("stats.fromQuestions"), value: overview.generated },
    { label: t("stats.personal"), value: overview.personal },
  ];

  return (
    <>
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        back={back}
        actions={
          <ButtonLink href="/practice/flashcards/new" variant="secondary">
            {t("newCard")}
          </ButtonLink>
        }
      />

      <Panel className="mb-6 p-4">
        <form method="get" action="/practice/flashcards" className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 xl:grid-cols-4">
          <ScopeFields viewer={viewer} scope={scope} mode="flashcards" idPrefix="fc" />
          <div className="flex items-end min-[480px]:col-span-2 xl:col-span-4">
            <Button type="submit" size="sm">
              {t("applyScope")}
            </Button>
          </div>
        </form>
      </Panel>

      {nothing ? (
        <EmptyState title={t("emptyTitle")} body={t("emptyBody")} action={<ButtonLink href="/practice/flashcards/new">{t("newCard")}</ButtonLink>} />
      ) : (
        <>
          <dl className="mb-4 grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 xl:grid-cols-4">
            {stats.map((s) => (
              <Panel key={s.label} className="px-4 py-3">
                <dt className="text-[13px] text-text-subtle">{s.label}</dt>
                <dd className="text-[22px] font-semibold tabular-nums">{format.number(s.value)}</dd>
              </Panel>
            ))}
          </dl>
          {overview.dueTotal + overview.newTotal > 0 ? (
            <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center">
              <ButtonLink href={reviewHref}>{t("startReview")}</ButtonLink>
              <p className="text-[13px] text-text-subtle">{t("sessionNote", { max: REVIEW_SESSION_MAX, fresh: NEW_CARDS_PER_SESSION })}</p>
            </div>
          ) : (
            <Notice>{t("nothingDue")}</Notice>
          )}
          <p className="mt-2 mb-6 text-[13px] text-text-subtle">{t("scheduleNote", { first: format.number(INTERVAL_MINUTES[1]! / 1440), last: format.number(INTERVAL_MINUTES[5]! / 1440) })}</p>
        </>
      )}

      <Section title={t("personalTitle")} description={t("personalHelp")}>
        {personal.length === 0 ? (
          <Panel className="px-4 py-5 text-[14px] text-text-muted">{t("personalEmpty")}</Panel>
        ) : (
          <List>
            {personal.map((card) => (
              <ListLinkRow
                key={card.id}
                href={`/practice/flashcards/${card.id}`}
                leading={
                  <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-surface-muted text-text-muted">
                    <CardsIcon width={18} height={18} />
                  </span>
                }
                title={excerpt(card.front, 120)}
                subtitle={excerpt(card.back, 120)}
                meta={
                  <>
                    {card.courseCode && <Badge>{card.courseCode}</Badge>}
                    <Badge tone={card.reviewCount === 0 ? "accent" : "neutral"}>{card.reviewCount === 0 ? t("badgeNew") : t("badgeBox", { box: card.box })}</Badge>
                  </>
                }
              />
            ))}
          </List>
        )}
      </Section>
      <PrivacyNote />
      <p className="mt-2 text-[13px]">
        <Link href="/practice/export" className="font-medium text-accent underline-offset-2 hover:underline">
          {t("exportLink")}
        </Link>
      </p>
    </>
  );
}
