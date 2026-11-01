# Setup

## Run it locally

```
cd "/Users/liamelkaim/Documents/Claude code projects/Adam's Database/DentOS"
pnpm install            # first time only
cp .env.example .env    # first time only, then fill in the values below
pnpm dev                # app on http://localhost:3000, local database in ./.data/pglite
```

Minimum `.env` for local use: `BETTER_AUTH_SECRET` (32+ random characters, `openssl rand -base64 32`), `BETTER_AUTH_URL=http://localhost:3000`, and `ADMIN_EMAILS` (your email, so you become the first admin). Leave `DATABASE_URL` empty: `pnpm dev` starts its own local database. Nothing else is needed.

Sign-up emails are not sent. The confirmation link is printed in the terminal where `pnpm dev` runs.

Everyday: `pnpm check` (typecheck, lint, tests), `pnpm build`, `pnpm db:generate` after schema changes, `pnpm db:migrate`.

## What is on locally

Accounts and sign-in, courses and documents, exam passes and moderation, practice, progress, flashcards, quizzes, exports, notes, topics, search, calendar, analytics, profile with data export and account deletion, French and English, light and dark, the offline page.

## What is off, and why

| Thing | State | To turn on |
|---|---|---|
| AI tutor | **Off.** Needs an admin switch AND a provider. No provider exists in the code, no key, no network call. The page only offers source search. | Choose a provider and a budget, then add a provider (see `docs/ai-tutor.md`). |
| Neon (hosted Postgres) | **Off.** Local database only. | Set `DATABASE_URL` on the host. |
| Vercel Blob (file storage) | **Off.** Files go to a private local folder (`UPLOADS_DIR`). | Needs `BLOB_READ_WRITE_TOKEN` and `DENTIQ_ENABLE_BLOB=true` (hosting only). |
| Resend (email) | **Off.** Emails go to the terminal. | Needs `RESEND_API_KEY`, `EMAIL_FROM` and `DENTIQ_ENABLE_RESEND=true`, plus a verified sender. |
| Recordings and transcription | **Not built.** See `docs/audio-readiness.md`. | Needs decisions first. |
| Analytics, ads, external fonts or scripts | **None exist.** | n/a |

The `DENTIQ_ENABLE_*` flags default off even if keys are present on your computer, so a stray key cannot spend money locally.

## Before any hosting

1. Rotate every credential that has ever been in an iCloud-synced `.env.vercel` or `.env.local` (database, Blob, Resend, auth secret, Vercel token).
2. Use a hosted Postgres, private file storage and a verified email sender. Run migrations first (see `docs/hosting-plan.md`).
3. Rate limits are shared in the database now (done). On a host other than Vercel, set `TRUSTED_IP_HEADER` only if a proxy you control overwrites that header (see `docs/hosting-plan.md`).
4. Request bodies are capped (done): server actions 2 MB, file uploads checked per kind in `/api/uploads`.
5. Set `BETTER_AUTH_URL` to the https address and decide `ALLOWED_EMAIL_DOMAINS` (enrollment policy).
6. Fill in the contact address in the privacy and terms pages and get a legal (Law 25) review. The pages are marked DRAFT.
7. Add a high-resolution logo (1024 px PNG or SVG) and regenerate the icons.
8. Nonce-based Content-Security-Policy is on (done, browser-tested). Re-check the browser console for CSP messages on the real host.
9. Decide the file retention policy and backups.
10. Check the Vercel, Neon, Blob and Resend dashboards for anything unexpected before connecting anything.
