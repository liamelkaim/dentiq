// Error codes the calendar service can return and the translation key each one shows. Lives outside actions.ts
// because a "use server" file may only export async functions. A test checks every code has FR and EN text.
export const CALENDAR_ERROR_CODES = [
  "noAccess",
  "notFound",
  "tooManyEntries",
  "courseNotFound",
  "invalid",
  "titleRequired",
  "titleTooLong",
  "noteTooLong",
  "invalidDate",
  "dateOutOfRange",
  "invalidTime",
] as const;

export const calendarErrorKey = (code: string) => `calendar.errors.${(CALENDAR_ERROR_CODES as readonly string[]).includes(code) ? code : "invalid"}`;

/** Form field a code belongs to (so the message appears next to it), when there is one. */
export function calendarErrorField(code: string): string | null {
  if (code === "titleRequired" || code === "titleTooLong") return "title";
  if (code === "invalidDate" || code === "dateOutOfRange") return "date";
  if (code === "invalidTime") return "time";
  if (code === "noteTooLong") return "note";
  if (code === "courseNotFound") return "courseId";
  return null;
}
