import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { DownloadIcon } from "@/components/icons";
import { NewVersionForm, ReportForm } from "@/components/resource-forms";
import { formatBytes, ResourceStatusBadges } from "@/components/resource-list";
import { Badge, Button, buttonClass, DescriptionList, Input, List, ListRow, Notice, PageHeader, Panel, Section } from "@/components/ui";
import { getDb } from "@/db/client";
import { localized, type Locale } from "@/i18n/config";
import { requireUser } from "@/server/auth/session";
import { previewKind } from "@/server/resources/files";
import { moderateResourceAction, resolveReportAction, setOfficialAction } from "@/server/resources/actions";
import { getResource } from "@/server/resources/service";

type Params = Promise<{ id: string }>;

async function load(params: Params) {
  const viewer = await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { viewer, resource: null };
  return { viewer, resource: await getResource(getDb(), viewer, id) };
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { resource } = await load(params);
  return { title: resource?.title };
}

export default async function ResourcePage({ params }: { params: Params }) {
  const { resource } = await load(params);
  if (!resource) notFound();

  const t = await getTranslations();
  const format = await getFormatter();
  const locale = (await getLocale()) as Locale;
  const latest = resource.versions[0];
  const preview = latest ? previewKind(latest.mimeType) : null;
  const courseHref = `/courses/${encodeURIComponent(resource.course.code)}`;
  const offeringLabel = resource.offering ? `${resource.offering.academicYear} · ${t(`terms.${resource.offering.term}`)}` : null;
  const date = (d: Date) => format.dateTime(d, { dateStyle: "medium" });

  return (
    <>
      <PageHeader
        back={{ href: courseHref, label: resource.course.code }}
        title={resource.title}
        subtitle={
          <span className="mt-1 inline-flex flex-wrap items-center gap-1.5">
            <Badge>{t(`resources.kinds.${resource.kind}`)}</Badge>
            {!resource.isOfficial && <Badge>{t("resources.student")}</Badge>}
            <ResourceStatusBadges isOfficial={resource.isOfficial} status={resource.status} period={resource.period} />
          </span>
        }
      />

      <div className="mb-6 flex flex-col gap-3">
        {resource.status === "pending" && <Notice tone="warning">{t("resources.detail.pendingNotice")}</Notice>}
        {resource.status === "hidden" && <Notice tone="danger">{t("resources.detail.hiddenNotice")}</Notice>}
        {resource.status === "removed" && <Notice tone="danger">{t("resources.detail.removedNotice")}</Notice>}
        {resource.period === "historical" && offeringLabel && (
          <Notice tone="neutral">
            {t("resources.detail.historicalNotice", {
              offering: [offeringLabel, resource.instructors.join(", ")].filter(Boolean).join(" — "),
            })}
          </Notice>
        )}
      </div>

      {latest && (
        <Section title={t("resources.detail.preview")}>
          <Panel className="overflow-hidden">
            {preview === "pdf" && (
              <iframe
                src={`/api/files/${latest.id}?inline=1`}
                title={`${t("resources.detail.preview")} — ${latest.fileName}`}
                className="block h-[70vh] min-h-96 w-full bg-surface-muted"
              />
            )}
            {preview === "image" && (
              // eslint-disable-next-line @next/next/no-img-element -- private file behind an auth check; next/image would proxy it
              <img src={`/api/files/${latest.id}?inline=1`} alt={resource.title} className="mx-auto block max-h-[70vh] w-auto" />
            )}
            {!preview && <p className="px-4 py-8 text-center text-[14px] text-text-muted">{t("resources.detail.previewUnavailable")}</p>}
            <div className="flex flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="truncate text-[14px] font-medium">{latest.fileName}</p>
                <p className="text-[12px] text-text-subtle">
                  {t("resources.detail.version", { number: latest.versionNumber })} · {formatBytes(latest.sizeBytes, locale)}
                </p>
              </div>
              <a href={`/api/files/${latest.id}`} className={buttonClass("primary", "shrink-0")} download>
                <DownloadIcon width={18} height={18} />
                {t("resources.detail.download")}
              </a>
            </div>
          </Panel>
          <p className="mt-2 px-1 text-[12px] text-text-subtle">{t("resources.detail.usageNotice")}</p>
        </Section>
      )}

      <Section title={t("course.details")}>
        <DescriptionList
          items={[
            {
              label: t("resources.detail.course"),
              value: (
                <Link href={courseHref} className="text-accent hover:text-accent-hover">
                  {resource.course.code} — {localized(locale, resource.course.titleFr, resource.course.titleEn)}
                </Link>
              ),
            },
            { label: t("resources.detail.offering"), value: offeringLabel ?? t("resources.detail.noOffering") },
            ...(resource.instructors.length ? [{ label: t("resources.detail.instructors"), value: resource.instructors.join(", ") }] : []),
            ...(resource.topic ? [{ label: t("resources.detail.topic"), value: resource.topic }] : []),
            { label: t("resources.detail.uploadedBy"), value: resource.uploaderName ?? t("resources.detail.unknownUser") },
            { label: t("resources.detail.uploadedOn"), value: date(resource.createdAt) },
            ...(resource.description
              ? [{ label: t("resources.detail.description"), value: <span className="whitespace-pre-line">{resource.description}</span> }]
              : []),
          ]}
        />
      </Section>

      <Section title={t("resources.detail.versions")}>
        <List>
          {resource.versions.map((v, i) => (
            <ListRow key={v.id} className="justify-between">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-[15px] font-medium">
                  {t("resources.detail.version", { number: v.versionNumber })}
                  {i === 0 && <Badge tone="accent">{t("resources.detail.latest")}</Badge>}
                </p>
                <p className="truncate text-[13px] text-text-subtle">
                  {[date(v.createdAt), v.uploaderName, formatBytes(v.sizeBytes, locale), v.changeNote].filter(Boolean).join(" · ")}
                </p>
              </div>
              <a
                href={`/api/files/${v.id}`}
                className={buttonClass("ghost", "shrink-0 px-2.5", "sm")}
                aria-label={`${t("resources.detail.download")} — ${t("resources.detail.version", { number: v.versionNumber })}`}
              >
                <DownloadIcon width={18} height={18} />
              </a>
            </ListRow>
          ))}
        </List>
      </Section>

      {(resource.canEdit || resource.canReport) && (
        <div className="mb-8 flex flex-col gap-4">
          {resource.canEdit && resource.status !== "removed" && <NewVersionForm resourceId={resource.id} isModerator={resource.canModerate} />}
          {resource.canReport && <ReportForm resourceId={resource.id} />}
        </div>
      )}

      {resource.canModerate && (
        <Section title={t("resources.moderate.title")}>
          <Panel className="flex flex-col gap-4 p-4 sm:p-5">
            <div className="flex flex-wrap gap-2">
              {(["publish", "hide", "remove"] as const)
                .filter((a) => ({ publish: "published", hide: "hidden", remove: "removed" })[a] !== resource.status)
                .map((a) => (
                  <form key={a} action={moderateResourceAction}>
                    <input type="hidden" name="resourceId" value={resource.id} />
                    <input type="hidden" name="action" value={a} />
                    <Button type="submit" variant={a === "publish" ? "primary" : a === "remove" ? "danger" : "secondary"} size="sm">
                      {t(`resources.moderate.${a}`)}
                    </Button>
                  </form>
                ))}
              <form action={setOfficialAction}>
                <input type="hidden" name="resourceId" value={resource.id} />
                <input type="hidden" name="value" value={String(!resource.isOfficial)} />
                <Button type="submit" variant="ghost" size="sm">
                  {resource.isOfficial ? t("resources.moderate.unmarkOfficial") : t("resources.moderate.markOfficial")}
                </Button>
              </form>
            </div>

            {resource.openReports.length > 0 && (
              <div className="border-t border-border pt-4">
                <h3 className="mb-2 text-[14px] font-semibold">{t("resources.moderate.openReports")}</h3>
                <ul className="flex flex-col gap-3">
                  {resource.openReports.map((r) => (
                    <li key={r.id} className="rounded-[var(--radius-control)] border border-border p-3">
                      <p className="text-[14px] font-medium">
                        {t(`resources.report.reasons.${r.reason}`)}
                        <span className="font-normal text-text-subtle">
                          {" "}
                          · {r.reporterName ?? t("resources.detail.unknownUser")} · {date(r.createdAt)}
                        </span>
                      </p>
                      {r.details && <p className="mt-0.5 text-[14px] text-text-muted">{r.details}</p>}
                      <form action={resolveReportAction} className="mt-2 flex flex-col gap-2 sm:flex-row">
                        <input type="hidden" name="reportId" value={r.id} />
                        <input type="hidden" name="resourceId" value={resource.id} />
                        <label htmlFor={`note-${r.id}`} className="sr-only">
                          {t("resources.moderate.note")}
                        </label>
                        <Input id={`note-${r.id}`} name="note" maxLength={500} placeholder={t("resources.moderate.note")} className="h-9 sm:flex-1" />
                        <div className="flex gap-2">
                          <Button type="submit" name="outcome" value="resolved" variant="secondary" size="sm">
                            {t("resources.moderate.resolve")}
                          </Button>
                          <Button type="submit" name="outcome" value="dismissed" variant="ghost" size="sm">
                            {t("resources.moderate.dismiss")}
                          </Button>
                        </div>
                      </form>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Panel>
        </Section>
      )}
    </>
  );
}
