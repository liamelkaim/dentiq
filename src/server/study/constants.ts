// Limits for the study tools, in ONE place. Change a number here and every screen, action and export follows.

/** Questions per practice session: default and hard cap. */
export const PRACTICE_DEFAULT_COUNT = 10;
export const PRACTICE_MAX_QUESTIONS = 50;

/** Questions per quiz: default and hard cap (a requested number above the cap is lowered to it). */
export const QUIZ_DEFAULT_COUNT = 10;
export const QUIZ_MAX_QUESTIONS = 50;

/** One flashcard review session: at most this many cards, of which at most NEW_CARDS_PER_SESSION never-seen ones. */
export const REVIEW_SESSION_MAX = 30;
export const NEW_CARDS_PER_SESSION = 10;

/** Most personal cards one student may keep, and the longest text on a side of a card. */
export const PERSONAL_CARDS_MAX = 2000;
export const PERSONAL_CARD_TEXT_MAX = 4000;

/** Safety limits on how many published questions one scope can match, and how many rows one export holds. */
export const STUDY_POOL_MAX = 2000;
export const EXPORT_MAX_ROWS = 5000;

/** Rows shown in the progress lists (flagged, review later) and the quiz history. */
export const PROGRESS_LIST_LIMIT = 50;
export const QUIZ_HISTORY_LIMIT = 30;
