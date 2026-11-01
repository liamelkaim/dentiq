import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDatabase, type Database } from "@/db/client";
import { account, user } from "@/db/schema";
import { createAuth, type Auth } from "@/server/auth/auth";
import type { EmailMessage } from "@/server/email";

const password = "correct-horse-battery";

let db: Database;
let auth: Auth;
let outbox: EmailMessage[];

beforeEach(async () => {
  db = await createTestDatabase();
  outbox = [];
  auth = createAuth(db, { nextjs: false, mailer: { send: async (m) => void outbox.push(m) } });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

async function signUp(email: string, extra: Record<string, unknown> = {}) {
  return auth.api.signUpEmail({ body: { name: "Test Student", email, password, ...extra } as never });
}

async function findUser(email: string) {
  const [row] = await db.select().from(user).where(eq(user.email, email));
  return row;
}

function verificationToken(message: EmailMessage | undefined): string {
  const url = message?.text.match(/https?:\/\/\S+/)?.[0];
  const token = url && new URL(url).searchParams.get("token");
  if (!token) throw new Error("no verification link in email");
  return token;
}

async function signUpAndVerify(email: string) {
  await signUp(email);
  await auth.api.verifyEmail({ query: { token: verificationToken(outbox.at(-1)) } });
}

describe("sign-up", () => {
  it("creates an unverified, pending student and sends a verification email", async () => {
    await signUp("ana@example.com");

    const created = await findUser("ana@example.com");
    expect(created).toMatchObject({ role: "student", approvalStatus: "pending", emailVerified: false });
    expect(outbox).toHaveLength(1);
    expect(outbox[0]?.to).toBe("ana@example.com");
  });

  it("stores a password hash, never the password", async () => {
    await signUp("hash@example.com");
    const created = await findUser("hash@example.com");
    const [credential] = await db.select().from(account).where(eq(account.userId, created!.id));
    expect(credential?.password).toBeTruthy();
    expect(credential?.password).not.toContain(password);
  });

  it("ignores or rejects attempts to self-assign role or approval", async () => {
    await signUp("sneaky@example.com", { role: "admin", approvalStatus: "approved" }).catch(() => null);
    const created = await findUser("sneaky@example.com");
    // Either the request was refused (no user) or the fields were ignored.
    expect(created?.role ?? "student").toBe("student");
    expect(created?.approvalStatus ?? "pending").toBe("pending");
  });

  it("rejects passwords shorter than 10 characters", async () => {
    await expect(
      auth.api.signUpEmail({ body: { name: "Short", email: "short@example.com", password: "123456789" } }),
    ).rejects.toThrow();
    expect(await findUser("short@example.com")).toBeUndefined();
  });

  it("enforces ALLOWED_EMAIL_DOMAINS when set", async () => {
    vi.stubEnv("ALLOWED_EMAIL_DOMAINS", "umontreal.ca");
    await expect(signUp("outsider@gmail.com")).rejects.toThrow();
    expect(await findUser("outsider@gmail.com")).toBeUndefined();

    await signUp("insider@umontreal.ca");
    expect(await findUser("insider@umontreal.ca")).toBeDefined();
  });

  it("makes ADMIN_EMAILS approved administrators", async () => {
    vi.stubEnv("ADMIN_EMAILS", "Owner@Example.com");
    await signUp("owner@example.com");
    expect(await findUser("owner@example.com")).toMatchObject({ role: "admin", approvalStatus: "approved" });
  });

  it("makes only the FIRST ADMIN_EMAILS address an administrator", async () => {
    vi.stubEnv("ADMIN_EMAILS", "owner@example.com, second@example.com");
    await signUp("second@example.com");
    expect(await findUser("second@example.com")).toMatchObject({ role: "student", approvalStatus: "pending" });
  });

  it("lets the administrator sign up from any domain while students need an allowed one", async () => {
    vi.stubEnv("ADMIN_EMAILS", "owner@gmail.example");
    vi.stubEnv("ALLOWED_EMAIL_DOMAINS", "umontreal.ca");
    await signUp("owner@gmail.example");
    expect(await findUser("owner@gmail.example")).toMatchObject({ role: "admin" });
    await expect(signUp("student@gmail.example")).rejects.toBeTruthy();
    await signUp("etudiant@umontreal.ca");
    expect(await findUser("etudiant@umontreal.ca")).toMatchObject({ role: "student", approvalStatus: "pending" });
  });
});

describe("sign-in", () => {
  it("is refused until the email is verified, then succeeds", async () => {
    await signUp("bea@example.com");

    await expect(auth.api.signInEmail({ body: { email: "bea@example.com", password } })).rejects.toThrow();

    await auth.api.verifyEmail({ query: { token: verificationToken(outbox[0]) } });
    expect(await findUser("bea@example.com")).toMatchObject({ emailVerified: true });

    const result = await auth.api.signInEmail({ body: { email: "bea@example.com", password } });
    expect(result.token).toBeTruthy();
  });

  it("rejects a wrong password", async () => {
    await signUpAndVerify("cam@example.com");
    await expect(
      auth.api.signInEmail({ body: { email: "cam@example.com", password: "wrong-password-123" } }),
    ).rejects.toThrow();
  });

  it("issues a session cookie that resolves to the user with role and approval status", async () => {
    await signUpAndVerify("dee@example.com");
    const { headers } = await auth.api.signInEmail({
      body: { email: "dee@example.com", password },
      returnHeaders: true,
    });
    const setCookie = headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(/HttpOnly/i);

    const sessionCookie = setCookie.split(";")[0]!;
    const session = await auth.api.getSession({ headers: new Headers({ cookie: sessionCookie }) });
    expect(session?.user).toMatchObject({
      email: "dee@example.com",
      role: "student",
      approvalStatus: "pending",
    });
  });

  it("returns no session for a forged cookie", async () => {
    const session = await auth.api.getSession({
      headers: new Headers({ cookie: "better-auth.session_token=forged.value" }),
    });
    expect(session).toBeNull();
  });
});
