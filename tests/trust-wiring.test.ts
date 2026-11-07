// Legal and trust wiring: upload notices on every upload form, French never falling back to English on the new pages,
// the cookies page matching what the code really does, the AI consent proof, and the privacy contact rule.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase, type Database } from "@/db/client";
import { user } from "@/db/schema";
import { LOCALE_COOKIE } from "@/i18n/config";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";
import { acceptTutorConsent, getTutorConsent, hasTutorConsent, TUTOR_CONSENT_VERSION } from "@/server/tutor/consent";

const root = process.cwd();
const read = (...p: string[]) => readFileSync(join(root, ...p), "utf8");

function leaves(value: unknown, path = ""): [string, string][] {
  if (typeof value === "string") return [[path, value]];
  if (Array.isArray(value)) return value.flatMap((v, i) => leaves(v, `${path}[${i}]`));
  if (value && typeof value === "object") return Object.entries(value).flatMap(([k, v]) => leaves(v, path ? `${path}.${k}` : k));
  return [];
}
const get = (obj: unknown, path: string) => path.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], obj);

describe("upload notice", () => {
  it.each(["resource-forms.tsx", "pass-forms.tsx", "recording-forms.tsx"])("%s shows it", (file) => {
    expect(read("src", "components", file)).toMatch(/<UploadNotice( reportable=\{false\})? \/>/);
  });
  it("says no patient information, permission to share and how to report, in both languages", () => {
    for (const m of [en, fr]) {
      const n = m.legal.uploadNotice;
      expect(n.noPatient.length).toBeGreaterThan(40);
      expect(n.permission.length).toBeGreaterThan(20);
      expect(n.report.length).toBeGreaterThan(20);
    }
    expect(en.legal.uploadNotice.noPatient).toMatch(/patient/i);
    expect(fr.legal.uploadNotice.noPatient).toMatch(/patient/i);
  });
});

describe("French never falls back to English", () => {
  const sections = ["legal.uploadNotice", "legal.cookies", "legal.accessibility", "legal.contactPage", "appeals", "settings.privacy", "tutor.consent"];
  const same = new Set(["Contact", "Note", "dentos-theme", "DENTOS_LOCALE"]);
  it.each(sections)("%s has the same keys as English and translated text", (section) => {
    const f = leaves(get(fr, section), section);
    const e = leaves(get(en, section), section);
    expect(f.map(([k]) => k)).toEqual(e.map(([k]) => k));
    for (const [i, [key, text]] of f.entries()) {
      expect(text.trim(), key).not.toBe("");
      if (text.length > 25 && !same.has(text)) expect(text, `${key} is identical to English`).not.toBe(e[i]![1]);
    }
  });
  it("the report reasons added for patient information and takedown exist in French", () => {
    for (const k of ["resources", "passes"] as const) {
      expect(fr[k].report.reasons.patient_info).toBeTruthy();
      expect(fr[k].report.reasons.takedown).not.toBe(en[k].report.reasons.takedown);
    }
  });
  it("loads only the visitor's language file", () => {
    const req = read("src", "i18n", "request.ts");
    expect(req).toContain("messages/${locale}.json");
    expect(req).not.toMatch(/en\.json/);
  });
});

describe("footer pages", () => {
  it.each(["privacy", "terms", "cookies", "accessibility", "contact"])("/%s exists and is linked from the footer", (page) => {
    expect(existsSync(join(root, "src", "app", "(legal)", page, "page.tsx"))).toBe(true);
    expect(read("src", "components", "site-footer.tsx")).toContain(`href="/${page}"`);
  });
});

describe("cookies page tells only what runs", () => {
  it("names the real cookie and storage keys", () => {
    const text = JSON.stringify(en.legal.cookies) + JSON.stringify(fr.legal.cookies);
    expect(text).toContain(LOCALE_COOKIE);
    expect(read("src", "components", "providers.tsx")).toContain("dentos-theme");
    expect(text).toContain("dentos-theme");
  });
  it("is true: no analytics or tracking library is installed and the policy blocks third parties", () => {
    const pkg = JSON.parse(read("package.json")) as { dependencies: Record<string, string>; devDependencies?: Record<string, string> };
    const names = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    expect(names.filter((n) => /analytics|gtag|segment|mixpanel|posthog|plausible|hotjar|sentry|datadog|fullstory|clarity|pixel/i.test(n))).toEqual([]);
    expect(read("src", "lib", "security-headers.ts")).toContain(`["connect-src", ["'self'"]]`);
  });
});

describe("privacy contact", () => {
  it("is shown in Settings only when configured", () => {
    const src = read("src", "app", "(app)", "settings", "privacy-section.tsx");
    expect(src).toContain("{contact && (");
    expect(src).not.toMatch(/example\.com|@umontreal/);
  });
});

describe("AI consent proof", () => {
  let db: Database;
  beforeEach(async () => {
    db = await createTestDatabase();
    await db.insert(user).values({ id: "u1", name: "U", email: "u1@example.com", emailVerified: true, approvalStatus: "approved" });
  });
  it("stores timestamp, language and wording version", async () => {
    expect(await getTutorConsent(db, "u1")).toBeNull();
    await acceptTutorConsent(db, "u1", "en");
    const c = await getTutorConsent(db, "u1");
    expect(c).toMatchObject({ version: TUTOR_CONSENT_VERSION, locale: "en" });
    expect(c!.acceptedAt).toBeInstanceOf(Date);
    await acceptTutorConsent(db, "u1", "de");
    expect((await getTutorConsent(db, "u1"))!.locale).toBe("fr");
    expect(await hasTutorConsent(db, "u1")).toBe(true);
  });
  it("lists what is sent, to whom, the error risk, no patient care and deleting history", () => {
    for (const m of [en, fr]) expect(Object.keys(m.tutor.consent.points)).toEqual(expect.arrayContaining(["what", "who", "wrong", "noClinical", "deleteHistory", "withdraw"]));
  });
});
