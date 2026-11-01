# Roadmap and status

Legend: ✅ implemented · 🔄 in progress · 📋 planned · ⛔ blocked · 🔐 requires approval

## Phase 1 — Foundation ✅ (2026-10-28)

| Feature | Status | Notes |
| --- | --- | --- |
| Next.js app, TypeScript, Tailwind, ESLint, Vitest | ✅ | |
| Design system (tokens, light + dark, components) | ✅ | Monochrome + clinical blue |
| Theme switcher (light / dark / system), persisted | ✅ | Verified in browser across reloads |
| French / English, switcher, persisted | ✅ | French default; verified in browser |
| Responsive shell: sidebar (desktop), tab bar (mobile) | ✅ | Checked at 390 px and 1200 px, no horizontal overflow |
| Installable PWA (manifest + icons) | ✅ | No offline mode yet |
| Database + migrations (Postgres via Drizzle; PGlite locally) | ✅ | |
| Accounts: sign-up, email confirmation, sign-in, sign-out | ✅ | Emails printed to console (no provider yet) |
| Roles (student / moderator / admin), approval workflow | ✅ | Moderator tools come in Phase 2–3 |
| Course catalog: programs, courses, offerings, professors | ✅ | Empty by default — no invented data |
| Catalog search and filters (text, year, term) | ✅ | |
| Admin: create/edit course, CSV import with source tracking | ✅ | |
| Audit log | ✅ | No viewer screen yet |
| Automated tests (39) | ✅ | |

## Phase 2 — Academic resources ✅ (2026-10-28)

| Feature | Status | Notes |
| --- | --- | --- |
| Course pages with a resources section (Current / Archive / All) | ✅ | |
| Uploads: outlines, notes, study guides (PDF, DOCX, PPTX, PNG, JPG; 25 MB) | ✅ | Type checked from file content, not just the name |
| Private file storage behind a permission check (`/api/files/…`) | ✅ | Local disk in `.data/uploads`; cloud storage later behind the same interface |
| Preview (PDF, images) and download, accented file names preserved | ✅ | DOCX/PPTX: download only |
| Version history (append-only; every version downloadable) | ✅ | |
| Duplicate detection (identical file fingerprint, SHA-256) | ✅ | Near-duplicates not detected |
| Current vs historical separation by course offering | ✅ | Derived from the most recent offering |
| Library with search + filters: course, professor, year, term, topic, type, period | ✅ | |
| Permissions: approved members view/upload; student uploads reviewed; moderators publish/hide/remove; official label by moderators only | ✅ | |
| Reporting (one open report per person per document) and moderation queue | ✅ | |
| Rights confirmation on every upload, usage notice on every document | ✅ | Not a legal review — see security-privacy.md |
| Audit log for uploads, versions, moderation and reports | ✅ | |
| Automated tests (65 total, 26 new) | ✅ | |
| Local dev database moved out of the Next.js process | ✅ | Fixes database corruption found during testing (see Known issues) |

## Next phases

| Phase | Scope | Status |
| --- | --- | --- |
| 3 | Exam passes: structured questions, moderation, statuses, exports | 🔄 **Screens built (2026-10-31), uncommitted, awaiting owner review.** Global `/passes` and per-course Passes tab, submission and edit form (single choice, multiple choice, four true/false, open answer; attached images), question page with the answer collapsed and separate "Student proposal" / "Verified answer" blocks, moderator review, verification with a required basis note, repeat grouping, reports, change history, admin settings (`/admin/passes`), dashboard summary, moderation queue section. 209 tests. **Not built:** Anki/CSV export (separate step; "All in One" template compatibility unverified), label-the-image questions, autosave, comments/votes. See `docs/phase-3-design.md` |
| 4 | Study tools: practice, flashcards, quizzes, progress, CSV/TSV/Anki export | 🔄 **First version built (2026-11-01), uncommitted, covered by automated tests, not yet browser-tested.** Study hub `/practice`; practice for all question types (scored only against verified answers, proposals labelled and never scored); private progress and flag/review-later marks; flashcards from published questions plus personal cards with a Leitner schedule; quizzes with scores from verified items only; CSV/TSV/Anki exports with formula escaping. **Anki "All in One" compatibility is UNVERIFIED** (never tested in Anki). See `docs/study-tools.md` |
| 2+ | Course library: shared per-course topics, private typed notes with version history, links between topics, documents, notes and published questions, topic page, search across all of them, current vs previous grouping | 🔄 **Built (2026-11-01), uncommitted, covered by automated tests, not yet browser-tested.** Migration `0006_library_topics.sql` (8 additive tables). **Not built:** note sharing and deletion, topic picker inside the question forms, accent-insensitive search. See `docs/library-topics.md` |
| 7a | Study calendar (`/calendar`, student-entered dates only, month grid + agenda, `.ics` local export) and analytics (`/analytics`, own data only, every metric with its denominator, weakest topics only above a minimum sample) | 🔄 **Built (2026-11-01), uncommitted, covered by automated tests, not yet browser-tested.** Migration `0007_study_calendar.sql` (1 additive table). `.ics` import into Apple/Google/Outlook **unverified**. **Not built:** reminders, recurring entries, per-user time zone, calendar feeds, per-topic trends. See `docs/calendar-analytics.md` |
| 5 | AI course tutors (retrieval + citations) | 🔄 **Grounding layer built (2026-11-01), uncommitted, covered by automated tests, not yet browser-tested. The tutor itself is OFF and planned: no provider, no key, no AI call, no generated answer.** Built: retrieval over the viewer's authorized sources (documents by title/topic/description only, own notes, published questions with verified answers), BM25 ranking, citations with official/student/own labels, current-vs-previous separation, `TutorProvider` interface with a `NullProvider`, admin switch (default off) and limits, usage table, prompt-injection wrapper, `/tutor` page with a working "search the course sources". Migration `0008_ai_tutor_usage.sql` (1 additive table). 🔐 **Needs an AI provider and budget approval** before any answer exists. Not built: any provider, question form, reading inside uploaded files, embeddings. See `docs/ai-tutor.md` |
| 6 | Audio: upload, recording, transcription | 📋 🔐 consent/legal review; provider choice |
| 7 | Advanced learning: summaries, study plans, analytics, voice | 📋 |

## Backlog (not scheduled)

- Password reset (needs an email provider) 🔐
- Real email provider (e.g. Resend, Postmark — free tiers exist) 🔐
- Audit log viewer for admins
- Archive/unarchive courses in the UI (column exists)
- Edit/delete offerings and programs in the UI
- Accent-insensitive search (`unaccent`)
- Browser end-to-end tests (Playwright)
- Offline support (service worker)
- Send only needed translation namespaces to the browser
- Edit a document's title/description/topic after upload (only new versions and moderation for now)
- Moderator view of pending items inside the library filters (currently only in the Moderation queue)
- Cloud object storage (e.g. Cloudflare R2 — free tier) before deployment 🔐
- Retention rules for removed documents (files are kept for the record today)
- Previews for DOCX/PPTX (would need a conversion service)
- Virus scanning of uploads before deployment

## Decisions needed from the project owner

- Student verification policy: university domain only, admin approval, or both? ⛔ blocks public launch
- Hosting provider and budget — before any deployment 🔐

## Known issues / limitations

- **Fixed in Phase 2 — local database corruption.** When PGlite ran *inside* the Next.js dev server, it crashed (`RuntimeError: Aborted()`) after sign-in/email verification and the database folder could no longer be opened. It did not happen in plain Node or in the production build. Root cause inside the dev server not identified; `pnpm dev` now runs PGlite as a separate process (`pglite-server`) and the app connects to it like a normal Postgres. Verified: repeated sign-ups/sign-ins, uploads, Ctrl+C shutdown and reopening — no crash, data intact. **If you ran Phase 1 `pnpm dev` and signed in, your old `.data/pglite` may be damaged; delete `.data/pglite` to start fresh.**
- Local database (PGlite) can be opened by one process at a time: stop `pnpm dev` before `pnpm db:migrate`.
- The local database server accepts one connection at a time (safe for transactions; fine for one developer).
- A student's new version sends the whole document back to review, hiding the previous published version until a moderator approves.
- No password reset yet — a user who forgets their password needs an admin (or a database reset) for now.
- Rate limiting is in-memory and only active in production mode.
- TypeScript is pinned to 6.0 because the lint tooling doesn't support TypeScript 7 yet.


## Dentiq alignment — 2026-10-29

- ✅ Kept the existing Next.js app, data model, Dentiq identity, responsive dashboard, and focus reader.
- ✅ Personal uploads alongside the shared library; new upload form defaults to Only me.
- ✅ Owner-only read, preview, download and version access, including protection from admin accounts.
- ✅ Visibility filter and badges in the library, document details, course notes and focus reader.
- ✅ Private topics and counts do not leak into other accounts; duplicates are scoped by visibility and owner.
- ✅ Additive migration preserves all existing records as shared.
- ✅ Mobile study drawer state and close-on-selection; arrow-key navigation for preferences.
- ✅ University-neutral English/French interface wording.
- ✅ TypeScript, lint, 76 automated tests and production build passed.
- 📋 University-scoped libraries/catalog identifiers and membership remain to be implemented.
- 📋 Unified tutor, flashcards and practice exams remain future work, sharing an eventual learning model.

This extends Phase 2; it does not claim completion of the seven-phase vision.
