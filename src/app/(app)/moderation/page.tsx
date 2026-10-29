import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { FileIcon, FlagIcon } from "@/components/icons";
import { Badge, List, ListLinkRow, PageHeader, Panel, Section } from "@/components/ui";
import { getDb } from "@/db/client";
import { requireRole } from "@/server/auth/session";
import { listModerationQueue } from "@/server/resources/service";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("moderation"))("title") };
}

const iconBox = "grid size-9 shrink-0 place-items-center rounded-[10px] bg-surface-muted text-text-muted";

export default async function ModerationPage() {
  const viewer = await requireRole("moderator");
  const t = await getTranslations();
  const format = await getFormatter();
  const { pending, reports } = await listModerationQueue(getDb(), viewer);
  const date = (d: Date) => format.dateTime(d, { dateStyle: "medium" });
  const unknown = t("resources.detail.unknownUser");

  return (
    <>
      <PageHeader title={t("moderation.title")} subtitle={t("moderation.subtitle")} />

      <Section title={`${t("moderation.pending")} (${pending.length})`}>
        {pending.length === 0 ? (
          <Panel className="px-4 py-5 text-[14px] text-text-muted">{t("moderation.pendingEmpty")}</Panel>
        ) : (
          <List>
            {pending.map((r) => (
              <ListLinkRow
                key={r.id}
                href={`/resources/${r.id}`}
                leading={<span className={iconBox}><FileIcon width={18} height={18} /></span>}
                title={r.title}
                subtitle={`${r.courseCode} · ${t(`resources.kinds.${r.kind}`)} · ${t("moderation.by", { name: r.uploaderName ?? unknown })} · ${date(r.createdAt)}`}
                trailing={<Badge tone="warning">{t("resources.status.pending")}</Badge>}
              />
            ))}
          </List>
        )}
      </Section>

      <Section title={`${t("moderation.reports")} (${reports.length})`}>
        {reports.length === 0 ? (
          <Panel className="px-4 py-5 text-[14px] text-text-muted">{t("moderation.reportsEmpty")}</Panel>
        ) : (
          <List>
            {reports.map((r) => (
              <ListLinkRow
                key={r.id}
                href={`/resources/${r.resourceId}`}
                leading={<span className={iconBox}><FlagIcon width={18} height={18} /></span>}
                title={r.resourceTitle}
                subtitle={[
                  t(`resources.report.reasons.${r.reason}`),
                  t("moderation.by", { name: r.reporterName ?? unknown }),
                  date(r.createdAt),
                  r.details,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              />
            ))}
          </List>
        )}
      </Section>
    </>
  );
}
