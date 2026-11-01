// Every account text exists in French and English, every literal key used by the profile screens has a message, and no
// new copy uses an em dash.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";
import { ACCOUNT_ERROR_CODES, accountErrorKey } from "@/server/account/errors";

const lookup = (messages: unknown, key: string) =>
  key.split(".").reduce<unknown>((node, part) => (node && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined), messages);

const FILES = [
  "src/components/profile-forms.tsx",
  "src/components/legal-ui.tsx",
  "src/app/(app)/profile/page.tsx",
  "src/app/(app)/profile/delete/page.tsx",
  "src/app/(auth)/account-deleted/page.tsx",
];

describe("account messages", () => {
  it("has a French and an English message for every error code", () => {
    for (const code of ACCOUNT_ERROR_CODES) {
      expect(typeof lookup(fr, accountErrorKey(code)), `fr ${code}`).toBe("string");
      expect(typeof lookup(en, accountErrorKey(code)), `en ${code}`).toBe("string");
    }
  });

  it("has messages for every literal account.*, settings.* and legal.* key used by the profile screens", () => {
    const missing: string[] = [];
    for (const file of FILES) {
      const text = readFileSync(file, "utf8");
      for (const match of text.matchAll(/["'`]((?:account|legal|settings|nav|common)\.[A-Za-z0-9_.]+)["'`]/g)) {
        const key = match[1]!;
        if (lookup(fr, key) === undefined) missing.push(`fr:${key} (${file})`);
        if (lookup(en, key) === undefined) missing.push(`en:${key} (${file})`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("uses no em dashes in the new texts", () => {
    for (const [name, messages] of [["fr", fr], ["en", en]] as const) {
      const text = JSON.stringify({ account: messages.account, draft: messages.legal.draftBanner, contact: messages.legal.contactPlaceholder, extra: messages.legal.privacyExtra });
      expect(text.includes("—"), name).toBe(false);
    }
  });

  it("marks the legal pages as drafts and the contact as to be filled in", () => {
    expect(en.legal.draftBanner).toMatch(/DRAFT/);
    expect(fr.legal.draftBanner).toMatch(/PROVISOIRE/);
    expect(en.legal.contactPlaceholder).toMatch(/TO FILL IN/);
    expect(fr.legal.contactPlaceholder).toMatch(/À COMPLÉTER/);
    for (const file of ["src/app/(legal)/privacy/page.tsx", "src/app/(legal)/terms/page.tsx"]) {
      const text = readFileSync(file, "utf8");
      expect(text).toContain("<LegalDraftBanner />");
      expect(text).toContain("<LegalContact />");
    }
  });

  it("links to privacy and terms from the auth pages layout, the app footer and the profile page", () => {
    for (const file of ["src/app/(auth)/layout.tsx", "src/components/app-shell.tsx", "src/app/(app)/profile/page.tsx"]) {
      const text = readFileSync(file, "utf8");
      expect(text, file).toContain('href="/privacy"');
      expect(text, file).toContain('href="/terms"');
    }
  });
});
