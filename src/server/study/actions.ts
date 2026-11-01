"use server";

// Server actions for the study tools. Each one: check who is asking (requireUser), validate the input with zod,
// call the service (which checks approval, ownership and question visibility again), and return plain data.
// Errors come back as codes that the screens translate (studyTools.errors.*).
//
// Practice and flashcard review do NOT revalidate the page they run on: the page keeps its own session state, and a
// refresh would reshuffle it. The progress pages are rendered fresh on every visit.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db/client";
import { requireUser } from "@/server/auth/session";
import { QUIZ_DEFAULT_COUNT, QUIZ_MAX_QUESTIONS } from "./constants";
import type { Reveal } from "./grading";
import { parseCount, parseStudyScope } from "./scope";
import {
  answerQuizItem,
  attemptInputSchema,
  createPersonalCard,
  createQuiz,
  deletePersonalCard,
  markInputSchema,
  personalCardSchema,
  quizAnswerSchema,
  quizRatingSchema,
  rateQuizItem,
  reviewCard,
  reviewInputSchema,
  revealAnswer,
  setMark,
  submitAttempt,
  updatePersonalCard,
  type AttemptResult,
  type Marks,
} from "./service";

export type ActionResult<T> = { ok: true; value: T } | { ok: false; error: string };

const invalid = { ok: false as const, error: "invalid" };

export type StudyFormState = {
  status: "idle" | "error";
  /** Error code, translated under studyTools.errors. */
  message?: string;
  fieldErrors?: Record<string, string>;
};

export async function submitAttemptAction(input: unknown): Promise<ActionResult<AttemptResult>> {
  const viewer = await requireUser();
  const parsed = attemptInputSchema.safeParse(input);
  if (!parsed.success) return invalid;
  return submitAttempt(getDb(), viewer, parsed.data, "practice");
}

export async function revealAnswerAction(questionId: unknown): Promise<ActionResult<Reveal>> {
  const viewer = await requireUser();
  const parsed = z.uuid().safeParse(questionId);
  if (!parsed.success) return invalid;
  return revealAnswer(getDb(), viewer, parsed.data);
}

export async function setMarkAction(input: unknown): Promise<ActionResult<Marks>> {
  const viewer = await requireUser();
  const parsed = markInputSchema.safeParse(input);
  if (!parsed.success) return invalid;
  return setMark(getDb(), viewer, parsed.data);
}

export async function reviewCardAction(input: unknown): Promise<ActionResult<{ box: number; dueAt: string }>> {
  const viewer = await requireUser();
  const parsed = reviewInputSchema.safeParse(input);
  if (!parsed.success) return invalid;
  const result = await reviewCard(getDb(), viewer, parsed.data);
  return result.ok ? { ok: true, value: { box: result.value.box, dueAt: result.value.dueAt.toISOString() } } : result;
}

export async function answerQuizItemAction(input: unknown): Promise<ActionResult<{ complete: boolean }>> {
  const viewer = await requireUser();
  const parsed = quizAnswerSchema.safeParse(input);
  if (!parsed.success) return invalid;
  const result = await answerQuizItem(getDb(), viewer, parsed.data);
  if (result.ok) revalidatePath("/practice/quizzes");
  return result;
}

export async function rateQuizItemAction(input: unknown): Promise<ActionResult<null>> {
  const viewer = await requireUser();
  const parsed = quizRatingSchema.safeParse(input);
  if (!parsed.success) return invalid;
  const result = await rateQuizItem(getDb(), viewer, parsed.data);
  if (result.ok) revalidatePath(`/practice/quizzes/${parsed.data.quizId}`);
  return result;
}

// ---------- Forms ----------

function formToRaw(form: FormData): Record<string, string> {
  const raw: Record<string, string> = {};
  for (const [key, value] of form.entries()) if (typeof value === "string") raw[key] = value;
  return raw;
}

export async function createQuizAction(_prev: StudyFormState, form: FormData): Promise<StudyFormState> {
  const viewer = await requireUser();
  const raw = formToRaw(form);
  const scope = parseStudyScope(raw);
  if (!scope.course) return { status: "error", message: "courseRequired", fieldErrors: { course: "courseRequired" } };
  const count = parseCount(raw.count, QUIZ_DEFAULT_COUNT, QUIZ_MAX_QUESTIONS);
  const result = await createQuiz(getDb(), viewer, scope, count);
  if (!result.ok) return { status: "error", message: result.error };
  revalidatePath("/practice/quizzes");
  redirect(`/practice/quizzes/${result.value.id}`);
}

export async function savePersonalCardAction(_prev: StudyFormState, form: FormData): Promise<StudyFormState> {
  const viewer = await requireUser();
  const raw = formToRaw(form);
  const parsed = personalCardSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0] ?? "form")] ??= issue.code === "too_big" ? "tooLong" : "required";
    return { status: "error", message: "invalid", fieldErrors };
  }
  const db = getDb();
  const id = raw.id;
  const result = id && z.uuid().safeParse(id).success ? await updatePersonalCard(db, viewer, id, parsed.data) : await createPersonalCard(db, viewer, parsed.data);
  if (!result.ok) return { status: "error", message: result.error };
  revalidatePath("/practice/flashcards");
  redirect("/practice/flashcards");
}

export async function deletePersonalCardAction(form: FormData): Promise<void> {
  const viewer = await requireUser();
  const id = form.get("id");
  if (typeof id === "string" && z.uuid().safeParse(id).success) await deletePersonalCard(getDb(), viewer, id);
  revalidatePath("/practice/flashcards");
  redirect("/practice/flashcards");
}
