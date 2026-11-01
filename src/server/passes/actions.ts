"use server";

// Server actions for exam passes. Each one: check who is asking, validate the form, call the service (which
// holds the rules and permissions again), then refresh the pages that show the data. Messages returned to the
// forms are translation keys.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db/client";
import { requireRole, requireUser } from "@/server/auth/session";
import { getStorage } from "@/server/storage";
import { passErrorField, passErrorKey } from "./errors";
import { hasOversizedImage, parseImages, parseNewQuestion, parseQuestionFields, parseSettingsForm, parseVerifiedAnswer } from "./form";
import {
  editQuestion,
  getQuestion,
  markDuplicate,
  moderateQuestion,
  questionEditSchema,
  questionInputSchema,
  questionReportInputSchema,
  reportQuestion,
  resolveQuestionReport,
  submitQuestion,
  unverifyAnswer,
  verifyAnswer,
} from "./service";
import { getPassSettings, updatePassSettings } from "./settings";

export type PassFormState = {
  status: "idle" | "success" | "error";
  /** Translation key. */
  message?: string;
  /** Field name -> translation key. */
  fieldErrors?: Record<string, string>;
  /** Existing question to point to (duplicates). */
  questionId?: string;
};

const failure = (code: string, questionId?: string): PassFormState => {
  const field = passErrorField(code);
  return {
    status: "error",
    message: passErrorKey(code),
    fieldErrors: field ? { [field]: passErrorKey(code) } : undefined,
    questionId,
  };
};

function zodFailure(error: z.ZodError): PassFormState {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "form");
    fieldErrors[field] ??= passErrorKey(issue.message);
  }
  return { status: "error", message: "passes.errors.invalid", fieldErrors };
}

const text = (form: FormData, name: string) => {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
};

function refresh(questionId?: string) {
  revalidatePath("/");
  revalidatePath("/passes", "layout");
  revalidatePath("/courses", "layout");
  revalidatePath("/moderation");
  if (questionId) revalidatePath(`/passes/${questionId}`);
}

// ---------- Contributors ----------

export async function submitQuestionAction(_prev: PassFormState, form: FormData): Promise<PassFormState> {
  const viewer = await requireUser();
  const db = getDb();
  const settings = await getPassSettings(db);
  if (hasOversizedImage(form, settings.images.maxBytes)) return failure("fileTooLarge");

  const parsed = questionInputSchema.safeParse(parseNewQuestion(form));
  if (!parsed.success) return zodFailure(parsed.error);
  const result = await submitQuestion(db, getStorage(), viewer, parsed.data, await parseImages(form));
  if (!result.ok) return failure(result.error, result.questionId);

  refresh(result.value.id);
  redirect(`/passes/${result.value.id}?submitted=1${result.value.repeatsOf.length ? "&repeat=1" : ""}`);
}

export async function editQuestionAction(_prev: PassFormState, form: FormData): Promise<PassFormState> {
  const viewer = await requireUser();
  const db = getDb();
  const id = z.uuid().safeParse(text(form, "questionId"));
  if (!id.success) return failure("notFound");
  const settings = await getPassSettings(db);
  if (hasOversizedImage(form, settings.images.maxBytes)) return failure("fileTooLarge");

  const fields = parseQuestionFields(form);
  const parsed = questionEditSchema.safeParse({ ...fields, proposedAnswerText: fields.proposedAnswerText ?? null });
  if (!parsed.success) return zodFailure(parsed.error);
  const changeNote = text(form, "changeNote").trim().slice(0, 300) || null;
  const removeIds = form.getAll("removeImage").map(String);

  const result = await editQuestion(db, getStorage(), viewer, id.data, parsed.data, changeNote, {
    add: await parseImages(form),
    removeIds,
  });
  if (!result.ok) return failure(result.error, result.questionId);

  refresh(id.data);
  redirect(`/passes/${id.data}?saved=1${result.value.answerReset ? "&reset=1" : ""}`);
}

export async function reportQuestionAction(_prev: PassFormState, form: FormData): Promise<PassFormState> {
  const viewer = await requireUser();
  const parsed = questionReportInputSchema.safeParse({
    questionId: text(form, "questionId"),
    reason: text(form, "reason"),
    details: text(form, "details"),
  });
  if (!parsed.success) return zodFailure(parsed.error);
  const result = await reportQuestion(getDb(), viewer, parsed.data);
  if (!result.ok) return failure(result.error);
  revalidatePath("/moderation");
  return { status: "success", message: "passes.report.sent" };
}

// ---------- Moderators and verifiers ----------

const reviewSchema = z.object({
  questionId: z.uuid(),
  action: z.enum(["publish", "reject", "hide"]),
  note: z.string().trim().max(500).optional(),
});

export async function reviewQuestionAction(_prev: PassFormState, form: FormData): Promise<PassFormState> {
  const viewer = await requireUser();
  const parsed = reviewSchema.safeParse({ questionId: text(form, "questionId"), action: text(form, "action"), note: text(form, "note") });
  if (!parsed.success) return zodFailure(parsed.error);
  const result = await moderateQuestion(getDb(), viewer, parsed.data.questionId, parsed.data.action, parsed.data.note || null);
  if (!result.ok) return failure(result.error);
  refresh(parsed.data.questionId);
  return { status: "success", message: `passes.review.done.${parsed.data.action}` };
}

export async function verifyAnswerAction(_prev: PassFormState, form: FormData): Promise<PassFormState> {
  const viewer = await requireUser();
  const db = getDb();
  const id = z.uuid().safeParse(text(form, "questionId"));
  if (!id.success) return failure("notFound");
  const question = await getQuestion(db, viewer, id.data);
  if (!question) return failure("notFound");
  const answer = parseVerifiedAnswer(form, question.type.answer, question.choices.length);
  const result = await verifyAnswer(db, viewer, id.data, answer, text(form, "note"));
  if (!result.ok) return failure(result.error);
  refresh(id.data);
  return { status: "success", message: "passes.verify.done" };
}

export async function unverifyAnswerAction(_prev: PassFormState, form: FormData): Promise<PassFormState> {
  const viewer = await requireUser();
  const id = z.uuid().safeParse(text(form, "questionId"));
  if (!id.success) return failure("notFound");
  const result = await unverifyAnswer(getDb(), viewer, id.data, text(form, "note"));
  if (!result.ok) return failure(result.error);
  refresh(id.data);
  return { status: "success", message: "passes.verify.removed" };
}

export async function markDuplicateAction(_prev: PassFormState, form: FormData): Promise<PassFormState> {
  const viewer = await requireUser();
  const ids = z.object({ questionId: z.uuid(), canonicalId: z.uuid().nullable() }).safeParse({
    questionId: text(form, "questionId"),
    canonicalId: text(form, "canonicalId") || null,
  });
  if (!ids.success) return failure("notFound");
  const result = await markDuplicate(getDb(), viewer, ids.data.questionId, ids.data.canonicalId);
  if (!result.ok) return failure(result.error);
  refresh(ids.data.questionId);
  return { status: "success", message: ids.data.canonicalId ? "passes.repeats.grouped" : "passes.repeats.ungrouped" };
}

export async function resolveQuestionReportAction(form: FormData): Promise<void> {
  const viewer = await requireUser();
  const input = z
    .object({
      reportId: z.uuid(),
      questionId: z.uuid(),
      outcome: z.enum(["resolved", "dismissed"]),
      note: z.string().trim().max(500).optional(),
    })
    .parse({
      reportId: text(form, "reportId"),
      questionId: text(form, "questionId"),
      outcome: text(form, "outcome"),
      note: text(form, "note"),
    });
  await resolveQuestionReport(getDb(), viewer, input.reportId, input.outcome, input.note || null);
  refresh(input.questionId);
}

// ---------- Administrators ----------

export async function updatePassSettingsAction(_prev: PassFormState, form: FormData): Promise<PassFormState> {
  const viewer = await requireRole("admin");
  const { invalidNumber, ...patch } = parseSettingsForm(form);
  if (invalidNumber) return failure("outOfRange");
  const result = await updatePassSettings(getDb(), viewer, patch);
  if (!result.ok) return failure(result.error);
  revalidatePath("/admin/passes");
  refresh();
  return { status: "success", message: "passes.settings.saved" };
}
