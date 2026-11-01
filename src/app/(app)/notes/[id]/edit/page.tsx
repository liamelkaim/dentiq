import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { NoteForm } from "@/components/library-forms";
import { PageHeader } from "@/components/ui";
import { getDb } from "@/db/client";
import { requireUser } from "@/server/auth/session";
import { getNote } from "@/server/library/notes";

type Params = Promise<{ id: string }>;

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("library.notes"))("edit") };
}

export default async function EditNotePage({ params }: { params: Params }) {
  const viewer = await requireUser();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const note = await getNote(getDb(), viewer, id);
  if (!note) notFound();
  const t = await getTranslations("library.notes");

  return (
    <>
      <PageHeader back={{ href: `/notes/${note.id}`, label: note.title }} title={t("edit")} subtitle={`${note.course.code} · ${t("version", { number: note.currentVersion })}`} />
      <p className="mb-4 max-w-2xl text-[14px] text-text-muted">{t("editHelp")}</p>
      {/* Keyed by version so the form shows the saved text again after a conflict-free save elsewhere. */}
      <NoteForm key={note.currentVersion} mode="edit" noteId={note.id} baseVersion={note.currentVersion} title={note.title} body={note.body} />
    </>
  );
}
