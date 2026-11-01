// Error codes the tutor service can return and the translation key each one shows (tutor.errors.*). Lives outside
// actions.ts because a "use server" file may only export async functions. A test checks every code has FR and EN text.
export const TUTOR_ERROR_CODES = [
  "noAccess",
  "off",
  "noProvider",
  "questionRequired",
  "questionTooLong",
  "courseNotFound",
  "dailyLimit",
  "providerFailed",
  "badCitations",
  "outOfRange",
  "forbidden",
  "invalid",
] as const;
export type TutorErrorCode = (typeof TUTOR_ERROR_CODES)[number];

export const tutorErrorKey = (code: string) => `tutor.errors.${(TUTOR_ERROR_CODES as readonly string[]).includes(code) ? code : "invalid"}`;
