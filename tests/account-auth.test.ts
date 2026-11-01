// The re-authentication used by account deletion goes through the real Better Auth instance: the correct password
// passes, a wrong one is refused, and Better Auth's own delete endpoint stays disabled (so it cannot skip our checks).
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase, type Database } from "@/db/client";
import { user } from "@/db/schema";
import { createAuth, type Auth } from "@/server/auth/auth";
import { deleteAccount } from "@/server/account/delete";
import { createMemoryStorage } from "@/server/storage";

const password = "correct-horse-battery";
let db: Database;
let auth: Auth;

async function signedInHeaders(email: string): Promise<Headers> {
  await auth.api.signUpEmail({ body: { name: "Test Student", email, password } });
  await db.update(user).set({ emailVerified: true }).where(eq(user.email, email));
  const response = await auth.api.signInEmail({ body: { email, password }, asResponse: true });
  const cookie = response.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  return new Headers({ cookie });
}

beforeEach(async () => {
  db = await createTestDatabase();
  auth = createAuth(db, { nextjs: false, mailer: { send: async () => {} } });
});

describe("re-authentication for account deletion", () => {
  it("accepts the right password and refuses a wrong one", async () => {
    const headers = await signedInHeaders("reauth@example.com");
    await expect(auth.api.verifyPassword({ body: { password }, headers })).resolves.toMatchObject({ status: true });
    await expect(auth.api.verifyPassword({ body: { password: "not-the-password" }, headers })).rejects.toThrow();
  });

  it("keeps Better Auth's own delete-user endpoint disabled, so nothing can skip the checks in deleteAccount()", async () => {
    const headers = await signedInHeaders("http@example.com");
    const del = await auth.handler(
      new Request("http://localhost:3000/api/auth/delete-user", {
        method: "POST",
        headers: { ...Object.fromEntries(headers), "content-type": "application/json", origin: "http://localhost:3000" },
        body: JSON.stringify({ password }),
      }),
    );
    expect(del.status).toBe(404);
    expect(await db.$count(user, eq(user.email, "http@example.com"))).toBe(1);
  });

  it("deletes a real signed-up account and its sessions, so the old session no longer works", async () => {
    const headers = await signedInHeaders("gone@example.com");
    const [row] = await db.select({ id: user.id }).from(user).where(eq(user.email, "gone@example.com"));
    expect(await auth.api.getSession({ headers })).not.toBeNull();
    expect(await deleteAccount(db, createMemoryStorage(), row!.id, "gone@example.com")).toMatchObject({ ok: true });
    expect(await auth.api.getSession({ headers })).toBeNull();
    expect(await db.$count(user, eq(user.email, "gone@example.com"))).toBe(0);
  });
});
