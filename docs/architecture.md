# Architecture

## In one paragraph

DentOS is **one Next.js application** written in TypeScript. The same app renders the pages and runs the server code (database queries, permission checks), so there is no separate API to deploy. Data lives in **PostgreSQL**, accessed through **Drizzle ORM** with versioned SQL migrations. Accounts are handled by **Better Auth**, an open-source library that stores users in our own database. The interface is bilingual (French default, English) with **next-intl**, styled with **Tailwind CSS** and shared design tokens, and installable on a phone's home screen (web app manifest).

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
    users/             Account approval and roles
    audit.ts           Audit log writer
    email.ts           Mailer interface (console in development)
    env.ts             Configuration validation
  db/
    schema/            Tables: auth.ts, catalog.ts, audit.ts
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

### PostgreSQL, embedded locally (PGlite)
Postgres handles relational data well and later supports full-text search and vector search (`pgvector`) for the AI tutors — one database instead of several services. Locally we use **PGlite**, real Postgres compiled to WebAssembly, so nothing needs installing.
*Limitations of local mode:* one process at a time can open the data folder; performance is lower than a real server; some Postgres extensions aren't available. Production must use a hosted Postgres (`DATABASE_URL`).

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
| `audit_log` | Who did what, when (catalog edits, imports, approvals, role changes) |

Constraints are enforced by the database too (unique codes, year of study 1–8, credits ≥ 0, academic year format `YYYY-YYYY`), not only by form validation.

### Changing the schema
1. Edit `src/db/schema/*.ts`.
2. `pnpm db:generate` → creates a SQL file in `drizzle/`. Read it.
3. Locally it applies itself on the next `pnpm dev`. For a hosted database: `pnpm db:migrate`.
4. Prefer additive changes (new tables/columns). Never drop data without an explicit decision.

## How future phases fit

| Feature | Where it plugs in |
| --- | --- |
| Notes & outlines (Phase 2) | New `resources` + `resource_versions` tables linked to `course_offerings`; files in private object storage behind a storage interface; `canContribute()` already gates uploads. |
| Exam passes (Phase 3) | `questions` linked to offerings, with status (submitted → verified/rejected), audit history and moderation via the `moderator` role. |
| Flashcards & Anki (Phase 4) | Cards generated from questions/resources; TSV export first. |
| AI tutors (Phase 5) | Text chunks + embeddings in Postgres (`pgvector`), retrieval filtered by offering; provider behind an interface. |
| Audio (Phase 6) | Uploads to private storage; a transcription provider interface; transcripts become searchable chunks. |

## Testing

`pnpm test` runs Vitest. Each test file creates a fresh **in-memory Postgres** with all migrations applied, so tests exercise the real schema and constraints. Covered: authentication rules, permission rules, catalog validation, CSV import, search, offerings, account approval, configuration validation, and translation completeness.
Not yet automated: browser-level tests (theme/language switching and full sign-up were verified manually in a real browser for Phase 1 — see roadmap).
