// File and history retention rules, in one place. These are SAFE DEFAULTS chosen without an owner rule (see
// docs/go-live-blockers.md). They are constants, not admin settings: changing one is a code change that goes through
// review, which is the right friction for anything that deletes data. Documented in docs/account-data.md.

/** A removed question image, or a removed document, keeps its stored file this many days after removal. */
export const RETENTION_GRACE_DAYS = 30;

/** Newest note versions kept per note. Older ones are deleted, oldest first. The current version is never deleted. */
export const NOTE_VERSIONS_MAX = 100;

/** Stored files with no database row are only reported when at least this old (a fresh upload may still be saving). */
export const ORPHAN_MIN_AGE_DAYS = 7;

/** Most items handled per category in one apply run. Run again to continue; every run is safe to repeat. */
export const RETENTION_BATCH_SIZE = 200;

/** Most stored files listed per prefix by the orphan report. Above this the report says it was cut short. */
export const ORPHAN_SCAN_MAX_FILES = 5000;

/** Storage prefixes the orphan report looks at. Anything outside them is never reported or deleted. */
export const ORPHAN_SCAN_PREFIXES = ["resources/", "questions/"] as const;

/** Most orphan keys echoed in a report (the keys are random ids, not personal data). */
export const ORPHAN_SAMPLE_SIZE = 20;

export const DAY_MS = 24 * 60 * 60 * 1000;
