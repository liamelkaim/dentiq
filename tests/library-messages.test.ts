// Every library text exists in French and English, and every literal "library.…" or "search.…" key used in the
// source files has a message (next-intl's t() is not type-checked against the JSON).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";
import { LIBRARY_ERROR_CODES, libraryErrorKey } from "@/server/library/errors";

const lookup = (messages: unknown, key: string) =>
  key.split(".").reduce<unknown>((node, part) => (node && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined), messages);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe("library messages", () => {
  it("has a French and an English message for every error code", () => {
    for (const code of LIBRARY_ERROR_CODES) {
      const key = libraryErrorKey(code);
      expect(typeof lookup(fr, key), `fr ${key}`).toBe("string");
      expect(typeof lookup(en, key), `en ${key}`).toBe("string");
    }
  });

  it("has messages for every literal library.* key used in the source", () => {
    const missing: string[] = [];
    for (const file of sourceFiles("src")) {
      const text = readFileSync(file, "utf8");
      for (const match of text.matchAll(/["'`](library\.[A-Za-z0-9_.]+)["'`]/g)) {
        const key = match[1]!;
        if (lookup(fr, key) === undefined) missing.push(`fr:${key} (${file})`);
        if (lookup(en, key) === undefined) missing.push(`en:${key} (${file})`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("has messages for keys used through useTranslations(\"library…\") or getTranslations(\"search\")", () => {
    const missing: string[] = [];
    for (const file of sourceFiles("src")) {
      const text = readFileSync(file, "utf8");
      // A file can declare the same variable name for different namespaces (one per component):
      // a key passes when it exists under any namespace that variable was declared with.
      const namespaces = new Map<string, string[]>();
      for (const decl of text.matchAll(/const (\w+) = (?:await )?(?:useTranslations|getTranslations)\("((?:library|search)[A-Za-z0-9_.]*)"\)/g)) {
        namespaces.set(decl[1]!, [...(namespaces.get(decl[1]!) ?? []), decl[2]!]);
      }
      for (const decl of text.matchAll(/const (\w+) = (?:await )?(?:useTranslations|getTranslations)\(\)/g)) {
        if (namespaces.has(decl[1]!)) namespaces.get(decl[1]!)!.push("");
      }
      for (const [variable, list] of namespaces) {
        for (const call of text.matchAll(new RegExp(`\\b${variable}\\("([A-Za-z0-9_.]+)"`, "g"))) {
          for (const [name, messages] of [["fr", fr], ["en", en]] as const) {
            if (!list.some((ns) => lookup(messages, ns ? `${ns}.${call[1]}` : call[1]!) !== undefined)) missing.push(`${name}:${list.join("|")}.${call[1]} (${file})`);
          }
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it("uses no em dash in the new texts", () => {
    for (const messages of [fr, en]) {
      expect(JSON.stringify((messages as Record<string, unknown>).library)).not.toContain("—");
    }
  });
});
