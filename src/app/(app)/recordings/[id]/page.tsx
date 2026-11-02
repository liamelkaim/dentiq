import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { NoteForm } from "@/components/recording-forms";
import { RecordingPlayer } from "@/components/recording-player";
import { Button, EmptyState, List, PageHeader, Panel, Section } from "@/components/ui";
import { getDb } from "@/db/client";
import { requireUser } from "@/server/auth/session";
import { formatSize } from "@/server/recordings/constants";
import { deleteNoteAction, deleteRecordingAction } from "@/server/recordings/actions";
import { getRecording } from "@/server/recordings/service";

type Params = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const viewer = await requireUser();
  const rec = await getRecording(getDb(), viewer, (await params).id);
  return { title: rec?.title };
}

const stamp = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export default async function RecordingPage({ params }: { params: Params }) {
  const viewer = await requireUser();
  const rec = await getRecording(getDb(), viewer, (await params).id);
  if (!rec) notFound();
  const t = await getTranslations("recordings");
  const format = await getFormatter();

  return (
    <>
      <PageHeader back={{ href: "/recordings", label: t("title") }} title={rec.title} subtitle={[rec.courseCode, rec.lecturerName, formatSize(rec.sizeBytes)].filter(Boolean).join(" · ")} />
      <div className="flex max-w-3xl flex-col gap-8">
        <RecordingPlayer id={rec.id} kind={rec.mimeType.startsWith("video/") ? "video" : "audio"} label={rec.title} />

        <Section title={t("notes.title")}>
          {rec.notes.length === 0 ? (
            <EmptyState title={t("notes.emptyTitle")} body={t("notes.emptyBody")} />
          ) : (
            <List>
              {rec.notes.map((n) => (
                <li key={n.id} className="flex min-h-14 items-start gap-3 px-4 py-3">
                  <span className="w-14 shrink-0 pt-0.5 text-[13px] text-text-muted tabular-nums">{n.atSeconds === null ? t("notes.general") : stamp(n.atSeconds)}</span>
                  <span className="min-w-0 flex-1 text-[15px] break-words whitespace-pre-line">{n.body}</span>
                  <form action={deleteNoteAction}>
                    <input type="hidden" name="noteId" value={n.id} />
                    <input type="hidden" name="recordingId" value={rec.id} />
                    <Button type="submit" variant="ghost" size="sm" aria-label={t("notes.deleteLabel")}>{t("notes.delete")}</Button>
                  </form>
                </li>
              ))}
            </List>
          )}
          <Panel className="mt-4 p-4 sm:p-5"><NoteForm recordingId={rec.id} /></Panel>
        </Section>

        <Section title={t("delete.title")} description={t("delete.help", { date: format.dateTime(rec.consentConfirmedAt, { dateStyle: "medium" }) })}>
          <form action={deleteRecordingAction}>
            <input type="hidden" name="recordingId" value={rec.id} />
            <Button type="submit" variant="danger">{t("delete.action")}</Button>
          </form>
        </Section>
      </div>
    </>
  );
}
