// Settings for the analytics page, in ONE place. (The time zone that decides which day an answer belongs to is
// CALENDAR_TIME_ZONE in src/server/calendar/constants.ts.)

/** Days shown in the activity chart, ending today. */
export const ANALYTICS_ACTIVITY_DAYS = 30;

/**
 * A topic is only ranked once it has at least this many answers scored against a verified answer. Below it the page says
 * "not enough data yet": a topic with 2 answers says nothing reliable about the student.
 */
export const WEAKEST_TOPIC_MIN_SAMPLE = 5;

/** Topics listed in the weakest-topics table. */
export const WEAKEST_TOPICS_LIMIT = 5;

/** Completed quizzes listed in the score history. */
export const ANALYTICS_QUIZ_HISTORY = 10;
