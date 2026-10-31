// THE one place that defines which kinds of exam question exist and how each one is validated.
//
// To add a type later: add one entry to QUESTION_TYPES below (and its labels in the translation files when
// screens exist). No database migration is needed: the stored type is plain text, and old questions keep
// working. To stop accepting a type for NEW questions, turn it off in the pass settings (settings.ts);
// existing questions of that type stay readable and editable. Never rename or delete a key that has been used:
// a retired key is described as "unknown/read-only" (describeQuestionType) rather than lost.
//
// Image-based questions: any type can carry images (e.g. a radiograph), so "image-based" is not a separate
// type here. A future type that REQUIRES an image would set `imageRequired: true`.

/** How the answer is expressed. */
export type AnswerRule =
  /** pick exactly one of the choices */
  | "single"
  /** pick one or more of the choices */
  | "multiple"
  /** each choice/statement is individually true or false (e.g. four-statement true/false) */
  | "perChoice"
  /** a written answer, no choices */
  | "text";

export type QuestionTypeDefinition = {
  readonly key: string;
  readonly answer: AnswerRule;
  readonly choices: { readonly min: number; readonly max: number };
  readonly imageRequired: boolean;
};

export const QUESTION_TYPES = {
  sc: { key: "sc", answer: "single", choices: { min: 2, max: 10 }, imageRequired: false },
  mc: { key: "mc", answer: "multiple", choices: { min: 2, max: 10 }, imageRequired: false },
  // Four statements, each true or false. (Matches the "KPRIM" format named in the master prompt; Anki
  // template compatibility is NOT verified.)
  kprim: { key: "kprim", answer: "perChoice", choices: { min: 4, max: 4 }, imageRequired: false },
  open: { key: "open", answer: "text", choices: { min: 0, max: 0 }, imageRequired: false },
} as const satisfies Record<string, QuestionTypeDefinition>;

export type KnownQuestionType = keyof typeof QUESTION_TYPES;
export const knownQuestionTypes = Object.keys(QUESTION_TYPES) as KnownQuestionType[];

export const MAX_QUESTION_TEXT = 4000;
export const MAX_CHOICE_TEXT = 1000;
export const MAX_ANSWER_TEXT = 4000;

export function getQuestionType(key: string): QuestionTypeDefinition | null {
  return Object.hasOwn(QUESTION_TYPES, key) ? QUESTION_TYPES[key as KnownQuestionType] : null;
}

/** Safe description for display, even for a type that was retired from the registry. */
export function describeQuestionType(key: string): QuestionTypeDefinition & { known: boolean } {
  const known = getQuestionType(key);
  if (known) return { ...known, known: true };
  // A stored type we no longer define: show it read-only as a generic choice question.
  return { key, answer: "multiple", choices: { min: 0, max: 10 }, imageRequired: false, known: false };
}

export type ChoiceDraft = { text: string; proposedCorrect?: boolean | null };

export type ShapeError =
  | "unknownType"
  | "choiceCount"
  | "emptyChoice"
  | "choiceTooLong"
  | "answerCount"
  | "answerIncomplete"
  | "answerTextNotAllowed"
  | "answerTooLong"
  | "questionTextInvalid";

export type Validation<E extends string = ShapeError> = { ok: true } | { ok: false; error: E };

const ok = { ok: true } as const;
const fail = <E extends string>(error: E) => ({ ok: false, error }) as const;

/**
 * Checks a question's wording, choices and the contributor's PROPOSED answer against its type.
 * (A proposal may be partial or empty: students often don't remember the answer.)
 */
export function validateQuestionShape(
  typeKey: string,
  questionText: string,
  choices: readonly ChoiceDraft[],
  proposedAnswerText?: string | null,
): Validation {
  const type = getQuestionType(typeKey);
  if (!type) return fail("unknownType");
  const text = questionText.trim();
  if (text.length === 0 || text.length > MAX_QUESTION_TEXT) return fail("questionTextInvalid");

  if (choices.length < type.choices.min || choices.length > type.choices.max) return fail("choiceCount");
  for (const choice of choices) {
    const t = choice.text.trim();
    if (t.length === 0) return fail("emptyChoice");
    if (t.length > MAX_CHOICE_TEXT) return fail("choiceTooLong");
  }

  const proposed = choices.map((c) => c.proposedCorrect ?? null);
  const trues = proposed.filter((p) => p === true).length;
  switch (type.answer) {
    case "single":
      if (trues > 1) return fail("answerCount");
      break;
    case "multiple":
      break;
    case "perChoice": {
      const given = proposed.filter((p) => p !== null).length;
      if (given !== 0 && given !== proposed.length) return fail("answerIncomplete");
      break;
    }
    case "text":
      if ((proposedAnswerText ?? "").length > MAX_ANSWER_TEXT) return fail("answerTooLong");
      return ok;
  }
  if (proposedAnswerText && proposedAnswerText.trim()) return fail("answerTextNotAllowed");
  return ok;
}

/**
 * Checks a moderator's VERIFIED answer: unlike a proposal it must be complete.
 * `verified[i]` is the verdict for choice i (same order as the question's choices).
 */
export function validateVerifiedAnswer(
  typeKey: string,
  choiceCount: number,
  verified: readonly boolean[] | undefined,
  verifiedAnswerText?: string | null,
): Validation {
  const type = getQuestionType(typeKey);
  if (!type) return fail("unknownType");

  if (type.answer === "text") {
    const t = (verifiedAnswerText ?? "").trim();
    if (t.length === 0) return fail("answerIncomplete");
    if (t.length > MAX_ANSWER_TEXT) return fail("answerTooLong");
    return ok;
  }
  if (verifiedAnswerText && verifiedAnswerText.trim()) return fail("answerTextNotAllowed");
  if (!verified || verified.length !== choiceCount) return fail("answerIncomplete");
  const trues = verified.filter(Boolean).length;
  if (type.answer === "single" && trues !== 1) return fail("answerCount");
  if (type.answer === "multiple" && trues < 1) return fail("answerCount");
  return ok; // perChoice: every statement already has a verdict
}
