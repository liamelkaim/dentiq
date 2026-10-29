# Security and privacy

This is a record of decisions, not a claim of compliance. **DentOS is not yet production-ready** — see "Before going live" below.

## In place (Phase 1)

**Accounts**
- Better Auth handles password hashing (scrypt), session tokens and cookies. Session cookies are `HttpOnly`, `SameSite=Lax`, signed with `BETTER_AUTH_SECRET`, and `Secure` when served over HTTPS.
- Passwords: 10–128 characters.
- Email must be confirmed before first sign-in.
- New accounts start as **pending students**. `role` and `approval_status` cannot be set by the user (tested against the real sign-up endpoint).
- Admins cannot change their own role or approval status (prevents accidental lock-out).
- Rate limiting on sign-in, sign-up and verification emails in production (Better Auth's built-in limiter; in-memory, so per server instance).

**Authorization**
- Every protected page and every server action checks the user's role **on the server** (`requireUser` / `requireRole`). Hidden buttons are only a convenience.
- Next.js server actions reject cross-site requests (origin check).

**Data handling**
- All input validated with zod on the server; the database also enforces constraints.
- Source links must be `http(s)` (no `javascript:` links). Search input is escaped.
- CSV import: `.csv` only, 1 MB / 2,000 rows maximum.
- Secrets live in `.env` (ignored by git). `.env.example` contains placeholders only. The app refuses to start with missing or placeholder secrets.
- Security headers: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, strict referrer policy, permissions policy.
- Audit log for catalog changes, imports, approvals and role changes.

**Data minimization**
We store only: name, email, password hash, role, approval status, session metadata (IP address and browser, from Better Auth). No real student data is used in development; test data uses `@example.com` addresses and `TEST`/`DEMO` course codes.

## Student verification (policy not final)

Designed but deliberately left open:
- Email confirmation proves control of an address, **not enrollment**.
- `ALLOWED_EMAIL_DOMAINS` can restrict sign-up to e.g. `umontreal.ca` (off by default).
- Administrator approval is required before contributing (enforced from Phase 2 via `canContribute()`).
Decision needed before launch: which combination to require.

## Before going live (not done)

- [ ] Real email provider for verification and password reset (password reset not implemented yet).
- [ ] Hosted Postgres with automated backups and a tested restore.
- [ ] HTTPS deployment; confirm `BETTER_AUTH_URL` uses `https://`.
- [ ] Shared rate-limit storage if running more than one server instance.
- [ ] Content Security Policy header.
- [ ] Account deletion and data export for users.
- [ ] Privacy policy and terms (French and English).
- [ ] Dependency update routine (`pnpm outdated`, `pnpm audit`).

## Legal questions to review (Québec / Canada)

Flagged for qualified review — **not** answered here:
- **Law 25** (Québec private-sector privacy law): person in charge of personal information, privacy impact assessment before collecting student data, consent wording, data residency of any hosting provider, breach notification process.
- **Recordings (Phase 6):** consent of professors and classmates; university recording policies.
- **Copyright:** redistribution of course notes, outlines and slides; past exam questions and instructor rules (Phase 2–3).
- **Use of the Université de Montréal name or logo** — currently text-only with a non-affiliation notice.
