// Limits and settings for the study calendar and the analytics page, in ONE place. Change a number here and every
// screen, action and export follows.

/** Most entries one student may keep (anti-abuse; no real student gets near it). */
export const CALENDAR_ENTRIES_PER_USER_MAX = 1000;

export const CALENDAR_TITLE_MAX = 120;
export const CALENDAR_NOTE_MAX = 1000;

/** Years a calendar date may have (inclusive). Anything outside is rejected as a typo. */
export const CALENDAR_YEAR_MIN = 2000;
export const CALENDAR_YEAR_MAX = 2100;

/**
 * The time zone that decides what "today" is, and which day an answer belongs to. Dentiq has no per-user time zone
 * setting yet, so one zone is used for everyone (the app targets Quebec universities). Change it here.
 */
export const CALENDAR_TIME_ZONE = "America/Toronto";

/** How many upcoming entries the dashboard panel lists. */
export const UPCOMING_LIMIT = 5;

/** The calendar week starts on Monday. */
export const WEEK_STARTS_ON = "monday" as const;
