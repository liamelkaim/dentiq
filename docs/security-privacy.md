# Security and privacy

This is a record of decisions, not a claim of compliance. **Dentiq is not yet production-ready** — see "Before going live" below.

## In place (Phase 1)

**Accounts**
- Better Auth handles password hashing (scrypt), session tokens and cookies. Session cookies are `HttpOnly`, `SameSite=Lax`, signed with `BETTER_AUTH_SECRET`, and `Secure` when served over HTTPS.
- Passwords: 10–128 characters.
- Email must be confirmed before first sign-in.
- New accounts start as **pending students**. `role` and `approval_status` cannot be set by the user (tested against the real sign-up endpoint).
- Admins cannot change their own role or approval status (prevents accidental lock-out).
- Rate limiting on sign-in, sign-up and verification emails in production (Better Auth's built-in limiter, counters in the database table `auth_rate_limit`, keyed by client IP and path; see "Rate limiting" below).

**Authorization**
- Every protected page and every server action checks the user's role **on the server** (`requireUser` / `requireRole`). Hidden buttons are only a convenience.
- Next.js server actions reject cross-site requests (origin check).

**Data handling**
- All input validated with zod on the server; the database also enforces constraints.
- Source links must be `http(s)` (no `javascript:` links). Search input is escaped.
- CSV import: `.csv` only, 1 MB / 2,000 rows maximum.
- Secrets live in `.env` (ignored by git). `.env.example` contains placeholders only. The app refuses to start with missing or placeholder secrets.
- Security headers: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, strict referrer policy, permissions policy, a Content-Security-Policy and (production only) Strict-Transport-Security. See "Content Security Policy" below.
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
- [x] Shared rate-limit storage (database): done, see "Rate limiting" below.
- [x] Content Security Policy: nonce-based for pages (`src/proxy.ts`), browser-tested on a production build and in development; see "Content Security Policy and headers" below.
- [~] Account deletion and data export for users: built 2026-11-01 (`docs/account-data.md`); **needs legal (Law 25) review** and a browser test.
- [~] Privacy policy and terms (French and English): drafts exist with a visible DRAFT banner and a contact placeholder; **not reviewed by a lawyer**, contact not filled in.
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


## Profile, export and deletion privacy — 2026-11-01

`/profile/export` builds the JSON from explicit column lists, filtered on the signed-in user's id, and is sent `private, no-store` as an attachment. It never contains password hashes, session tokens, storage keys, file fingerprints, other students' data or moderator identities (tests in `tests/account.test.ts`). Account deletion re-checks the password through Better Auth, requires the typed email, refuses the last approved administrator, runs in one transaction, deletes private rows and their stored files, detaches published contributions (author columns become empty) and keeps an audit entry with counts only. Better Auth's own `/delete-user` endpoint stays disabled (tested). The export and deletion forms are rate limited in memory per server instance. Everything here is a draft pending legal review; see `docs/account-data.md` for the open questions.


## Content Security Policy and headers - 2026-11-01 (nonce-based since the same day)

Pages get their policy from `src/proxy.ts` (the Next.js 16 "proxy", formerly middleware), built by `buildNonceCsp()` in `src/lib/security-headers.ts`, with a fresh 128-bit nonce for every request. Next.js reads the nonce from the request's policy header and puts it on its own scripts; the root layout reads `x-nonce` and passes it to next-themes (its theme script). `tests/platform-quality.test.ts` reads the exact policy.

```
default-src 'self'; script-src 'self' 'nonce-<random>' 'strict-dynamic'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:;
font-src 'self' data:; connect-src 'self'; frame-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none';
base-uri 'self'; form-action 'self'; frame-ancestors 'none'
```

(`'unsafe-eval'` is added to `script-src` in development only, because React uses it for debugging.)

- **Scripts**: no `'unsafe-inline'`. An injected inline script or `onclick=` attribute does not run; only scripts with the nonce, or loaded by one (`'strict-dynamic'`), do.
- **Styles keep `'unsafe-inline'`** on purpose: React and Tailwind use `style` attributes, which a nonce cannot cover, and a style cannot run code. (A nonce in `style-src` would make browsers ignore `'unsafe-inline'` and break those attributes, so none is added.)
- **Cost**: every page is rendered per request, no static page or CDN page cache. Dentiq pages already were (the layout reads the language cookie and the session); the only static outputs are the icons and the manifest.
- **Not run through the proxy** (matcher in `src/proxy.ts`): `/api/*`, `/_next/static`, `/_next/image`, `sw.js`, the manifest, the offline page, icons, link prefetches and server-action posts (a proxy on those would buffer the request body). `/api/*` routes answer data, so `next.config.ts` gives them `default-src 'none'; frame-ancestors 'none'` (except `/api/files` and `/api/question-images`, which set their own). The offline page is a static file with one inline script, so it gets the older fixed policy with `'unsafe-inline'` from `next.config.ts` (no user content is served from it).
- **Verified in a real browser** (production build, `next start`, and `next dev`): sign-up, sign-in, dashboard, theme toggle (hydration works), admin forms, document upload and PDF preview in the iframe, question page with an image, practice, calendar, tutor, search, privacy, `/offline`, service worker registration. Zero CSP violations in the console; `eval` is refused.
- **If a page ever shows nothing after a deploy**: look for "Content Security Policy" in the browser console. To fall back quickly, change `src/proxy.ts` to send the header as `Content-Security-Policy-Report-Only` (violations are reported, nothing is blocked) while you investigate.

What it still stops: scripts, images, fonts, frames and connections to other sites, plugins, `<base>` tag tricks, form posts to other sites, framing of Dentiq pages, and now injected inline scripts. The input handling in the rest of this document remains the first defence against injection.

## Rate limiting - 2026-11-01

Counters live in the database, so every serverless instance shares them (no paid service).

- **Own limiter**: table `rate_limits` (key, window start, window length, count), `src/server/rate-limit/service.ts`. One atomic `INSERT ... ON CONFLICT DO UPDATE` per attempt (fixed window, safe under concurrency, refused attempts do not extend the window); about 2% of calls also delete expired rows. All limits are in `src/server/rate-limit/limits.ts`, per signed-in user: account export 5/hour, deletion form 5/15 min, `/search` 40/min, tutor source search 20/min, study export 30/hour, calendar export 30/hour. Over the limit: HTTP 429 with `Retry-After` for downloads, a friendly notice on the pages.
- **Better Auth's limiter** (`storage: "database"`, table `auth_rate_limit`): sign-in 5/min, sign-up 3/min, verification email 3/min, 100/min otherwise, per client IP and path; on in production only, as before.
- **Which IP to trust**: a forwarding header is only trustworthy when your own proxy overwrites it, otherwise anyone can forge it and dodge the limit. `TRUSTED_IP_HEADER` (see `.env.example`): on Vercel (`VERCEL=1`) it defaults to `x-forwarded-for` (Vercel overwrites it with the real client address; `x-real-ip` also works); anywhere else the default is none, so all visitors share one counter per path (safe but coarse; Better Auth logs a warning once). Unknown values are ignored.

## Request body limits - 2026-11-01

Server actions accept at most 2 MB (`next.config.ts`, `serverActions.bodySizeLimit`; the 1 MB CSV import still fits). Forms that send files (new document, new version, question with images) post to `/api/uploads/<kind>` instead (`src/app/api/uploads/[kind]/route.ts`), which checks the session and the request origin first, then reads the body with a hard cap per kind (file limit or image limit plus 512 KB of form fields), counting bytes as they arrive. Over the cap: HTTP 413 and the same friendly "file too large" message as before.

**File previews.** `/api/files/` and `/api/question-images/` are excluded from this rule because they set their own headers (PDF previews:
`frame-ancestors 'self'`; other files and images: `default-src 'none'`, sandbox). The PDF preview is a plain `<iframe>` of `/api/files/...?inline=1`
that uses the browser's built-in viewer; the parent page allows it with `frame-src 'self'`. No PDF.js, no worker, no blob URL is used today
(`blob:` is allowed for images only). Not verified in a browser.

**Strict-Transport-Security** (`max-age=31536000`, no `includeSubDomains` or `preload`) is sent only when `NODE_ENV` is `production`; browsers
ignore it over plain HTTP, so a local `next start` is unaffected. Adding `includeSubDomains` or preloading is one-way and left to the owner once
the final domain exists.

**Service worker.** `/sw.js` caches only public static files and never pages, API responses, uploads or images; see `docs/pwa.md`.
