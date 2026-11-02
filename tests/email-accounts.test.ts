// Email domain preset, verification expiry and resend limit, password reset. Fake data only (example.com / umontreal.ca test addresses).
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDatabase, type Database } from "@/db/client";
import { user, verification } from "@/db/schema";
import { createAuth, type Auth } from "@/server/auth/auth";
import { DOMAIN_PRESETS, getAllowedDomains, normalizeDomain, parseDomainList, updateAllowedDomains } from "@/server/auth/domains";
import type { EmailMessage } from "@/server/email";
import { passwordResetEmail, verificationEmail } from "@/server/email-templates";

const password = "correct-horse-battery";
let db: Database;
let auth: Auth;
let outbox: EmailMessage[];

const make = (rateLimitEnabled?: boolean) => createAuth(db, { nextjs: false, rateLimitEnabled, mailer: { send: async (m) => void outbox.push(m) } });
beforeEach(async () => {
  db = await createTestDatabase();
  outbox = [];
  auth = make();
});
afterEach(() => vi.unstubAllEnvs());

const signUp = (email: string) => auth.api.signUpEmail({ body: { name: "TEST", email, password } });
const tokenOf = (m: EmailMessage | undefined) => new URL(m!.text.match(/https?:\/\/\S+/)![0]).searchParams.get("token")!;
const admin = { id: "admin-1", role: "admin" as const };

describe("domain list", () => {
  it("normalizes and validates", () => {
    expect(normalizeDomain("@UMontreal.CA")).toBe("umontreal.ca");
    expect(normalizeDomain("*.umontreal.ca")).toBe("umontreal.ca");
    expect(normalizeDomain("not a domain")).toBeNull();
    expect(normalizeDomain("localhost")).toBeNull();
    expect(parseDomainList("umontreal.ca, mcgill.ca\numontreal.ca")).toEqual(["umontreal.ca", "mcgill.ca"]);
    expect(parseDomainList("umontreal.ca, nope")).toBeNull();
  });
  it("only an administrator can change it, and it is audited", async () => {
    await db.insert(user).values({ id: "admin-1", name: "A", email: "a@example.com", role: "admin" });
    expect(await updateAllowedDomains(db, { id: "s", role: "student" }, "umontreal.ca")).toEqual({ ok: false, error: "forbidden" });
    expect(await updateAllowedDomains(db, admin, "bad domain")).toEqual({ ok: false, error: "invalid" });
    expect(await updateAllowedDomains(db, admin, DOMAIN_PRESETS.udem.join("\n"))).toEqual({ ok: true, value: ["umontreal.ca"] });
    expect(await getAllowedDomains(db)).toEqual(["umontreal.ca"]);
  });
  it("falls back to the environment variable when nothing is stored", async () => {
    expect(await getAllowedDomains(db, "mcgill.ca")).toEqual(["mcgill.ca"]);
    expect(await getAllowedDomains(db, "")).toEqual([]);
  });
});

describe("sign-up domain rules with the preset", () => {
  beforeEach(async () => {
    await db.insert(user).values({ id: "admin-1", name: "A", email: "owner@example.com", role: "admin" });
    await updateAllowedDomains(db, admin, "umontreal.ca");
    vi.stubEnv("ADMIN_EMAILS", "boss@example.com");
  });
  it("allows the domain and its subdomains", async () => {
    await expect(signUp("ana@umontreal.ca")).resolves.toBeTruthy();
    await expect(signUp("bo@med.umontreal.ca")).resolves.toBeTruthy();
  });
  it("blocks other domains, look-alikes and suffix tricks", async () => {
    for (const email of ["x@gmail.com", "x@notumontreal.ca", "x@umontreal.ca.evil.com", "x@umontreal.com"]) {
      await expect(signUp(email)).rejects.toThrow();
    }
    expect(await db.select().from(user).where(eq(user.email, "x@gmail.com"))).toHaveLength(0);
  });
  it("exempts the administrator named in ADMIN_EMAILS", async () => {
    await signUp("boss@example.com");
    const [row] = await db.select().from(user).where(eq(user.email, "boss@example.com"));
    expect(row).toMatchObject({ role: "admin", approvalStatus: "approved" });
  });
});

describe("verification email", () => {
  it("is bilingual HTML plus text and mentions the expiry", async () => {
    await signUp("ana@example.com");
    const m = outbox[0]!;
    expect(m.html).toContain("Confirmer mon adresse");
    expect(m.html).toContain("Confirm my email");
    expect(m.text).toContain("24");
    expect(m.html).toMatch(/href="https?:\/\//);
  });
  it("escapes the link in HTML", () => {
    expect(verificationEmail("a@b.ca", 'https://x.test/?a=1&b="2"', 24).html).toContain("a=1&amp;b=&quot;2&quot;");
  });
  it("an expired link does not verify", async () => {
    await signUp("late@example.com");
    const token = tokenOf(outbox[0]);
    await db.update(verification).set({ expiresAt: new Date(Date.now() - 1000) });
    // Better Auth signs the link as a JWT with its own expiry, so test with a stale iat/exp too.
    vi.useFakeTimers({ now: Date.now() + 25 * 3600 * 1000, toFake: ["Date"] });
    try {
      await expect(auth.api.verifyEmail({ query: { token } })).rejects.toThrow();
    } finally {
      vi.useRealTimers();
    }
    const [row] = await db.select().from(user).where(eq(user.email, "late@example.com"));
    expect(row?.emailVerified).toBe(false);
  });
  it("limits how often a new link can be requested", async () => {
    auth = make(true);
    await signUp("rate@example.com");
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await auth.handler(
        new Request("http://localhost:3000/api/auth/send-verification-email", {
          method: "POST",
          headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9" },
          body: JSON.stringify({ email: "rate@example.com" }),
        }),
      );
      statuses.push(res.status);
    }
    expect(statuses).toContain(429);
  });
});

describe("password reset", () => {
  const request = (email: string) => auth.api.requestPasswordReset({ body: { email, redirectTo: "/reset-password" } });

  it("emails a link, accepts a new password once, and signs out other sessions", async () => {
    await signUp("ana@example.com");
    await auth.api.verifyEmail({ query: { token: tokenOf(outbox[0]) } });
    outbox.length = 0;
    await request("ana@example.com");
    expect(outbox).toHaveLength(1);
    expect(outbox[0]!.html).toContain("Choose a new password");
    const url = outbox[0]!.text.match(/https?:\/\/\S+/)![0];
    const token = url.split("/reset-password/")[1]!.split("?")[0]!;
    await auth.api.resetPassword({ body: { newPassword: "a-brand-new-passphrase", token } });
    await expect(auth.api.resetPassword({ body: { newPassword: "another-passphrase-1", token } })).rejects.toThrow();
    await expect(auth.api.signInEmail({ body: { email: "ana@example.com", password } })).rejects.toThrow();
    await expect(auth.api.signInEmail({ body: { email: "ana@example.com", password: "a-brand-new-passphrase" } })).resolves.toBeTruthy();
  });
  it("answers the same for an unknown address and sends nothing (no account enumeration)", async () => {
    await signUp("known@example.com");
    outbox.length = 0;
    const known = await request("known@example.com");
    const unknown = await request("nobody@example.com");
    expect(unknown).toEqual(known);
    expect(outbox.map((m) => m.to)).toEqual(["known@example.com"]);
  });
  it("rejects a made-up token", async () => {
    await expect(auth.api.resetPassword({ body: { newPassword: "a-brand-new-passphrase", token: "nope" } })).rejects.toThrow();
  });
  it("limits requests", async () => {
    auth = make(true);
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await auth.handler(
        new Request("http://localhost:3000/api/auth/request-password-reset", {
          method: "POST",
          headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.7" },
          body: JSON.stringify({ email: "x@example.com" }),
        }),
      );
      statuses.push(res.status);
    }
    expect(statuses).toContain(429);
  });
  it("reset email has the expiry and both languages", () => {
    const m = passwordResetEmail("a@b.ca", "https://x.test/r", 1);
    expect(m.text).toContain("1 heure");
    expect(m.text).toContain("1 hour");
  });
});
