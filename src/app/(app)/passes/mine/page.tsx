import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { FileIcon } from "@/components/icons";
import { AnswerBadge, excerpt, useTypeName } from "@/components/pass-ui";
import { Badge, ButtonLink, EmptyState, List, ListLinkRow, ListRow, Notice, PageHeader } from "@/components/ui";
import { getDb } from "@/db/client";
import { requireUser } from "@/server/auth/session";
import { listMyQuestions } from "@/server/passes/service";
import { canAccessLibrary } from "@/server/resources/service";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("passes.mine"))("title") };
}

function TypeLabel({ type }: { type: string }) {
  return <>{useTypeName()(type)}</>;
}

/** The signed-in user's own submitted questions, whatever their status. Own items only (filtered in the query). */
export default async function MyContributionsPage() {
  const viewer = await requireUser();
  const t = await getTranslations("passes");
  const back = { href: "/passes", label: t("title") };

  if (!canAccessLibrary(viewer)) {
    const r = await getTranslations("resources");
    return (
      <>
        <PageHeader title={t("mine.title")} subtitle={t("mine.subtitle")} back={back} />
        <Notice tone="warning" title={r("noAccessTitle")}>
          {r("noAccessBody")}
        </Notice>
      </>
    );
  }

  const items = await listMyQuestions(getDb(), viewer);
  return (
    <>
      <PageHeader title={t("mine.title")} subtitle={t("mine.subtitle")} back={back} />
      {items.length === 0 ? (
        <EmptyState title={t("mine.emptyTitle")} body={t("mine.emptyBody")} action={<ButtonLink href="/passes/new">{t("add")}</ButtonLink>} />
      ) : (
        <>
          <p className="mb-3 px-1 text-[13px] text-text-subtle">{t("browser.count", { count: items.length })}</p>
          <List>
            {items.map((item) => {
              const subtitle = (
                <>
                  {item.courseCode} · {item.examAcademicYear} · <TypeLabel type={item.questionType} />
                </>
              );
              const meta = (
                <>
                  <Badge tone={item.status === "published" ? "success" : item.status === "pending" ? "warning" : item.status === "rejected" ? "danger" : "neutral"}>
                    {t(`status.${item.status === "published" ? "publishedLabel" : item.status}`)}
                  </Badge>
                  <AnswerBadge status={item.answerStatus} />
                </>
              );
              const title = excerpt(item.questionText);
              if (item.openable) {
                return (
                  <ListLinkRow
                    key={item.id}
                    href={`/passes/${item.id}`}
                    leading={
                      <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-surface-muted text-text-muted">
                        <FileIcon width={18} height={18} />
                      </span>
                    }
                    title={title}
                    subtitle={subtitle}
                    meta={meta}
                  />
                );
              }
              return (
                <ListRow key={item.id} className="flex-col items-start gap-1">
                  <span className="block max-w-full truncate text-[15px] font-medium">{title}</span>
                  <span className="text-[13px] text-text-subtle">{subtitle}</span>
                  <span className="flex flex-wrap gap-1.5">{meta}</span>
                  <span className="text-[12px] text-text-subtle">{t("mine.hiddenNote")}</span>
                </ListRow>
              );
            })}
          </List>
        </>
      )}
    </>
  );
}
