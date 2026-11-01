// Every tutor text exists in French and English, with no em dash; every literal "tutor.*" key used in the source has a
// message; the ICU sentences format; and the page never words anything as an AI answer.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";
import { TUTOR_ERROR_CODES, tutorErrorKey } from "@/server/tutor/errors";

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

describe("tutor messages", () => {
  it("has the same keys in French and English", () => {
    expect(leafKeys(fr.tutor).sort()).toEqual(leafKeys(en.tutor).sort());
  });

  it("has a French and an English message for every error code", () => {
    for (const code of TUTOR_ERROR_CODES) {
      const key = tutorErrorKey(code);
      expect(typeof lookup(fr, key), `fr ${key}`).toBe("string");
      expect(typeof lookup(en, key), `en ${key}`).toBe("string");
    }
  });

  it("has the navigation, admin and Study hub texts", () => {
    for (const key of ["nav.tutor", "nav.off", "admin.tutor", "admin.tutorHelp", "studyTools.hub.tutor.title", "studyTools.hub.tutor.body", "studyTools.hub.tutorLine"]) {
      expect(typeof lookup(fr, key), `fr ${key}`).toBe("string");
      expect(typeof lookup(en, key), `en ${key}`).toBe("string");
    }
  });

  it("has a message for every literal tutor.* key and every key used through a tutor translator", () => {
    const missing: string[] = [];
    for (const file of sourceFiles("src")) {
      const text = readFileSync(file, "utf8");
      for (const match of text.matchAll(/["'`](tutor\.[A-Za-z0-9_.]+)["'`]/g)) {
        if (match[1]!.startsWith("tutor.settings.")) continue; // the audit action name, not a message
        for (const [name, messages] of [["fr", fr], ["en", en]] as const) if (lookup(messages, match[1]!) === undefined) missing.push(`${name}:${match[1]} (${file})`);
      }
      const namespaces = new Map<string, string[]>();
      for (const decl of text.matchAll(/const (\w+) = (?:await )?(?:useTranslations|getTranslations)\("(tutor[A-Za-z0-9_.]*)"\)/g)) {
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

  it("uses no em dash and no emoji", () => {
    for (const messages of [fr, en]) {
      const text = JSON.stringify([messages.tutor, messages.nav.off, messages.admin.tutor, messages.admin.tutorHelp, messages.studyTools.hub.tutor, messages.studyTools.hub.tutorLine]);
      expect(text).not.toContain("—");
      expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });

  it("states in both languages that the tutor is off, needs a provider and a budget, and sends nothing anywhere", () => {
    expect(en.tutor.status.off.title).toMatch(/provider and a budget/);
    expect(en.tutor.status.off.body).toMatch(/no answers|generates no answers/);
    expect(en.tutor.status.off.body).toMatch(/Nothing you type/);
    expect(fr.tutor.status.off.title).toMatch(/fournisseur d'IA et un budget/);
    expect(fr.tutor.status.off.body).toMatch(/aucune réponse/);
    expect(fr.tutor.status.off.body).toMatch(/n'est envoyé ailleurs/);
    expect(en.tutor.search.description).toMatch(/not an AI answer/);
    expect(fr.tutor.search.description).toMatch(/pas d'une réponse d'IA/);
    expect(en.tutor.admin.warning).toMatch(/does nothing|changes no behaviour/);
  });

  it("formats the sentences with real values in both languages", () => {
    const en_ = createTranslator({ locale: "en", messages: en, namespace: "tutor" });
    const fr_ = createTranslator({ locale: "fr", messages: fr, namespace: "tutor" });
    expect(en_("results.count", { count: 0 })).toBe("No passage found");
    expect(en_("results.count", { count: 1 })).toBe("1 passage found");
    expect(fr_("results.count", { count: 3 })).toBe("3 passages trouvés");
    expect(en_("results.scope", { documents: 2, notes: 0, questions: 1 })).toBe("Searched 2 documents, none of your notes and 1 published exam question with a verified answer.");
    expect(fr_("results.scope", { documents: 0, notes: 1, questions: 0 })).toContain("aucun document");
    expect(en_("how.limits", { limit: 1, chars: 6000 })).toContain("1 question per student per day");
    expect(en_("results.historicalSkipped", { count: 2 })).toContain("2 sources from previous offerings were not searched");
    expect(fr_("results.historicalSkipped", { count: 1 })).toContain("l'inclure");
    expect(en_("offering.yearTerm", { year: "2025-2026", term: "Fall" })).toBe("2025-2026, Fall");
  });
});
