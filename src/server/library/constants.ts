// Limits for notes, topics, links and search. Change them here only.

/** Topics a course can have (active and archived together). */
export const TOPICS_PER_COURSE_MAX = 200;
export const TOPIC_NAME_MAX = 80;

export const NOTE_TITLE_MAX = 200;
export const NOTE_BODY_MAX = 50_000;
export const NOTE_CHANGE_NOTE_MAX = 300;
/** Per-student cap on notes (anti-abuse; no real student gets near it). */
export const NOTES_PER_USER_MAX = 500;

/** How many topics / exam questions one document or note can be linked to. */
export const TOPICS_PER_ITEM_MAX = 10;
export const QUESTION_LINKS_PER_ITEM_MAX = 20;
/** How many published questions the "link a question" picker offers (most recent first). */
export const QUESTION_PICKER_LIMIT = 100;

/** Rows shown per source on the search page (documents, notes, topics, questions each). */
export const SEARCH_RESULT_LIMIT = 10;
/** Longest search text used. */
export const SEARCH_QUERY_MAX = 100;
/** Characters of a note shown around the first match in search results. */
export const SNIPPET_LENGTH = 140;

/** Version rows shown on a note's history page. */
export const NOTE_HISTORY_LIMIT = 200;
/** The text comparison is skipped above this many lines on either side (it is quadratic). */
export const DIFF_MAX_LINES = 2000;

/** Rows per kind (documents, notes, questions) listed on a topic page. */
export const TOPIC_PAGE_LIMIT = 200;
