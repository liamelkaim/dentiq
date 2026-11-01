# Study tools (Phase 4, first version)

Status: **built and covered by automated tests; not yet checked in a browser, not committed, not deployed.**
Everything below is private to the signed-in student unless it says otherwise.

## What exists

| Tool | Address | What it does |
| --- | --- | --- |
| Study hub | `/practice` | One entry per tool, each with a real number (never an invented one). A course can be preselected with `?course=`. The course page has a "Study" tab pointing here. Main nav entry "Study" (phones: fifth tab for students; moderators and admins already have five tabs, so theirs is an icon in the phone header) |
| Practice | `/practice/questions` | Pick a course (required) and optional exam year, question type, topic, current/previous years, and "flagged" or "review later" only. Answer published questions one at a time; the answer appears after you check it |
| Flashcards | `/practice/flashcards` | Cards generated from published questions plus your own cards (create, edit, delete). Review session at `/practice/flashcards/review`: show answer, then Again / Hard / Good / Easy |
| Quizzes | `/practice/quizzes` | Build a quiz from a course, take it one question at a time with no feedback, then see the score, the answers and a history list |
| Progress | `/practice/progress` | Your own recorded answers by course, flagged and review-later lists, card and quiz activity. Honest empty state before any activity |
| Export | `/practice/export` (downloads from `/api/study-export`) | CSV or TSV of questions, your own cards, your progress; Anki text file |

## The honesty rules (enforced in code, in the database and in tests)

1. **Only published questions.** The study tools read exam questions in one place, `src/server/study/questions.ts`. It reuses the exam-pass rules: the candidate list comes from `listQuestions(..., { publishedOnly: true })`, every loaded row is checked again with `canSeeQuestion` and must have status `published`. Pending, rejected and hidden questions never reach practice, a quiz, a flashcard or an export, not even for the person who wrote them or for a moderator. Accounts that are not approved get nothing.
2. **Scored only against a verified answer.** `src/server/study/grading.ts`: an answer is "correct / partial / incorrect" only when the question has a complete, verified answer. Against a student's proposal, or when there is no answer, the attempt is recorded as **unscored** (even if the student "matches" the proposal). An inconsistent "verified" record is treated as not verified. The database also refuses a scored attempt whose answer basis is not "verified" (`study_attempts_scored_needs_verified`).
3. **Proposals are always labelled.** After answering, a verified answer is shown as "Verified answer"; a proposal is shown under "Proposed answer, not verified" with a warning; no answer says "No answer yet". The same labels appear on flashcard backs and in exports.
4. **No invented numbers.** Progress counts come from stored attempts only. A quiz with nothing scored shows "No score", never 0%. Questions that are later hidden disappear from progress counts and lists.
5. **Scored outcomes are fixed at the moment of answering.** The outcome (correct, partial, incorrect, unscored) is stored with the attempt when the student answers. It is **not re-scored** if the question is edited afterwards, if its verified answer is removed ("unverified"), or if a proposal is verified later: an old "unscored" answer stays unscored and an old "correct" stays correct. Decision recorded after review (finding S1): history is kept as the student experienced it; the analytics page says so in "What each number counts" (`analytics.definitions.fixed`).
6. **Private.** Every study table has a `user_id`, and every query filters on it (`src/server/study/service.ts`). A student cannot read, change, review or export another student's attempts, marks, cards, schedules or quizzes, and a moderator has no special access to them. Looking up someone else's card or quiz by id behaves like "not found". Tested in `tests/study-tools.test.ts`.

### How each question type is graded
| Type | Rule |
| --- | --- |
| Single choice (`sc`) | Correct when the chosen option is the verified one |
| Multiple choice (`mc`) | Correct when the chosen set equals the verified set exactly (no partial credit) |
| Four true/false (`kprim`) | Correct when all four True/False answers match (no partial credit) |
| Open answer (`open`) | Not auto-graded. You write (optional) or just reveal the answer, then rate yourself: Got it = correct, Partly = partial, Missed = incorrect. Self-rated against the verified answer; if the answer is only a proposal, your rating is recorded but **not scored** |

A new question type added to the registry in `src/server/passes/question-types.ts` is picked up by the scope pickers; its grading rule must be added to `grading.ts`.

### Quiz scoring
Score = correct + 0.5 x partly right, out of the items scored against a verified answer (`PARTIAL_CREDIT` in `grading.ts`). Unscored items are listed separately and never counted. Open questions wait for your self-rating on the results page (the verified answer is shown there). Nothing about the answers is shown while the quiz is being taken. The score is computed from the stored items, not stored itself. Outcomes are fixed when you answer: if a question is verified later, an old "unscored" result stays unscored.

## Flashcard schedule (Leitner boxes)

Pure function in `src/server/study/schedule.ts`, unit-tested. Six boxes, a card is due again after the interval of the box it lands in:

| Box | Due again after |
| --- | --- |
| 0 (learning, also where new cards start) | 10 minutes |
| 1 | 1 day |
| 2 | 3 days |
| 3 | 7 days |
| 4 | 14 days |
| 5 (top) | 30 days |

Rating from box *b*: **Again** goes to box 0 (a lapse when *b* is 1 or more); **Hard** stays in box 0 if there, otherwise goes one box back but never below 1; **Good** goes up one box; **Easy** goes up two boxes (capped at 5). A never-reviewed card is new and due immediately. A card rated Again returns at the end of the same session; its stored due time is 10 minutes. The intervals are fixed numbers chosen to be simple, **not tuned against research data**; change them in `INTERVAL_MINUTES`.

Cards generated from questions are never stored: they are built from the question each time (front = wording and lettered choices; back = verified answer or the labelled proposal, explanation, source line). Only the student's schedule for that question is stored (`study_question_cards`). Personal cards live in `study_personal_cards` with their own schedule.

## Export

Limited to what the student may see: published questions in the chosen scope (never non-published), plus their **own** cards and progress.

| Export | Content |
| --- | --- |
| Questions | `question_id, course_code, exam_year, exam_term, source (recalled/released), topic, question_type, question, choices, answer_status, answer_verified, answer_proposed_unverified, explanation`. A verified answer and a proposal are in separate columns; a proposal is only filled when no verified answer exists |
| Your own cards | `course_code, front, back, created_on` |
| Your progress | `answered_at, mode, course_code, exam_year, exam_term, question_id, outcome, answer_basis, self_rating, flagged, review_later` (only questions still published) |
| Anki text file | Tab-separated Front / Back / Tags, from published questions and your personal cards. Tags: course code, exam year, and `unverified` when the answer is only a proposal. Always TSV |

CSV files start with a byte-order mark so Excel reads accents; TSV and Anki files do not. **Formula injection:** in the CSV and TSV exports, every cell starting with `=`, `+`, `-`, `@`, a tab or a carriage return gets a leading apostrophe (`guardCell` in `src/server/study/csv.ts`, tested). The **Anki file is not guarded** (`toDelimited(..., { guard: false })`): Anki reads it, not a spreadsheet, its fields are HTML-escaped, and the apostrophe would change a card such as "-5 mm" into "'-5 mm" (tested).

### Anki: UNVERIFIED
The Anki file is a plain Front / Back / Tags layout with the import directives `#separator:tab`, `#html:true`, `#tags column:3` at the top. **It has not been tested in Anki.** Compatibility with the **Anki All in One** template (MC / SC / KPRIM note types) is **not confirmed**: that template may need its own note types and field layout, which we have not verified. Text is HTML-escaped and line breaks become `<br>`; the import must allow HTML in fields. This is also stated on the export screen.

## Limits and where to change them
All in `src/server/study/constants.ts`:

| Constant | Value | Meaning |
| --- | --- | --- |
| `PRACTICE_DEFAULT_COUNT` / `PRACTICE_MAX_QUESTIONS` | 10 / 50 | Questions per practice session |
| `QUIZ_DEFAULT_COUNT` / `QUIZ_MAX_QUESTIONS` | 10 / 50 | Questions per quiz; a higher request is lowered to the cap |
| `REVIEW_SESSION_MAX` / `NEW_CARDS_PER_SESSION` | 30 / 10 | Cards per review session, of which new ones |
| `PERSONAL_CARDS_MAX` / `PERSONAL_CARD_TEXT_MAX` | 2000 / 4000 | Per-student cards and text length per side |
| `STUDY_POOL_MAX` / `EXPORT_MAX_ROWS` | 2000 / 5000 | Safety limits on a scope and an export |
| `PROGRESS_LIST_LIMIT` / `QUIZ_HISTORY_LIMIT` | 50 / 30 | Rows in progress lists and quiz history |

## Tables (migration `drizzle/0005_study_tools.sql`, additive)
`study_attempts`, `study_question_marks`, `study_personal_cards`, `study_question_cards`, `study_card_reviews`, `study_quizzes`, `study_quiz_items` (schema in `src/db/schema/study.ts`). Deleting a user deletes their study data; deleting a question deletes the attempts and schedules that point to it.

## Not built / planned
- Browser-level testing (not done yet), keyboard shortcuts in review, editing the schedule per course.
- Per-topic progress and charts (progress is by course only; no estimates or predictions).
- Anki `.apkg` packages, media in Anki, the All in One template (see above).
- Partial credit for multiple choice, a timer for quizzes, retaking a quiz with the same questions.
- Cards from shared documents (only questions and personal cards for now).
- Sharing cards or quizzes between students (everything is private by design).
- The nav item "Analytics" (renamed from "Progress", still marked soon) is for later advanced analytics; the Progress page in the Study hub is the simple counts described here.
