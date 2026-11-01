// Error codes the library services can return and the translation key each one shows. Lives outside actions.ts
// because a "use server" file may only export async functions. A test checks every code has FR and EN text.
export const LIBRARY_ERROR_CODES = [
  "forbidden",
  "notFound",
  "invalidOffering",
  "tooManyNotes",
  "invalidTopics",
  "invalidQuestion",
  "tooManyLinks",
  "versionConflict",
  "noChange",
  "duplicateTopic",
  "tooManyTopics",
  "required",
  "invalid",
  "tooLong",
  "tooMany",
] as const;

export const libraryErrorKey = (code: string) => `library.errors.${(LIBRARY_ERROR_CODES as readonly string[]).includes(code) ? code : "invalid"}`;

/** Form field a code belongs to (so the message appears next to it), when there is one. */
export function libraryErrorField(code: string): string | null {
  if (code === "duplicateTopic") return "name";
  if (code === "invalidOffering") return "offeringId";
  return null;
}
