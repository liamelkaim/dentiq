import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { CourseCover } from "@/components/course-layout";
import { SearchIcon } from "@/components/icons";
import { Button, ButtonLink, EmptyState, Notice, Select, cx } from "@/components/ui";
import { getDb } from "@/db/client";
import { requireUser } from "@/server/auth/session";
import { SEARCH_QUERY_MAX } from "@/server/library/constants";
import { listNotes } from "@/server/library/notes";
import { listCourseChoices } from "@/server/passes/queries";
import { canAccessLibrary } from "@/server/resources/service";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("library.notes"))("title") };
}

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

function Heading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="mb-6 min-h-[110px] px-1 lg:px-3">
      <h1 className="text-[34px] leading-[1.1] font-bold tracking-[-0.03em] text-mountain-title sm:text-[42px] lg:text-[46px]">{title}</h1>
      {subtitle && <p className="mt-1 text-[18px] leading-snug text-text-muted sm:text-[22px] lg:text-[27px]">{subtitle}</p>}
    </header>
  );
}

/** The signed-in student's own notes: list on the left, the selected note on the right. Nobody else's notes appear. */
export default async function NotesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const viewer = await requireUser();
  const t = await getTranslations();
  const format = await getFormatter();
  const params = await searchParams;
  const q = first(params.q)?.trim().slice(0, SEARCH_QUERY_MAX) ?? "";
  const courseCode = first(params.course) ?? "";
  const selectedId = first(params.note) ?? "";

  if (!canAccessLibrary(viewer)) {
    return (
      <>
        <Heading title={t("library.notes.pageTitle")} />
        <Notice tone="warning" title={t("resources.noAccessTitle")}>
          {t("resources.noAccessBody")}
        </Notice>
      </>
    );
  }

  const db = getDb();
  const courses = await listCourseChoices(db);
  const course = courses.find((c) => c.code === courseCode);
  const notes = await listNotes(db, viewer, { courseId: course?.id, q: q || undefined });
  const filtered = Boolean(course || q);
  const newHref = course ? `/notes/new?course=${encodeURIComponent(course.code)}` : "/notes/new";
  const selected = notes.find((n) => n.id === selectedId) ?? notes[0];
  const words = selected?.body.trim() ? selected.body.trim().split(/\s+/).length : 0;

  /** Same filters, a different selected note. */
  function selectHref(id: string) {
    const next = new URLSearchParams();
    if (q) next.set("q", q);
    if (course) next.set("course", course.code);
    next.set("note", id);
    return `/notes?${next.toString()}`;
  }

  return (
    <>
      <Heading title={t("library.notes.pageTitle")} subtitle={t("library.notes.subtitle")} />

      <div className="rounded-[var(--radius-card)] border border-border bg-surface p-3 shadow-card sm:p-4">
        <form method="get" role="search" aria-label={t("library.notes.filterLabel")} className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1 sm:max-w-[22rem]">
            <label htmlFor="notes-q" className="sr-only">
              {t("library.notes.search")}
            </label>
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-text-muted" width={18} height={18} />
            <input
              id="notes-q"
              name="q"
              defaultValue={q}
              maxLength={SEARCH_QUERY_MAX}
              placeholder={t("library.notes.searchPlaceholder")}
              className="h-11 w-full rounded-[var(--radius-control)] border border-border-strong bg-surface pr-3 pl-10 text-[15px] placeholder:text-text-muted focus:border-accent"
            />
          </div>
          <label htmlFor="notes-course" className="sr-only">
            {t("library.notes.course")}
          </label>
          <Select id="notes-course" name="course" defaultValue={course?.code ?? ""} className="h-11 sm:w-48! sm:flex-none">
            <option value="">{t("library.notes.allCourses")}</option>
            {courses.map((c) => (
              <option key={c.id} value={c.code}>
                {c.code}
              </option>
            ))}
          </Select>
          <Button type="submit" variant="secondary">
            {t("library.notes.filter")}
          </Button>
          <ButtonLink href={newHref} className="sm:ml-auto">
            + {t("library.notes.new")}
          </ButtonLink>
        </form>

        {notes.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title={t(filtered ? "library.notes.noMatchTitle" : "library.notes.emptyTitle")}
              body={t(filtered ? "library.notes.noMatch" : "library.notes.emptyBody")}
              action={filtered ? undefined : <ButtonLink href={newHref}>{t("library.notes.new")}</ButtonLink>}
            />
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,8fr)]">
            {/* Left: the list */}
            <section aria-label={t("library.notes.pageTitle")} className="rounded-[var(--radius-card)] border border-border bg-surface-muted/20">
              <div className="flex items-center justify-between px-4 pt-4 pb-2">
                <h2 className="text-[19px] font-semibold">{t("library.notes.pageTitle")}</h2>
                <span className="rounded-[10px] border border-border px-3 py-1.5 text-[13px] text-text-muted">{t("library.notes.sortUpdated")}</span>
              </div>
              <ul className="max-h-[640px] overflow-y-auto px-2 pb-2">
                {notes.map((n) => {
                  const active = n.id === selected?.id;
                  return (
                    <li key={n.id}>
                      <Link
                        href={selectHref(n.id)}
                        aria-current={active ? "true" : undefined}
                        className={cx(
                          "flex min-h-[72px] items-center gap-3 rounded-[10px] border-l-[3px] px-2.5 py-2 transition-colors",
                          active ? "border-accent-solid bg-accent-soft" : "border-transparent hover:bg-surface-hover",
                        )}
                      >
                        <CourseCover code={n.courseCode} compact className="size-[60px] shrink-0 rounded-[8px]" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] font-medium">{n.title}</span>
                          <span className="mt-0.5 flex items-center justify-between gap-2 text-[12px] text-text-muted">
                            <span className="truncate">{n.courseCode}</span>
                            <span className="shrink-0 tabular-nums">{format.dateTime(n.updatedAt, { dateStyle: "medium" })}</span>
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>

            {/* Right: the selected note */}
            {selected && (
              <article aria-label={selected.title} className="flex min-w-0 flex-col rounded-[var(--radius-card)] border border-border bg-surface-muted/20 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-[26px] leading-tight font-bold tracking-[-0.02em] break-words">{selected.title}</h2>
                    <p className="mt-1.5 text-[14px] text-text-muted">
                      {selected.courseCode} · {t("library.notes.updated", { date: format.dateTime(selected.updatedAt, { dateStyle: "medium", timeStyle: "short" }) })}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <ButtonLink href={`/notes/${selected.id}`} variant="secondary" size="sm">
                      {t("library.notes.open")}
                    </ButtonLink>
                    <ButtonLink href={`/notes/${selected.id}/edit`} variant="secondary" size="sm">
                      {t("library.notes.edit")}
                    </ButtonLink>
                  </div>
                </div>
                <div className="my-4 min-h-[260px] flex-1 border-t border-border pt-4">
                  {selected.body ? (
                    <p className="max-h-[480px] overflow-y-auto text-[16px] leading-relaxed break-words whitespace-pre-wrap">{selected.body}</p>
                  ) : (
                    <p className="text-[14px] text-text-muted">{t("library.notes.emptyBodyNote")}</p>
                  )}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-[13px] text-text-muted">
                  <span>{t("library.notes.privacy")}</span>
                  <span className="tabular-nums">{t("library.notes.wordCount", { count: words })}</span>
                </div>
              </article>
            )}
          </div>
        )}
      </div>
    </>
  );
}
