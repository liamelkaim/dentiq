// Every error code the pass service and settings can return, the translation key each one shows, and which
// form field it belongs to. Lives outside actions.ts because a "use server" file may only export async
// functions. A test checks that every code has a French and an English message.

export const PASS_ERROR_CODES = [
  // service and validation
  "forbidden",
  "notFound",
  "typeNotEnabled",
  "unknownType",
  "futureExamYear",
  "invalidExamYear",
  "invalidOffering",
  "offeringYearMismatch",
  "invalidProfessor",
  "courseNotFound",
  "tooManyImages",
  "imageRequired",
  "imageNotFound",
  "fileMissing",
  "fileTooLarge",
  "fileType",
  "tooManyPending",
  "duplicateQuestion",
  "noteRequired",
  "noteTooShort",
  "choiceCount",
  "emptyChoice",
  "choiceTooLong",
  "answerCount",
  "answerIncomplete",
  "answerTextNotAllowed",
  "answerTooLong",
  "questionTextInvalid",
  "notVerifiable",
  "notVerified",
  "hasDuplicates",
  "canonicalIsDuplicate",
  "sameQuestion",
  "alreadyReported",
  // form-level
  "required",
  "rightsRequired",
  "invalid",
  // settings
  "noQuestionTypes",
  "unknownQuestionType",
  "invalidVerifierRole",
  "adminMustVerify",
  "outOfRange",
] as const;

export type PassErrorCode = (typeof PASS_ERROR_CODES)[number];

const known = new Set<string>(PASS_ERROR_CODES);

/** Translation key for an error code; an unexpected code falls back to the generic message. */
export function passErrorKey(code: string): string {
  return known.has(code) ? `passes.errors.${code}` : "errors.generic";
}

const fieldOf: Partial<Record<PassErrorCode, string>> = {
  duplicateQuestion: "questionText",
  questionTextInvalid: "questionText",
  typeNotEnabled: "questionType",
  unknownType: "questionType",
  invalidExamYear: "examAcademicYear",
  futureExamYear: "examAcademicYear",
  offeringYearMismatch: "examAcademicYear",
  invalidOffering: "offeringId",
  invalidProfessor: "professorId",
  choiceCount: "choices",
  emptyChoice: "choices",
  choiceTooLong: "choices",
  answerCount: "choices",
  answerIncomplete: "choices",
  answerTextNotAllowed: "choices",
  answerTooLong: "choices",
  tooManyImages: "images",
  imageRequired: "images",
  imageNotFound: "images",
  fileMissing: "images",
  fileTooLarge: "images",
  fileType: "images",
  noteRequired: "note",
  noteTooShort: "note",
  rightsRequired: "rightsConfirmed",
};

/** The form field an error should be shown next to, or undefined for a message at the top of the form. */
export function passErrorField(code: string): string | undefined {
  return known.has(code) ? fieldOf[code as PassErrorCode] : undefined;
}
