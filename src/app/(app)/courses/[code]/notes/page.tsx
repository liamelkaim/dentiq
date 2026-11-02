import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { CourseHeader, loadCourseByCode, loadCourseSummary } from "@/components/course-layout";
import { DownloadIcon, FileIcon, FocusIcon, SearchIcon } from "@/components/icons";
import { formatBytes, ResourceStatusBadges } from "@/components/resource-list";
import { Badge, ButtonLink, buttonClass, cx, EmptyState, Notice, Panel } from "@/components/ui";
import { getDb } from "@/db/client";
import { SEARCH_QUERY_MAX } from "@/server/library/constants";
import { requireUser } from "@/server/auth/session";
import { previewKind } from "@/server/resources/files";
import { canAccessLibrary, getResource, listResources } from "@/server/resources/service";

type Params = Promise<{ code: string }>;
const periods = ["current", "historical", "all"] as const;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const course = await loadCourseByCode((await params).code);
  const t = await getTranslations("courseLayout");
  return { title: course ? `${t("notes")} · ${course.code}` : undefined };
}

export default async function CourseNotesPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Promise<{ period?: string; doc?: string; q?: string }>;
}) {
  const user = await requireUser();
  const course = await loadCourseByCode((await params).code);
  if (!course) notFound();

  const t = await getTranslations();
  const locale = await getLocale();
  const query = await searchParams;
  const period = periods.find((p) => p === query.period) ?? "current";
  const base = `/courses/${encodeURIComponent(course.code)}/notes`;
  const q = (typeof query.q === "string" ? query.q.trim() : "").slice(0, SEARCH_QUERY_MAX);
  const qParam = q ? `&q=${encodeURIComponent(q)}` : "";
  const summary = await loadCourseSummary(user, course);
  const libraryAccess = canAccessLibrary(user);

  const uploadButton = libraryAccess && !course.archivedAt && (
    <>
      <ButtonLink href={`/notes?course=${encodeURIComponent(course.code)}`} variant="secondary" size="sm">
        {t("library.notes.title")}
      </ButtonLink>
      <ButtonLink href={`/courses/${encodeURIComponent(course.code)}/upload`} size="sm">
        {t("resources.upload")}
      </ButtonLink>
    </>
  );

  if (!libraryAccess) {
    return (
      <>
        <CourseHeader course={summary} offeringCount={course.offerings.length} active="notes" />
        <Notice tone="warning" title={t("resources.noAccessTitle")}>
          {t("resources.noAccessBody")}
        </Notice>
      </>
    );
  }

  const items = await listResources(getDb(), user, { courseId: course.id, period, q: q || undefined });
  const selectedId = items.find((r) => r.id === query.doc)?.id ?? items[0]?.id;
  const selected = selectedId ? await getResource(getDb(), user, selectedId) : null;
  const latest = selected?.versions[0];
  const preview = latest ? previewKind(latest.mimeType) : null;

  return (
    <>
      <CourseHeader course={summary} offeringCount={course.offerings.length} active="notes" actions={uploadButton} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        {/* Document list */}
        <Panel className="flex min-w-0 flex-col self-start overflow-hidden">
          <form method="get" role="search" aria-label={t("library.notes.filterLabel")} className="relative border-b border-border p-2">
            <input type="hidden" name="period" value={period} />
            <label htmlFor="course-notes-q" className="sr-only">
              {t("library.notes.search")}
            </label>
            <SearchIcon className="pointer-events-none absolute top-1/2 left-5 -translate-y-1/2 text-text-muted" width={16} height={16} />
            <input
              id="course-notes-q"
              name="q"
              type="search"
              defaultValue={q}
              maxLength={SEARCH_QUERY_MAX}
              placeholder={t("library.notes.searchPlaceholder")}
              className="h-11 w-full rounded-[8px] border border-border bg-surface-muted pr-3 pl-9 text-[14px] sm:h-9"
            />
          </form>
          <nav aria-label={t("resources.period.label")} className="flex gap-1 border-b border-border p-2">
            {periods.map((p) => (
              <Link
                key={p}
                href={`${base}?period=${p}${qParam}`}
                scroll={false}
                aria-current={period === p ? "page" : undefined}
                className={cx(
                  "flex h-11 flex-1 items-center justify-center rounded-[8px] text-[13px] font-medium sm:h-8",
                  period === p ? "bg-accent-soft text-accent" : "text-text-subtle hover:bg-surface-muted hover:text-text",
                )}
              >
                {t(`resources.period.${p}`)}
              </Link>
            ))}
          </nav>
          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-[14px] text-text-muted">{t("resources.emptyCourse")}</p>
          ) : (
            <ul className="max-h-[60vh] divide-y divide-border overflow-y-auto lg:max-h-[calc(100dvh-20rem)]">
              {items.map((r) => {
                const current = r.id === selectedId;
                return (
                  <li key={r.id}>
                    <Link
                      href={`${base}?period=${period}&doc=${r.id}${qParam}`}
                      scroll={false}
                      aria-current={current ? "true" : undefined}
                      className={cx(
                        "flex min-h-14 gap-3 px-3 py-3 transition-colors focus-visible:outline-offset-[-2px]",
                        current ? "bg-accent-soft" : "hover:bg-surface-hover",
                      )}
                    >
                      <span
                        className={cx(
                          "grid size-9 shrink-0 place-items-center rounded-[9px]",
                          current ? "bg-accent-solid text-on-accent" : "bg-surface-muted text-text-muted",
                        )}
                      >
                        <FileIcon width={17} height={17} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cx("block truncate text-[14px] font-medium", current && "text-accent")}>{r.title}</span>
                        <span className="block truncate text-[12px] text-text-subtle">
                          {[t(`resources.kinds.${r.kind}`), r.academicYear && r.term ? `${r.academicYear} · ${t(`terms.${r.term}`)}` : null, r.topic]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                        <span className="mt-1 flex flex-wrap gap-1 empty:hidden">
                          <ResourceStatusBadges visibility={r.visibility} isOfficial={r.isOfficial} status={r.status} period={r.period} />
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="border-t border-border px-4 py-3 text-[12px] text-text-subtle">{t("resources.periodHelp")}</p>
        </Panel>

        {/* Selected document */}
        {!selected || !latest ? (
          <EmptyState title={t("resources.emptyTitle")} body={t("courseLayout.selectDocument")} />
        ) : (
          <Panel className="min-w-0 overflow-hidden">
            <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
              <div className="min-w-0">
                <h2 className="text-[20px] leading-snug font-semibold tracking-[-0.01em]">{selected.title}</h2>
                <p className="mt-0.5 text-[13px] text-text-subtle">
                  {[
                    t(`resources.kinds.${selected.kind}`),
                    selected.offering
                      ? `${selected.offering.academicYear} · ${t(`terms.${selected.offering.term}`)}`
                      : t("resources.detail.noOffering"),
                    selected.instructors.join(", "),
                    t("resources.detail.version", { number: latest.versionNumber }),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {!selected.isOfficial && <Badge>{t("resources.student")}</Badge>}
                  <ResourceStatusBadges visibility={selected.visibility} isOfficial={selected.isOfficial} status={selected.status} period={selected.period} />
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <ButtonLink href={`/study/${selected.id}`}>
                  <FocusIcon width={17} height={17} />
                  {t("courseLayout.studyMode")}
                </ButtonLink>
                <ButtonLink href={`/resources/${selected.id}`} variant="secondary">
                  {t("courseLayout.openDetails")}
                </ButtonLink>
                <a
                  href={`/api/files/${latest.id}`}
                  download
                  className={buttonClass("ghost", "px-3")}
                  aria-label={`${t("resources.detail.download")} · ${latest.fileName} (${formatBytes(latest.sizeBytes, locale)})`}
                >
                  <DownloadIcon width={18} height={18} />
                </a>
              </div>
            </div>
            {selected.period === "historical" && selected.offering && (
              <Notice tone="neutral" className="m-4 mb-0">
                {t("resources.detail.historicalNotice", {
                  offering: [`${selected.offering.academicYear} · ${t(`terms.${selected.offering.term}`)}`, selected.instructors.join(", ")]
                    .filter(Boolean)
                    .join(" · "),
                })}
              </Notice>
            )}
            {preview === "pdf" && (
              <iframe
                src={`/api/files/${latest.id}?inline=1`}
                title={`${t("resources.detail.preview")} · ${latest.fileName}`}
                className="block h-[65vh] min-h-96 w-full bg-surface-muted"
              />
            )}
            {preview === "image" && (
              // eslint-disable-next-line @next/next/no-img-element -- private file behind an auth check
              <img src={`/api/files/${latest.id}?inline=1`} alt={selected.title} className="mx-auto block max-h-[65vh] w-auto p-4" />
            )}
            {!preview && <p className="px-4 py-12 text-center text-[14px] text-text-muted">{t("resources.detail.previewUnavailable")}</p>}
            {selected.description && (
              <p className="border-t border-border px-5 py-4 text-[15px] leading-relaxed whitespace-pre-line text-text-muted">
                {selected.description}
              </p>
            )}
          </Panel>
        )}
      </div>
    </>
  );
}
