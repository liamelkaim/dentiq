// Exam passes: business rules and permissions. Every function takes the database (and storage) explicitly, so
// it can be tested without a browser. No screens exist yet; server actions will call these functions.
//
// Rules in one glance:
//  - Approved members (and moderators) can submit. Student submissions wait for a moderator; moderators and
//    admins publish directly. Nobody sees who contributed a question except moderators.
//  - Changing a question's wording, type, choices, images or exam year RESETS a verified answer to "proposed".
//    The old state is kept in the revision history.
//  - Only roles allowed by the settings may verify an answer, and (by default) must give a note saying what the
//    verification rests on. Proposed and verified answers are stored separately and never mixed.
//  - A question's current/previous-year category is derived from its exam year (academic-year.ts), never stored.
import { randomUUID } from "node:crypto";
import { and, asc, count, desc, eq, exists, ilike, inArray, isNull, lt, ne, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import {
  confidences,
  courseOfferings,
  courses,
  examQuestionChoices,
  examQuestionImages,
  examQuestionReports,
  examQuestionRevisions,
  examQuestions,
  offeringInstructors,
  professors,
  provenances,
  questionReportReasons,
  terms,
  user,
  type AnswerStatus,
  type QuestionStatus,
} from "@/db/schema";
import { writeAudit, type DbExecutor } from "@/server/audit";
import { canAccessLibrary, isModerator, type Viewer } from "@/server/resources/service";
import { detectFileType, sanitizeFileName, sha256 } from "@/server/resources/files";
import type { FileStorage } from "@/server/storage";
import { categoryBounds, isFutureAcademicYear, parseAcademicYear, passCategory, type PassCategory } from "./academic-year";
import { questionFingerprint } from "./fingerprint";
import {
  describeQuestionType,
  getQuestionType,
  MAX_ANSWER_TEXT,
  MAX_QUESTION_TEXT,
  validateQuestionShape,
  validateVerifiedAnswer,
  type ChoiceDraft,
} from "./question-types";
import { canSubmitQuestionType, canVerifyAnswers, getPassSettings } from "./settings";

export type PassResult<T> = { ok: true; value: T } | { ok: false; error: string; questionId?: string };
const fail = (error: string, questionId?: string) => ({ ok: false as const, error, questionId });

type QuestionRow = typeof examQuestions.$inferSelect;
type ChoiceRow = typeof examQuestionChoices.$inferSelect;
type ImageRow = typeof examQuestionImages.$inferSelect;
type Full = { q: QuestionRow; choices: ChoiceRow[]; images: ImageRow[] };

export type ImageUpload = { name: string; bytes: Uint8Array; altText?: string | null };

// ---------- Permissions ----------

type Ownable = Pick<QuestionRow, "status" | "contributedBy">;

export function canSeeQuestion(viewer: Viewer, q: Ownable): boolean {
  if (isModerator(viewer)) return true;
  if (!canAccessLibrary(viewer)) return false;
  if (q.status === "published") return true;
  // Contributors can follow their own pending and rejected questions (and read the reviewer's note).
  return q.contributedBy === viewer.id && (q.status === "pending" || q.status === "rejected");
}

export function canEditQuestion(viewer: Viewer, q: Ownable): boolean {
  if (isModerator(viewer)) return true;
  return q.contributedBy === viewer.id && canAccessLibrary(viewer) && q.status !== "hidden";
}

// ---------- Validation of input ----------

const blankToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
const optionalText = (max: number) =>
  z.preprocess(blankToNull, z.string().trim().max(max).nullish()).transform((v) => v ?? null);
const optionalUuid = z.preprocess(blankToNull, z.uuid().nullish()).transform((v) => v ?? null);

const choiceSchema = z.object({
  text: z.string(),
  proposedCorrect: z.boolean().nullish().transform((v) => v ?? null),
});

export const questionInputSchema = z.object({
  courseId: z.uuid(),
  offeringId: optionalUuid,
  professorId: optionalUuid,
  examAcademicYear: z.string().trim().refine((v) => parseAcademicYear(v) !== null, { message: "invalidExamYear" }),
  examTerm: z.preprocess(blankToNull, z.enum(terms).nullish()).transform((v) => v ?? null),
  topic: optionalText(80),
  questionType: z.string().trim().min(1).max(30),
  questionText: z.string().trim().min(1, { message: "required" }).max(MAX_QUESTION_TEXT),
  explanation: optionalText(4000),
  provenance: z.enum(provenances).default("recalled"),
  confidence: z.preprocess(blankToNull, z.enum(confidences).nullish()).transform((v) => v ?? null),
  rightsConfirmed: z.literal(true, { message: "rightsRequired" }),
  choices: z.array(choiceSchema).max(10).default([]),
  proposedAnswerText: optionalText(MAX_ANSWER_TEXT),
});
export type QuestionInput = z.output<typeof questionInputSchema>;

/** Fields a contributor or moderator may change on an existing question. */
export const questionEditSchema = z.object({
  offeringId: optionalUuid.optional(),
  professorId: optionalUuid.optional(),
  examAcademicYear: z.string().trim().refine((v) => parseAcademicYear(v) !== null, { message: "invalidExamYear" }).optional(),
  examTerm: z.preprocess(blankToNull, z.enum(terms).nullish()).transform((v) => v ?? null).optional(),
  topic: optionalText(80).optional(),
  questionType: z.string().trim().min(1).max(30).optional(),
  questionText: z.string().trim().min(1).max(MAX_QUESTION_TEXT).optional(),
  explanation: optionalText(4000).optional(),
  confidence: z.preprocess(blankToNull, z.enum(confidences).nullish()).transform((v) => v ?? null).optional(),
  choices: z.array(choiceSchema).max(10).optional(),
  proposedAnswerText: optionalText(MAX_ANSWER_TEXT).optional(),
});
export type QuestionEdit = z.output<typeof questionEditSchema>;

export const questionReportInputSchema = z.object({
  questionId: z.uuid(),
  reason: z.enum(questionReportReasons),
  details: optionalText(1000),
});

// ---------- Images ----------

type CheckedImage = { image: ImageUpload; mime: string; fileName: string; hash: string; altText: string | null };

function checkQuestionImage(file: ImageUpload, maxBytes: number) {
  if (file.bytes.byteLength === 0) return fail("fileMissing");
  if (file.bytes.byteLength > maxBytes) return fail("fileTooLarge");
  const type = detectFileType(file.name, file.bytes);
  if (!type || type.preview !== "image") return fail("fileType"); // PNG and JPEG only
  return {
    ok: true as const,
    mime: type.mime,
    fileName: sanitizeFileName(file.name),
    hash: sha256(file.bytes),
    altText: file.altText?.trim().slice(0, 300) || null,
  };
}

// ---------- Loading and snapshots ----------

async function loadFull(db: DbExecutor, id: string): Promise<Full | null> {
  const [q] = await db.select().from(examQuestions).where(eq(examQuestions.id, id));
  if (!q) return null;
  const [choices, images] = await Promise.all([
    db.select().from(examQuestionChoices).where(eq(examQuestionChoices.questionId, id)).orderBy(asc(examQuestionChoices.position)),
    db.select().from(examQuestionImages).where(eq(examQuestionImages.questionId, id)).orderBy(asc(examQuestionImages.position)),
  ]);
  return { q, choices, images };
}

function snapshotOf({ q, choices, images }: Full): Record<string, unknown> {
  return {
    courseId: q.courseId,
    offeringId: q.offeringId,
    professorId: q.professorId,
    examAcademicYear: q.examAcademicYear,
    examTerm: q.examTerm,
    topic: q.topic,
    questionType: q.questionType,
    questionText: q.questionText,
    explanation: q.explanation,
    proposedAnswerText: q.proposedAnswerText,
    verifiedAnswerText: q.verifiedAnswerText,
    provenance: q.provenance,
    confidence: q.confidence,
    status: q.status,
    answerStatus: q.answerStatus,
    verificationNote: q.verificationNote,
    choices: choices.map((c) => ({
      position: c.position,
      text: c.text,
      proposedCorrect: c.proposedCorrect,
      verifiedCorrect: c.verifiedCorrect,
    })),
    images: images.map((i) => ({ id: i.id, position: i.position, fileName: i.fileName, removed: i.removedAt !== null })),
  };
}

async function addRevision(tx: DbExecutor, questionId: string, snapshot: Record<string, unknown>, actorId: string, note: string | null) {
  const [row] = await tx
    .select({ next: sql<number>`coalesce(max(${examQuestionRevisions.revisionNumber}), 0) + 1` })
    .from(examQuestionRevisions)
    .where(eq(examQuestionRevisions.questionId, questionId));
  await tx.insert(examQuestionRevisions).values({
    questionId,
    revisionNumber: Number(row?.next ?? 1),
    snapshot,
    changeNote: note,
    changedBy: actorId,
  });
}

async function checkPlacement(
  db: DbExecutor,
  courseId: string,
  offeringId: string | null,
  professorId: string | null,
  examAcademicYear: string,
): Promise<string | null> {
  const [course] = await db.select({ id: courses.id }).from(courses).where(and(eq(courses.id, courseId), isNull(courses.archivedAt)));
  if (!course) return "courseNotFound";
  if (offeringId) {
    const [offering] = await db
      .select({ academicYear: courseOfferings.academicYear })
      .from(courseOfferings)
      .where(and(eq(courseOfferings.id, offeringId), eq(courseOfferings.courseId, courseId)));
    if (!offering) return "invalidOffering";
    if (offering.academicYear !== examAcademicYear) return "offeringYearMismatch";
  }
  if (professorId) {
    const [prof] = await db.select({ id: professors.id }).from(professors).where(eq(professors.id, professorId));
    if (!prof) return "invalidProfessor";
  }
  return null;
}

/** Other pending/published questions in the course with the same wording. */
async function sameWording(db: DbExecutor, courseId: string, fingerprint: string, excludeId?: string) {
  const conditions: SQL[] = [
    eq(examQuestions.courseId, courseId),
    eq(examQuestions.fingerprint, fingerprint),
    inArray(examQuestions.status, ["pending", "published"]),
  ];
  if (excludeId) conditions.push(ne(examQuestions.id, excludeId));
  return db
    .select({
      id: examQuestions.id,
      examAcademicYear: examQuestions.examAcademicYear,
      status: examQuestions.status,
      contributedBy: examQuestions.contributedBy,
    })
    .from(examQuestions)
    .where(and(...conditions));
}

// ---------- Submitting ----------

export async function submitQuestion(
  db: Database,
  storage: FileStorage,
  viewer: Viewer,
  input: QuestionInput,
  images: ImageUpload[] = [],
): Promise<PassResult<{ id: string; repeatsOf: string[] }>> {
  if (!canAccessLibrary(viewer)) return fail("forbidden");
  const settings = await getPassSettings(db);

  const type = getQuestionType(input.questionType);
  if (!type) return fail("unknownType");
  if (!canSubmitQuestionType(settings, input.questionType)) return fail("typeNotEnabled");
  const shape = validateQuestionShape(input.questionType, input.questionText, input.choices, input.proposedAnswerText);
  if (!shape.ok) return fail(shape.error);
  if (isFutureAcademicYear(input.examAcademicYear)) return fail("futureExamYear");
  const placement = await checkPlacement(db, input.courseId, input.offeringId, input.professorId, input.examAcademicYear);
  if (placement) return fail(placement);

  if (images.length > settings.images.maxPerQuestion) return fail("tooManyImages");
  if (type.imageRequired && images.length === 0) return fail("imageRequired");
  const checked: CheckedImage[] = [];
  for (const image of images) {
    const result = checkQuestionImage(image, settings.images.maxBytes);
    if (!("hash" in result)) return result;
    checked.push({ image, ...result });
  }

  const moderator = isModerator(viewer);
  if (!moderator) {
    const [pending] = await db
      .select({ n: count() })
      .from(examQuestions)
      .where(and(eq(examQuestions.contributedBy, viewer.id), eq(examQuestions.status, "pending")));
    if ((pending?.n ?? 0) >= settings.limits.maxPendingPerUser) return fail("tooManyPending");
  }

  const fingerprint = questionFingerprint(input.questionText, input.choices.map((c) => c.text));
  const similar = await sameWording(db, input.courseId, fingerprint);
  const sameYear = similar.find((s) => s.examAcademicYear === input.examAcademicYear);
  // Blocked either way; the link is only given when this person may see the original.
  if (sameYear) return fail("duplicateQuestion", canSeeQuestion(viewer, sameYear) ? sameYear.id : undefined);
  // The same wording in ANOTHER exam year is legitimate (questions get reused): allowed, and reported.
  const repeatsOf = similar.filter((s) => canSeeQuestion(viewer, s)).map((s) => s.id);

  const stored: string[] = [];
  try {
    for (const c of checked) {
      const key = `questions/${randomUUID()}`;
      await storage.put(key, c.image.bytes);
      stored.push(key);
    }
    return await db.transaction(async (tx) => {
      const [q] = await tx
        .insert(examQuestions)
        .values({
          courseId: input.courseId,
          offeringId: input.offeringId,
          professorId: input.professorId,
          examAcademicYear: input.examAcademicYear,
          examTerm: input.examTerm,
          topic: input.topic,
          questionType: input.questionType,
          questionText: input.questionText,
          explanation: input.explanation,
          proposedAnswerText: input.proposedAnswerText,
          provenance: input.provenance,
          confidence: input.confidence,
          rightsConfirmed: true,
          // Student submissions are reviewed first; moderators and admins publish directly.
          status: moderator ? "published" : "pending",
          reviewedBy: moderator ? viewer.id : null,
          reviewedAt: moderator ? new Date() : null,
          answerStatus: "proposed",
          fingerprint,
          contributedBy: viewer.id,
        })
        .returning({ id: examQuestions.id });
      const id = q!.id;
      if (input.choices.length) {
        await tx.insert(examQuestionChoices).values(
          input.choices.map((c, i) => ({
            questionId: id,
            position: i + 1,
            text: c.text.trim(),
            proposedCorrect: c.proposedCorrect,
            verifiedCorrect: null,
          })),
        );
      }
      if (checked.length) {
        await tx.insert(examQuestionImages).values(
          checked.map((c, i) => ({
            questionId: id,
            position: i + 1,
            storageKey: stored[i]!,
            fileName: c.fileName,
            mimeType: c.mime,
            sizeBytes: c.image.bytes.byteLength,
            sha256: c.hash,
            altText: c.altText,
            uploadedBy: viewer.id,
          })),
        );
      }
      const full = await loadFull(tx, id);
      await addRevision(tx, id, snapshotOf(full!), viewer.id, null);
      await writeAudit(tx, {
        actorId: viewer.id,
        action: "question.submit",
        entityType: "exam_question",
        entityId: id,
        metadata: { courseId: input.courseId, type: input.questionType, examAcademicYear: input.examAcademicYear, status: full!.q.status },
      });
      return { ok: true as const, value: { id, repeatsOf } };
    });
  } catch (error) {
    await Promise.all(stored.map((key) => storage.delete(key)));
    throw error;
  }
}

// ---------- Editing ----------

export async function editQuestion(
  db: Database,
  storage: FileStorage,
  viewer: Viewer,
  id: string,
  patch: QuestionEdit,
  changeNote: string | null,
  imageChanges: { add?: ImageUpload[]; removeIds?: string[] } = {},
): Promise<PassResult<{ answerReset: boolean; status: QuestionStatus }>> {
  const before = await loadFull(db, id);
  if (!before || !canSeeQuestion(viewer, before.q)) return fail("notFound");
  if (!canEditQuestion(viewer, before.q)) return fail("forbidden");
  const settings = await getPassSettings(db);
  const q = before.q;

  const next = {
    offeringId: patch.offeringId !== undefined ? patch.offeringId : q.offeringId,
    professorId: patch.professorId !== undefined ? patch.professorId : q.professorId,
    examAcademicYear: patch.examAcademicYear ?? q.examAcademicYear,
    examTerm: patch.examTerm !== undefined ? patch.examTerm : q.examTerm,
    topic: patch.topic !== undefined ? patch.topic : q.topic,
    questionType: patch.questionType ?? q.questionType,
    questionText: patch.questionText ?? q.questionText,
    explanation: patch.explanation !== undefined ? patch.explanation : q.explanation,
    confidence: patch.confidence !== undefined ? patch.confidence : q.confidence,
    proposedAnswerText: patch.proposedAnswerText !== undefined ? patch.proposedAnswerText : q.proposedAnswerText,
  };
  const drafts: ChoiceDraft[] =
    patch.choices ?? before.choices.map((c) => ({ text: c.text, proposedCorrect: c.proposedCorrect }));

  // Existing questions of a type that was later switched off stay editable; only CHANGING to a type requires it.
  if (next.questionType !== q.questionType && !canSubmitQuestionType(settings, next.questionType)) return fail("typeNotEnabled");
  const shape = validateQuestionShape(next.questionType, next.questionText, drafts, next.proposedAnswerText);
  if (!shape.ok) return fail(shape.error);
  if (next.examAcademicYear !== q.examAcademicYear && isFutureAcademicYear(next.examAcademicYear)) return fail("futureExamYear");
  const placement = await checkPlacement(db, q.courseId, next.offeringId, next.professorId, next.examAcademicYear);
  if (placement) return fail(placement);

  // Images: validate additions and removals before touching anything.
  const activeImages = before.images.filter((i) => i.removedAt === null);
  const removeIds = [...new Set(imageChanges.removeIds ?? [])];
  if (removeIds.some((rid) => !activeImages.some((i) => i.id === rid))) return fail("imageNotFound");
  const additions = imageChanges.add ?? [];
  if (activeImages.length - removeIds.length + additions.length > settings.images.maxPerQuestion) return fail("tooManyImages");
  const typeDef = getQuestionType(next.questionType);
  if (typeDef?.imageRequired && activeImages.length - removeIds.length + additions.length === 0) return fail("imageRequired");
  const checkedAdds: CheckedImage[] = [];
  for (const image of additions) {
    const result = checkQuestionImage(image, settings.images.maxBytes);
    if (!("hash" in result)) return result;
    checkedAdds.push({ image, ...result });
  }

  const choicesTextChanged =
    drafts.length !== before.choices.length || drafts.some((d, i) => d.text.trim() !== before.choices[i]!.text);
  const contentChanged =
    next.questionText !== q.questionText ||
    next.questionType !== q.questionType ||
    next.examAcademicYear !== q.examAcademicYear ||
    choicesTextChanged ||
    removeIds.length > 0 ||
    checkedAdds.length > 0;
  const answerReset = contentChanged && q.answerStatus === "verified";

  const fingerprint = questionFingerprint(next.questionText, drafts.map((d) => d.text));
  if (fingerprint !== q.fingerprint || next.examAcademicYear !== q.examAcademicYear) {
    const clash = (await sameWording(db, q.courseId, fingerprint, id)).find((s) => s.examAcademicYear === next.examAcademicYear);
    if (clash) return fail("duplicateQuestion", canSeeQuestion(viewer, clash) ? clash.id : undefined);
  }

  const moderator = isModerator(viewer);
  // A contributor's change to a published or rejected question goes back to review.
  const status: QuestionStatus = moderator ? q.status : "pending";

  const stored: string[] = [];
  try {
    for (const c of checkedAdds) {
      const key = `questions/${randomUUID()}`;
      await storage.put(key, c.image.bytes);
      stored.push(key);
    }
    return await db.transaction(async (tx) => {
      await tx
        .update(examQuestions)
        .set({
          ...next,
          fingerprint,
          status,
          reviewNote: !moderator && q.status !== "pending" ? null : q.reviewNote,
          ...(answerReset
            ? { answerStatus: "proposed" as AnswerStatus, verifiedBy: null, verifiedAt: null, verificationNote: null, verifiedAnswerText: null }
            : {}),
        })
        .where(eq(examQuestions.id, id));

      if (choicesTextChanged) {
        // Different wording or count: replace the choices (verified verdicts no longer apply and are cleared).
        await tx.delete(examQuestionChoices).where(eq(examQuestionChoices.questionId, id));
        if (drafts.length) {
          await tx.insert(examQuestionChoices).values(
            drafts.map((d, i) => ({ questionId: id, position: i + 1, text: d.text.trim(), proposedCorrect: d.proposedCorrect ?? null, verifiedCorrect: null })),
          );
        }
      } else {
        // Same choices: update only the contributor's proposal; a verified verdict is kept (or cleared on reset).
        for (const [i, d] of drafts.entries()) {
          await tx
            .update(examQuestionChoices)
            .set({ proposedCorrect: d.proposedCorrect ?? null, ...(answerReset ? { verifiedCorrect: null } : {}) })
            .where(and(eq(examQuestionChoices.questionId, id), eq(examQuestionChoices.position, i + 1)));
        }
      }
      if (removeIds.length) {
        await tx.update(examQuestionImages).set({ removedAt: new Date() }).where(inArray(examQuestionImages.id, removeIds));
      }
      if (checkedAdds.length) {
        const [top] = await tx
          .select({ max: sql<number>`coalesce(max(${examQuestionImages.position}), 0)` })
          .from(examQuestionImages)
          .where(eq(examQuestionImages.questionId, id));
        const start = Number(top?.max ?? 0);
        await tx.insert(examQuestionImages).values(
          checkedAdds.map((c, i) => ({
            questionId: id,
            position: start + i + 1,
            storageKey: stored[i]!,
            fileName: c.fileName,
            mimeType: c.mime,
            sizeBytes: c.image.bytes.byteLength,
            sha256: c.hash,
            altText: c.altText,
            uploadedBy: viewer.id,
          })),
        );
      }
      const after = await loadFull(tx, id);
      await addRevision(tx, id, snapshotOf(after!), viewer.id, changeNote);
      await writeAudit(tx, {
        actorId: viewer.id,
        action: "question.edit",
        entityType: "exam_question",
        entityId: id,
        metadata: { answerReset, from: q.status, to: status },
      });
      return { ok: true as const, value: { answerReset, status } };
    });
  } catch (error) {
    await Promise.all(stored.map((key) => storage.delete(key)));
    throw error;
  }
}

// ---------- Review ----------

export async function moderateQuestion(
  db: Database,
  viewer: Viewer,
  id: string,
  action: "publish" | "reject" | "hide",
  note: string | null,
): Promise<PassResult<{ status: QuestionStatus }>> {
  if (!isModerator(viewer)) return fail("forbidden");
  const [q] = await db.select().from(examQuestions).where(eq(examQuestions.id, id));
  if (!q) return fail("notFound");
  const cleanNote = note?.trim() || null;
  if (action === "reject" && !cleanNote) return fail("noteRequired");
  const status: QuestionStatus = action === "publish" ? "published" : action === "reject" ? "rejected" : "hidden";
  await db.transaction(async (tx) => {
    await tx
      .update(examQuestions)
      .set({ status, reviewNote: cleanNote, reviewedBy: viewer.id, reviewedAt: new Date() })
      .where(eq(examQuestions.id, id));
    await writeAudit(tx, {
      actorId: viewer.id,
      action: `question.${action}`,
      entityType: "exam_question",
      entityId: id,
      metadata: { from: q.status, to: status },
    });
  });
  return { ok: true, value: { status } };
}

// ---------- Verification ----------

export type VerifiedAnswer = { choices?: boolean[]; text?: string | null };

function noteProblem(note: string | null, settings: Awaited<ReturnType<typeof getPassSettings>>): string | null {
  const length = note?.trim().length ?? 0;
  if (settings.verification.requireNote && length === 0) return "noteRequired";
  if (length < settings.verification.minNoteLength && settings.verification.requireNote) return "noteTooShort";
  return null;
}

export async function verifyAnswer(
  db: Database,
  viewer: Viewer,
  id: string,
  answer: VerifiedAnswer,
  note: string | null,
): Promise<PassResult<{ answerStatus: AnswerStatus }>> {
  const settings = await getPassSettings(db);
  if (!canVerifyAnswers(viewer, settings)) return fail("forbidden");
  const before = await loadFull(db, id);
  if (!before) return fail("notFound");
  if (before.q.status === "rejected" || before.q.status === "hidden") return fail("notVerifiable");
  const problem = noteProblem(note, settings);
  if (problem) return fail(problem);
  const check = validateVerifiedAnswer(before.q.questionType, before.choices.length, answer.choices, answer.text);
  if (!check.ok) return fail(check.error);

  await db.transaction(async (tx) => {
    for (const [i, choice] of before.choices.entries()) {
      await tx.update(examQuestionChoices).set({ verifiedCorrect: answer.choices?.[i] ?? null }).where(eq(examQuestionChoices.id, choice.id));
    }
    await tx
      .update(examQuestions)
      .set({
        answerStatus: "verified",
        verifiedBy: viewer.id,
        verifiedAt: new Date(),
        verificationNote: note?.trim() || null,
        verifiedAnswerText: getQuestionType(before.q.questionType)?.answer === "text" ? (answer.text?.trim() ?? null) : null,
      })
      .where(eq(examQuestions.id, id));
    const after = await loadFull(tx, id);
    await addRevision(tx, id, snapshotOf(after!), viewer.id, note?.trim() || null);
    await writeAudit(tx, {
      actorId: viewer.id,
      action: "question.verify",
      entityType: "exam_question",
      entityId: id,
      metadata: { role: viewer.role, previouslyVerified: before.q.answerStatus === "verified" },
    });
  });
  return { ok: true, value: { answerStatus: "verified" } };
}

/** Takes a verified answer back to "proposed" (e.g. found to be wrong). The verified verdicts stay in history. */
export async function unverifyAnswer(db: Database, viewer: Viewer, id: string, note: string | null): Promise<PassResult<{ answerStatus: AnswerStatus }>> {
  const settings = await getPassSettings(db);
  if (!canVerifyAnswers(viewer, settings)) return fail("forbidden");
  const before = await loadFull(db, id);
  if (!before) return fail("notFound");
  if (before.q.answerStatus !== "verified") return fail("notVerified");
  const problem = noteProblem(note, settings);
  if (problem) return fail(problem);

  await db.transaction(async (tx) => {
    await tx.update(examQuestionChoices).set({ verifiedCorrect: null }).where(eq(examQuestionChoices.questionId, id));
    await tx
      .update(examQuestions)
      .set({ answerStatus: "proposed", verifiedBy: null, verifiedAt: null, verificationNote: null, verifiedAnswerText: null })
      .where(eq(examQuestions.id, id));
    const after = await loadFull(tx, id);
    await addRevision(tx, id, snapshotOf(after!), viewer.id, note?.trim() || null);
    await writeAudit(tx, { actorId: viewer.id, action: "question.unverify", entityType: "exam_question", entityId: id, metadata: { role: viewer.role } });
  });
  return { ok: true, value: { answerStatus: "proposed" } };
}

// ---------- Duplicate grouping ----------

/** Links a question to its canonical version (or clears the link with `null`). Moderators only. */
export async function markDuplicate(db: Database, viewer: Viewer, id: string, canonicalId: string | null): Promise<PassResult<null>> {
  if (!isModerator(viewer)) return fail("forbidden");
  const [q] = await db.select().from(examQuestions).where(eq(examQuestions.id, id));
  if (!q) return fail("notFound");
  if (canonicalId) {
    if (canonicalId === id) return fail("sameQuestion");
    const [canonical] = await db.select().from(examQuestions).where(eq(examQuestions.id, canonicalId));
    if (!canonical || canonical.courseId !== q.courseId) return fail("notFound");
    if (canonical.duplicateOfId) return fail("canonicalIsDuplicate");
    const [others] = await db.select({ n: count() }).from(examQuestions).where(eq(examQuestions.duplicateOfId, id));
    if ((others?.n ?? 0) > 0) return fail("hasDuplicates");
  }
  await db.transaction(async (tx) => {
    await tx.update(examQuestions).set({ duplicateOfId: canonicalId }).where(eq(examQuestions.id, id));
    await writeAudit(tx, {
      actorId: viewer.id,
      action: canonicalId ? "question.duplicate.set" : "question.duplicate.clear",
      entityType: "exam_question",
      entityId: id,
      metadata: { canonicalId },
    });
  });
  return { ok: true, value: null };
}

/** Moderators: other questions in the same course with the same wording (any exam year). */
export async function findRepeats(db: Database, viewer: Viewer, id: string) {
  if (!isModerator(viewer)) return [];
  const [q] = await db.select().from(examQuestions).where(eq(examQuestions.id, id));
  if (!q) return [];
  return db
    .select({
      id: examQuestions.id,
      examAcademicYear: examQuestions.examAcademicYear,
      status: examQuestions.status,
      duplicateOfId: examQuestions.duplicateOfId,
    })
    .from(examQuestions)
    .where(and(eq(examQuestions.courseId, q.courseId), eq(examQuestions.fingerprint, q.fingerprint), ne(examQuestions.id, id)))
    .orderBy(desc(examQuestions.examAcademicYear));
}

// ---------- Reports ----------

export async function reportQuestion(db: Database, viewer: Viewer, input: z.output<typeof questionReportInputSchema>): Promise<PassResult<null>> {
  const [q] = await db.select().from(examQuestions).where(eq(examQuestions.id, input.questionId));
  if (!q || !canSeeQuestion(viewer, q)) return fail("notFound");
  if (q.status !== "published" || !canAccessLibrary(viewer)) return fail("forbidden");
  try {
    await db.insert(examQuestionReports).values({ ...input, reporterId: viewer.id });
  } catch (error) {
    const e = error as { code?: string; cause?: { code?: string } };
    if (e?.code === "23505" || e?.cause?.code === "23505") return fail("alreadyReported");
    throw error;
  }
  return { ok: true, value: null };
}

export async function resolveQuestionReport(
  db: Database,
  viewer: Viewer,
  reportId: string,
  outcome: "resolved" | "dismissed",
  note: string | null,
): Promise<PassResult<null>> {
  if (!isModerator(viewer)) return fail("forbidden");
  const [row] = await db
    .update(examQuestionReports)
    .set({ status: outcome, resolvedBy: viewer.id, resolvedAt: new Date(), resolutionNote: note?.trim() || null })
    .where(and(eq(examQuestionReports.id, reportId), eq(examQuestionReports.status, "open")))
    .returning({ id: examQuestionReports.id, questionId: examQuestionReports.questionId });
  if (!row) return fail("notFound");
  await writeAudit(db, {
    actorId: viewer.id,
    action: `question.report.${outcome}`,
    entityType: "exam_question_report",
    entityId: reportId,
    metadata: { questionId: row.questionId },
  });
  return { ok: true, value: null };
}

// ---------- Reading ----------

export type QuestionFilters = {
  courseId?: string;
  offeringId?: string;
  professorId?: string;
  examAcademicYear?: string;
  /** current-year or previous-year, derived from the exam year */
  category?: PassCategory;
  topic?: string;
  questionType?: string;
  answerStatus?: AnswerStatus;
  /** Moderators only. */
  status?: QuestionStatus;
  q?: string;
  includeDuplicates?: boolean;
  limit?: number;
  offset?: number;
  /** For tests; defaults to now. */
  now?: Date;
};

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function listQuestions(db: Database, viewer: Viewer, filters: QuestionFilters = {}) {
  if (!canAccessLibrary(viewer)) return { items: [], total: 0 };
  const now = filters.now ?? new Date();
  const e = examQuestions;
  const conditions: SQL[] = [];

  if (isModerator(viewer) && filters.status) {
    conditions.push(eq(e.status, filters.status));
  } else {
    conditions.push(or(eq(e.status, "published"), and(eq(e.contributedBy, viewer.id), inArray(e.status, ["pending", "rejected"])))!);
  }
  if (!filters.includeDuplicates) conditions.push(isNull(e.duplicateOfId));
  if (filters.courseId) conditions.push(eq(e.courseId, filters.courseId));
  if (filters.offeringId) conditions.push(eq(e.offeringId, filters.offeringId));
  if (filters.examAcademicYear) conditions.push(eq(e.examAcademicYear, filters.examAcademicYear));
  if (filters.questionType) conditions.push(eq(e.questionType, filters.questionType));
  if (filters.answerStatus) conditions.push(eq(e.answerStatus, filters.answerStatus));
  if (filters.topic) conditions.push(ilike(e.topic, escapeLike(filters.topic)));
  if (filters.category) {
    const bounds = categoryBounds(filters.category, now);
    conditions.push("equals" in bounds ? eq(e.examAcademicYear, bounds.equals) : lt(e.examAcademicYear, bounds.before));
  }
  if (filters.professorId) {
    conditions.push(
      or(
        eq(e.professorId, filters.professorId),
        exists(
          db
            .select({ one: sql`1` })
            .from(offeringInstructors)
            .where(and(eq(offeringInstructors.offeringId, e.offeringId), eq(offeringInstructors.professorId, filters.professorId))),
        ),
      )!,
    );
  }
  const text = filters.q?.trim();
  if (text) {
    const pattern = `%${escapeLike(text)}%`;
    conditions.push(or(ilike(e.questionText, pattern), ilike(e.topic, pattern))!);
  }

  const where = and(...conditions);
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
  const [rows, totals] = await Promise.all([
    db
      .select({
        id: e.id,
        courseId: e.courseId,
        courseCode: courses.code,
        examAcademicYear: e.examAcademicYear,
        examTerm: e.examTerm,
        offeringId: e.offeringId,
        professorId: e.professorId,
        topic: e.topic,
        questionType: e.questionType,
        questionText: e.questionText,
        status: e.status,
        answerStatus: e.answerStatus,
        provenance: e.provenance,
        confidence: e.confidence,
        duplicateOfId: e.duplicateOfId,
        createdAt: e.createdAt,
      })
      .from(e)
      .innerJoin(courses, eq(e.courseId, courses.id))
      .where(where)
      .orderBy(desc(e.examAcademicYear), desc(e.createdAt))
      .limit(limit)
      .offset(Math.max(filters.offset ?? 0, 0)),
    db.select({ n: count() }).from(e).where(where),
  ]);
  return {
    items: rows.map((r) => ({ ...r, category: passCategory(r.examAcademicYear, now) })),
    total: totals[0]?.n ?? 0,
  };
}

export type QuestionListItem = Awaited<ReturnType<typeof listQuestions>>["items"][number];

export async function getQuestion(db: Database, viewer: Viewer, id: string, now: Date = new Date()) {
  const full = await loadFull(db, id);
  if (!full || !canSeeQuestion(viewer, full.q)) return null;
  const { q } = full;
  const moderator = isModerator(viewer);
  const settings = await getPassSettings(db);

  const [[course], [revisions], instructorRows, [profRow], [contributor], reports] = await Promise.all([
    db.select({ id: courses.id, code: courses.code, titleFr: courses.titleFr, titleEn: courses.titleEn }).from(courses).where(eq(courses.id, q.courseId)),
    db.select({ n: count() }).from(examQuestionRevisions).where(eq(examQuestionRevisions.questionId, id)),
    q.offeringId
      ? db
          .select({ fullName: professors.fullName })
          .from(offeringInstructors)
          .innerJoin(professors, eq(offeringInstructors.professorId, professors.id))
          .where(eq(offeringInstructors.offeringId, q.offeringId))
          .orderBy(asc(professors.fullName))
      : Promise.resolve([]),
    q.professorId ? db.select({ fullName: professors.fullName }).from(professors).where(eq(professors.id, q.professorId)) : Promise.resolve([]),
    moderator && q.contributedBy ? db.select({ name: user.name }).from(user).where(eq(user.id, q.contributedBy)) : Promise.resolve([]),
    moderator
      ? db
          .select({ id: examQuestionReports.id, reason: examQuestionReports.reason, details: examQuestionReports.details, createdAt: examQuestionReports.createdAt })
          .from(examQuestionReports)
          .where(and(eq(examQuestionReports.questionId, id), eq(examQuestionReports.status, "open")))
          .orderBy(asc(examQuestionReports.createdAt))
      : Promise.resolve([]),
  ]);

  const verified = q.answerStatus === "verified";
  return {
    id: q.id,
    course: course!,
    examAcademicYear: q.examAcademicYear,
    examTerm: q.examTerm,
    category: passCategory(q.examAcademicYear, now),
    offeringId: q.offeringId,
    professorName: profRow?.fullName ?? null,
    instructors: instructorRows.map((r) => r.fullName),
    topic: q.topic,
    type: describeQuestionType(q.questionType),
    questionText: q.questionText,
    explanation: q.explanation,
    provenance: q.provenance,
    confidence: q.confidence,
    status: q.status,
    reviewNote: moderator || q.contributedBy === viewer.id ? q.reviewNote : null,
    answerStatus: q.answerStatus,
    // Proposed and verified answers stay apart; the verified ones are null until a moderator verifies.
    choices: full.choices.map((c) => ({
      position: c.position,
      text: c.text,
      proposedCorrect: c.proposedCorrect,
      verifiedCorrect: verified ? c.verifiedCorrect : null,
    })),
    proposedAnswerText: q.proposedAnswerText,
    verifiedAnswerText: verified ? q.verifiedAnswerText : null,
    verification: verified ? { at: q.verifiedAt, note: q.verificationNote } : null,
    images: full.images.filter((i) => i.removedAt === null).map((i) => ({ id: i.id, position: i.position, altText: i.altText, fileName: i.fileName })),
    duplicateOfId: q.duplicateOfId,
    revisionCount: Number(revisions?.n ?? 0),
    contributorName: contributor?.name ?? null,
    openReports: reports,
    canEdit: canEditQuestion(viewer, q),
    canModerate: moderator,
    canVerify: canVerifyAnswers(viewer, settings),
    canReport: q.status === "published" && canAccessLibrary(viewer),
  };
}

/** Change history: moderators and the contributor. */
export async function listQuestionRevisions(db: Database, viewer: Viewer, id: string) {
  const [q] = await db.select().from(examQuestions).where(eq(examQuestions.id, id));
  if (!q || !canSeeQuestion(viewer, q)) return [];
  if (!isModerator(viewer) && q.contributedBy !== viewer.id) return [];
  return db
    .select({
      revisionNumber: examQuestionRevisions.revisionNumber,
      snapshot: examQuestionRevisions.snapshot,
      changeNote: examQuestionRevisions.changeNote,
      changedByName: user.name,
      createdAt: examQuestionRevisions.createdAt,
    })
    .from(examQuestionRevisions)
    .leftJoin(user, eq(examQuestionRevisions.changedBy, user.id))
    .where(eq(examQuestionRevisions.questionId, id))
    .orderBy(desc(examQuestionRevisions.revisionNumber));
}

export async function listQuestionQueue(db: Database, viewer: Viewer) {
  if (!isModerator(viewer)) return { pending: [], reports: [] };
  const [pending, reports] = await Promise.all([
    db
      .select({
        id: examQuestions.id,
        courseCode: courses.code,
        examAcademicYear: examQuestions.examAcademicYear,
        questionType: examQuestions.questionType,
        excerpt: sql<string>`left(${examQuestions.questionText}, 140)`,
        createdAt: examQuestions.createdAt,
      })
      .from(examQuestions)
      .innerJoin(courses, eq(examQuestions.courseId, courses.id))
      .where(eq(examQuestions.status, "pending"))
      .orderBy(asc(examQuestions.createdAt)),
    db
      .select({
        id: examQuestionReports.id,
        questionId: examQuestions.id,
        reason: examQuestionReports.reason,
        details: examQuestionReports.details,
        excerpt: sql<string>`left(${examQuestions.questionText}, 140)`,
        createdAt: examQuestionReports.createdAt,
      })
      .from(examQuestionReports)
      .innerJoin(examQuestions, eq(examQuestionReports.questionId, examQuestions.id))
      .where(eq(examQuestionReports.status, "open"))
      .orderBy(asc(examQuestionReports.createdAt)),
  ]);
  return { pending, reports };
}

/** What the download route needs, or null when the viewer may not see this image. */
export async function getQuestionImageDownload(db: Database, viewer: Viewer, imageId: string) {
  if (!z.uuid().safeParse(imageId).success) return null;
  const [row] = await db
    .select({ image: examQuestionImages, status: examQuestions.status, contributedBy: examQuestions.contributedBy })
    .from(examQuestionImages)
    .innerJoin(examQuestions, eq(examQuestionImages.questionId, examQuestions.id))
    .where(eq(examQuestionImages.id, imageId));
  if (!row || !canSeeQuestion(viewer, row)) return null;
  if (row.image.removedAt && !isModerator(viewer)) return null;
  const { storageKey, fileName, mimeType, sizeBytes } = row.image;
  return { storageKey, fileName, mimeType, sizeBytes };
}
