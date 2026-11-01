// Turns browser form data into the plain objects the pass service validates. No database access and no rules
// of its own: every rule (how many choices, who may verify, ...) stays in question-types.ts, settings.ts and
// service.ts. Kept separate so the parsing can be tested without a browser.
//
// Form field names (shared with src/components/pass-forms.tsx):
//   choiceText            one per choice row, in order (blank rows are ignored)
//   correct               single / multiple choice: the index of each row marked correct
//   correct-<i>           four-statement questions: "true" | "false" | "" for row i
//   image<i>, imageAlt<i> up to MAX_IMAGE_SLOTS image slots with their alternative text
//   verified / verified-<i>  the moderator's verdicts, same shapes as correct / correct-<i>
import type { Role } from "@/db/schema";
import { getQuestionType, type AnswerRule } from "./question-types";
import type { ImageUpload, VerifiedAnswer } from "./service";
import type { PassSettingsPatch } from "./settings";

export const MAX_IMAGE_SLOTS = 10;

const text = (form: FormData, name: string): string | undefined => {
  const value = form.get(name);
  return typeof value === "string" ? value : undefined;
};

/**
 * Reads the answer marks for `count` rows. `null` means "not marked" (a student may not remember the answer).
 * Single and multiple choice: nothing selected = all unmarked; otherwise selected rows are true and the rest false.
 */
export function parseMarks(form: FormData, rule: AnswerRule, count: number, name: string): (boolean | null)[] {
  if (rule === "text" || count === 0) return [];
  if (rule === "perChoice") {
    return Array.from({ length: count }, (_, i) => {
      const value = text(form, `${name}-${i}`);
      return value === "true" ? true : value === "false" ? false : null;
    });
  }
  const selected = new Set(form.getAll(name).map(String));
  if (selected.size === 0) return Array.from({ length: count }, () => null);
  return Array.from({ length: count }, (_, i) => selected.has(String(i)));
}

export async function parseImages(form: FormData, field = "image"): Promise<ImageUpload[]> {
  const out: ImageUpload[] = [];
  for (let i = 0; i < MAX_IMAGE_SLOTS; i++) {
    const file = form.get(`${field}${i}`);
    if (!(file instanceof File) || file.size === 0) continue;
    out.push({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()), altText: text(form, `${field}Alt${i}`) ?? null });
  }
  return out;
}

/** True when any image slot holds a file bigger than `maxBytes` (checked before reading it into memory). */
export function hasOversizedImage(form: FormData, maxBytes: number, field = "image"): boolean {
  for (let i = 0; i < MAX_IMAGE_SLOTS; i++) {
    const file = form.get(`${field}${i}`);
    if (file instanceof File && file.size > maxBytes) return true;
  }
  return false;
}

/** Fields shared by the submission and edit forms, in the shape of questionInputSchema / questionEditSchema. */
export function parseQuestionFields(form: FormData) {
  const typeKey = (text(form, "questionType") ?? "").trim();
  const type = getQuestionType(typeKey);
  const rows = form.getAll("choiceText").map((v) => (typeof v === "string" ? v : ""));
  const marks = type ? parseMarks(form, type.answer, rows.length, "correct") : [];
  const choices: { text: string; proposedCorrect: boolean | null }[] = [];
  if (type && type.answer !== "text") {
    rows.forEach((row, i) => {
      if (row.trim() !== "") choices.push({ text: row, proposedCorrect: marks[i] ?? null });
    });
  }
  // An older exam year typed in the optional field wins over the list of recent years.
  const older = text(form, "examYearOlder")?.trim();
  return {
    offeringId: text(form, "offeringId"),
    professorId: text(form, "professorId"),
    examAcademicYear: older || text(form, "examAcademicYear"),
    examTerm: text(form, "examTerm"),
    topic: text(form, "topic"),
    questionType: typeKey,
    questionText: text(form, "questionText"),
    explanation: text(form, "explanation"),
    confidence: text(form, "confidence"),
    choices,
    proposedAnswerText: type?.answer === "text" ? text(form, "proposedAnswerText") : undefined,
  };
}

/** A new question: the shared fields plus the course, provenance and the rights confirmation. */
export function parseNewQuestion(form: FormData) {
  return {
    ...parseQuestionFields(form),
    courseId: text(form, "courseId"),
    provenance: text(form, "provenance") || undefined,
    rightsConfirmed: form.get("rightsConfirmed") === "on" ? true : undefined,
  };
}

/** The moderator's verified answer for a question with `choiceCount` choices of the given answer rule. */
export function parseVerifiedAnswer(form: FormData, rule: AnswerRule, choiceCount: number): VerifiedAnswer {
  if (rule === "text") return { text: text(form, "verifiedText") ?? "" };
  const marks = parseMarks(form, rule, choiceCount, "verified");
  // Every statement of a four-statement question needs a verdict; a missing one is left out so it reads as incomplete.
  if (rule === "perChoice" && marks.some((m) => m === null)) return {};
  return { choices: marks.map((m) => m === true) };
}

const wholeNumber = (value: string | undefined): number | undefined => {
  const trimmed = value?.trim();
  if (!trimmed || !/^\d+$/.test(trimmed)) return undefined;
  return Number(trimmed);
};

/** Admin settings form. Unreadable numbers are left out, so the existing value stays and validation speaks for the rest. */
export function parseSettingsForm(form: FormData): PassSettingsPatch & { invalidNumber?: boolean } {
  const noteLength = wholeNumber(text(form, "minNoteLength"));
  const perQuestion = wholeNumber(text(form, "maxImages"));
  const megabytes = wholeNumber(text(form, "maxImageMB"));
  const pending = wholeNumber(text(form, "maxPending"));
  const invalidNumber = [noteLength, perQuestion, megabytes, pending].some((n) => n === undefined);
  return {
    enabledQuestionTypes: form.getAll("questionTypes").map(String),
    verification: {
      allowedRoles: form.getAll("verifierRoles").map(String) as Role[],
      requireNote: form.get("requireNote") === "on",
      ...(noteLength !== undefined && { minNoteLength: noteLength }),
    },
    images: {
      ...(perQuestion !== undefined && { maxPerQuestion: perQuestion }),
      ...(megabytes !== undefined && { maxBytes: megabytes * 1024 * 1024 }),
    },
    limits: pending !== undefined ? { maxPendingPerUser: pending } : {},
    invalidNumber,
  };
}
