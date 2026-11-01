// Error codes the account services and actions return, and the translation key each one shows (account.errors.*).
// Lives outside actions.ts because a "use server" file may only export async functions.
export const ACCOUNT_ERROR_CODES = [
  "invalid",
  "nameRequired",
  "nameTooLong",
  "notFound",
  "confirmationMismatch",
  "wrongPassword",
  "lastAdmin",
  "tooManyAttempts",
  "tryAgain",
  "tooLarge",
  "tooManyExports",
] as const;

export const accountErrorKey = (code: string) =>
  `account.errors.${(ACCOUNT_ERROR_CODES as readonly string[]).includes(code) ? code : "invalid"}`;
