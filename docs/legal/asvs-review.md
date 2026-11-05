# OWASP ASVS review (2026-11-02, DRAFT)

Method: read the code for the five areas below and compared it with the matching ASVS 4.0 requirement families. This is a **developer self-review, not an independent audit or a certification**, and it does not claim any ASVS level. Chapter numbers are ASVS 4.0 families, used as a guide.

Result: **2 findings fixed with a failing test first**, 3 gaps documented as open decisions, everything else met by code and tests named below.

## Findings fixed

| # | ASVS | Finding | Fix | Test |
|---|---|---|---|---|
| F1 | V11.1 anti-automation | Uploads (documents, versions, question images, recordings), reports and appeals had no per-user rate limit. Uploads had a size cap and a per-student quota, but a script could still send unlimited requests, or flood the moderators' queue with reports. | `RATE_UPLOAD` (20 per 10 min) checked in `/api/uploads/[kind]` after the session and before the body is read, with a 429 answer; `RATE_REPORT` (20 per hour) on both report actions; `RATE_APPEAL` (5 per hour) on appeals. Shared counter in the database, no new service. | `tests/asvs-fixes.test.ts` |
| F2 | V4.1 access control | The new appeal path did not apply the library rule (approved, verified member) used everywhere else, so a rejected account with an old hidden item could still appeal. | `canAppeal` and `submitAppeal` call `canAccessLibrary`. | `tests/asvs-fixes.test.ts` |

## Gaps that need an owner decision (not fixed)

| # | ASVS | Gap | Why not fixed now |
|---|---|---|---|
| G1 | V2.2 / V11 | Sign-in is limited per client IP and path (5 per minute) but there is **no per-account lockout or throttle**. A slow, distributed guess against one account is not stopped. Passwords are 10 to 128 characters; email must be verified. | A lockout lets an attacker lock a student out on purpose; the right trade-off is a product decision. Gate 12 in `launch-gates.md`. |
| G2 | V2.8 | **No second factor.** | Out of scope for this stage; decide with the owner. |
| G3 | V3.3 | Sessions last 30 days and renew daily while used (sliding), so an active session never reaches an absolute limit. Sign-out, password reset and account deletion end sessions; nothing lists or revokes other devices. | Sliding sessions are a usability choice; an absolute limit or a "sign out everywhere" button is a product decision. |

## Checked and met (with evidence)

**Authentication (V2, V3)**
- Passwords hashed by Better Auth (scrypt); 10 to 128 characters (`src/server/auth/auth.ts`). Email must be verified before sign-in; verification links last 24 h, reset links 1 h, and a reset revokes all sessions.
- Sign-up cannot set role or approval; new students are `pending`; the administrator is the first address in `ADMIN_EMAILS`; student domains restricted (`tests/auth.test.ts`, `tests/account-auth.test.ts`).
- Reset and verification messages do not reveal whether an address has an account; the reset email is sent after the response (`auth.ts`).
- Account deletion needs the password again and the typed email, is limited to 5 per 15 min, and Better Auth's own delete endpoint is off (`tests/account-auth.test.ts`).
- Session cookie: HttpOnly, SameSite=Lax, signed with `BETTER_AUTH_SECRET`, Secure over HTTPS (`docs/security-privacy.md`).

**Access control (V4)**
- Every page and server action calls `requireUser` or `requireRole`; services check ownership and approval again (`canAccessLibrary`, `canSeeResource`, `canSeeQuestion`). Another person's private item answers "not found", not "forbidden".
- Moderator and administrator actions use `requireRole`; appeals can be decided by administrators only, not by the moderator who hid the item (`tests/appeals.test.ts`).
- Role changes apply at once: the session lookup reads the user row on every request.
- Own-data export and deletion read and delete only rows keyed to the signed-in user (`tests/account.test.ts`).

**Uploads (V12)**
- File type decided from the first bytes and extension; HTML, SVG and scripts refused; size caps per kind are enforced while the body streams, not from the Content-Length header (`src/server/uploads/read-body.ts`); per-student quota; duplicate detection by hash.
- Stored under random keys outside the web root; every read goes through a permission check; files are served with `nosniff`, `no-store`, `Content-Disposition`, and a sandboxing CSP for non-PDF files (`src/app/api/files/[versionId]/route.ts`, `tests/storage.test.ts`, `tests/uploads.test.ts`).
- The upload route answers 401 before reading any body and refuses a foreign `Origin`.
- **Not done**: antivirus scanning; detection of patient information (not possible in code; warning, confirmation, reports, takedown and appeal instead).

**Sessions and CSRF (V3, V4)**
- SameSite=Lax cookies, Next.js origin check on server actions, own origin check on the upload route. Exports are GET downloads that return data only to the signed-in owner and are rate limited.

**Headers and browser policy (V14)**
- Per-request nonce CSP with `strict-dynamic`, no `unsafe-inline` for scripts, no external hosts allowed, `frame-ancestors 'none'` (previews allowed for Dentiq only), `object-src 'none'`; `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy`; HSTS in production; API answers carry a "nothing may load" policy; `poweredByHeader` off (`src/lib/security-headers.ts`, `src/proxy.ts`, `tests/platform-quality.test.ts`).
- Dependencies: no analytics or tracking libraries (`tests/trust-wiring.test.ts`). A known advisory in `zod` and its handling are tracked in `docs/go-live-blockers.md`.

**Data protection (V6, V8)**
- No emails, tokens, provider responses or request bodies are logged; the console mailer is used only locally and hosted startup refuses it (`src/server/email.ts`).
- Rate-limit keys hold IP addresses; they expire in minutes to an hour.

## Not tested in this review
Penetration testing, dependency audit of the installed tree on the host, real HTTPS/cookie behaviour on the final domain, Safari and Firefox, screen readers.
