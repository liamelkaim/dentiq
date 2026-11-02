import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { Badge, Button, EmptyState, List, PageHeader } from "@/components/ui";
import { getDb } from "@/db/client";
import { requireRole } from "@/server/auth/session";
import { markFeedbackAction } from "@/server/feedback/actions";
import { listFeedback } from "@/server/feedback/service";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("admin.feedback"))("title") };
}

export default async function FeedbackAdminPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const viewer = await requireRole("admin");
  const t = await getTranslations("admin.feedback");
  const f = await getTranslations("feedback");
  const format = await getFormatter();
  const showAll = (await searchParams).show === "all";
  const items = await listFeedback(getDb(), viewer, showAll ? "all" : "new");
  return (
    <>
      <PageHeader back={{ href: "/admin", label: (await getTranslations("admin"))("title") }} title={t("title")} subtitle={t("subtitle")} />
      <div className="flex max-w-3xl flex-col gap-4">
        <nav aria-label={t("filter")} className="flex gap-2 text-[14px]">
          <Link href="/admin/feedback" aria-current={!showAll ? "page" : undefined} className={!showAll ? "font-semibold text-accent" : "text-text-muted"}>
            {t("new")}
          </Link>
          <Link href="/admin/feedback?show=all" aria-current={showAll ? "page" : undefined} className={showAll ? "font-semibold text-accent" : "text-text-muted"}>
            {t("all")}
          </Link>
        </nav>
        {items.length === 0 ? (
          <EmptyState title={t("emptyTitle")} body={t("emptyBody")} />
        ) : (
          <List>
            {items.map((i) => (
              <li key={i.id} className="flex flex-col gap-2 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2 text-[13px] text-text-muted">
                  <Badge tone={i.status === "new" ? "warning" : "success"}>{i.status === "new" ? t("new") : t("done")}</Badge>
                  <Badge>{f(`types.${i.type}`)}</Badge>
                  <span>{format.dateTime(i.createdAt, { dateStyle: "medium", timeStyle: "short" })}</span>
                  <span className="tabular-nums">{i.pagePath}</span>
                </div>
                <p className="text-[15px] break-words whitespace-pre-line">{i.message}</p>
                {i.contactEmail && (
                  <p className="text-[13px] text-text-muted">
                    {t("replyTo")}{" "}
                    <a href={`mailto:${i.contactEmail}`} className="font-medium text-accent">
                      {i.contactEmail}
                    </a>
                  </p>
                )}
                <form action={markFeedbackAction}>
                  <input type="hidden" name="id" value={i.id} />
                  <input type="hidden" name="done" value={i.status === "new" ? "1" : "0"} />
                  <Button type="submit" variant="secondary" size="sm">
                    {i.status === "new" ? t("markDone") : t("reopen")}
                  </Button>
                </form>
              </li>
            ))}
          </List>
        )}
      </div>
    </>
  );
}
