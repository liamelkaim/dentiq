// Document uploads (a new document and a new version). They run in the upload route (/api/uploads/...), NOT as server
// actions, so the large body is read there with its own size check and the global server-action body limit can stay small
// (next.config.ts). The caller has already checked that someone is signed in; the service checks permissions again.
import { z } from "zod";
import { getDb } from "@/db/client";
import type { CurrentUser } from "@/server/auth/session";
import { TOPICS_PER_ITEM_MAX } from "@/server/library/constants";
import { checkTopicIds, setItemTopics } from "@/server/library/links";
import { getStorage } from "@/server/storage";
import { getMaxFileBytes } from "./files";
import { errorMessage, formObject, revalidateResources, toFieldErrors, type ResourceFormState } from "./form-helpers";
import { addVersion, createResource, resourceInputSchema, versionInputSchema, type UploadFile } from "./service";

/** What an upload handler hands back to the route: the form state, and where to go next on success. */
export type UploadOutcome<State> = { state: State; redirectTo?: string };

async function readFile(form: FormData): Promise<UploadFile | null> {
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return null;
  return { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) };
}

const tooLarge = (): UploadOutcome<ResourceFormState> => ({ state: { status: "error", message: "errors.uploadTooLarge", fieldErrors: { file: "errors.uploadTooLarge" } } });

export async function handleUploadResource(viewer: CurrentUser, form: FormData): Promise<UploadOutcome<ResourceFormState>> {
  const parsed = resourceInputSchema.safeParse(formObject(form));
  if (!parsed.success) return { state: { status: "error", message: "errors.invalid", fieldErrors: toFieldErrors(parsed.error) } };
  const candidate = form.get("file");
  if (candidate instanceof File && candidate.size > getMaxFileBytes()) return tooLarge();
  const file = await readFile(form);
  if (!file) return { state: { status: "error", message: "errors.fileMissing", fieldErrors: { file: "errors.fileMissing" } } };

  // Topics come from the course's shared list. Checked before anything is stored, so a stale form fails cleanly.
  const rawTopicIds = form.getAll("topicIds").filter((v): v is string => typeof v === "string" && v !== "");
  const topicIdsParsed = z.array(z.uuid()).max(TOPICS_PER_ITEM_MAX).safeParse(rawTopicIds);
  if (!topicIdsParsed.success) return { state: { status: "error", message: "library.errors.invalidTopics" } };
  const topicIds = topicIdsParsed.data;
  if (topicIds.length > 0 && !(await checkTopicIds(getDb(), parsed.data.courseId, topicIds))) {
    return { state: { status: "error", message: "library.errors.invalidTopics" } };
  }

  const result = await createResource(getDb(), getStorage(), viewer, parsed.data, file);
  if (!result.ok) return { state: { status: "error", message: errorMessage(result.error), duplicateOf: result.resourceId } };
  if (topicIds.length > 0) await setItemTopics(getDb(), viewer, "resource", result.value.id, topicIds);
  revalidateResources(result.value.id);
  return { state: { status: "success" }, redirectTo: `/resources/${result.value.id}` };
}

export async function handleAddVersion(viewer: CurrentUser, form: FormData): Promise<UploadOutcome<ResourceFormState>> {
  const parsed = versionInputSchema.safeParse(formObject(form));
  if (!parsed.success) return { state: { status: "error", message: "errors.invalid", fieldErrors: toFieldErrors(parsed.error) } };
  const candidate = form.get("file");
  if (candidate instanceof File && candidate.size > getMaxFileBytes()) return tooLarge();
  const file = await readFile(form);
  if (!file) return { state: { status: "error", message: "errors.fileMissing", fieldErrors: { file: "errors.fileMissing" } } };

  const result = await addVersion(getDb(), getStorage(), viewer, parsed.data.resourceId, file, parsed.data.changeNote);
  if (!result.ok) return { state: { status: "error", message: errorMessage(result.error), duplicateOf: result.resourceId } };
  revalidateResources(parsed.data.resourceId);
  return { state: { status: "success", message: "resources.version.added" } };
}
