import { describe, expect, it } from "vitest";
import { localized, resolveLocale } from "@/i18n/config";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";
import { canContribute, hasRole, isBootstrapAdmin, isEmailDomainAllowed } from "@/server/auth/roles";
import { validateEnv } from "@/server/env";

function keys(obj: object, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === "object" ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

describe("translations", () => {
  it("French and English define exactly the same keys", () => {
    expect(keys(en).sort()).toEqual(keys(fr).sort());
  });

  it("has no empty strings", () => {
    const empty = (obj: object): string[] => keys(obj).filter((k) => k.split(".").reduce<any>((o, p) => o[p], obj) === ""); // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(empty(fr)).toEqual([]);
    expect(empty(en)).toEqual([]);
  });
});

describe("language selection", () => {
  it("prefers the saved choice, then the browser language, then French", () => {
    expect(resolveLocale("en", "fr-CA,fr;q=0.9")).toBe("en");
    expect(resolveLocale(undefined, "en-US,en;q=0.9")).toBe("en");
    expect(resolveLocale(undefined, "de-DE,fr;q=0.5")).toBe("fr");
    expect(resolveLocale("xx", null)).toBe("fr");
  });

  it("falls back to the French (original) text when no English version exists", () => {
    expect(localized("en", "Titre", "Title")).toBe("Title");
    expect(localized("en", "Titre", null)).toBe("Titre");
    expect(localized("fr", "Titre", "Title")).toBe("Titre");
  });
});

describe("permissions", () => {
  it("ranks roles student < moderator < admin", () => {
    expect(hasRole({ role: "admin" }, "moderator")).toBe(true);
    expect(hasRole({ role: "moderator" }, "admin")).toBe(false);
    expect(hasRole({ role: "student" }, "student")).toBe(true);
  });

  it("only lets verified, approved accounts contribute", () => {
    expect(canContribute({ role: "student", emailVerified: true, approvalStatus: "approved" })).toBe(true);
    expect(canContribute({ role: "admin", emailVerified: true, approvalStatus: "pending" })).toBe(false);
    expect(canContribute({ role: "student", emailVerified: false, approvalStatus: "approved" })).toBe(false);
  });

  it("matches allowed email domains exactly or as subdomains", () => {
    expect(isEmailDomainAllowed("a@gmail.com", "")).toBe(true);
    expect(isEmailDomainAllowed("a@umontreal.ca", "umontreal.ca")).toBe(true);
    expect(isEmailDomainAllowed("a@etud.umontreal.ca", "umontreal.ca")).toBe(true);
    expect(isEmailDomainAllowed("a@fakeumontreal.ca", "umontreal.ca")).toBe(false);
    expect(isEmailDomainAllowed("a@umontreal.ca.evil.com", "umontreal.ca")).toBe(false);
  });

  it("matches bootstrap admin emails case-insensitively", () => {
    expect(isBootstrapAdmin(" Owner@Example.com ", "owner@example.com, other@example.com")).toBe(true);
    expect(isBootstrapAdmin("someone@example.com", "owner@example.com")).toBe(false);
    expect(isBootstrapAdmin("owner@example.com", undefined)).toBe(false);
  });
});

describe("configuration", () => {
  const valid = { BETTER_AUTH_SECRET: "x".repeat(32), BETTER_AUTH_URL: "http://localhost:3000" };

  it("accepts a valid local configuration", () => {
    expect(validateEnv(valid).BETTER_AUTH_URL).toBe("http://localhost:3000");
  });

  it("rejects missing, short or placeholder secrets", () => {
    expect(() => validateEnv({ BETTER_AUTH_URL: valid.BETTER_AUTH_URL })).toThrow(/BETTER_AUTH_SECRET/);
    expect(() => validateEnv({ ...valid, BETTER_AUTH_SECRET: "short" })).toThrow(/32 characters/);
    expect(() => validateEnv({ ...valid, BETTER_AUTH_SECRET: "replace-me" })).toThrow();
  });

  it("requires a real database in production unless the local database is explicitly allowed", () => {
    expect(() => validateEnv({ ...valid, NODE_ENV: "production" })).toThrow(/DATABASE_URL/);
    expect(() => validateEnv({ ...valid, NODE_ENV: "production", ALLOW_LOCAL_DATABASE: "true" })).not.toThrow();
    expect(() => validateEnv({ ...valid, NODE_ENV: "production", ALLOW_LOCAL_DATABASE: "yes" })).toThrow(/DATABASE_URL/);
    expect(() => validateEnv({ ...valid, DATABASE_URL: "mysql://x" })).toThrow(/postgres/);
  });
});
