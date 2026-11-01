# Phase 3 — Exam passes: table design

Status: **database, service layer and screens are built and tested locally** (not committed, not deployed). Sections below that say "not built yet" describe the original plan; see "Screens (built)" at the end for what exists now.

## What a "pass" is

One past-exam question, contributed by a student, reviewed by a moderator, and shown in the course it
belongs to. Questions are never copied from leaked or unauthorized exams or answer keys: every
contribution carries a rights confirmation, and moderators review before anything is published.

## The two categories (your definition)

- **Current-year passes** — questions from this academic year's exams.
- **Previous-year passes** — questions inherited from earlier academic years.

The category is **never stored**. It is worked out each time from the question's real exam year:

    academic year today  = 2026-2027
    exam year 2026-2027  → current-year
    exam year 2025-2026  → previous-year   (and anything earlier)

So on the first day of the next academic year, last year's current passes become previous passes by
themselves, with no data change. A test checks that no category column exists. The rule lives in
`src/server/passes/academic-year.ts`; the same rule is available as a database filter.

## Tables

### `exam_questions` — one row per question
| Group | Fields |
| --- | --- |
| Where it belongs | course (required), course offering (optional), professor (optional), exam academic year (required, "2025-2026"), exam term (optional), topic (optional) |
| Content | question type (`sc` single choice · `mc` multiple choice · `kprim` four true/false statements), question text, explanation (optional) |
| Source | provenance (`recalled` from memory · `released` officially by the instructor/faculty), confidence (`sure`/`unsure`, optional), rights confirmation (required: not copied from a leaked exam or answer key) |
| Publication | `status`: `pending` → `published` · `rejected` · `hidden`; review note, reviewer, review date |
| Answer | `answerStatus`: `proposed` (a student's suggestion) or `verified` (moderator-confirmed); verifier, verification date, verification note |
| Duplicates | fingerprint of the wording (flags likely repeats), "duplicate of" link set by a moderator |
| Bookkeeping | contributor, created and updated dates |

The question keeps its **actual exam year, course, offering, professor (when known), question type and
answer status** — exactly the fields you listed.

### `exam_question_choices` — the options (or the four statements for `kprim`)
Position 1–10, text, **`proposedCorrect`** (the contributor's suggestion; empty = "I don't remember") and
**`verifiedCorrect`** (set only by a moderator). Proposed and verified answers are separate columns, so a
proposed answer can never be mistaken for a verified one.

### `exam_question_revisions` — append-only history
A full snapshot after every change (wording, choices, answers, year, offering…) with who changed it and a
note. Corrections and verification changes can always be audited and nothing is overwritten.

### `exam_question_reports` — problem reports
Same pattern as document reports: one open report per person per question; reasons: wrong answer,
duplicate, inappropriate, leaked or copyrighted, other.

**No "collections" table.** A course's collection is simply "published questions for that course",
filtered by year, category, topic and so on. Downloads are generated from that list in a later step.

## Rules the database itself enforces
(tested in `tests/passes-schema.test.ts`, independent of any form)
- Exam year must be two consecutive years (`2025-2026`; not `2025-2027`, `25-26`, or blank).
- A rights confirmation is mandatory.
- `verified` always has a verification date; the date survives if the verifier's account is deleted.
- A question cannot be a duplicate of itself; deleting the original keeps the repeat.
- One row per choice position; no repeated revision numbers; one open report per person per question.
- Courses, offerings and professors cannot be deleted while questions depend on them (history is kept).
- If a contributor deletes their account, their questions stay (no longer linked to a person).
- Deleting a question deletes its choices, revisions and reports with it.

## What the next steps will add (not built yet)
Service layer and permissions (approved members submit, moderators review/verify), the submission form,
duplicate detection, the "Passes" tab replacing its disabled placeholder, filters (course, year, category,
professor, topic, type), downloads. Anki export stays a separate, later step; the type names follow the
"All in One" MC/SC/KPRIM formats from the master prompt, but **compatibility has not been verified**.

## Decisions

**Confirmed by the owner:**
1. **The academic year starts on 1 August** (`ACADEMIC_YEAR_START_MONTH`, default 8). This is the day
   "current-year" flips to the new year.
2. **The category comes from the exam's academic year**, not the contribution date. The two differ only when
   someone submits an old exam late (a 2024-25 question added in 2026-27 is *previous-year*). Contribution
   dates are still stored, so this could be changed later.

**Chosen by the owner for now (not permanent; designed to change, see below):**
3. **Question kinds:** single choice (`sc`), multiple choice (`mc`), four true/false statements (`kprim`),
   open answer (`open`), and image-based questions.
   *Interpretation:* "image-based" is implemented as a capability of every question (any question can carry
   images such as radiographs), not as a separate answer format, because an image alone doesn't say how the
   question is answered. If something else was meant (e.g. "label this image" / hotspots), that needs its own
   answer model; tell me and it becomes one new registry entry plus a table.
4. **Verification:** only moderators and admins may verify an answer, and each verification needs a note
   explaining its basis (at least 10 characters; never a leaked answer key).

## Changing question types and verification rules later

Everything that can change is in two places, so nothing is scattered through the feature:

| What | Where | How to change |
| --- | --- | --- |
| What kinds of question exist and their rules (how many choices, how the answer works, image required?) | `src/server/passes/question-types.ts` (the registry) | **Add a type:** add one entry. No migration: the type is stored as plain text. |
| Which of those kinds are accepted for NEW questions; who may verify; whether a note is required and how long; image and anti-spam limits | the `app_settings` table, read by `src/server/passes/settings.ts` | An administrator changes it with `updatePassSettings` (no code change, no redeploy; audited with before/after). An admin screen comes with the UI. |

What is guaranteed when you change them:
- **Existing questions and answers are never altered.** Switching a type off only blocks new questions of
  that type; existing ones stay readable, searchable and editable. A question verified under an old policy
  stays verified (who, when and on what basis are stored on the question itself).
- **Nothing widens by accident.** A missing or corrupted setting falls back to the strict defaults; plain
  students can never be given verification rights; an administrator can always verify.
- **Never rename a stored type key.** To retire a type, switch it off. If a key is ever removed from the code,
  its questions still display (marked as unknown, read-only) and are never deleted.
- **New roles:** a role added later (e.g. a dedicated "verifier") is eligible automatically once it exists in
  the role list (`roles` in `src/db/schema/auth.ts`); then add it to the allowed roles in the settings.

## Service layer (built, tested, no screens yet)

`src/server/passes/service.ts`: submit (with images, rights confirmation, duplicate detection, a per-student
cap on waiting questions), edit (every change is a revision; changing wording, type, choices, images or exam
year resets a verified answer to "proposed"), review (publish / reject with a reason / hide), verify and
un-verify, duplicate grouping, reports, filtered lists (course, offering, professor, exam year, current- or
previous-year, topic, type, answer status, text), change history, and permission-checked image access.
Students never see who contributed a question; only moderators do.

## Screens (built)

| Screen | Address | Notes |
| --- | --- | --- |
| Passes (all courses) | `/passes` | Main-nav entry "Passes", subtitle "Questions d'examens passés". Period switch (Current year / Previous years / All, default All), filters (search, course, exam year, type, answer status, topic, moderators: review status), 25 per page |
| Course Passes tab | `/courses/[code]/passes` | Questions from **all offerings by default**, plus an offering filter and a professor filter |
| Add a question | `/passes/new` (course picker) then `/courses/[code]/passes/new` | Exam year: last 8 academic years, plus a field for older years. Offerings are filtered to the chosen year. Images (up to the configured limit) with required alternative text. Rights confirmation. The form keeps what you typed when the server reports an error |
| Question page | `/passes/[id]` | Answer **collapsed behind "Show answer"**. Student proposal and verified answer are separate blocks, each with an icon and words. Report form. Moderator panel on large screens: review (publish / reject with reason / hide), verify, remove verification, repeat grouping, open reports |
| Edit | `/passes/[id]/edit` | Author or moderators. Editing content resets a verified answer to "proposal" (warned on the form) and sends a student's edit back to review |
| History | `/passes/[id]/history` | Every version with who, when, note, which fields changed, and the state at that time |
| Settings | `/admin/passes` | Enabled question types, who may verify (admins always can), note required + minimum length, image limits, waiting-question cap. Saved through `updatePassSettings` (audited) |
| Review queue | `/moderation` | New sections for waiting questions and open question reports; counts included in the dashboard and admin review totals |
| Image route | `/api/question-images/[id]` | Permission-checked on every request, like `/api/files` |

Files: `src/server/passes/{actions,form,browse,errors,queries}.ts`, `src/components/pass-{browser,forms,ui}.tsx`.
Form parsing, list-filter parsing, the year list and the error-code translations are unit-tested (`tests/pass-form.test.ts`).

Phones: the tab bar keeps five items. Settings moved to a gear in the phone header, and the theme switcher is on the Settings page on phones (the desktop sidebar is unchanged).
