import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { AskForm } from "@/components/tutor-ask";
import { Button, EmptyState, List, PageHeader, Panel, Section } from "@/components/ui";
import { getDb } from "@/db/client";
import { localized, type Locale } from "@/i18n/config";
import { requireUser } from "@/server/auth/session";
import { listCourseChoices } from "@/server/passes/queries";
import { canAccessLibrary } from "@/server/resources/service";
import { deleteAllConversationsAction, deleteConversationAction } from "@/server/tutor/actions";
import { getConversation, listConversations } from "@/server/tutor/conversations";
import { getTutorStatus } from "@/server/tutor/service";
import { getLocale } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("tutor.history"))("title") };
}

export default async function TutorHistoryPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const viewer = await requireUser();
  const t = await getTranslations("tutor");
  const h = await getTranslations("tutor.history");
  const format = await getFormatter();
  const locale = (await getLocale()) as Locale;
  const back = { href: "/tutor", label: t("title") };
  if (!canAccessLibrary(viewer)) return <PageHeader back={back} title={h("title")} />;

  const db = getDb();
  const { c } = await searchParams;
  const [items, open, status, courses] = await Promise.all([listConversations(db, viewer.id), c ? getConversation(db, viewer.id, c) : null, getTutorStatus(db), listCourseChoices(db)]);

  return (
    <>
      <PageHeader back={back} title={h("title")} subtitle={h("subtitle")} />
      <div className="flex max-w-3xl flex-col gap-8">
        {open ? (
          <Section title={open.title}>
            <Panel className="flex flex-col gap-4 p-4 sm:p-5">
              {open.messages.map((m) => (
                <div key={m.id}>
                  <p className="text-[12px] font-semibold text-text-subtle">{m.role === "user" ? h("you") : t("ask.generated")}</p>
                  <p className="text-[15px] break-words whitespace-pre-line">{m.body}</p>
                  {m.citations.length > 0 && (
                    <ul className="mt-1 text-[13px]">
                      {m.citations.map((cit) => (
                        <li key={cit.passageId}>
                          <Link href={cit.href} className="font-medium text-accent">{cit.title}</Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
              <form action={deleteConversationAction}>
                <input type="hidden" name="id" value={open.id} />
                <Button type="submit" variant="danger" size="sm">{h("delete")}</Button>
              </form>
            </Panel>
            {status.state === "ready" && open.courseId && (
              <div className="mt-4">
                <AskForm conversationId={open.id} defaultCourseId={open.courseId} courses={courses.map((x) => ({ id: x.id, label: `${x.code} · ${localized(locale, x.titleFr, x.titleEn)}` }))} />
              </div>
            )}
          </Section>
        ) : null}

        <Section title={h("listTitle")} description={h("privacy")}>
          {items.length === 0 ? (
            <EmptyState title={h("emptyTitle")} body={h("emptyBody")} />
          ) : (
            <List>
              {items.map((i) => (
                <li key={i.id}>
                  <Link href={`/tutor/history?c=${i.id}`} className="flex min-h-14 flex-col justify-center px-4 py-3 hover:bg-surface-hover">
                    <span className="text-[15px] font-medium break-words">{i.title}</span>
                    <span className="text-[13px] text-text-subtle">{format.dateTime(i.updatedAt, { dateStyle: "medium", timeStyle: "short" })}</span>
                  </Link>
                </li>
              ))}
            </List>
          )}
        </Section>

        <Section title={h("manage")}>
          <div className="flex flex-wrap gap-3">
            <a href="/api/tutor-export" download className="inline-flex min-h-11 items-center rounded-[10px] border border-border-strong px-4 text-[14px] font-medium hover:bg-surface-hover">{h("export")}</a>
            {items.length > 0 && (
              <form action={deleteAllConversationsAction}>
                <Button type="submit" variant="danger">{h("deleteAll")}</Button>
              </form>
            )}
          </div>
        </Section>
      </div>
    </>
  );
}
