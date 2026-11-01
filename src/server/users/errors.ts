// Error codes the account administration returns, and where their messages live (admin.usersPage.errors.*).
// Outside actions.ts because a "use server" file may only export async functions.
export const USER_ERROR_CODES = ["lastAdmin", "tryAgain", "cannotChangeSelf", "notFound", "singleAdmin"] as const;
