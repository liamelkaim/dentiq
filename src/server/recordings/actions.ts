"use server";

// Server actions for notes on a recording, deleting a recording, and the administrator's settings. Each checks who is
// asking; the service checks ownership again (another student's recording behaves as "not found").
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { requireRole, requireUser } from "@/server/auth/session";
import { getStorage } from "@/server/storage";
import { MB } from "./constants";
import { addRecordingNote, deleteRecording, deleteRecordingNote } from "./service";
import { updateRecordingSettings } from "./settings";

export type RecordingActionState = { status: "idle" | "error" | "success"; message?: string };

export async function addNoteAction(_prev: RecordingActionState, form: FormData): Promise<RecordingActionState> {
  const viewer = await requireUser();
  const id = String(form.get("recordingId") ?? "");
  const at = String(form.get("atSeconds") ?? "").trim();
  const seconds = at === "" ? null : /^\d{1,6}$/.test(at) ? Number(at) : -1;
  const r = await addRecordingNote(getDb(), viewer, id, String(form.get("body") ?? ""), seconds);
  if (!r.ok) return { status: "error", message: `recordings.errors.${r.error}` };
  revalidatePath(`/recordings/${id}`);
  return { status: "success" };
}

export async function deleteNoteAction(form: FormData): Promise<void> {
  const viewer = await requireUser();
  await deleteRecordingNote(getDb(), viewer, String(form.get("noteId") ?? ""));
  revalidatePath(`/recordings/${String(form.get("recordingId") ?? "")}`);
}

export async function deleteRecordingAction(form: FormData): Promise<void> {
  const viewer = await requireUser();
  await deleteRecording(getDb(), getStorage(), viewer, String(form.get("recordingId") ?? ""));
  revalidatePath("/recordings");
  redirect("/recordings");
}

export async function updateRecordingSettingsAction(_prev: RecordingActionState, form: FormData): Promise<RecordingActionState> {
  const viewer = await requireRole("admin");
  const num = (k: string) => {
    const v = String(form.get(k) ?? "").trim();
    return /^\d{1,6}$/.test(v) ? Number(v) : NaN;
  };
  const r = await updateRecordingSettings(getDb(), viewer, { enabled: form.get("enabled") === "on", maxFileBytes: num("maxFileMb") * MB, quotaBytes: num("quotaMb") * MB });
  if (!r.ok) return { status: "error", message: "recordings.admin.outOfRange" };
  revalidatePath("/admin/recordings");
  revalidatePath("/recordings");
  revalidatePath("/", "layout");
  return { status: "success", message: "recordings.admin.saved" };
}
