# Phase 3 — Screen plan (for the owner's approval; nothing here is built yet)

Builds on the finished service layer (`src/server/passes/*`). Same design system, light/dark, French/English,
phone-first layouts and permission rules as the rest of Dentiq. "Image-based" = an image attached to a question
(confirmed). Interactive "label this spot" questions are out of scope for the first version.

## 1. Screens

| # | Screen | Address | Who | What it does |
|---|---|---|---|---|
| A | **Passes tab** | `/courses/[code]/passes` | approved members | List of the course's questions. Switch: **Current-year (2026-2027) · Previous years · All**. Filters: exam year, professor, topic, type, answer status, search. Each row: question excerpt, type, exam year, topic, a clear **Verified** / **Student proposal** badge, a picture icon if it has images. 25 per page. |
| B | **Question page** | `/passes/[id]` | who may see it | The question, its images, choices, and the answer in **two clearly separate blocks**: "Student proposal (not verified)" and "Verified answer" with the basis note and date. Answer collapsed behind "Show answer" so students can test themselves. Report button; Edit for the author/moderators; moderator panel (screen D). |
| C | **Submission form** | `/courses/[code]/passes/new` (edit: `/passes/[id]/edit`) | approved members | One form in five short sections (below). After sending: a confirmation saying "In review" with a link to the question. |
| D | **Moderator panel** (on screen B) | same page, moderators only | moderators, admins | **Review:** Publish · Reject (reason required) · Hide. **Verify:** per-choice verdicts (pre-filled from the student's proposal, which stays visible beside it), or a text box for open answers, plus the **required basis note**; "Remove verification" with a note. **Repeats:** other questions with the same wording in other years, with "Group under this one". **Reports:** open reports with Resolve/Dismiss. |
| E | **Review queue** | existing `/moderation` page, new "Exam questions" section | moderators, admins | Waiting questions and open reports (counts in the nav badge and dashboard). |
| F | **Change history** | `/passes/[id]/history` | moderators and the author | Timeline of every change: who, when, note, and what the question looked like then (including earlier verifications). |
| G | **Pass settings** *(proposed extra)* | `/admin/passes` | admins | Switch question types on/off, choose who may verify, require note + minimum length, image and waiting-question limits. Says clearly: "Changing these never changes existing questions." |

Also needed (not screens): a permission-checked image route `/api/question-images/[id]`, and server actions that
call the service (they check the signed-in user, validate input, translate errors).

## 2. The submission form (screen C)

1. **Where it comes from** — exam academic year (choices: the last 8 years up to the current one; future years
   not offered), term (optional), course offering (filtered to the chosen year; optional), professor (optional).
2. **The question** — type (only the enabled types appear, each with a one-line plain-language description),
   question text, topic (optional), images (up to the limit; **alt-text field per image**, with a reminder
   not to give away the answer).
3. **Choices and your answer** — adapts to the type:
   single choice = radio buttons; multiple choice = checkboxes; four statements = True/False per statement;
   open answer = a text box. Add/remove choices where allowed. Leaving answers unmarked means "I don't remember".
4. **About this question** — where it comes from (recalled from memory / officially released), how sure you are
   (optional), explanation (optional).
5. **Confirm** — rights checkbox: "I did not copy this from a leaked or unauthorized exam or answer key." and a
   note that moderators review it and that your name is never shown to other students.

Behaviour: errors listed at the top (linking to each field) and under each field; same-year duplicates are
refused with a link to the existing question when you may see it; a repeat in another year is accepted with a
note; nothing is lost when an error occurs; no autosave in the first version.

## 3. States every screen handles
Loading, empty ("No questions yet — be the first to add one"), no results for the filters, no access
(account not approved yet), not found, and an error page with Retry. Success messages are shown in the page,
never as pop-ups.

## 4. Accessibility and phones
Keyboard-only use for every control; visible focus; each field labelled; "Verified" vs "Student proposal" is
shown with an icon **and** words (never colour alone); images always have alt text; touch targets at least 44 px;
single-column layout on phones with a sticky "Send" button; the tab strip scrolls sideways like the course tabs.

## 5. Navigation changes
The course tab "Passes" becomes active (it is currently greyed out as "soon"). The global sidebar and dashboard
"Passes — soon" entries are removed, because passes live inside each course.

## 6. Text (French and English)
A new `passes` section in both translation files (about 120 strings), written in natural French. Labels: **Passes**
("Questions d'examens passés"), **Année en cours** / **Années précédentes**, **Réponse vérifiée** /
**Proposition d'un·e étudiant·e**. The existing test keeps both languages in sync.

## 7. Build order (each step passes type check, lint, tests and build before the next)
1. Server actions, form parsing and error messages, with tests (no visible change).
2. Image route.
3. Passes tab and question page, read-only. **Browser check, then I show you screenshots.**
4. Submission form. **Browser check; screenshots before moving on.**
5. Moderator panel, verification, review queue section.
6. Change history and repeat grouping.
7. Pass settings screen (only if you say yes).

Browser checks each time: desktop and phone widths, dark and light, French and English, keyboard use, page
width never exceeds the screen, no console errors.

## 8. Not in the first version
Label-the-image questions · Anki export and downloadable collections (separate step; compatibility with the
"All in One" template is not yet verified) · autosave drafts · comments or votes · a global cross-course
passes page · email notifications · AI features.

## 9. Decisions needed before building
1. Answers collapsed behind "Show answer" by default?
2. Build the admin **Pass settings** screen (G) now, or later?
3. Remove the "Passes — soon" entries from the sidebar and dashboard (passes live in each course)?
4. French label: "Passes" (as students say it) with the subtitle "Questions d'examens passés" — OK?
5. Exam year choices: last 8 academic years — enough?

## Decisions (owner, 2026-10-31) and what was built

1. Answers collapsed behind "Show answer": **yes, built.**
2. Admin Pass settings screen: **built now** (`/admin/passes`).
3. Passes entry: **global entry in the main nav plus the per-course tab** (this replaces the earlier plan to remove the global entry). "Passes — soon" placeholders removed.
4. Label: "Passes", French subtitle "Questions d'examens passés": **built.**
5. Exam year: last 8 academic years **plus older years**: **built.**
6. Question kinds: single choice, multiple choice, four true/false statements, open answer, any question may carry images (no hotspot questions).
7. Only moderators and admins verify, with a required basis note (configurable, strict default).
