"use client";

import { useEffect, useState } from "react";
import { common as enCommon, errors as enErrors } from "@/messages/en.json";
import { common as frCommon, errors as frErrors } from "@/messages/fr.json";
import { LOCALE_COOKIE, resolveLocale, type Locale } from "@/i18n/config";
import "./globals.css";

const TEXT = {
  fr: { title: frErrors.errorTitle, body: frErrors.errorBody, retry: frCommon.retry, home: frErrors.goHome, reference: frErrors.reference },
  en: { title: enErrors.errorTitle, body: enErrors.errorBody, retry: enCommon.retry, home: enErrors.goHome, reference: enErrors.reference },
} as const;

function readLocale(): Locale {
  const saved = document.cookie
    .split("; ")
    .find((part) => part.startsWith(`${LOCALE_COOKIE}=`))
    ?.slice(LOCALE_COOKIE.length + 1);
  return resolveLocale(saved, navigator.language);
}

/**
 * Last-resort boundary: it replaces the root layout, so there is no translation provider, no theme provider and no app
 * shell. It reads the saved language and theme itself, and it never prints the error message or a stack trace (only the
 * opaque digest, so someone can quote it when asking for help).
 */
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  const [locale, setLocale] = useState<Locale>("fr");
  const digest = error instanceof Error ? (error as Error & { digest?: string }).digest : undefined;

  useEffect(() => {
    console.error(error);
  }, [error]);

  useEffect(() => {
    // Synchronise with browser-only state (cookie, localStorage) once mounted.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocale(readLocale());
    try {
      const saved = localStorage.getItem("dentos-theme");
      const dark = saved === "dark" || ((saved === null || saved === "system") && matchMedia("(prefers-color-scheme: dark)").matches);
      document.documentElement.classList.toggle("dark", dark);
    } catch {
      // Storage can be blocked; the light theme is a fine fallback.
    }
  }, []);

  const text = TEXT[locale];
  return (
    <html lang={locale}>
      <body>
        <main className="flex min-h-dvh flex-col items-center justify-center px-6 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-center">
          <p className="mb-8 text-[19px] font-bold tracking-[-0.02em]">Dentiq</p>
          <div role="alert">
            <h1 className="text-[22px] font-semibold tracking-tight">{text.title}</h1>
            <p className="mt-1 text-[15px] text-text-muted">{text.body}</p>
            {digest && <p className="mt-2 text-[12px] text-text-subtle tabular-nums">{text.reference.replace("{code}", digest)}</p>}
          </div>
          <div className="mt-6 flex flex-col items-stretch gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => retry()}
              className="inline-flex h-11 items-center justify-center rounded-[var(--radius-control)] bg-accent-solid px-4 text-[14px] font-medium text-on-accent hover:bg-accent-solid-hover sm:h-10"
            >
              {text.retry}
            </button>
            {/* A plain link on purpose: the app router is not available in this boundary. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              className="inline-flex h-11 items-center justify-center rounded-[var(--radius-control)] border border-border-strong bg-surface px-4 text-[14px] font-medium text-text hover:bg-surface-hover sm:h-10"
            >
              {text.home}
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
