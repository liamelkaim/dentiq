// The upload endpoints: one entry per kind of form that sends files. Each one says how large its body may be (decided
// before any byte is read), which handler runs it, and which form state to answer with when something is wrong.
// Adding an upload form means adding an entry here, never raising the global server-action limit.
import { getDb } from "@/db/client";
import type { CurrentUser } from "@/server/auth/session";
import { MAX_IMAGE_SLOTS } from "@/server/passes/form";
import { handleEditQuestion, handleSubmitQuestion } from "@/server/passes/upload-handlers";
import { getPassSettings } from "@/server/passes/settings";
import { getMaxFileBytes } from "@/server/resources/files";
import { handleAddVersion, handleUploadResource, type UploadOutcome } from "@/server/resources/upload-handlers";
import { getRecordingSettings, recordingBodyLimit } from "@/server/recordings/settings";
import { handleUploadRecording } from "@/server/recordings/upload-handler";
import { FORM_OVERHEAD_BYTES } from "./read-body";

export type UploadKind = {
  /** Largest request body accepted, in bytes. */
  maxBodyBytes: () => Promise<number>;
  /** Form state sent back when the body is over the cap or unreadable (translation keys, same as the old actions). */
  tooLarge: { status: "error"; message: string; fieldErrors?: Record<string, string> };
  invalid: { status: "error"; message: string };
  run: (viewer: CurrentUser, form: FormData) => Promise<UploadOutcome<{ status: string }>>;
};

const documentKind = (run: UploadKind["run"]): UploadKind => ({
  maxBodyBytes: async () => getMaxFileBytes() + FORM_OVERHEAD_BYTES,
  tooLarge: { status: "error", message: "errors.uploadTooLarge", fieldErrors: { file: "errors.uploadTooLarge" } },
  invalid: { status: "error", message: "errors.generic" },
  run,
});

const questionKind = (run: UploadKind["run"]): UploadKind => ({
  maxBodyBytes: async () => {
    const { images } = await getPassSettings(getDb());
    return Math.min(images.maxPerQuestion, MAX_IMAGE_SLOTS) * images.maxBytes + FORM_OVERHEAD_BYTES;
  },
  tooLarge: { status: "error", message: "passes.errors.fileTooLarge", fieldErrors: { images: "passes.errors.fileTooLarge" } },
  invalid: { status: "error", message: "errors.generic" },
  run,
});

const recordingKind: UploadKind = {
  // While recordings are OFF no file is accepted, so no large body is read either.
  maxBodyBytes: async () => recordingBodyLimit(await getRecordingSettings(getDb()), FORM_OVERHEAD_BYTES),
  tooLarge: { status: "error", message: "recordings.errors.fileTooLarge" },
  invalid: { status: "error", message: "errors.generic" },
  run: handleUploadRecording,
};

export const uploadKinds: Record<string, UploadKind> = {
  recording: recordingKind,
  resource: documentKind(handleUploadResource),
  "resource-version": documentKind(handleAddVersion),
  question: questionKind(handleSubmitQuestion),
  "question-edit": questionKind(handleEditQuestion),
};
