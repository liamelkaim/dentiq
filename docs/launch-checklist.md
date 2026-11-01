# Launch checklist (prepared 2026-11-01, nothing launched)

Status is based on reading the code on 2026-11-01, not on a live deployment. DONE means the code exists; it does not mean it has been tested on a real host. Companion: `docs/hosting-plan.md`.

| Item | Status | Evidence / what is missing |
|---|---|---|
| Custom domain connected | NEEDS ME | No domain bought or connected. `BETTER_AUTH_URL` must be the final https URL (`scripts/vercel-preflight.mjs` refuses non-https). Decide HSTS `includeSubDomains`/preload only after the domain is final (`src/lib/security-headers.ts`). |
| Favicon and icons present | DONE (with a caveat) | `src/app/icon.png` (64x64), `src/app/apple-icon.png` (180x180), `public/icon-192.png`, `public/icon-512.png`, `public/icon-maskable-512.png`, wired in `src/app/manifest.ts`. Caveat: the logo source is low resolution (224x93); a 1024 px PNG or SVG is wanted. |
| Privacy policy and terms with contact address and legal review | NOT DONE | Pages exist: `src/app/(legal)/privacy/page.tsx`, `src/app/(legal)/terms/page.tsx`, FR and EN. They show a DRAFT banner and the contact is a placeholder (`contactPlaceholder` in `src/messages/en.json`). Owner must supply the person in charge and address; a lawyer must review. |
| Hosted database | NOT DONE (code ready) | Nothing created. Code supports hosted Postgres via `DATABASE_URL`; the preflight rejects localhost. Migrations in `drizzle/` (latest `0008_ai_tutor_usage.sql`) are run manually with `pnpm db:migrate`. Neon has no Canadian region (see hosting plan). |
| Private file storage | NOT DONE (code ready) | Vercel Blob code path exists behind `DENTIQ_ENABLE_BLOB` and `BLOB_READ_WRITE_TOKEN` (`src/server/storage.ts`); private store required, downloads stream through the authorized `/api/files` route. No store created. Hosted upload cap 4 MB (`docs/vercel-deployment.md`). |
| Verified email sender | NOT DONE | Resend path exists behind `DENTIQ_ENABLE_RESEND`, `RESEND_API_KEY`, `EMAIL_FROM`. Needs a domain you own, DNS records added, sender verified. Resend's test sender cannot reach arbitrary students. Email verification stays on. |
| Admin account setup | NEEDS ME | `ADMIN_EMAILS` makes a matching sign-up an approved admin (`src/server/auth/auth.ts`, user.create.before). Owner must set it to their real address, sign up first, and verify the email. Last-admin guard exists. Decide `ALLOWED_EMAIL_DOMAINS` (enrollment policy, e.g. umontreal.ca). |
| Backups | NOT DONE | No backup or restore tested. Relies on the provider (Neon point-in-time restore: 6 h free, up to 7 days Launch per pricing page). Blob has no versioning in this app; removed files are kept on storage. Owner needs a tested restore and a periodic export. |
| Security headers | DONE | `src/lib/security-headers.ts`, `src/proxy.ts`, `next.config.ts`: nosniff, referrer policy, X-Frame-Options DENY, permissions policy, nonce-based CSP for pages (no inline scripts allowed; styles keep `'unsafe-inline'`), HSTS (production only). Browser-tested on a production build and in development; tested by `tests/platform-quality.test.ts`. |
| Rate limits | DONE in code (verify on host) | Shared in the database: Better Auth limiter (`storage: "database"`: sign-in 5/min, sign-up 3/min, verification 3/min, production only) and `rate_limits` for export, deletion, `/search`, tutor search, study and calendar export (`src/server/rate-limit/limits.ts`). Needs migration `0009` on the hosted database. Trusted IP header: automatic on Vercel, else `TRUSTED_IP_HEADER` (`docs/hosting-plan.md`). |
| Error pages (404 and 500) | DONE | `src/app/not-found.tsx`, `src/app/error.tsx`, `src/app/global-error.tsx`, `src/app/forbidden.tsx`. Browser-tested on the production build (overnight log, block I). |
| HTTPS only | DONE in code, verify on host | HSTS `max-age=31536000` in production; preflight rejects a non-https `BETTER_AUTH_URL`. Vercel serves https and redirects http. Confirm with curl after the first deploy. |
| Cookie settings | DONE in code, verify on host | Better Auth: HttpOnly, SameSite=Lax, signed with `BETTER_AUTH_SECRET`, Secure over https (`docs/security-privacy.md`; `src/server/auth/auth.ts` sets session 30 days, refresh daily). No explicit `useSecureCookies` or `cookiePrefix` is set in `auth.ts`; check the cookie flags in the browser on the real https domain. |
| Law 25 review | NEEDS ME | Not done and not claimed. Needs: person in charge of personal information, privacy impact assessment, consent wording, hosting data residency decision, breach process, retention. See `docs/security-privacy.md` and `docs/account-data.md`. Export and deletion exist but are unreviewed. |

## Known gaps (not fixed)

- **Retention**: removed documents and question images stay on storage; no retention or hard-delete policy; note versions unbounded.
- **Logo**: source is 224x93 px; need 1024 px PNG or SVG, then regenerate the icons.
- **Dependency advisory**: a zod advisory reported through `@vercel/blob` (owner-reported; not re-verified here). Run `pnpm audit` and `pnpm outdated`; the project pins `zod` 4.6.7 itself.
- Password reset is not built (needed before real users forget passwords).
- Not browser-tested: Safari, Firefox, real devices, screen readers, PWA install prompt, (the PDF preview inside the nonce CSP was tested in Chrome).
- No antivirus scanning or per-user upload quota.

## Must do before anyone can go live

1. Rotate every credential that ever sat in an iCloud-synced `.env.vercel` or `.env.local` (names: `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`, `RESEND_API_KEY`, `BETTER_AUTH_SECRET`, Vercel token).
2. Buy the domain; set `BETTER_AUTH_URL` to its https address.
3. Create hosted Postgres, a private Blob store and a verified Resend sender; run migrations on a copy first (hosting plan).
4. (Done) Shared rate limits, request-body cap and nonce CSP: `docs/go-live-blockers.md`.
5. Fill in the privacy contact, get a Law 25 / legal review, remove the DRAFT banners only after that.
6. Set `ADMIN_EMAILS`, decide `ALLOWED_EMAIL_DOMAINS`, create the first admin, run the smoke test.
7. Confirm backups work with a real restore test.
8. Decide whether Vercel Hobby (non-commercial terms) or Pro fits; check the pricing pages again before buying.
9. Replace the low-resolution logo and regenerate icons (cosmetic, can follow launch, but fix before public sharing).
10. Run `pnpm check`, `pnpm build`, and `pnpm audit` before the first deploy.
