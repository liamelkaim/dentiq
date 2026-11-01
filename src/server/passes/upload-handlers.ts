// Question submission and editing with images. They run in the upload route (/api/uploads/...), NOT as server actions,
// so the image bodies are read there with their own size check and the global server-action body limit can stay small
// (next.config.ts). The caller has already checked that someone is signed in; the service checks permissions again.
import { z } from "zod";
import { getDb } from "@/db/client";
import type { CurrentUser } from "@/server/auth/session";
import type { UploadOutcome } from "@/server/resources/upload-handlers";
import { getStorage } from "@/server/storage";
import { hasOversizedImage, parseImages, parseNewQuestion, parseQuestionFields } from "./form";
import { failure, refresh, text, zodFailure, type PassFormState } from "./form-state";
import { editQuestion, questionEditSchema, questionInputSchema, submitQuestion } from "./service";
import { getPassSettings } from "./settings";

export async function handleSubmitQuestion(viewer: CurrentUser, form: FormData): Promise<UploadOutcome<PassFormState>> {
  const db = getDb();
  const settings = await getPassSettings(db);
  if (hasOversizedImage(form, settings.images.maxBytes)) return { state: failure("fileTooLarge") };

  const parsed = questionInputSchema.safeParse(parseNewQuestion(form));
  if (!parsed.success) return { state: zodFailure(parsed.error) };
  const result = await submitQuestion(db, getStorage(), viewer, parsed.data, await parseImages(form));
  if (!result.ok) return { state: failure(result.error, result.questionId) };

  refresh(result.value.id);
  return { state: { status: "success" }, redirectTo: `/passes/${result.value.id}?submitted=1${result.value.repeatsOf.length ? "&repeat=1" : ""}` };
}

export async function handleEditQuestion(viewer: CurrentUser, form: FormData): Promise<UploadOutcome<PassFormState>> {
  const db = getDb();
  const id = z.uuid().safeParse(text(form, "questionId"));
  if (!id.success) return { state: failure("notFound") };
  const settings = await getPassSettings(db);
  if (hasOversizedImage(form, settings.images.maxBytes)) return { state: failure("fileTooLarge") };

  const fields = parseQuestionFields(form);
  const parsed = questionEditSchema.safeParse({ ...fields, proposedAnswerText: fields.proposedAnswerText ?? null });
  if (!parsed.success) return { state: zodFailure(parsed.error) };
  const changeNote = text(form, "changeNote").trim().slice(0, 300) || null;
  const removeIds = form.getAll("removeImage").map(String);

  const result = await editQuestion(db, getStorage(), viewer, id.data, parsed.data, changeNote, {
    add: await parseImages(form),
    removeIds,
  });
  if (!result.ok) return { state: failure(result.error, result.questionId) };

  refresh(id.data);
  return { state: { status: "success" }, redirectTo: `/passes/${id.data}?saved=1${result.value.answerReset ? "&reset=1" : ""}` };
}
