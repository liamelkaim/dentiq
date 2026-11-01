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
| File retention and deletion policy | OPEN (needs a decision) | Removed documents and images stay on storage; note versions unbounded. I can build a hard-delete job once you pick the rule. |
| Password reset | OPEN | Not built; users who forget a password need an admin. Needs the email sender first. |
| Upload hardening | OPEN | No antivirus scan, no per-user upload quota. |
| Dependency advisory (zod via `@vercel/blob`) | OPEN | Owner-reported, not re-verified. Run `pnpm audit` and `pnpm outdated` before deploy. |
| Confirm on the real host | OPEN | Cookie flags (Secure, HttpOnly, SameSite), headers via `curl -I`, `no-trusted-ip` absent from `auth_rate_limit` keys, CSP console clean, smoke test in `docs/vercel-deployment.md`. |
| Browsers and devices not tested | OPEN | Safari, Firefox, real phones, screen readers, PWA install prompt. |
| Upload size on Vercel | OPEN (by design) | Hosted uploads are 4 MB because Vercel rejects larger function bodies (about 4.5 MB). Larger files would need direct-to-Blob uploads (new code and a Blob store); decide if 4 MB is enough. |
