# Phase 3 — Exam passes: table design

Status: **design and database only.** No screens, forms or services exist yet. Nothing here is live.

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

**Still open (needed before the submission form):**
3. **Question types:** `sc`, `mc`, `kprim` only? Say if open-answer, true/false or image questions are needed.
4. **Who may verify an answer?** Proposed: moderators and admins only, each with a note saying what the
   verification rests on (never a leaked answer key).
