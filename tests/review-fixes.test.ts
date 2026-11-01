// Regression tests for the review fixes that are about text, markup and source rules (database and service
// fixes have their own tests next to the feature they belong to).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createTranslator } from "next-intl";
import { describe, expect, it, vi } from "vitest";

// The form components import server actions, which import server-only modules; they are never run here.
vi.mock("server-only", () => ({}));
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

const root = join(__dirname, "..");
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}
const src = sourceFiles(join(root, "src"));
const read = (path: string) => readFileSync(path, "utf8");

describe("plural grammar in both languages", () => {
  // The namespaces are nested paths; the loose type keeps the test readable.
  const E = (ns: string) => createTranslator({ locale: "en", messages: en, namespace: ns as never }) as unknown as (key: string, values?: Record<string, unknown>) => string;
  const F = (ns: string) => createTranslator({ locale: "fr", messages: fr, namespace: ns as never }) as unknown as (key: string, values?: Record<string, unknown>) => string;

  it("analytics sentences agree with the count", () => {
    expect(E("analytics")("accuracy.unscored", { count: 1 })).toBe("1 unscored answer, not counted");
    expect(E("analytics")("accuracy.unscored", { count: 3 })).toBe("3 unscored answers, not counted");
    expect(F("analytics")("accuracy.unscored", { count: 1 })).toBe("1 réponse non notée, non comptée");
    expect(F("analytics")("accuracy.unscored", { count: 4 })).toBe("4 réponses non notées, non comptées");
    expect(E("analytics")("quizzes.unscored", { count: 1 })).toBe("1 unscored question");
    expect(F("analytics")("quizzes.unscored", { count: 2 })).toBe("2 questions non notées");
    expect(E("analytics")("activity.summary", { active: 1, days: 30, answers: 1, reviews: 1 })).toBe(
      "1 of 30 days with at least one answer or card review (1 answer and 1 card review in all).",
    );
    expect(F("analytics")("activity.summary", { active: 2, days: 30, answers: 5, reviews: 0 })).toContain("2 jours sur 30");
    expect(F("analytics")("activity.summary", { active: 2, days: 30, answers: 5, reviews: 0 })).toContain("0 révision de carte");
  });

  it("study tools sentences agree with the count", () => {
    expect(E("studyTools.progress")("courseUnscored", { count: 1 })).toBe("1 answer not scored");
    expect(E("studyTools.progress")("courseUnscored", { count: 2 })).toBe("2 answers not scored");
    expect(F("studyTools.progress")("courseUnscored", { count: 1 })).toBe("1 réponse non notée");
    expect(F("studyTools.progress")("courseUnscored", { count: 5 })).toBe("5 réponses non notées");
    expect(E("studyTools.quizzes")("rowScore", { points: "1", scored: 1, unscored: 1 })).toBe("1 of 1 scored question, 1 question not scored");
    expect(F("studyTools.quizzes")("rowScore", { points: "2,5", scored: 3, unscored: 2 })).toBe("2,5 sur 3 questions notées, 2 questions non notées");
    expect(F("studyTools.quizzes")("rowNoScore", { unscored: 1 })).toBe("Pas de note (1 question non notée)");
  });
});

describe("download routes answer in the visitor's language", () => {
  const routes = ["src/app/(app)/profile/export/route.ts", "src/app/api/study-export/route.ts", "src/app/api/calendar-export/route.ts"];

  it("has no hard-coded English text body in any export route", () => {
    for (const route of routes) {
      const code = read(join(root, route));
      expect(code, route).not.toMatch(/new Response\(\s*["'`]/);
      expect(code, route).not.toMatch(/"(Too many|Unknown|Not found|Your data)/);
    }
  });

  it("has the apiErrors messages in French and English, used by the helper", () => {
    const keys = ["tooManyExports", "exportTooLarge", "notFound", "unknownExport", "unknownFormat"] as const;
    const helper = read(join(root, "src/server/api-errors.ts"));
    for (const key of keys) {
      expect(typeof en.apiErrors[key], `en ${key}`).toBe("string");
      expect(typeof fr.apiErrors[key], `fr ${key}`).toBe("string");
      expect(fr.apiErrors[key]).not.toBe(en.apiErrors[key]);
      expect(helper).toContain(`"${key}"`);
    }
  });
});

describe("course code from a URL segment", () => {
  it("decodes a valid segment and returns null (404) for malformed percent-encoding instead of throwing", async () => {
    const { courseCodeFromSegment } = await import("@/server/catalog/validation");
    expect(courseCodeFromSegment("dmd%201234")).toBe("DMD 1234");
    expect(courseCodeFromSegment("%")).toBeNull();
    expect(courseCodeFromSegment("%E0%A4%A")).toBeNull();
    expect(courseCodeFromSegment("%25")).toBe("%");
  });

  it("does not decode the ?course= search parameter a second time", () => {
    const page = read(join(root, "src/app/(app)/notes/new/page.tsx"));
    expect(page).not.toContain("decodeURIComponent");
  });

  it("no page or layout calls decodeURIComponent on a route segment without a guard", () => {
    for (const file of src.filter((f) => /\.tsx$/.test(f))) {
      expect(read(file), file).not.toContain("decodeURIComponent(");
    }
  });
});

describe("list pages past the end", () => {
  it("counts pages with a minimum of one", async () => {
    const { lastPageOf, PAGE_SIZE } = await import("@/server/passes/browse");
    expect(lastPageOf(0)).toBe(1);
    expect(lastPageOf(1)).toBe(1);
    expect(lastPageOf(PAGE_SIZE)).toBe(1);
    expect(lastPageOf(PAGE_SIZE + 1)).toBe(2);
    expect(lastPageOf(PAGE_SIZE * 4)).toBe(4);
  });

  it("sends a page beyond the last one to the last page (no dead 'previous' chain)", () => {
    const browser = read(join(root, "src/components/pass-browser.tsx"));
    expect(browser).toContain("if (params.page > lastPage) redirect(");
    expect(browser.indexOf("lastPageOf(result.total)")).toBeLessThan(browser.indexOf("params.page > lastPage"));
  });
});

describe("touch targets on phones", () => {
  it("has no bare 40 px control left outside the desktop sidebar", () => {
    // `h-10` / `min-h-10` must come with an `sm:` override ("h-11 sm:h-10") or the 44 px rule is broken on phones.
    for (const file of src.filter((f) => /\.tsx$/.test(f) && !f.endsWith("app-shell.tsx"))) {
      const bare = read(file).match(/(?<![:\w-])(?:min-)?h-10(?![\w-])/g);
      expect(bare, file).toBeNull();
    }
  });
});

describe("forms keep what was typed when the server reports an error", () => {
  it("uses the shared useKeepingForm hook everywhere; no form submits a useActionState action directly", () => {
    const hook = read(join(root, "src/components/use-keeping-form.ts"));
    expect(hook).toContain("event.preventDefault()");
    expect(hook).toContain("new FormData(event.currentTarget, submitter)");
    expect(hook).toContain("startTransition(() => formAction(data))");
    const components = src.filter((f) => f.includes(`${join("src", "components")}`) && f.endsWith(".tsx"));
    for (const file of components) {
      const code = read(file);
      // `useActionState` lives in the hook only: a component that calls it directly would hand the form to React's reset.
      expect(code, file).not.toContain("useActionState");
      expect(code, file).not.toMatch(/<form[^>]*\baction=\{action\}/);
    }
    for (const name of ["library-forms", "calendar-forms", "study-forms", "admin-forms", "resource-forms", "profile-forms", "tutor-forms", "pass-forms"]) {
      expect(read(join(root, "src/components", `${name}.tsx`)), name).toContain("useKeepingForm");
    }
  });

  it("renders the converted forms without a React form action (typed values are not reset after the action)", async () => {
    const { createElement } = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { NextIntlClientProvider } = await import("next-intl");
    const { CalendarEntryForm } = await import("@/components/calendar-forms");
    const { PersonalCardForm } = await import("@/components/study-forms");
    const { NoteForm } = await import("@/components/library-forms");
    const Provider = NextIntlClientProvider as unknown as import("react").ComponentType<{ locale: string; messages: object; timeZone: string; children?: import("react").ReactNode }>;
    const html = (node: import("react").ReactElement) => renderToStaticMarkup(createElement(Provider, { locale: "en", messages: en, timeZone: "UTC" }, node));
    const calendar = html(
      createElement(CalendarEntryForm, { courses: [], kinds: ["exam"], initial: { title: "TEST", date: "2026-12-10", time: null, courseId: null, kind: "exam", note: null }, cancelHref: "/calendar", maxEntries: 1000 }),
    );
    const card = html(createElement(PersonalCardForm, { courses: [], initial: undefined }));
    const note = html(createElement(NoteForm, { mode: "edit", noteId: "11111111-1111-4111-8111-111111111111", baseVersion: 1, title: "TEST", body: "x" }));
    for (const markup of [calendar, card, note]) {
      expect(markup).toContain("<form");
      expect(markup).not.toContain("javascript:throw");
    }
  });
});

describe("one definition of shared helpers and constants", () => {
  it("has a single escapeLike (library/like.ts) and a single app time zone constant", () => {
    const like = join("src", "server", "library", "like.ts");
    for (const file of src) {
      const code = read(file);
      if (!file.endsWith(like)) expect(code, file).not.toMatch(/(?:function|const)\s+escapeLike\b/);
      expect(code, file).not.toContain("ACADEMIC_TIME_ZONE");
      expect(code, file).not.toContain("WEEK_STARTS_ON");
    }
    const zones = src.filter((f) => /["']America\/Toronto["']/.test(read(f)));
    expect(zones.map((f) => f.replace(root, ""))).toEqual([join("/src", "server", "calendar", "constants.ts")]);
  });

  it("no longer exports the unused helpers and types that were removed", () => {
    const all = src.map(read).join("\n");
    for (const gone of [/export function TextLink\b/, /export type CardRating\b/, /export type TopicRow\b/, /export type NoteListItem\b/, /export type TutorErrorCode\b/]) {
      expect(all).not.toMatch(gone);
    }
  });

  it("explains in the manifest why its description is not translated", () => {
    expect(read(join(root, "src/app/manifest.ts"))).toContain("getTranslations cannot pick a language here");
  });
});

describe("new messages exist in both languages", () => {
  it("has the account administration errors, the quiz awaiting-rating row and the scoring-is-fixed sentence", () => {
    for (const messages of [en, fr]) {
      for (const key of ["lastAdmin", "tryAgain", "cannotChangeSelf", "notFound"] as const) {
        expect(typeof messages.admin.usersPage.errors[key], key).toBe("string");
      }
      expect(typeof messages.account.errors.tryAgain).toBe("string");
      expect(typeof messages.studyTools.quizzes.rowAwaiting).toBe("string");
      expect(typeof messages.analytics.definitions.fixed).toBe("string");
      expect(typeof messages.studyTools.practice.resultRegion).toBe("string");
      expect(typeof messages.studyTools.practice.questionRegion).toBe("string");
      expect(typeof messages.calendar.grid.cellSelected).toBe("string");
    }
    expect(en.analytics.definitions.fixed).toMatch(/not recalculated/);
    expect(fr.analytics.definitions.fixed).toMatch(/pas recalcul/);
  });
});
