import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { z } from "zod";
import { Badge, Button, cx, Notice, PageHeader, Panel } from "@/components/ui";
import { getDb } from "@/db/client";
import { requireUser } from "@/server/auth/session";
import { restoreNoteVersionAction } from "@/server/library/actions";
import { getNote, getNoteVersionDiff, listNoteVersions } from "@/server/library/notes";

type Params = Promise<{ id: string }>;

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("library.history"))("title") };
}

/** Who saved each version, when, and what changed (a line-by-line comparison with the version before). Restore is for the owner. */
export default async function NoteHistoryPage({ params, searchParams }: { params: Params; searchParams: Promise<{ v?: string }> }) {
  const viewer = await requireUser();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const db = getDb();
  const note = await getNote(db, viewer, id);
  const versions = note ? await listNoteVersions(db, viewer, id) : null;
  if (!note || !versions) notFound();

  const t = await getTranslations("library.history");
  const format = await getFormatter();
  const requested = Number((await searchParams).v);
  const selectedNumber = versions.some((v) => v.versionNumber === requested) ? requested : (versions[0]?.versionNumber ?? 1);
  const diff = await getNoteVersionDiff(db, viewer, id, selectedNumber);
  const summary = versions.find((v) => v.versionNumber === selectedNumber)!;
  const when = (d: Date) => format.dateTime(d, { dateStyle: "medium", timeStyle: "short" });

  return (
    <>
      <PageHeader back={{ href: `/notes/${note.id}`, label: note.title }} title={t("title")} subtitle={`${note.course.code} · ${t("subtitle")}`} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">
        <Panel className="min-w-0 self-start overflow-hidden">
          <h2 className="border-b border-border px-4 py-3 text-[13px] font-semibold text-text-subtle">{t("versions", { count: versions.length })}</h2>
          <ol className="max-h-[60vh] divide-y divide-border overflow-y-auto">
            {versions.map((v) => {
              const current = v.versionNumber === selectedNumber;
              return (
                <li key={v.versionNumber}>
                  <Link
                    href={`/notes/${note.id}/history?v=${v.versionNumber}`}
                    aria-current={current ? "true" : undefined}
                    scroll={false}
                    className={cx("flex min-h-14 flex-col gap-0.5 px-4 py-3 focus-visible:outline-offset-[-2px]", current ? "bg-accent-soft" : "hover:bg-surface-hover")}
                  >
                    <span className="flex flex-wrap items-center gap-1.5 text-[14px] font-medium">
                      {t("version", { number: v.versionNumber })}
                      {v.isCurrent && <Badge tone="accent">{t("currentBadge")}</Badge>}
                      {v.restoredFromVersion !== null && <Badge>{t("restoredFrom", { number: v.restoredFromVersion })}</Badge>}
                    </span>
                    <span className="truncate text-[13px] text-text-subtle">
                      {[when(v.createdAt), v.authorName ? t("by", { name: v.authorName }) : null].filter(Boolean).join(" · ")}
                    </span>
                    <span className="text-[13px] text-text-muted">
                      {v.versionNumber === versions[versions.length - 1]?.versionNumber
                        ? t("firstVersion")
                        : [
                            v.change.titleChanged ? t("titleChanged") : null,
                            v.change.tooLarge ? t("tooLargeShort") : v.change.bodyChanged ? `${t("added", { count: v.change.added })}, ${t("removed", { count: v.change.removed })}` : t("noBodyChange"),
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                    </span>
                    {v.changeNote && <span className="truncate text-[13px] text-text-subtle">{v.changeNote}</span>}
                  </Link>
                </li>
              );
            })}
          </ol>
        </Panel>

        <Panel className="min-w-0 p-4 sm:p-5">
          {!diff ? (
            <Notice tone="danger">{t("notFound")}</Notice>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <h2 className="text-[18px] font-semibold">{t("changesIn", { number: diff.version.versionNumber })}</h2>
                  <p className="text-[13px] text-text-subtle">
                    {[when(diff.version.createdAt), summary.authorName ? t("by", { name: summary.authorName }) : null].filter(Boolean).join(" · ")}
                  </p>
                </div>
                {!diff.isCurrent && (
                  <form action={restoreNoteVersionAction} className="shrink-0">
                    <input type="hidden" name="noteId" value={note.id} />
                    <input type="hidden" name="version" value={diff.version.versionNumber} />
                    <Button type="submit" variant="secondary" size="sm">
                      {t("restore")}
                    </Button>
                  </form>
                )}
              </div>
              {!diff.isCurrent && <p className="text-[13px] text-text-subtle">{t("restoreHelp")}</p>}

              {diff.previous ? (
                diff.titleChanged && (
                  <div className="rounded-[10px] border border-border p-3 text-[14px]">
                    <p className="font-medium">{t("titleChanged")}</p>
                    <p className="mt-1 break-words">
                      <span className="mr-1 font-semibold text-danger" aria-hidden="true">-</span>
                      <span className="sr-only">{t("removedLine")} </span>
                      {diff.previous.title}
                    </p>
                    <p className="break-words">
                      <span className="mr-1 font-semibold text-success" aria-hidden="true">+</span>
                      <span className="sr-only">{t("addedLine")} </span>
                      {diff.version.title}
                    </p>
                  </div>
                )
              ) : (
                <Notice>{t("firstVersionHelp")}</Notice>
              )}

              {diff.body.tooLarge ? (
                <Notice>{t("tooLarge")}</Notice>
              ) : diff.body.ops.length === 0 ? (
                <p className="text-[14px] text-text-muted">{t("emptyBody")}</p>
              ) : (
                <div>
                  <h3 className="mb-1 text-[13px] font-semibold text-text-subtle">{t("bodyHeading")}</h3>
                  <pre className="max-h-[60vh] overflow-auto rounded-[10px] border border-border bg-surface-muted p-0 text-[13px] leading-relaxed">
                    {diff.body.ops.map((op, i) => (
                      <code
                        key={i}
                        className={cx(
                          "block px-3 py-0.5 break-words whitespace-pre-wrap",
                          op.type === "add" && "bg-success-soft text-success",
                          op.type === "del" && "bg-danger-soft text-danger",
                          op.type === "same" && "text-text-muted",
                        )}
                      >
                        <span aria-hidden="true" className="mr-2 inline-block w-3 font-semibold select-none">
                          {op.type === "add" ? "+" : op.type === "del" ? "-" : " "}
                        </span>
                        {op.type !== "same" && <span className="sr-only">{op.type === "add" ? t("addedLine") : t("removedLine")} </span>}
                        {op.text || " "}
                      </code>
                    ))}
                  </pre>
                </div>
              )}
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
