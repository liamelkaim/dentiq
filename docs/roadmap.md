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
| 3 | Exam passes: structured questions, moderation, statuses, exports | 🔄 Tables, category rule and service layer built and tested (180 tests); **no screens yet**. Question types and verification rules are centralized and changeable (see `docs/phase-3-design.md`). Next: confirm the "image-based" interpretation, then server actions and screens |
| 4 | Study tools: flashcards, Anki TSV export, quizzes, progress | 📋 |
| 5 | AI course tutors (retrieval + citations) | 📋 🔐 needs an AI provider and budget approval |
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
- Interpretation of the two pass categories (current year / previous years) — needed for Phase 3
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
