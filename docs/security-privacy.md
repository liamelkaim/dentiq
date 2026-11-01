# Security and privacy

This is a record of decisions, not a claim of compliance. **Dentiq is not yet production-ready** — see "Before going live" below.

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
- Responses: `Content-Disposition` (attachment unless previewing a PDF/image), `X-Content-Type-Options: nosniff`, `Cache-Control: private, no-store`, framing allowed only by Dentiq itself; non-PDF files are additionally sandboxed by CSP.
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


## Personal document access — 2026-10-29

The resource visibility is independent of moderation status. Existing records retain `shared`;
new UI uploads default to `private`. Server-side read/edit checks enforce ownership before role
privileges, so an administrator cannot retrieve another user's private document through the app.
File version downloads use the same rule. Private items are excluded from moderation, other users'
searches, topic suggestions and document counts. Duplicate detection is scoped to private owner
or shared collection, avoiding disclosure that another user holds the same private file.

A personal document's internally `published` status means available to its owner, not shared.
New versions keep visibility. No visibility-changing action is exposed. Only approved, verified
members may upload in either mode. Existing shared-resource moderation policy is unchanged.

This does not encrypt documents from the machine/server operator. Personal documents remain on
private local disk, with the existing file limits and validation. Account deletion, retention,
malware scanning and hosted storage remain production prerequisites.


## Study tools privacy — 2026-11-01

Attempts, flag/review-later marks, personal flashcards, card schedules, quizzes and quiz results are stored per student
(`study_*` tables) and every query filters on the signed-in user; other students and moderators cannot read them through
the app (tested). Study tools only ever read published exam questions the viewer may see. Exports (`/api/study-export`)
check the session on every request, include only published questions in the chosen scope plus the student's own cards and
progress, are sent with `Cache-Control: private, no-store`, and neutralise spreadsheet formulas by prefixing cells that start
with `=`, `+`, `-`, `@`, tab or carriage return. Study data is deleted with the account (cascade). Not yet: a user-facing
"download or erase all my data" screen.


## Notes, topics and links privacy — 2026-11-01

Typed notes (`course_notes`) are private to their owner: no other student, moderator or administrator can read, list, search,
restore or link them through the app (tested). A link between a document, note or question is shown only when the viewer may see
both sides, so another person's private note or document, and any non-published question, is never named, counted or hinted at on a
question page, topic page, Related panel or in search. Topics are shared course metadata managed by moderators and administrators
only. Audit entries for notes record ids and version numbers, never text. Notes are deleted with the account (cascade). Same
caveat as private documents: this does not encrypt notes from the machine operator, and there is no user-facing "erase all my data"
screen yet.


## AI tutor privacy — 2026-11-01

The tutor is off and has no provider: no question, note or document text leaves the server. The retrieval layer reuses the library, notes and published-question rules, so a student's search (and any future prompt) can contain only what that student may open: never another student's private note or document, and never a non-published question or an unverified answer (tests in `tests/tutor.test.ts`). Usage rows store counts, not text. If a provider is ever connected, the question and the matched excerpts, including the student's own private notes, would be sent to that third party; the conditions to settle first (Law 25 assessment, no-training terms, student notice and opt-in, rights over shared material) are listed in `docs/ai-tutor.md`. Retrieved text is wrapped as quoted data before it reaches any model (prompt-injection mitigation, not a guarantee).
