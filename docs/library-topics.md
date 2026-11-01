# Course library: topics, links, notes and versions

Status: **built and covered by automated tests (`tests/library.test.ts`, `tests/library-messages.test.ts`); not yet checked in a browser, not committed, not deployed.**
Migration: `drizzle/0006_library_topics.sql` (additive: 8 new tables, no existing table or column changed).
Code: `src/server/library/*` (rules), `src/components/library-{ui,forms}.tsx` (screens), schema in `src/db/schema/library.ts`.

## What existed before, and what this adds

| Before | Now |
| --- | --- |
| Documents (`resources`): free-text `topic`, file versions (append-only, downloadable), current/historical derived from the offering | Unchanged. A document can also be linked to course topics and to published questions. File version history was already complete, so documents did not get a second history |
| Exam questions (`exam_questions`): free-text `topic`, revisions (`exam_question_revisions`), current/previous by exam year | Unchanged. A question can also be linked to topics; the question page shows a Related panel |
| Personal documents (uploads with visibility "Only me") | Unchanged. Typed notes are new and separate (below) |
| No shared topic list, no typed notes, no links | `course_topics`, `course_notes` + `course_note_versions`, link tables, topic page, notes screens, search extension |

## Topics

- One list **per course** (`course_topics`): French name (source language), optional English name (never auto-translated), sort order, archived flag. A name is unique within a course ignoring case (database unique index).
- **Who manages**: moderators and administrators only (`createTopic`, `renameTopic`, `setTopicArchived`, `moveTopic`; the server actions use `requireRole("moderator")` and the service checks again). Students and unapproved accounts get `forbidden`. Every change is written to the audit log.
- **Archived, never deleted.** An archived topic leaves the pickers; existing links and the topic page keep working (the page says it is archived). Restoring puts it back. Only moderators see archived topics in the management list.
- **Reorder**: up/down buttons. The whole course list is renumbered before each move, so ties and gaps can never make a move do nothing.
- **Students pick from the list.** The document upload form, the note form, and the "Edit topics" control on document, note and question pages all use the course list (checkboxes). If the course has no topics, the upload form shows "no topics yet" instead of a free-text field; moderators and administrators are pointed to the course's Topics tab ("Add the first topic..."). Students are told a moderator must add them.
- Limits: `TOPICS_PER_COURSE_MAX` (200), `TOPIC_NAME_MAX` (80), `TOPICS_PER_ITEM_MAX` (10) in `src/server/library/constants.ts`.

### Legacy free-text topics (backward compatible)
`resources.topic` and `exam_questions.topic` are untouched and stay readable (lists, filters, exports, search all still use them). Where an item has no linked topic but has a free-text one, the Related panel shows it as "Topic typed by hand" with a "Free-text topic" badge. On a topic page, documents and questions whose free-text topic **equals the topic's name** (case-insensitive, whole text, wildcards escaped) are listed too and flagged "Free-text topic", so old material shows up without anyone editing it. Nothing is rewritten and no link is created for them.
Not done: the question submission/edit form still has its free-text topic field (see "Not built").

## Links

| Table | Meaning |
| --- | --- |
| `resource_topics`, `note_topics`, `question_topics` | Item is about a topic |
| `resource_question_links`, `note_question_links` | A document or note is linked to a specific published question |

Each has a composite primary key (no duplicate links), foreign keys with cascade (deleting a document, note, question or topic removes its links), `created_by` and `created_at`.

**Writing a link** (`src/server/library/links.ts`): the actor must be allowed to edit the source (document: uploader or moderator, via `canEditResource`; note: its owner; question: its contributor or a moderator, via `canEditQuestion`). Topics must belong to the **same course** and not be archived (a topic already linked may stay after archiving). A question link must point to a **published** question of the **same course** that the actor may see. Not found and not allowed return the same `notFound`.

**Reading a link: shown only when the viewer may see both sides.** All reads are built from three conditions in `src/server/library/visibility.ts`:

| Item | Who sees it through a link, a count, a topic page or search |
| --- | --- |
| Document | Shared and published; plus the viewer's own items (private, or their own pending/hidden). Same rule as the library list |
| Note | Its owner only (not other students, not moderators, not administrators) |
| Question | Published only, for everyone (a pending, rejected or hidden question is never reachable through a link) |

So a student never learns that someone else's private note exists, that it is linked to a question, or how many there are. Tested for question pages, note pages, topic pages, counts, and search, with student, moderator, administrator and unapproved viewers.

**Screens**
- Document page (`/resources/[id]`): Related panel with topics, linked questions, controls to edit topics and link/unlink a question (editors only).
- Note page (`/notes/[id]`): same panel.
- Question page (`/passes/[id]`): Related panel with topics, linked documents (that you may see) and **your own** linked notes; "Write a note about this question" opens `/notes/new?course=...&question=...` with the link pre-set; editors can change the question's topics (this does not touch the answer, the revisions or the verification).
- **Topic page** `/courses/[code]/topics/[id]`: documents, your own notes, published questions, each row labelled with its source (Document / Personal note (private) / Exam question) and grouped by current vs previous. Reachable only through its own course's address.
- Course topic list `/courses/[code]/topics` (new "Topics" tab on the course header) with per-viewer counts.

## Notes and version history

- A **note** (`course_notes`) is typed text (plain text, no formatting) belonging to one course, optionally one offering, **owned by one student and private**. `canSeeNote` = owner and library access. There is no sharing; shared material goes through the document library and its moderation. Deleting the account deletes the notes (cascade).
- Every save appends a row to `course_note_versions` (title, body, optional "what changed" note, author, time). Rows are never updated. The note row keeps the current title, body and `current_version`.
- **Saving**: the form sends the version it started from; if the note moved on meanwhile (another tab) the save is refused with a clear message instead of overwriting. Saving with nothing changed is refused (`noChange`), so no empty versions.
- **History page** `/notes/[id]/history`: list of versions (who, when, change note, "title changed", lines added/removed) and, for the selected version, a line-by-line comparison against the previous one (`src/server/library/diff.ts`, longest common subsequence after trimming equal start and end; skipped above `DIFF_MAX_LINES` = 2000 lines with a message). Added and removed lines carry a "+" or "-" mark and screen-reader text, not just colour.
- **Restore**: "Restore this version" creates a **new** version with the old content (`restored_from_version` records the source). Only the owner can; anyone else gets `notFound` and nothing changes. The history is never rewritten.
- Audit entries name the note and version numbers, never its text.
- Limits: `NOTE_TITLE_MAX` 200, `NOTE_BODY_MAX` 50,000, `NOTE_CHANGE_NOTE_MAX` 300, `NOTES_PER_USER_MAX` 500, `QUESTION_LINKS_PER_ITEM_MAX` 20, `NOTE_HISTORY_LIMIT` 200.

## Search (`/search`)

Searches documents, **your own** notes, course topics and published questions, optionally within one course (filter above the results). Each section names its source ("Source: Resources", "Source: My notes (private)", "Source: Course topics", "Source: Passes"). Postgres `ILIKE` with `%`, `_` and `\` escaped (`escapeLike` in `src/server/library/like.ts`, tested: `%` finds only a literal percent sign). Each source shows at most `SEARCH_RESULT_LIMIT` (10) rows with "N shown out of M" and a link to the full list; the search text is cut at `SEARCH_QUERY_MAX` (100). Notes show a short snippet around the match. Other people's notes are never queried (the note search is filtered by owner in SQL). Archived topics are not searched. Matching is case-insensitive but **not accent-insensitive** (same as the rest of the app).

## Current and previous offerings

- **Documents and notes**: derived from the offering, never stored (`periodOf` / `latestOfferingByCourse`): the course's most recent offering and anything without an offering count as "current"; any other offering is "previous". Adding a newer offering moves material to "previous" without editing it (tested).
- **Exam questions**: derived from the exam year with the existing rule (`passCategory`, academic year starting 1 August).
- Wherever the new screens list items (topic page, My notes, Related panels) they use `PeriodSections` (`src/components/library-ui.tsx`): two groups, "Current offering" and "Previous offerings" (for questions "Current year" and "Previous years"), each with its explanation that older material may be outdated, and each row shows its offering (year and term) or "No offering set". The existing course Notes tab (documents) keeps its Current / Archive / All tabs; the Passes tab keeps its Current year / Previous years / All switch and now has an explanation line under it.

## Not built / planned (nothing here is claimed to work)

- Sharing a note with other students, deleting a note, rich text or attachments in notes.
- Topic picker inside the exam question submission and edit forms (questions get topics after creation from their page; the free-text topic field is still there).
- Editing a document's title or metadata after upload (already a backlog item), and therefore no text diff for documents (their history is file versions).
- Accent-insensitive search; ranking of results; full-text search (plain ILIKE only).
- Topic merge or delete (archive only); topic suggestions from free-text values.
- Per-topic progress in the Study hub; practice scoped by topic uses the old free-text field as before.
- Browser-level testing of these screens (none done yet).
