# Study calendar and analytics

Status: **built and covered by automated tests (`tests/calendar.test.ts`, `tests/analytics.test.ts`, `tests/calendar-messages.test.ts`); not yet checked in a browser, not committed, not deployed.**
Migration: `drizzle/0007_study_calendar.sql` (additive: one new table, nothing existing changed).
Everything is private to the signed-in student, local only (no network call, no external calendar service) and approved members only (same rule as the study tools).

## Study calendar (`/calendar`)

The student writes their own entries. **Dentiq never creates, imports or guesses an entry**, especially not exam dates: a new account has an empty calendar and the page says so.

| Field | Rule |
| --- | --- |
| Title | Required, at most `CALENDAR_TITLE_MAX` (120) characters |
| Date | Required, a real calendar date `YYYY-MM-DD` (29 February only in leap years), year between `CALENDAR_YEAR_MIN` (2000) and `CALENDAR_YEAR_MAX` (2100) |
| Time | Optional `HH:MM` (24 h). Empty means all day |
| Course | Optional, must exist in the catalog |
| Kind | `exam`, `assignment`, `study_session` or `other` |
| Note | Optional, at most `CALENDAR_NOTE_MAX` (1000) characters |

Limit: `CALENDAR_ENTRIES_PER_USER_MAX` (1000) entries per student. Constants live in `src/server/calendar/constants.ts`.

- **Privacy.** Table `study_calendar_entries` has `user_id`; every query filters on the viewer. Another student, a moderator or an administrator cannot read, edit or delete an entry; looking one up by id behaves like "not found" (tested). Deleting an account deletes its entries.
- **Validation twice.** The service (`src/server/calendar/service.ts`) checks everything, including the date range and the course, on every create and update; the database also refuses a malformed time, a blank title and an impossible date.
- **Views.** A month grid and an agenda list. Month and selected day come from the URL (`?month=YYYY-MM&day=YYYY-MM-DD&view=month|list`), so the page is server-rendered and every state is a link. On phones the list is the default (the grid is hidden under the `sm` breakpoint unless `view=month`); `view=list` hides the grid everywhere. The grid is a real table: Monday first, each day a link with a full text label (date, number of entries, "today"), visible focus, 44 px targets on phones. Today is a filled circle plus the word "today" in the label; entry counts are numbers, not colours.
- **Dates and "today".** Dates are formatted with `Intl` in the user's language. There is no per-user time zone setting yet, so "today" and the day an answer belongs to use one zone for everyone, `CALENDAR_TIME_ZONE` (`America/Toronto`, chosen because the app targets Quebec universities; change it in the constants file).
- **Days until.** Shown only for entries the student created, only when the date is today or later ("Today", "In 3 days"). Past entries show nothing.
- **Dashboard.** The home page lists the next `UPCOMING_LIMIT` (5) entries only when there is at least one; otherwise nothing is rendered (no placeholder).
- **`.ics` export** (`/api/calendar-export`, a download button on the calendar page, labelled as a local file export). Pure text generation (`src/server/calendar/ics.ts`): no-time entries are all-day events; timed entries use floating local time (no time zone is claimed because the student never gave one); text is escaped (backslash, semicolon, comma, line breaks), control characters are removed so a title cannot add iCalendar properties, lines are folded at 75 octets and end with CRLF. **Not verified in Apple Calendar, Google Calendar or Outlook.**

## Analytics (`/analytics`)

Built **only** from the signed-in student's rows. There is no cross-student data, no benchmark, no "you are above average", no streak counter and no estimate or prediction. The page repeats what each number counts in a "What each number counts" section. Code: `src/server/analytics/{service,aggregate,constants}.ts`.

| Metric | Exactly what it counts | Denominator shown |
| --- | --- | --- |
| Activity, last 30 days (`ANALYTICS_ACTIVITY_DAYS`) | Per calendar day (in `CALENDAR_TIME_ZONE`): rows of `study_attempts` (answers in practice or quizzes) on questions that are still published, and rows of `study_card_reviews` (flashcard reviews). Days with nothing are shown as zero. Drawn as grouped bars (answers, then card reviews, side by side) in plain SVG using design tokens, with a text table in a "Show the numbers as a table" disclosure | "N of 30 days with at least one answer or card review", plus totals |
| Accuracy on verified answers (overall and per course) | Answers with outcome `correct`, `partial` or `incorrect`, which the database only allows against a **verified** answer. Accuracy = (correct + 0.5 x partial) / scored answers (`PARTIAL_CREDIT`, same as quiz scores). Answers on questions without a verified answer are **unscored**: listed with their count, never counted as right or wrong. With nothing scored the page says "Nothing scored yet", never 0% | "X points out of N scored answers", recorded answers on M different questions, K unscored |
| Questions answered | Different published questions answered at least once | "of P published questions you can study" |
| Flashcards due now | Started cards (from published questions, plus your own) whose scheduled review time has passed; new cards (never reviewed) are counted apart. Same rule as the flashcard screen | "D of S started cards", "F of T cards in all" |
| Flagged / marked for later | Your marks on published questions | "of P published questions you can study" |
| Weakest topics | Scored answers grouped by topic: the course topics linked to the question (`question_topics`), else the free-text topic typed on the question. An answer counts once in each topic its question has. **A topic is only ranked once it has at least `WEAKEST_TOPIC_MIN_SAMPLE` (5) scored answers.** Only topics under 100% are listed, lowest first, at most `WEAKEST_TOPICS_LIMIT` (5). Below the minimum the page says "Not enough data yet" and how many topics have some answers but fewer than 5. Scored answers on questions with no topic at all are counted in a note | Scored answers per topic |
| Quiz scores | Completed quizzes, latest `ANALYTICS_QUIZ_HISTORY` (10), score = points over items scored against a verified answer (the quiz screen's own `scoreQuiz`). "No score" when nothing was scored | "P of S points (X%)", unscored count |
| Calendar | Entries you created: how many are upcoming out of the total, the next entry, the next exam you added | "U upcoming of N entries" |

Honest empty state: when there is no activity, no mark, no card, no quiz and no calendar entry, the page shows only an explanation and a link to practice.

## Navigation

- Desktop sidebar: live links "Calendar" and "Analytics"; "Analytics soon" was removed. "AI Tutor" and "Recordings" stay as soon.
- Phones: the tab bar stays at five items. Calendar and Analytics are tiles in the Study hub (`/practice`), the same pattern as the rest of the study tools. The dashboard's old "Study progress / coming soon" card now links to Analytics.

## Not built / planned

- Browser-level testing (not done), a per-user time zone, recurring entries, reminders or notifications (no email provider yet), drag and drop, week view.
- Subscribing to the calendar from another app (a private feed URL) and importing an `.ics` file. Writing to Google or Apple calendars was deliberately not built (no external calendar APIs).
- Study plans suggested by Dentiq. Anything that guesses dates or tells the student what to study is out of scope until the owner decides how it should work.
- Per-topic charts over time, per-question statistics, time spent studying (no timing data is recorded).
- Accuracy over a chosen date range; the accuracy figures are all-time.
