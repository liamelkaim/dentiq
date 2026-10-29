# DentOS

A study platform for dentistry students, starting with Université de Montréal.
Independent student project — not affiliated with or endorsed by the university.

**Current status: Phase 2 (academic resources) complete.** See [docs/roadmap.md](docs/roadmap.md) for what works and what is planned.

## Run it locally

You need **Node.js 22+** and **pnpm** (both already installed on the development Mac). Nothing else — `pnpm dev` starts a local database for you.

```bash
cd "$HOME/Documents/Claude code projects/Adam's Database/DentOS"
pnpm install          # first time, and after pulling new code
pnpm dev              # starts the local database + the app on http://localhost:3000
```

Stop with **Ctrl+C** — it shuts down the app and then the database cleanly.

If port 3000 is busy: `PORT=3100 pnpm dev` **and** set `BETTER_AUTH_URL=http://localhost:3100` in `.env` (sign-in checks that the two match).

### First-time setup

1. Copy the example settings (skip if `.env` already exists):
   ```bash
   cp .env.example .env
   openssl rand -base64 32   # paste the result as BETTER_AUTH_SECRET in .env
   ```
2. Put your own email in `ADMIN_EMAILS=` in `.env` so your account becomes an administrator.
3. `pnpm dev`, open the app, and **create an account** with that email.
4. **Confirm your email:** no email service is connected yet, so the confirmation link is printed in the terminal where `pnpm dev` runs (look for `[DentOS email]`). Open that link.
5. You're signed in as an administrator. Go to **Administration → Catalogue** to add courses or import a CSV.

Other people who sign up start as **pending students**: they confirm their email, then you approve them in **Administration → Comptes**. To make someone a moderator, change their role there.

## Sharing documents

- Approved members open a course and choose **Ajouter un document**: PDF, DOCX, PPTX, PNG or JPG, 25 MB max. They must confirm they have the right to share it.
- Student uploads wait in **Modération** until a moderator publishes them. Moderators' and admins' uploads are published directly.
- Each upload is linked to a course offering (year + term). Material from older offerings appears under **Archives**, never mixed with current material.
- Uploading a new file to an existing document creates a new **version**; old versions stay downloadable.
- Files are private: they're stored in `.data/uploads` and can only be opened by signed-in members through DentOS.

## Everyday commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | Start the local database and the app with live reload |
| `pnpm dev:app` | Start only the app (when `DATABASE_URL` points to your own Postgres) |
| `pnpm test` | Run the automated tests |
| `pnpm typecheck` | Check TypeScript types |
| `pnpm lint` | Check code style and common mistakes |
| `pnpm check` | All three of the above |
| `pnpm build` then `pnpm start` | Production build and run (needs `DATABASE_URL`, or `ALLOW_LOCAL_DATABASE=true` plus `pnpm db:migrate` to try it locally) |
| `pnpm db:generate` | Create a migration after changing `src/db/schema/` |
| `pnpm db:migrate` | Apply migrations (needed for a hosted Postgres; `pnpm dev` migrates the local database itself) |

## Importing courses (CSV)

First row (only `code` and `title_fr` are required):

```
code,title_fr,title_en,description_fr,description_en,credits,year_of_study,term
```

`term` accepts `automne/hiver/été` or `fall/winter/summer`. Rows with the same code update the existing course.
Fill in the **source** fields (e.g. "Ampho Académique", date consulted) when importing so every course records where it came from.
**Never enter invented courses, credits or professors.**

## Settings (`.env`)

| Variable | Required | Meaning |
| --- | --- | --- |
| `BETTER_AUTH_SECRET` | yes | Random 32+ character string that signs sessions. Keep secret. |
| `BETTER_AUTH_URL` | yes | The app's address, e.g. `http://localhost:3000` |
| `DATABASE_URL` | production only | A Postgres connection string. Empty = `pnpm dev` uses the local database in `.data/pglite` |
| `ADMIN_EMAILS` | no | Comma-separated emails that become administrators on sign-up |
| `ALLOWED_EMAIL_DOMAINS` | no | Comma-separated domains allowed to sign up (e.g. `umontreal.ca`). Empty = any |
| `UPLOADS_DIR` | no | Folder for uploaded documents (default `.data/uploads`) |
| `ALLOW_LOCAL_DATABASE` | no | `true` only to try the production build on your own computer. Never on a server |
| `PGLITE_DATA_DIR` | no | Local database folder for `pnpm db:migrate` and scripts (default `.data/pglite`) |

The app refuses to work with a clear message if a required setting is missing or invalid.

## Local data

- Local data lives in `.data/` (ignored by git): `.data/pglite` (database) and `.data/uploads` (documents). Deleting `.data` resets everything — accounts, catalog and files. Back it up by copying the folder while `pnpm dev` is stopped.
- Only one program can open the local database at a time: stop `pnpm dev` before running `pnpm db:migrate` or other database scripts. (`pnpm build` doesn't touch it.)

## Documentation

- [docs/architecture.md](docs/architecture.md) — how the app is built and why
- [docs/security-privacy.md](docs/security-privacy.md) — security decisions, privacy, open legal questions
- [docs/roadmap.md](docs/roadmap.md) — implemented / planned / blocked, known issues
