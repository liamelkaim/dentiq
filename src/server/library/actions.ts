"use server";

// Server actions for topics, notes, links and note history. Each one: check who is asking, validate the form,
// call the service (which checks permissions again), then refresh the pages that show the data.
// Messages returned to forms are translation keys.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db/client";
import { requireRole, requireUser } from "@/server/auth/session";
import { TOPICS_PER_ITEM_MAX } from "./constants";
import { libraryErrorField, libraryErrorKey } from "./errors";
import { addQuestionLink, removeQuestionLink, setItemTopics } from "./links";
import { createNote, noteEditSchema, noteInputSchema, restoreNoteVersion, updateNote } from "./notes";
import { createTopic, moveTopic, renameTopic, setTopicArchived, topicInputSchema } from "./topics";

export type LibraryFormState = {
  status: "idle" | "success" | "error";
  /** Translation key. */
  message?: string;
  /** Field name -> translation key. */
  fieldErrors?: Record<string, string>;
};

const failure = (code: string): LibraryFormState => {
  const field = libraryErrorField(code);
  return { status: "error", message: libraryErrorKey(code), fieldErrors: field ? { [field]: libraryErrorKey(code) } : undefined };
};

function zodFailure(error: z.ZodError): LibraryFormState {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) fieldErrors[String(issue.path[0] ?? "form")] ??= libraryErrorKey(issue.message);
  return { status: "error", message: "library.errors.invalid", fieldErrors };
}

const strings = (form: FormData) => Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === "string"));
const list = (form: FormData, name: string) => form.getAll(name).filter((v): v is string => typeof v === "string" && v !== "");

/** Topic ids from a form: real UUIDs, at most TOPICS_PER_ITEM_MAX (a tampered form is refused, never a 500). */
const topicIdsSchema = z.array(z.uuid()).max(TOPICS_PER_ITEM_MAX);

function refresh() {
  revalidatePath("/notes", "layout");
  revalidatePath("/courses", "layout");
  revalidatePath("/passes", "layout");
  revalidatePath("/resources", "layout");
  revalidatePath("/search");
}

// ---------- Topics: moderators and admins ----------

export async function createTopicAction(_prev: LibraryFormState, form: FormData): Promise<LibraryFormState> {
  const viewer = await requireRole("moderator");
  const parsed = topicInputSchema.safeParse(strings(form));
  const courseId = z.uuid().safeParse(form.get("courseId"));
  if (!parsed.success) return zodFailure(parsed.error);
  if (!courseId.success) return failure("invalid");
  const result = await createTopic(getDb(), viewer, courseId.data, parsed.data);
  if (!result.ok) return failure(result.error);
  refresh();
  return { status: "success", message: "library.topics.added" };
}

export async function renameTopicAction(_prev: LibraryFormState, form: FormData): Promise<LibraryFormState> {
  const viewer = await requireRole("moderator");
  const parsed = topicInputSchema.safeParse(strings(form));
  const topicId = z.uuid().safeParse(form.get("topicId"));
  if (!parsed.success) return zodFailure(parsed.error);
  if (!topicId.success) return failure("invalid");
  const result = await renameTopic(getDb(), viewer, topicId.data, parsed.data);
  if (!result.ok) return failure(result.error);
  refresh();
  return { status: "success", message: "library.topics.renamed" };
}

export async function archiveTopicAction(form: FormData): Promise<void> {
  const viewer = await requireRole("moderator");
  const input = z.object({ topicId: z.uuid(), value: z.enum(["true", "false"]) }).parse(strings(form));
  await setTopicArchived(getDb(), viewer, input.topicId, input.value === "true");
  refresh();
}

export async function moveTopicAction(form: FormData): Promise<void> {
  const viewer = await requireRole("moderator");
  const input = z.object({ topicId: z.uuid(), direction: z.enum(["up", "down"]) }).parse(strings(form));
  await moveTopic(getDb(), viewer, input.topicId, input.direction);
  refresh();
}

// ---------- Notes: the owner only ----------

export async function createNoteAction(_prev: LibraryFormState, form: FormData): Promise<LibraryFormState> {
  const viewer = await requireUser();
  const parsed = noteInputSchema.safeParse({ ...strings(form), topicIds: list(form, "topicIds"), questionIds: list(form, "questionIds") });
  if (!parsed.success) return zodFailure(parsed.error);
  const result = await createNote(getDb(), viewer, parsed.data);
  if (!result.ok) return failure(result.error);
  refresh();
  redirect(`/notes/${result.value.id}`);
}

export async function updateNoteAction(_prev: LibraryFormState, form: FormData): Promise<LibraryFormState> {
  const viewer = await requireUser();
  const parsed = noteEditSchema.safeParse(strings(form));
  if (!parsed.success) return zodFailure(parsed.error);
  const result = await updateNote(getDb(), viewer, parsed.data);
  if (!result.ok) return failure(result.error);
  refresh();
  redirect(`/notes/${parsed.data.noteId}`);
}

export async function restoreNoteVersionAction(form: FormData): Promise<void> {
  const viewer = await requireUser();
  const input = z.object({ noteId: z.uuid(), version: z.coerce.number().int().min(1) }).parse(strings(form));
  const result = await restoreNoteVersion(getDb(), viewer, input.noteId, input.version);
  refresh();
  redirect(result.ok ? `/notes/${input.noteId}` : `/notes/${input.noteId}/history`);
}

// ---------- Links ----------

export async function setTopicsAction(_prev: LibraryFormState, form: FormData): Promise<LibraryFormState> {
  const viewer = await requireUser();
  const input = z.object({ target: z.enum(["resource", "note", "question"]), id: z.uuid() }).safeParse(strings(form));
  if (!input.success) return failure("invalid");
  const topicIds = topicIdsSchema.safeParse(list(form, "topicIds"));
  if (!topicIds.success) return failure("invalidTopics");
  const result = await setItemTopics(getDb(), viewer, input.data.target, input.data.id, topicIds.data);
  if (!result.ok) return failure(result.error);
  refresh();
  return { status: "success", message: "library.topics.saved" };
}

export async function addQuestionLinkAction(_prev: LibraryFormState, form: FormData): Promise<LibraryFormState> {
  const viewer = await requireUser();
  const input = z.object({ kind: z.enum(["resource", "note"]), id: z.uuid(), questionId: z.uuid() }).safeParse(strings(form));
  if (!input.success) return failure("invalid");
  const result = await addQuestionLink(getDb(), viewer, input.data.kind, input.data.id, input.data.questionId);
  if (!result.ok) return failure(result.error);
  refresh();
  return { status: "success", message: "library.links.added" };
}

export async function removeQuestionLinkAction(form: FormData): Promise<void> {
  const viewer = await requireUser();
  const input = z.object({ kind: z.enum(["resource", "note"]), id: z.uuid(), questionId: z.uuid() }).parse(strings(form));
  await removeQuestionLink(getDb(), viewer, input.kind, input.id, input.questionId);
  refresh();
}
