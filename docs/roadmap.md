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

## Next phases

| Phase | Scope | Status |
| --- | --- | --- |
| 2 | Academic resources: outlines and notes uploads, versioning, course pages | 📋 Recommended next |
| 3 | Exam passes: structured questions, moderation, statuses, exports | 📋 |
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

## Decisions needed from the project owner

- Student verification policy: university domain only, admin approval, or both? ⛔ blocks public launch
- Interpretation of the two pass categories (current year / previous years) — needed for Phase 3
- Hosting provider and budget — before any deployment 🔐

## Known issues / limitations

- Local database (PGlite) can be opened by one process at a time: stop `pnpm dev` before `pnpm db:migrate`.
- `pnpm build` opens the local database folder (creates `.data/pglite` if missing). Harmless.
- No password reset yet — a user who forgets their password needs an admin (or a database reset) for now.
- Rate limiting is in-memory and only active in production mode.
- TypeScript is pinned to 6.0 because the lint tooling doesn't support TypeScript 7 yet.
