export const locales = ["fr", "en"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "fr";
export const LOCALE_COOKIE = "DENTOS_LOCALE";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}

/** Saved choice first, then the browser's preferred language, then French. */
export function resolveLocale(cookieValue: string | undefined, acceptLanguage: string | null): Locale {
  if (isLocale(cookieValue)) return cookieValue;
  for (const part of (acceptLanguage ?? "").split(",")) {
    const lang = part.split(";")[0]?.trim().slice(0, 2).toLowerCase();
    if (isLocale(lang)) return lang;
  }
  return defaultLocale;
}

/** Picks the field for the active language, falling back to French (the source language). */
export function localized(locale: Locale, fr: string, en: string | null | undefined): string {
  return locale === "en" && en ? en : fr;
}
