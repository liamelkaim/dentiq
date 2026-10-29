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

**Uploaded documents (Phase 2)**
- Files are stored outside the public web folder (`.data/uploads`, owner-only permissions `600`/`700`) under random keys; storage keys can't escape the folder (tested).
- Every download re-checks permissions on the server: unauthenticated → 401; not allowed → 404 (doesn't reveal that the file exists).
- File type decided from the file's first bytes *and* extension (PDF, DOCX, PPTX, PNG, JPG). HTML, SVG, scripts and renamed executables are rejected. 25 MB limit.
- Responses: `Content-Disposition` (attachment unless previewing a PDF/image), `X-Content-Type-Options: nosniff`, `Cache-Control: private, no-store`, framing allowed only by DentOS itself; non-PDF files are additionally sandboxed by CSP.
- Only approved members (and moderators) can see shared files. Student uploads are reviewed before publication. Removed documents are hidden from everyone but moderators; the file is kept for the record (no hard delete yet).
- Uploaders must confirm they have the right to share; each document shows a personal-use notice. **This is not a copyright clearance process** — see legal questions below.
- Not yet: antivirus scanning, per-user upload quotas, retention/deletion policy for removed files.

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
