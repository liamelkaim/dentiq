# Overnight log

> Final summary goes at the top when the run finishes (block M). Until then this is a running log.
> Started 2026-11-01. Phase 3 screens were committed first as `9ddb7a0`.

## Rules for every block (from the owner)

- Never: push, deploy, merge, touch Vercel/Neon/Blob/Resend, add paid services or paid AI/transcription providers, use real student data (`example.com` test accounts only), move the project folder, delete anything outside the scratch folder.
- Never present an unfinished feature as working. Planned features stay clearly marked as planned.
- Every block: French and English text (same keys in `fr.json` and `en.json`), light and dark themes (tokens only), phone/tablet/desktop layouts, server-side permission checks, private-by-default student material, source attribution, brand rules (no purple gradients, no emoji icons, no em dashes in UI copy, no fake numbers).
- Don't rebuild working features. Open decisions: pick a default, make it changeable in settings or constants, record it here.
- After each block: typecheck, lint, tests, build, then a local commit. Before each commit confirm no `.env*`, `.nosync`, `.data`, `.vercel` is staged.

## Block status

| Block | Status | Commit |
|---|---|---|
| Phase 3 screens (carried over) | committed | 9ddb7a0 |
| A. Passes polish | built; typecheck, lint, 212 tests, build all clean; not yet browser-tested | d990d7c |
| B. Study tools (practice, progress, flashcards, quizzes, export) | built; typecheck, lint, 269 tests, build clean; not yet browser-tested; Anki All in One compatibility UNVERIFIED | 72d3700 |
| C. Notes and course library (topics, links, note versions, search, current vs previous) | built; typecheck, lint, 303 tests, build clean; not yet browser-tested | c3b1a3f |
| D. Calendar and analytics (local only) | built; typecheck, lint, 375 tests, build clean; not yet browser-tested; .ics import into calendar apps UNVERIFIED | 4a0fbc4 |
| E. Course-grounded AI tutor shell (retrieval, citations, provider interface; OFF, no provider) | built; typecheck, lint, 439 tests, build clean; not yet browser-tested | see git log |

## Decisions made for the owner

- A: search page shows the 10 most recent matching questions (`SEARCH_QUESTION_LIMIT` in `src/server/passes/queries.ts`).
- A: dashboard search now opens `/search?q=` (documents plus published questions) instead of `/resources`.
- B: Leitner schedule with six boxes (10 min, 1, 3, 7, 14, 30 days) in `src/server/study/schedule.ts`; other limits in `src/server/study/constants.ts` (10 questions per practice or quiz, max 50; 30 cards per review; 2000 personal cards; 5000 export rows); partly right = half a point (`PARTIAL_CREDIT`).
- B: attempts on unverified answers are stored as unscored and never counted as correct (database CHECK plus tests). Quiz scores are fixed when answered.
- B: still-"soon" nav item renamed "Analytics" so it does not clash with the new Progress page. Flashcards "soon" replaced by a live Study entry (`/practice`).
- B: new migration `drizzle/0005_study_tools.sql` (7 tables, additive).
- C: notes are private to the owner only (no sharing); shared material goes through the document library. Topics are per course, FR name plus optional EN, staff-managed, archived not deleted. Limits in `src/server/library/constants.ts`.
- C: when a course has topics the upload form uses the picker instead of free text; legacy free-text topics stay readable with a badge.
- C: migration `drizzle/0006_library_topics.sql` (8 tables, additive).
- C not done: no topic picker inside question submit/edit forms, no note delete/share, no "My notes" in main nav, search not accent-insensitive.
- D: no per-user time zone yet; one constant `CALENDAR_TIME_ZONE = "America/Toronto"` in `src/server/calendar/constants.ts` decides "today". Change it if wrong.
- D: calendar never pre-fills dates; 1000 entries per student; analytics counts only the viewer's rows, excludes unscored answers, names weak topics only from 5 scored answers (constants in `src/server/analytics/constants.ts`).
- D: migration `drizzle/0007_study_calendar.sql` (1 table, additive). Dashboard "progress coming soon" card replaced by an Analytics link.
- D not built: reminders, recurring entries, .ics import/feed, per-user time zone.
- E: tutor is OFF by default and needs BOTH an admin flag and a configured provider; `PROVIDER_FACTORIES` is empty on purpose, so it cannot turn on. No AI SDK, no key, no network call (checked: no AI package in `package.json`, no `fetch` in `src/server/tutor`). `/tutor` offers plain "search the course sources" with citations, labelled as search, not as an AI answer.
- E: constants in `src/server/tutor/constants.ts`: 10 questions per student per day (admin-changeable 1 to 200), context 6000 characters, unverified answers excluded (`INCLUDE_UNVERIFIED_ANSWERS = false`), previous offerings excluded unless ticked. Documents are matched on title/topic/description only (no extracted text exists; no PDF parser added).
- E: migration `drizzle/0008_ai_tutor_usage.sql` (1 table, counts only, no question text).
- OWNER DECISION STILL OPEN: AI provider choice and budget (see `docs/ai-tutor.md`).

## Noted for later blocks

- Four UI strings still contain em dashes (`soonLabel`, `fileHint`, FR and EN). Fix in block G copy pass.
- No logo file of 1024 px or more in the project; a kit sits in Downloads (outside the project).
- `pnpm audit`: 1 high advisory, `zod` below 4.6.6, transitive via `@vercel/blob`. Not used locally.

## Findings and fixes (review blocks)

(none yet)

## Skipped / failed

(none yet)
