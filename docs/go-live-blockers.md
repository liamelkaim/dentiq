# Go-live blockers (updated 2026-11-01)

Status key: **DONE** = built and tested in code (a real host still has to confirm it), **OPEN** = work left that I can do in code, **NEEDS ME** = only the owner can do it (decision, account, money, legal). Nothing has been deployed, pushed or bought. Companions: `docs/hosting-plan.md` (steps), `docs/launch-checklist.md` (item by item).

## Fixed in code

| Blocker | Status | What was done |
|---|---|---|
| Shared rate limiting | DONE | Counters in the database (works on serverless, no paid service). Own limiter: table `rate_limits`, `allowAttempt(db, key, limit, windowSeconds)` as one atomic upsert, expired rows deleted by about 2% of calls (`src/server/rate-limit/`). Better Auth uses `rateLimit.storage: "database"` with table `auth_rate_limit` (it needs exactly key, count, lastRequest). Migration `drizzle/0009_rate_limits.sql` (additive). Replaced the in-memory limiter for export and account deletion; added limits to `/search`, tutor search, `/api/study-export`, `/api/calendar-export`. Tests: limit, window reset, 40 concurrent calls cannot pass 10, per-key isolation, cleanup, Better Auth on database storage. Browser check on a production build: tutor 20/min and search 40/min enforced exactly, calendar export 30/hour then 429. |
| Trusted client IP | DONE | `TRUSTED_IP_HEADER` (`src/server/rate-limit/client-ip.ts`): automatic `x-forwarded-for` on Vercel, otherwise none (safe default: one shared counter per page, Better Auth logs a warning). Only known header names accepted. |
| Body-size cap | DONE | Server actions capped at 2 MB (was 26 MB). Document upload, new version and question images moved to `/api/uploads/<kind>`: session and origin checked first, then a counted read capped per kind, HTTP 413 plus the same friendly message. Tested in the browser (30 MB refused for documents and images, a PDF and a question with an image upload and show correctly). |
| Nonce-based CSP | DONE | `src/proxy.ts` makes a fresh nonce per request; scripts need it (no `'unsafe-inline'` for scripts), next-themes receives it. Styles keep `'unsafe-inline'` (style attributes). Verified in Chrome on a production build and in dev: sign-in, dashboard, theme toggle, admin forms, upload, PDF preview, question page, practice, calendar, tutor, search, privacy, `/offline`, service worker: zero CSP violations. All pages render per request (they already did). Fallback if the real host shows violations: send the header as `Content-Security-Policy-Report-Only` (`docs/security-privacy.md`). |

## Still open

| Blocker | Status | Notes |
|---|---|---|
| Rotate credentials that ever sat in an iCloud-synced `.env.vercel` / `.env.local` | NEEDS ME | `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`, `RESEND_API_KEY`, `BETTER_AUTH_SECRET`, Vercel token, any Neon key. I never read `.env*`. Rotating `BETTER_AUTH_SECRET` signs everyone out. |
| Domain and `BETTER_AUTH_URL` | NEEDS ME | Buy a domain, connect it, set `BETTER_AUTH_URL` to the https address. HSTS `includeSubDomains`/preload only after the domain is final. |
| Hosted Postgres, private Blob store, verified Resend sender | NEEDS ME | Accounts, money and DNS records. Code paths exist and are off by default. Run migrations (latest `0009`) on a copy first. |
| Hobby vs Pro, spend limit | NEEDS ME | Vercel Hobby is non-commercial; set a spend limit before inviting students. Re-check all prices. |
| Privacy contact, privacy and terms text, legal review | NEEDS ME | Pages carry a DRAFT banner and a contact placeholder; a qualified person must review before the banner goes. |
| Law 25 (Quebec) review | NEEDS ME | Person in charge, impact assessment, consent wording, data residency (Neon has no Canadian region), cross-border transfer, breach process. Not claimed anywhere. |
| Admin account and enrollment policy | NEEDS ME | Set `ADMIN_EMAILS` and `ALLOWED_EMAIL_DOMAINS`; sign up first with the admin address and verify. |
| Backups and a tested restore | NEEDS ME | Neon branch or point-in-time restore plus a periodic export; Blob files are not covered by a database restore. |
| Logo | NEEDS ME | Source is 224x93 px; a 1024 px PNG or SVG is needed, then I regenerate the icons. |
| File retention and deletion policy | BUILT with safe defaults (2026-11-01); owner to confirm the defaults | `/admin/retention` (dry run, then Apply) and `pnpm retention` / `pnpm retention --apply`. Defaults: 30-day grace after removal, 100 note versions per note, orphans reported only. No scheduler yet. Remaining: confirm or change the defaults (`src/server/retention/constants.ts`), schedule it on the host, test against the real Blob backend (it has no file listing, so the orphan scan reports "unavailable" there and only the local disk backend is tested), and decide on backups. Details in `docs/account-data.md`. |
| Password reset | DONE in code (2026-11-02) | Forgot-password and reset pages, 1-hour links, no account enumeration, rate limited, other sessions signed out. Delivery to real students still needs a domain verified in Resend (NEEDS ME). |
| Upload hardening | PARTLY DONE (2026-11-02) | Per-student upload allowance (100 MB total of stored document files, moderators exempt, `UPLOAD_QUOTA_BYTES_PER_USER`). Still no antivirus scan. |
| Dependency advisory (zod via `@vercel/blob`) | NEEDS ME (exact steps) | `pnpm audit` (2026-11-02): high, zod <4.6.6 reached only through `@vercel/blob > @vercel/oidc > @vercel/cli-config > zod` (the app's own zod is 4.6.7, safe); two moderate dev-tool advisories (esbuild, minimatch via eslint tooling, not shipped). The override was written and tested, then REVERTED because pnpm cannot install through the iCloud `node_modules` symlink ("workspace hoist directory is not a real directory"). To apply it: move the project out of iCloud (or temporarily replace the `node_modules` symlink with a real folder), add `overrides:` with `"zod@<4.6.6": 4.6.7` to `pnpm-workspace.yaml`, run `pnpm install`, then `pnpm audit`. A fresh install on Vercel is unaffected by the symlink. |
| Confirm on the real host | OPEN | Cookie flags (Secure, HttpOnly, SameSite), headers via `curl -I`, `no-trusted-ip` absent from `auth_rate_limit` keys, CSP console clean, smoke test in `docs/vercel-deployment.md`. |
| Browsers and devices not tested | OPEN | Safari, Firefox, real phones, screen readers, PWA install prompt. |
| Upload size on Vercel | OPEN (by design) | Hosted uploads are 4 MB because Vercel rejects larger function bodies (about 4.5 MB). Larger files would need direct-to-Blob uploads (new code and a Blob store); decide if 4 MB is enough. |


## Deployment progress (2026-11-01)

| Step | State |
|---|---|
| Private GitHub repo `liamelkaim/dentiq`, `main` pushed (history scanned first: no secrets, only `.env.example`) | DONE |
| Vercel project `dentiq` | BLOCKED: the Vercel CLI is not installed or signed in on this computer, and no Vercel connector is available. Needs a one-time login by the owner. |
| Neon database (new credentials), migrations 0000 to 0010 applied | BLOCKED: no Neon access. Create the project in the Neon dashboard (free tier), then apply migrations before the first deploy. |
| Vercel Blob (private store) | BLOCKED: created from the Vercel project's Storage tab. |
| Resend (verified sender, new key) | BLOCKED: needs a Resend account; a vercel.app address cannot send from its own domain, so the sandbox sender only reaches the account owner's email. |
| New `BETTER_AUTH_SECRET`, env vars, preview deploy, live checks, production deploy | NOT STARTED (depend on the four rows above) |
| Latest migration is now `0010_file_retention` (after `0009_rate_limits`) | NOTE |

### Vercel findings (read-only, after owner signed in)

- A Vercel project named `dentiq` already exists (created before tonight, never deployed). It still holds the OLD credentials: Neon integration resource `neon-crimson-marble` plus its `DATABASE_*`/`PG*` variables, a Blob store (`BLOB_*`), `RESEND_API_KEY`, `EMAIL_FROM`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `ADMIN_EMAILS`. Values were not read.
- Rule from the owner: never reuse old credentials. So before deploying: detach the old Neon resource (`vercel integration resource disconnect neon-crimson-marble dentiq`, does not delete data), remove the old variables, create a NEW Neon database, a NEW private Blob store, a NEW Resend key and a NEW `BETTER_AUTH_SECRET`, then delete the old Neon resource and Blob store after confirming they hold nothing needed.
- BLOCKED: the detach command was refused by Claude Code's permission classifier (modifies a shared resource). Needs the owner to run it or to allow it.
- Resend is available as a Vercel Marketplace product (`resend/resend-email`); a vercel.app address cannot send from its own domain, so mail only reaches the account owner until a domain is verified.

## Deployment status, new project `dentiq-app` (2026-11-01, run while owner away)

Old `dentiq` project: untouched (still holds old credentials and the old Neon resource `neon-crimson-marble`; nothing was disconnected or deleted).

| Step | State |
|---|---|
| New Vercel project `dentiq-app` (Hobby), this folder linked to it | DONE |
| New Neon database `dentiq-app-db` (free plan), connected to dentiq-app only | DONE |
| Migrations 0000 to 0010 applied to the new database (11 recorded, 38 tables, `rate_limits` and `auth_rate_limit` present) | DONE |
| New private Blob store `dentiq-app-files` (region yul1), connected to dentiq-app | DONE |
| New `BETTER_AUTH_SECRET` (generated here, never printed), `BETTER_AUTH_URL=https://dentiq-app.vercel.app`, `ADMIN_EMAILS` (production and preview) | DONE; confirm the URL after the first deploy and that ADMIN_EMAILS is the address you will sign up with |
| Resend (free) | BLOCKED: Vercel needs you to accept the Resend terms in a browser: https://vercel.com/liamelkaim/~/integrations/accept-terms/resend?source=cli . Then rerun `npx vercel integration add resend/resend-email --name dentiq-app-mail --billing-plan free --no-env-pull -e production -e preview`. A vercel.app address cannot send from its own domain, so mail only reaches the Resend account owner's email until a domain is verified. |
| `EMAIL_FROM` | NOT SET (needs Resend; e.g. the Resend sandbox sender) |
| Preview deploy, live checks (admin sign-up, sign-in, upload, pass question, CSP console check, legal pages), production promote | NOT DONE (the app refuses to start on Vercel without RESEND_API_KEY and EMAIL_FROM, by design) |

When Resend is connected: set `EMAIL_FROM`, run `npx vercel deploy` (preview), check it, then `npx vercel deploy --prod`. If the console shows CSP errors, switch the header in `src/proxy.ts` to `Content-Security-Policy-Report-Only`.

Cleanup for you later (never done by me): the old `dentiq` project's Neon resource and Blob store, and the old credentials, once confirmed empty/unneeded. Old credentials must still be rotated at the providers.

### Resend, update (same day)

The Vercel Marketplace route for Resend requires a domain you own (`--meta domain=...`) and offered only paid plans (Pro $20/mo, Scale $90/mo) at install time, so it was NOT used (free tiers only). Free route instead: create a Resend account directly (resend.com), create an API key, and add it yourself so it never appears in chat:

```
! npx vercel env add RESEND_API_KEY production --sensitive
! npx vercel env add RESEND_API_KEY preview --sensitive
```

`EMAIL_FROM` is already set to `Dentiq <onboarding@resend.dev>` (Resend's sandbox sender, which only delivers to the email address that owns the Resend account, so sign up to Resend and to Dentiq with the same address as ADMIN_EMAILS). Real students cannot receive verification emails until a domain is bought and verified in Resend.

### Dependency audit (2026-11-01)

`pnpm audit --prod`: one high advisory, `zod` below 4.6.6 nested under `@vercel/blob` (the app's own `zod` is 4.6.7). Not fixed: `pnpm install` cannot run here because `node_modules` is an iCloud symlink, and an `overrides: zod: 4.6.7` entry without an updated lockfile would break the Vercel build. To fix: copy the project to a normal folder, add that override to `pnpm-workspace.yaml`, run `pnpm install`, commit `pnpm-lock.yaml`. Dev-only advisories (esbuild via drizzle-kit, minimatch via eslint) do not ship. Password reset and per-user upload quota remain OPEN (not started: auth-critical, they need a browser test with real email).

### Student emails and the single administrator (2026-11-01)

Enforced in code and tested (first ADMIN_EMAILS address only, no promotion to admin, students need an allowed domain, admin exempt). See `docs/student-verification.md`. Not switched on in production: set `ALLOWED_EMAIL_DOMAINS=umontreal.ca` and redeploy after the owner agrees; students cannot get verification email until a sender domain is verified in Resend.
