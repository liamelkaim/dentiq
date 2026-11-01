import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PassRow } from "@/components/pass-ui";
import { ResourceList } from "@/components/resource-list";
import { Badge, EmptyState, List, Notice, PageHeader, Section } from "@/components/ui";
import { getDb } from "@/db/client";
import { requireUser } from "@/server/auth/session";
import { searchPublishedQuestions, SEARCH_QUESTION_LIMIT } from "@/server/passes/queries";
import { canAccessLibrary, listResources } from "@/server/resources/service";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("search"))("title") };
}

/** Dashboard search: documents and published exam questions, each with its source label. Permissions come from the services. */
export default async function SearchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const viewer = await requireUser();
  const t = await getTranslations("search");
  const raw = (await searchParams).q;
  const q = (Array.isArray(raw) ? raw[0] : raw)?.trim().slice(0, 100) ?? "";

  if (!canAccessLibrary(viewer)) {
    const r = await getTranslations("resources");
    return (
      <>
        <PageHeader title={t("title")} />
        <Notice tone="warning" title={r("noAccessTitle")}>
          {r("noAccessBody")}
        </Notice>
      </>
    );
  }
  if (!q) {
    return (
      <>
        <PageHeader title={t("title")} />
        <EmptyState title={t("noQueryTitle")} body={t("noQueryBody")} />
      </>
    );
  }

  const db = getDb();
  const [documents, questions] = await Promise.all([
    listResources(db, viewer, { q, period: "all" }),
    searchPublishedQuestions(db, viewer, q),
  ]);
  const passesTitle = (await getTranslations("passes"))("title");

  return (
    <>
      <PageHeader title={t("title")} subtitle={t("forQuery", { q })} />
      <Section title={t("documents", { count: documents.length })} actions={<Badge>{t("sourceDocuments")}</Badge>}>
        <ResourceList items={documents} emptyBody={t("noDocuments")} />
      </Section>
      <Section
        title={t("questions", { count: questions.total })}
        actions={<Badge>{t("sourceQuestions", { passes: passesTitle })}</Badge>}
      >
        {questions.items.length === 0 ? (
          <EmptyState title={t("noQuestionsTitle")} body={t("noQuestions")} />
        ) : (
          <>
            <List>
              {questions.items.map((item) => (
                <PassRow key={item.id} item={item} courseLabel={item.courseCode} />
              ))}
            </List>
            {questions.total > SEARCH_QUESTION_LIMIT && (
              <p className="mt-3 text-[14px]">
                <Link href={`/passes?q=${encodeURIComponent(q)}`} className="font-medium text-accent hover:text-accent-hover">
                  {t("allQuestions", { count: questions.total })}
                </Link>
              </p>
            )}
          </>
        )}
      </Section>
    </>
  );
}
