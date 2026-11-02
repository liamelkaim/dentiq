// Recording upload: runs in /api/uploads/recording (the body is large, so it cannot be a server action).
import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import type { CurrentUser } from "@/server/auth/session";
import { getStorage } from "@/server/storage";
import type { UploadOutcome } from "@/server/resources/upload-handlers";
import { createRecording } from "./service";

export type RecordingFormState = { status: "idle" | "error" | "success"; message?: string };

const on = (form: FormData, key: string) => form.get(key) === "on";

export async function handleUploadRecording(viewer: CurrentUser, form: FormData): Promise<UploadOutcome<RecordingFormState>> {
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { state: { status: "error", message: "recordings.errors.fileMissing" } };
  const str = (k: string) => (typeof form.get(k) === "string" ? (form.get(k) as string) : "");
  const result = await createRecording(
    getDb(),
    getStorage(),
    viewer,
    { title: str("title"), courseId: str("courseId") || null, lecturerName: str("lecturerName") || null, consent: { recordingAllowed: on(form, "recordingAllowed"), lecturerPermission: on(form, "lecturerPermission"), privateUse: on(form, "privateUse") } },
    { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) },
  );
  if (!result.ok) return { state: { status: "error", message: `recordings.errors.${result.error}` } };
  revalidatePath("/recordings");
  return { state: { status: "success" }, redirectTo: `/recordings/${result.value.id}` };
}
