// Limits and settings for the profile, the data export and account deletion, in ONE place.

/** Display name: same maximum as the sign-up form. */
export const PROFILE_NAME_MAX = 120;

/**
 * Data export guards. The export is built in memory, so each table is capped, and the finished file is capped too.
 * If either cap is hit the export FAILS with a clear message (it is never silently cut short, which would hand the
 * student an incomplete copy that looks complete).
 */
export const EXPORT_MAX_ROWS_PER_TABLE = 50_000;
export const EXPORT_MAX_BYTES = 25 * 1024 * 1024;
/** How many exports one account may download per hour (in memory, per server instance). */
export const EXPORT_MAX_PER_HOUR = 5;

/** Bumped when the shape of the export file changes. */
export const EXPORT_SCHEMA_VERSION = 1;

/** Wrong-password or wrong-confirmation attempts allowed on the deletion form per window. */
export const DELETE_ATTEMPTS_MAX = 5;
export const DELETE_ATTEMPTS_WINDOW_MS = 15 * 60 * 1000;

/**
 * Deletion rule for contributions that other people may already rely on. Statuses listed here were never shared with
 * anyone else, so they are deleted with the account. Everything else a student contributed (published, hidden) is kept
 * and detached from the account (the author link becomes empty).
 */
export const DELETE_UNSHARED_RESOURCE_STATUSES = ["pending"] as const;
export const DELETE_UNSHARED_QUESTION_STATUSES = ["pending", "rejected"] as const;
