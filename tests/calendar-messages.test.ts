// Every calendar and analytics text exists in French and English, and every literal "calendar.*" or "analytics.*"
// key used in the source files has a message (next-intl's t() is not type-checked against the JSON).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";
import { CALENDAR_ERROR_CODES, calendarErrorKey } from "@/server/calendar/errors";

const lookup = (messages: unknown, key: string) =>
  key.split(".").reduce<unknown>((node, part) => (node && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined), messages);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

const leafKeys = (node: unknown, prefix = ""): string[] =>
  node && typeof node === "object" ? Object.entries(node).flatMap(([k, v]) => leafKeys(v, prefix ? `${prefix}.${k}` : k)) : [prefix];

describe("calendar and analytics messages", () => {
  it("has the same keys in French and English", () => {
    for (const ns of ["calendar", "analytics"] as const) {
      expect(leafKeys(fr[ns]).sort(), ns).toEqual(leafKeys(en[ns]).sort());
    }
  });

  it("has a French and an English message for every error code", () => {
    for (const code of CALENDAR_ERROR_CODES) {
      const key = calendarErrorKey(code);
      expect(typeof lookup(fr, key), `fr ${key}`).toBe("string");
      expect(typeof lookup(en, key), `en ${key}`).toBe("string");
    }
  });

  it("has a message for every entry kind and for the navigation, hub and dashboard texts", () => {
    for (const kind of ["exam", "assignment", "study_session", "other"]) {
      expect(typeof lookup(fr, `calendar.kinds.${kind}`)).toBe("string");
      expect(typeof lookup(en, `calendar.kinds.${kind}`)).toBe("string");
    }
    for (const key of ["nav.calendar", "nav.analytics", "studyTools.hub.calendar.title", "studyTools.hub.calendar.body", "studyTools.hub.analytics.title", "studyTools.hub.analytics.body", "studyTools.hub.calendarLine", "studyTools.hub.analyticsLine"]) {
      expect(typeof lookup(fr, key), `fr ${key}`).toBe("string");
      expect(typeof lookup(en, key), `en ${key}`).toBe("string");
    }
  });

  it("has messages for every literal calendar.* or analytics.* key used in the source", () => {
    const missing: string[] = [];
    for (const file of sourceFiles("src")) {
      const text = readFileSync(file, "utf8");
      for (const match of text.matchAll(/["'`]((?:calendar|analytics)\.[A-Za-z0-9_.]+)["'`]/g)) {
        const key = match[1]!;
        if (lookup(fr, key) === undefined) missing.push(`fr:${key} (${file})`);
        if (lookup(en, key) === undefined) missing.push(`en:${key} (${file})`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('has messages for keys used through useTranslations("calendar…") or getTranslations("analytics…")', () => {
    const missing: string[] = [];
    for (const file of sourceFiles("src")) {
      const text = readFileSync(file, "utf8");
      // A file can declare the same variable name for different namespaces: a key passes under any of them.
      const namespaces = new Map<string, string[]>();
      for (const decl of text.matchAll(/const (\w+) = (?:await )?(?:useTranslations|getTranslations)\("((?:calendar|analytics)[A-Za-z0-9_.]*)"\)/g)) {
        namespaces.set(decl[1]!, [...(namespaces.get(decl[1]!) ?? []), decl[2]!]);
      }
      for (const [variable, list] of namespaces) {
        for (const call of text.matchAll(new RegExp(`\\b${variable}\\("([A-Za-z0-9_.]+)"`, "g"))) {
          for (const [name, messages] of [["fr", fr], ["en", en]] as const) {
            if (!list.some((ns) => lookup(messages, `${ns}.${call[1]}`) !== undefined)) missing.push(`${name}:${list.join("|")}.${call[1]} (${file})`);
          }
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it("uses no em dash in the new texts", () => {
    for (const messages of [fr, en]) {
      expect(JSON.stringify(messages.calendar)).not.toContain("—");
      expect(JSON.stringify(messages.analytics)).not.toContain("—");
    }
  });

  it("formats the analytics sentences with real values in both languages (ICU plurals and numbers)", () => {
    const en_ = createTranslator({ locale: "en", messages: en, namespace: "analytics" });
    const fr_ = createTranslator({ locale: "fr", messages: fr, namespace: "analytics" });
    // The page passes numbers already formatted for the locale (format.number), so 7.5 becomes "7,5" in French.
    expect(en_("accuracy.points", { points: "7.5", scored: 10 })).toBe("Score 7.5 out of 10 scored answers");
    expect(en_("accuracy.points", { points: "1", scored: 1 })).toBe("Score 1 out of 1 scored answer");
    expect(fr_("accuracy.points", { points: "7,5", scored: 10 })).toBe("Score de 7,5 sur 10 réponses notées");
    expect(en_("accuracy.volume", { attempts: 1, questions: 1 })).toBe("1 recorded answer on 1 question");
    expect(en_("accuracy.volume", { attempts: 14, questions: 9 })).toBe("14 recorded answers on 9 different questions");
    expect(en_("activity.summary", { active: 3, days: 30, answers: 12, reviews: 4 })).toContain("3 of 30 days");
    expect(en_("topics.belowMinimum", { count: 1, min: 5 })).toBe("1 topic has some scored answers, but fewer than 5.");
    expect(fr_("topics.belowMinimum", { count: 2, min: 5 })).toBe("2 sujets ont quelques réponses notées, mais moins de 5.");
    expect(en_("yourDates.inDays", { days: 3 })).toBe("in 3 days");
    expect(en_("quizzes.line", { points: "7.5", scored: 9, percent: 83 })).toBe("7.5 of 9 points (83%)");
    expect(fr_("accuracy.percent", { percent: 83 })).toContain("83");
  });

  it("formats the calendar sentences in both languages", () => {
    const en_ = createTranslator({ locale: "en", messages: en, namespace: "calendar" });
    const fr_ = createTranslator({ locale: "fr", messages: fr, namespace: "calendar" });
    expect(en_("agenda.daysUntil", { days: 0 })).toBe("Today");
    expect(en_("agenda.daysUntil", { days: 1 })).toBe("In 1 day");
    expect(fr_("agenda.daysUntil", { days: 2 })).toBe("Dans 2 jours");
    expect(en_("grid.cell", { date: "Monday", count: 0 })).toBe("Monday: no entries");
    expect(fr_("grid.cell", { date: "lundi", count: 1 })).toBe("lundi : 1 entrée");
    expect(en_("form.dateHint", { min: 2000, max: 2100 })).toBe("Years 2000 to 2100.");
  });
});
