import { getLocale, getTranslations } from "next-intl/server";
import type { ResourceListItem } from "@/server/resources/service";
import { FileIcon } from "./icons";
import { Badge, EmptyState, List, ListLinkRow } from "./ui";

export function formatBytes(bytes: number, locale: string): string {
  const mb = bytes / (1024 * 1024);
  const unit = locale === "fr" ? (mb >= 1 ? "Mo" : "Ko") : mb >= 1 ? "MB" : "KB";
  const value = mb >= 1 ? mb : bytes / 1024;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)} ${unit}`;
}

export async function ResourceStatusBadges({
  isOfficial,
  visibility,
  status,
  period,
}: {
  isOfficial: boolean;
  visibility: "private" | "shared";
  status: string;
  period: string;
}) {
  const t = await getTranslations("resources");
  return (
    <>
      {visibility === "private" && <Badge tone="accent">{t("visibility.private")}</Badge>}
      {status !== "published" && (
        <Badge tone={status === "pending" ? "warning" : "danger"}>{t(`status.${status}`)}</Badge>
      )}
      {period === "historical" && <Badge>{t("historicalBadge")}</Badge>}
      {isOfficial && <Badge tone="accent">{t("official")}</Badge>}
    </>
  );
}

export async function ResourceList({
  items,
  showCourse = true,
  emptyBody,
}: {
  items: ResourceListItem[];
  showCourse?: boolean;
  emptyBody?: string;
}) {
  const t = await getTranslations();
  const locale = await getLocale();

  if (items.length === 0) return <EmptyState title={t("resources.emptyTitle")} body={emptyBody ?? t("resources.emptyBody")} />;

  return (
    <List>
      {items.map((r) => {
        const details = [
          showCourse ? r.courseCode : null,
          t(`resources.kinds.${r.kind}`),
          r.academicYear && r.term ? `${r.academicYear} · ${t(`terms.${r.term}`)}` : null,
          r.topic,
          r.latestVersion ? formatBytes(r.latestVersion.sizeBytes, locale) : null,
        ].filter(Boolean);
        return (
          <ListLinkRow
            key={r.id}
            href={`/resources/${r.id}`}
            leading={
              <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-surface-muted text-text-muted">
                <FileIcon width={18} height={18} />
              </span>
            }
            title={r.title}
            subtitle={details.join(" · ")}
            meta={<ResourceStatusBadges visibility={r.visibility} isOfficial={r.isOfficial} status={r.status} period={r.period} />}
          />
        );
      })}
    </List>
  );
}
