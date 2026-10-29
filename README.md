# DentOS

A study platform for dentistry students, starting with Université de Montréal.
Independent student project — not affiliated with or endorsed by the university.

**Current status: Phase 1 (foundation) complete.** See [docs/roadmap.md](docs/roadmap.md) for what works and what is planned.

## Run it locally

You need **Node.js 22+** and **pnpm** (both already installed on the development Mac). Nothing else — the database runs inside the app.

```bash
cd "$HOME/Documents/Claude code projects/Adam's Database/DentOS"
pnpm install          # first time only
pnpm dev              # starts http://localhost:3000
```

If port 3000 is busy: `pnpm dev --port 3100` **and** set `BETTER_AUTH_URL=http://localhost:3100` in `.env` (sign-in checks that the two match).

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

Other people who sign up start as **pending students**: they confirm their email, then you approve them in **Administration → Comptes**.

## Everyday commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | Run the app with live reload |
| `pnpm test` | Run the automated tests |
| `pnpm typecheck` | Check TypeScript types |
| `pnpm lint` | Check code style and common mistakes |
| `pnpm check` | All three of the above |
| `pnpm build` then `pnpm start` | Production build, run it |
| `pnpm db:generate` | Create a migration after changing `src/db/schema/` |
| `pnpm db:migrate` | Apply migrations (needed for a hosted Postgres; local DB migrates itself) |

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
| `DATABASE_URL` | production only | A Postgres connection string. Empty = local embedded database in `.data/pglite` |
| `ADMIN_EMAILS` | no | Comma-separated emails that become administrators on sign-up |
| `ALLOWED_EMAIL_DOMAINS` | no | Comma-separated domains allowed to sign up (e.g. `umontreal.ca`). Empty = any |
| `PGLITE_DATA_DIR` | no | Alternative folder for the local database |

The app refuses to start with a clear message if a required setting is missing or invalid.

## Local data

- Your local database lives in `.data/pglite` (ignored by git). Deleting that folder resets all local data — accounts and catalog included.
- Only one program can open the local database at a time: stop `pnpm dev` before running `pnpm db:migrate`.

## Documentation

- [docs/architecture.md](docs/architecture.md) — how the app is built and why
- [docs/security-privacy.md](docs/security-privacy.md) — security decisions, privacy, open legal questions
- [docs/roadmap.md](docs/roadmap.md) — implemented / planned / blocked, known issues
