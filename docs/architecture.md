# Architecture

## In one paragraph

Dentiq is **one Next.js application** written in TypeScript. The same app renders the pages and runs the server code (database queries, permission checks), so there is no separate API to deploy. Data lives in **PostgreSQL**, accessed through **Drizzle ORM** with versioned SQL migrations. Accounts are handled by **Better Auth**, an open-source library that stores users in our own database. The interface is bilingual (French default, English) with **next-intl**, styled with **Tailwind CSS** and shared design tokens, and installable on a phone's home screen (web app manifest).

## Folder structure

```
src/
  app/                 Pages and layouts (Next.js App Router)
    (auth)/            Sign-in, sign-up, verify-email — shown when signed out
    (app)/             Everything behind sign-in: dashboard, courses, settings, admin
    api/auth/          Better Auth's HTTP endpoints
    globals.css        Design tokens (light + dark) and base styles
    manifest.ts        PWA manifest
  components/          UI: design-system primitives (ui.tsx), shell, forms, icons
  server/              Server-only logic, one folder per module
    auth/              Better Auth config, session helpers, role rules
    catalog/           validation.ts (zod), service.ts (business logic), actions.ts (server actions)
    resources/         Shared documents: service.ts (rules + permissions), files.ts (upload checks), actions.ts
    users/             Account approval and roles
    audit.ts           Audit log writer
    email.ts           Mailer interface (console in development)
    env.ts             Configuration validation
    storage.ts         Private file storage interface (local disk now, cloud later)
  db/
    schema/            Tables: auth.ts, catalog.ts, resources.ts, audit.ts
    client.ts          Database connection (PGlite locally, Postgres in production)
  i18n/                Language detection and switching
  messages/            fr.json, en.json — every interface string
drizzle/               Generated SQL migrations (committed)
tests/                 Vitest tests, each against a fresh in-memory Postgres
scripts/migrate.ts     Applies migrations to a hosted database
apps/, packages/       Empty folders kept from the initial setup; unused by design (see below)
```

**How a request flows:** page or form → server action (`actions.ts`: checks the user's role, validates input with zod) → service (`service.ts`: business rules, database writes, audit entry) → database. Services receive the database as a parameter, which is why they can be tested without a browser.

## Decisions and trade-offs

### One app, not frontend + API + packages
For a small team and one product, a single Next.js app is the simplest thing that works: one deployment, one set of dependencies, server code next to the pages that use it. The empty `apps/` and `packages/` folders from the initial setup were kept (nothing is deleted without approval) but are not used. They can be removed safely.
*Revisit if:* a native mobile app or third-party integrations need a public API — Next.js route handlers can provide one without splitting the project.

### PostgreSQL, with PGlite for local development
Postgres handles relational data well and later supports full-text search and vector search (`pgvector`) for the AI tutors — one database instead of several services. Locally we use **PGlite**, real Postgres compiled to WebAssembly, so nothing needs installing.

**How it runs (changed in Phase 2):** `pnpm dev` starts `pglite-server` (official ElectricSQL package) on port 54329 with the data in `.data/pglite`, then launches `next dev` with `DATABASE_URL` pointing at it. The app always talks to Postgres through the same driver (postgres.js) in development and production.
*Why:* when PGlite ran inside the Next.js dev server, it crashed after sign-in/verification requests and left the data folder unreadable. This did not reproduce in plain Node or in the production build; the exact trigger inside the dev server was not identified. Running PGlite in its own process removed the crash in every test.
*Limitations of local mode:* one process at a time can open the data folder; the local server accepts one connection at a time (the app uses a single pooled connection for local URLs so transactions never interleave); performance is lower than a real server. Production must use a hosted Postgres (`DATABASE_URL`). Tests and scripts still use PGlite in-process, where it works correctly.

### Better Auth for accounts
| Option | Verdict |
| --- | --- |
| **Better Auth** (chosen) | Open source, actively maintained, TypeScript-first. Password hashing, sessions, email verification and rate limiting built in. Data stays in our own Postgres (helps with Law 25). Free. Trade-off: younger project than Auth.js. |
| Auth.js / NextAuth | v5 in long beta; email/password support intentionally limited. |
| Lucia | Deprecated in 2025 (now a learning resource). |
| Clerk, Supabase Auth | Polished hosted services, but student data lives with a third party, free tiers have limits, and switching away later is costly. |

We wrote **no custom password or session security**: hashing, session tokens and cookie handling all come from Better Auth.

### Course vs course offering
A **course** is the stable catalog entry (code, title, credits). A **course offering** is one teaching of it in a specific academic year and term, with its own instructors. Future notes, exam passes and AI tutor context will attach to offerings, so a new professor never silently inherits a previous professor's material as current content.

### Bilingual content
Interface text comes from translation files. Catalog data stores French (required — the source language) and English (optional) side by side. When English is missing, the French original is shown and labelled, rather than auto-translated.

### Source tracking
Programs, courses, professors and offerings each record `source_name`, `source_url` and `source_retrieved_on`, so imported information always says where it came from.

## Database

Tables (see `src/db/schema/`):

| Table | Purpose |
| --- | --- |
| `user`, `session`, `account`, `verification` | Better Auth. `user` also has `role` (student/moderator/admin) and `approval_status` (pending/approved/rejected). |
| `programs` | Academic programs |
| `courses` | Catalog entries; code unique and normalized (`DMD 1234`); credits/year/term nullable — never guessed |
| `professors` | Instructors (unique name) |
| `course_offerings` | Course × academic year × term (unique together) |
| `offering_instructors` | Which professors teach which offering |
| `audit_log` | Who did what, when (catalog edits, imports, approvals, role changes, uploads, moderation) |
| `resources` | A shared document: course, optional offering, kind, title, topic, `is_official`, status (pending/published/hidden/removed) |
| `resource_versions` | Every uploaded file (append-only): storage key, original name, type, size, SHA-256, change note, rights confirmation |
| `resource_reports` | Problem reports; one open report per person per document (partial unique index) |
| `course_topics`, `course_notes`, `course_note_versions`, `resource_topics`, `note_topics`, `question_topics`, `resource_question_links`, `note_question_links` | Course library (topics, private notes with versions, link tables). See `docs/library-topics.md` |
| `study_calendar_entries` | The student's own calendar entries (private, `user_id` owner-only). See `docs/calendar-analytics.md` |

### Shared documents (Phase 2)
- **Current vs historical** is computed, not stored: a document tied to the course's most recent offering (latest academic year, then fall < winter < summer) is *current*; one tied to an older offering is *historical*; one with no offering is *general* and shown with current material. Adding a new offering automatically moves older material to the archive without editing it.
- **Files** are written to private storage under a random key (`resources/<uuid>`), never under the uploaded name, and never overwritten. The database keeps the original name for downloads.
- **Downloads** go through `/api/files/<versionId>`, which re-checks the viewer's permission on every request. Previews are served inline only for PDFs and images; everything else is a download.
- **Status flow:** student upload → `pending` → moderator publishes → `published` (or `hidden`/`removed`). Moderator uploads are published directly. A student's new version returns the document to `pending`.

Constraints are enforced by the database too (unique codes, year of study 1–8, credits ≥ 0, academic year format `YYYY-YYYY`), not only by form validation.

### Changing the schema
1. Edit `src/db/schema/*.ts`.
2. `pnpm db:generate` → creates a SQL file in `drizzle/`. Read it.
3. Locally it applies itself on the next `pnpm dev`. For a hosted database: `pnpm db:migrate`.
4. Prefer additive changes (new tables/columns). Never drop data without an explicit decision.

## How future phases fit

| Feature | Where it plugs in |
| --- | --- |
| Notes & outlines (Phase 2) | ✅ Implemented — see "Shared documents" above. |
| Exam passes (Phase 3) | `questions` linked to offerings, with status (submitted → verified/rejected); reuse the Phase 2 moderation queue, reports pattern and audit log. |
| Flashcards & Anki (Phase 4) | 🔄 First version built: `src/server/study/*`, tables in `src/db/schema/study.ts`, screens under `/practice`. See `docs/study-tools.md`. |
| AI tutors (Phase 5) | Text chunks + embeddings in Postgres (`pgvector`), retrieval filtered by offering; provider behind an interface. |
| Audio (Phase 6) | Uploads to private storage; a transcription provider interface; transcripts become searchable chunks. |

## Testing

`pnpm test` runs Vitest. Each test file creates a fresh **in-memory Postgres** with all migrations applied, so tests exercise the real schema and constraints. Covered: authentication rules, permission rules, catalog validation, CSV import, search, offerings, account approval, configuration validation, translation completeness, and (Phase 2) uploads, file-type checks, duplicate detection, versions, current/historical classification, library filters, visibility/download permissions, moderation, reports, and private storage (including path-escape attempts).
Not yet automated: browser-level tests. Phases 1 and 2 were verified manually in a real browser (sign-up, uploads, preview, moderation, reports, both languages and themes, 390 px phone width).


## Personal resource extension — 2026-10-29

`resources.visibility` is `shared | private`, with a database check constraint and a default of
`shared` for migration compatibility. The upload form explicitly defaults to `private`.
No new service or dependency was added. Existing version history and storage are reused.
Read, edit, download, list, filter, summary and duplicate detection paths all enforce visibility.
Private resources bypass shared-content moderation and cannot be marked official.

Current catalog codes are globally unique. Supporting identical course codes across universities,
separate university libraries and memberships needs a future additive catalog migration; neutral
wording alone does not implement university tenancy.
