# Hosting plan (prepared 2026-11-01, nothing created or bought)

**Prices change. Verify every price on the provider's page before buying.** All figures are USD per month, read on 2026-11-01 from the pages listed below. Nothing here is a quote. Currency conversion to CAD and taxes are not included.

## Sources (read 2026-11-01)

| Provider | URL | What was read |
|---|---|---|
| Vercel | https://vercel.com/pricing | Hobby $0; Pro $20/mo with $20 usage credit, extra seats $20 each; Hobby is "personal, non-commercial use"; Hobby cannot buy more usage |
| Neon | https://neon.com/pricing | Free: 100 CU-hours/project, 1 GB/project, 6 h restore window. Launch: $0.106 per CU-hour, $0.35 per GB-month, restore up to 7 days. Scale $0.222/CU-hour |
| Vercel Blob | https://vercel.com/docs/vercel-blob/usage-and-pricing | Hobby: 1 GB, first 10,000 simple and 2,000 advanced ops, 10 GB transfer, blocked (not billed) when exceeded. Pro: usage-based; example in the page uses $0.023/GB storage, $0.40 per 1M simple ops, $5 per 1M advanced ops, $0.05/GB data transfer (iad1), $0.06/GB fast origin transfer (iad1). Private and public priced the same for storage and ops |
| Resend | https://resend.com/pricing | Free: 3,000 emails/mo, 100/day, 3 domains. Pro $20 for 50,000/mo, $35 for 100,000, $0.90 per 1,000 overage if enabled |
| Regions | https://vercel.com/docs/regions and https://neon.com/docs/introduction/regions | Vercel has a Montreal region (yul1). Neon lists 8 AWS regions, none in Canada |
| Domain | https://domainoffer.net/tld/ca (third-party tracker, snapshots Jun to Oct 2026) | .ca roughly 8 to 12 USD per year at Cloudflare, Porkbun, Namecheap; some registrars far more. Not read from registrar pages directly; CIRA prices not found |

## Assumptions (mine, not measured)

- Students with accounts: 50 (pilot), 500, 2,000.
- Stored documents and images: about 40 MB per student, so about 2 GB, 20 GB, 80 GB. Uploads are capped at 4 MB per file on Vercel.
- Emails: about 3 per student per month (verification, notices), with a sign-up burst at semester start. 150, 1,500, 6,000 per month.
- Database: small (under 1 GB at 50 and 500 students, a few GB at 2,000). Compute is the uncertain part; I assumed 0.25 to 1 CU, active about 100, 250 and 500 hours per month because the database sleeps when idle. Real usage must be measured.
- Downloads: private files stream through a Vercel function, so they incur function, transfer and Blob operation charges. I assumed a few GB to a few tens of GB of transfer per month, mostly inside Pro included allowances.
- One developer seat (the owner).

## Estimated monthly cost per scenario (USD)

| Scenario | Free tiers only | Recommended paid |
|---|---|---|
| 50 students | $0 (Vercel Hobby + Neon Free + Blob Hobby + Resend Free) | about $20 to 25 (Vercel Pro $20, Neon Launch about $2 to 5, Blob and email within the free amounts or the Pro credit) |
| 500 students | Not recommended: Neon Free (100 CU-hours, 1 GB) and Hobby limits would likely be hit; Resend 100/day is tight on sign-up days | about $30 to 60 (Pro $20, Neon about $10 to 20, Blob about $1 to 5, Resend $0 to 20) |
| 2,000 students | Does not fit | about $75 to 125 (Pro $20, Neon about $25 to 55, Blob about $5 to 20 including transfer, Resend $20 to 35) |

Plus a domain: about $8 to 12 per year (about $1 per month).

Caveats that matter more than the totals:
- **Vercel Hobby is for non-commercial use.** Whether a student study platform qualifies is the owner's call; read Vercel's terms. Hobby also cannot raise limits: when the cap is hit, service stops.
- Free Neon allows only a 6-hour restore window, which is weak for a real backup story. Free Blob blocks access for up to 30 days when exceeded.
- Pro has a usage-based part that is uncapped by default. Set a Spend Management limit in Vercel before inviting students.
- Compute at Neon and bandwidth at Vercel are the uncertain lines; check dashboards after week one.

## Canadian data residency and Law 25 (not legal advice)

- Student names, emails, notes and uploaded documents are personal information. Law 25 (Quebec) raises questions about where it is stored, cross-border transfers, an impact assessment, and breach notification. A qualified person must decide; this plan does not.
- Vercel offers a Montreal compute region (yul1) per its regions page. Neon lists no Canadian region, so the database would be in the US or Europe unless Neon adds one on request (their page says regions can be requested). Whether Blob offers a Canadian region was not confirmed.
- If data must stay in Canada, alternatives to evaluate with the owner (not recommended or priced here): a Canadian-region managed Postgres at another provider, and Canadian-region object storage. That means code and migration work; ask before changing anything.
- Resend processes email content and recipient addresses; check its region and data processing terms.
- The app does not log in third-party analytics, ads or fonts (`docs/setup.md`).

## Credentials that may need rotation (names only)

`DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`, `RESEND_API_KEY`, `BETTER_AUTH_SECRET`, the Vercel account token or CLI login, and any Neon API key or password. Rotate all of them if they ever sat in an iCloud-synced `.env.vercel` or `.env.local` (`docs/setup.md`). Rotating `BETTER_AUTH_SECRET` signs everyone out.

## Runbook for the owner (do in order; stop if anything is unexpected)

1. **Decide first**: Hobby vs Pro, region, enrollment policy (`ALLOWED_EMAIL_DOMAINS`), who is the privacy contact. Re-check all prices.
2. **Accounts**: create or sign in to Vercel, Neon (Vercel Marketplace integration is fine), Resend, and a domain registrar. Enable two-factor on each. Set a Vercel spend limit.
3. **Domain**: buy it; add it to the Vercel project; add the DNS records Vercel shows. Wait for https to be active.
4. **Database**: create a Neon project (note the region). Keep a pooled URL for the app and a direct URL for migrations.
5. **Blob**: create a **private** Blob store linked to the project.
6. **Email**: add the domain in Resend, add its DNS records, wait for "verified", choose the sender address.
7. **Environment variables** (set in Vercel, never in chat or git; names only): `DATABASE_URL`, `BETTER_AUTH_SECRET` (random, 32+ chars), `BETTER_AUTH_URL` (the https domain), `BLOB_READ_WRITE_TOKEN`, `DENTIQ_ENABLE_BLOB=true`, `RESEND_API_KEY`, `EMAIL_FROM`, `DENTIQ_ENABLE_RESEND=true`, `ADMIN_EMAILS` (your email), optionally `ALLOWED_EMAIL_DOMAINS`, `ACADEMIC_YEAR_START_MONTH`. Do **not** set `ALLOW_LOCAL_DATABASE` or `UPLOADS_DIR`. `vercel.json` runs `scripts/vercel-preflight.mjs` and fails the build if required ones are missing.
8. **Before deploying**: resolve the open items in `docs/go-live-blockers.md` (privacy contact and legal review, backups, retention, logo). Rate limits, the body cap and the nonce CSP are already done in code. Run `pnpm check` and `pnpm build`.
9. **Migrations**: follow the safe procedure below, on a preview copy first, then production. The latest, `0009_rate_limits.sql`, adds two small tables (`rate_limits`, `auth_rate_limit`); without it sign-in is refused by the production rate limiter.
10. **Deploy**: deploy a Preview first and use a separate database branch and Blob store for it; promote to production only after the smoke test.
11. **First admin**: sign up at the site with the `ADMIN_EMAILS` address, click the verification email, confirm you land as admin.
12. **Smoke test** (as in `docs/vercel-deployment.md`): sign up a second test account, email arrives and verifies, admin approves it, create a course, upload a private file (under 4 MB), owner preview and download work, second account is denied the private file (404), response headers present (`curl -I`), cookies are Secure/HttpOnly in the browser, 404 and error pages render, no console errors.
13. **Invite** a small group first; watch Vercel, Neon and Resend usage for a week.

## Rate limiting, request size and CSP on the host (done in code, 2026-11-01)

- **Rate limits are in the database** (tables `rate_limits` and `auth_rate_limit`, migration `0009_rate_limits.sql`), so they work across Vercel's serverless instances with no paid service. They add one small database round trip to sign-in, exports, `/search` and the tutor search; expired rows are deleted by about 2% of calls, no cron job. Limits are listed in `src/server/rate-limit/limits.ts` and `src/server/auth/auth.ts`.
- **Trusted client IP** (the sign-in and sign-up limits count per IP): on Vercel nothing to set, `VERCEL=1` makes the app trust `x-forwarded-for`, which Vercel overwrites with the real client address (`x-real-ip` is equivalent: set `TRUSTED_IP_HEADER=x-real-ip` to use it). Off Vercel, leave `TRUSTED_IP_HEADER` empty unless a proxy you control overwrites the header; empty means all visitors share one counter per page (safe, coarse). Never point it at a header a browser can send directly. After the first deploy, check that two different networks get separate sign-in counters (table `auth_rate_limit`, keys like `<ip>|/sign-in/email`; a key starting `no-trusted-ip` means the header is not being read).
- **Request size**: server actions are capped at 2 MB; uploads go to `/api/uploads/<kind>` with their own cap (4 MB file on Vercel, `src/server/resources/files.ts`). Vercel itself rejects bodies over about 4.5 MB before the app sees them.
- **CSP**: nonce-based, set per request by `src/proxy.ts`; all pages render per request. If the console on the real domain shows CSP violations, see `docs/security-privacy.md` for the report-only fallback.

## Safe database migration procedure

1. **Never run against production first.** Migrations in `drizzle/` must be additive only (new tables or nullable columns). Review the generated SQL for `DROP`, `ALTER ... TYPE`, `NOT NULL` without default, or renames; stop and ask if any appear.
2. **Back up first**: note the exact time, and create a Neon branch of production (a copy-on-write snapshot) or a dump, and confirm it exists. On the free plan the restore window is only 6 hours, so branch immediately before migrating.
3. **Rehearse on the copy**: point `DATABASE_URL` in your local shell (not on the command line) at the branch, run `pnpm db:migrate`, then run the app and the smoke test against it.
4. **Run on production** only if step 3 was clean, using the direct (non-pooled) URL, outside request handling, at a quiet hour. Never run migrations automatically during a build.
5. **Verify**: sign in, load key pages, check row counts against the backup.
6. **Roll back**: because migrations are additive, the previous app version keeps working against the new schema; first roll back the app (below). If data was damaged, restore from the Neon branch or point-in-time restore to the noted time, or switch `DATABASE_URL` to the verified branch. Do not hand-delete columns or tables to "undo" without a reviewed plan.

## Rollback plan

- **Bad deploy**: in Vercel, redeploy or promote the previous production deployment (instant rollback in the dashboard). No data change needed if only additive migrations ran.
- **Bad config or secret**: revert the environment variable and redeploy; rotate any secret that may have leaked, then redeploy.
- **Email problem**: sign-ups cannot verify; pause invites. Do not disable email verification.
- **Data problem**: stop writes if possible (take the site down or restrict sign-in), restore from the Neon branch or point-in-time restore, then re-verify. Blob files are not restored by database restore; deleted files are not recoverable unless exported, so keep a periodic export.
- **Everything wrong**: remove the custom domain from the project or pause the project in Vercel; no data is lost by pausing.
- Keep a written record of times: last good deploy, migration start, backup name.
