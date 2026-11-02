// Every rate limit in ONE place: how many attempts per window, per signed-in user. Keys are built with rateKey() so two
// features can never share a counter. Better Auth's own limits (sign-in, sign-up, verification email) live in
// src/server/auth/auth.ts because Better Auth applies them itself, per client IP.

/** Share of rate-limit calls that also delete expired rows (see cleanupExpiredRateLimits). */
export const CLEANUP_CHANCE = 0.02;

export type RateRule = { name: string; limit: number; windowSeconds: number };

/** Own-data JSON export (/profile/export). */
export const RATE_ACCOUNT_EXPORT: RateRule = { name: "export", limit: 5, windowSeconds: 60 * 60 };
/** Wrong-password or wrong-confirmation attempts on the account deletion form; every submission counts. */
export const RATE_ACCOUNT_DELETE: RateRule = { name: "delete", limit: 5, windowSeconds: 15 * 60 };
/** Library search page (/search): documents, notes, topics and questions in one request. */
export const RATE_SEARCH: RateRule = { name: "search", limit: 40, windowSeconds: 60 };
/** Tutor source search (/tutor with a course and a query): reads every source of the course. */
export const RATE_TUTOR_SEARCH: RateRule = { name: "tutor-search", limit: 20, windowSeconds: 60 };
/** Study exports (/api/study-export): CSV, TSV and Anki files. */
export const RATE_STUDY_EXPORT: RateRule = { name: "study-export", limit: 30, windowSeconds: 60 * 60 };
/** Calendar export (/api/calendar-export). */
export const RATE_CALENDAR_EXPORT: RateRule = { name: "calendar-export", limit: 30, windowSeconds: 60 * 60 };

/** The database key for one user under one rule. */
export function rateKey(rule: RateRule, userId: string): string {
  return `${rule.name}:${userId}`;
}

/** Calendar (.ics) imports: each one parses a file and writes rows. */
export const RATE_CALENDAR_IMPORT: RateRule = { name: "calendar-import", limit: 5, windowSeconds: 60 };

/** Questions sent to the tutor: a few per minute per student (the daily question, token and cost caps are separate). */
export const RATE_TUTOR_ASK: RateRule = { name: "tutor-ask", limit: 6, windowSeconds: 60 };
