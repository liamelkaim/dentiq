"use server";

// Server actions for the profile page and account deletion. Each one checks who is asking (requireUser) and only ever
// touches the signed-in user's own account. Errors are CODES the screens translate (account.errors.*).
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { getAuth, requireUser } from "@/server/auth/session";
import { checkRate } from "@/server/rate-limit/guard";
import { RATE_ACCOUNT_DELETE } from "@/server/rate-limit/limits";
import { getStorage } from "@/server/storage";
import { deleteAccount } from "./delete";
import { updateDisplayName } from "./profile";

export type AccountFormState = {
  status: "idle" | "error" | "saved";
  /** Error code, translated under account.errors. */
  message?: string;
};

export async function updateNameAction(_prev: AccountFormState, form: FormData): Promise<AccountFormState> {
  const viewer = await requireUser();
  const raw = form.get("name");
  const result = await updateDisplayName(getDb(), viewer.id, typeof raw === "string" ? raw : "");
  if (!result.ok) return { status: "error", message: result.error };
  revalidatePath("/", "layout");
  return { status: "saved" };
}

export async function deleteAccountAction(_prev: AccountFormState, form: FormData): Promise<AccountFormState> {
  const viewer = await requireUser();
  const typed = form.get("confirmation");
  const password = form.get("password");
  if (typeof typed !== "string" || typeof password !== "string" || !password) return { status: "error", message: "invalid" };

  // Every submission counts, right or wrong, so the form cannot be used to guess the password.
  if (!(await checkRate(RATE_ACCOUNT_DELETE, viewer.id)).allowed) return { status: "error", message: "tooManyAttempts" };

  // Re-authentication: Better Auth checks the password against the stored hash for the current session. Its own
  // deleteUser endpoint stays disabled (tested) so nothing can skip the checks in deleteAccount().
  const auth = getAuth();
  try {
    await auth.api.verifyPassword({ body: { password }, headers: await headers() });
  } catch {
    return { status: "error", message: "wrongPassword" };
  }

  const result = await deleteAccount(getDb(), getStorage(), viewer.id, typed);
  if (!result.ok) return { status: "error", message: result.error };

  // The account and its sessions are gone; this clears the browser's session cookie.
  try {
    await auth.api.signOut({ headers: await headers() });
  } catch {
    // The session row no longer exists, so there is nothing left to revoke.
  }
  redirect("/account-deleted");
}
