import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { DownloadIcon, FileIcon } from "@/components/icons";
import { formatBytes, ResourceStatusBadges } from "@/components/resource-list";
import { StudyShell } from "@/components/study-mode";
import { Badge, buttonClass, cx, Notice, Panel } from "@/components/ui";
import { getDb } from "@/db/client";
import { localized, type Locale } from "@/i18n/config";
import { requireUser } from "@/server/auth/session";
import { previewKind } from "@/server/resources/files";
import { getResource, listResources } from "@/server/resources/service";

type Params = Promise<{ id: string }>;

async function load(params: Params) {
  const viewer = await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { viewer, resource: null };
  return { viewer, resource: await getResource(getDb(), viewer, id) };
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { resource } = await load(params);
  const t = await getTranslations("study");
  return { title: resource ? `${t("title")} · ${resource.title}` : t("title") };
}

export default async function StudyPage({ params }: { params: Params }) {
  const { viewer, resource } = await load(params);
  if (!resource) notFound();

  const t = await getTranslations();
  const locale = (await getLocale()) as Locale;
  // Keep current and archived material apart here too: the list shows the same period as this document.
  const period = resource.period === "historical" ? "historical" : "current";
  const siblings = await listResources(getDb(), viewer, { courseId: resource.courseId, period });
  const latest = resource.versions[0];
  const preview = latest ? previewKind(latest.mimeType) : null;
  const exitHref = `/courses/${encodeURIComponent(resource.course.code)}/notes?period=${period}&doc=${resource.id}`;
  const offering = resource.offering
    ? `${resource.offering.academicYear} · ${t(`terms.${resource.offering.term}`)}`
    : t("resources.detail.noOffering");

  return (
    <StudyShell
      exitHref={exitHref}
      heading={
        <div className="min-w-0 leading-tight">
          <p className="truncate text-[12px] font-medium text-text-subtle">
            {resource.course.code} · {localized(locale, resource.course.titleFr, resource.course.titleEn)}
          </p>
          <h1 className="truncate text-[15px] font-semibold">{resource.title}</h1>
        </div>
      }
      nav={
        <>
          <p className="px-4 pt-4 pb-2 text-[12px] font-semibold tracking-wide text-text-subtle uppercase">
            {t("study.documents")} · {t(`resources.period.${period}`)}
          </p>
          <ul className="flex flex-col gap-0.5 px-2 pb-4">
            {siblings.map((r) => {
              const current = r.id === resource.id;
              return (
                <li key={r.id}>
                  <Link
                    href={`/study/${r.id}`}
                    aria-current={current ? "page" : undefined}
                    className={cx(
                      "flex min-h-12 items-center gap-3 rounded-[10px] px-2.5 py-2 transition-colors",
                      current ? "bg-accent-soft text-accent" : "text-text-muted hover:bg-surface-muted hover:text-text",
                    )}
                  >
                    <FileIcon width={17} height={17} className="shrink-0" />
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-medium">{r.title}</span>
                      <span className="block truncate text-[12px] text-text-subtle">
                        {[t(`resources.kinds.${r.kind}`), r.topic].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          {siblings.length <= 1 && <p className="px-4 pb-4 text-[13px] text-text-subtle">{t("study.empty")}</p>}
        </>
      }
    >
      <div className="mx-auto flex h-full max-w-5xl flex-col gap-3 p-3 sm:p-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="flex flex-wrap gap-1.5">
            <Badge>{t(`resources.kinds.${resource.kind}`)}</Badge>
            {!resource.isOfficial && <Badge>{t("resources.student")}</Badge>}
            <ResourceStatusBadges visibility={resource.visibility} isOfficial={resource.isOfficial} status={resource.status} period={resource.period} />
          </div>
          <p className="min-w-0 flex-1 truncate text-[13px] text-text-subtle">
            {[offering, resource.instructors.join(", "), latest && t("resources.detail.version", { number: latest.versionNumber })]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {latest && (
            <a
              href={`/api/files/${latest.id}`}
              download
              className={buttonClass("secondary", undefined, "sm")}
              aria-label={`${t("resources.detail.download")} · ${latest.fileName} (${formatBytes(latest.sizeBytes, locale)})`}
            >
              <DownloadIcon width={17} height={17} />
              <span className="hidden sm:inline">{t("resources.detail.download")}</span>
            </a>
          )}
        </div>

        {resource.period === "historical" && (
          <Notice tone="neutral">
            {t("resources.detail.historicalNotice", { offering: [offering, resource.instructors.join(", ")].filter(Boolean).join(" · ") })}
          </Notice>
        )}

        {latest && preview === "pdf" && (
          <iframe
            src={`/api/files/${latest.id}?inline=1`}
            title={`${resource.title} · ${latest.fileName}`}
            className="min-h-[70vh] w-full flex-1 rounded-[var(--radius-card)] border border-border bg-surface-muted"
          />
        )}
        {latest && preview === "image" && (
          <Panel className="flex flex-1 items-center justify-center p-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- private file behind an auth check */}
            <img src={`/api/files/${latest.id}?inline=1`} alt={resource.title} className="max-h-[78vh] w-auto" />
          </Panel>
        )}
        {(!latest || !preview) && (
          <Panel className="px-6 py-16 text-center text-[15px] text-text-muted">{t("resources.detail.previewUnavailable")}</Panel>
        )}

        {resource.description && (
          <Panel className="px-5 py-4">
            <p className="mx-auto max-w-[68ch] text-[16px] leading-[1.7] whitespace-pre-line">{resource.description}</p>
          </Panel>
        )}
        <p className="pb-4 text-center text-[12px] text-text-subtle">{t("resources.detail.usageNotice")}</p>
      </div>
    </StudyShell>
  );
}
