# Morning handover

## Deployment status (updated while you were away)

**Production: LIVE at https://dentiq-app.vercel.app** (alias confirmed exact, so `BETTER_AUTH_URL` matches; public pages 200; owner checked sign-up, sign-in and the app by hand and said it looks good). The notes below describe the earlier preview. Preview: Ready at https://dentiq-61rftn8az-liamelkaim.vercel.app (Vercel login protection is on; use `npx vercel curl <path> --deployment <url>` or sign in to Vercel). Resend key and `EMAIL_FROM` are set. The old `dentiq` project was not touched.

**Done on the preview:** build OK (1m), `pnpm check` OK (598 tests), `/sign-in`, `/sign-up`, `/privacy`, `/terms`, `/offline` all 200, nonce CSP and security headers present.

**Not done, and why:** admin sign-up/sign-in, upload, pass question and the browser CSP console check need an account. I can't create accounts or enter passwords, and the verification email goes to your inbox. `BETTER_AUTH_URL` is a hidden secret, so I could not read it; it is meant to be `https://dentiq-app.vercel.app`, which returns 404 until the first production deploy. The preview hostname differs, so sign-in will not work on the preview itself.

**Next, in this order:**
1. `npx vercel deploy --prod`, then `npx vercel inspect <url>` and confirm the alias is exactly `dentiq-app.vercel.app` (otherwise reset `BETTER_AUTH_URL` and redeploy).
2. Sign up there with the `ADMIN_EMAILS` address, click the emailed link, sign in, upload a file, answer a pass question, open DevTools console and look for CSP errors (fallback: `Content-Security-Policy-Report-Only` in `src/proxy.ts`).
3. If anything fails: `npx vercel rollback`.

Fix made: `.vercelignore` now excludes the iCloud copies (`.data 2`, `.next 2`, `node_modules 2`, `*.nosync`); without it the upload was about 4.5 GB and hung. Uncommitted. A stuck earlier `vercel deploy --yes` process (PID 53879) may still be running; kill it.


Nothing was pushed, deployed or connected to Vercel, Neon, Blob or Resend. Everything is committed locally on `main`.

## a) Start the app and sign in

```
cd "/Users/liamelkaim/Documents/Claude code projects/Adam's Database/DentOS"
pnpm dev
```

Open http://localhost:3000. Your own `.env` decides the first admin: sign up with the email listed in `ADMIN_EMAILS`. The confirmation link is printed in the terminal, not emailed.

**Test accounts:** your own dev database has none. I only created fake `@example.com` accounts in throwaway databases in a temporary folder, which are not yours to sign into. To test, sign up with fake example.com emails (the terminal shows each link), approve them as admin, and promote one to moderator. `docs/setup.md` has details.

## b) What works, what is off, what is planned

**Works (tested in a real browser on a scratch database):** accounts and approval, courses and documents with moderation, exam passes (4 question types, images, verification, history), practice, progress, flashcards, quizzes, CSV/TSV/Anki export, topics, private notes with version history, search, calendar, analytics, profile, data export, account deletion, French/English, light/dark, phone to desktop, keyboard use, offline page.

**Switched off, on purpose:**
- AI tutor: needs a provider and a budget. No answers are generated; the page only searches your course sources with citations.
- Neon, Vercel Blob, Resend: not connected. Local database, local files, emails printed in the terminal.

**Planned, not built:** recordings and transcription (`docs/audio-readiness.md`), reminders, shared notes, email change.

**Unverified:** Anki "All in One" compatibility; importing the `.ics` file into Apple, Google or Outlook calendars.

## c) Final check results

typecheck: exit 0. lint: exit 0. tests: 29 files, 543 passed. production build: exit 0. Browser: about 40 functional steps passed, plus an 800-page-load matrix (7 widths, light/dark, FR/EN) that ended with 0 overflow, 0 touch targets under 44 px on phones, 0 low-contrast text and 0 console errors on the re-checked pages. Details in `docs/overnight-log.md`.

## d) Known problems

- (Fixed afterwards: shared database rate limits, 2 MB server-action cap with uploads on `/api/uploads`, nonce-based CSP. See `docs/go-live-blockers.md`.)
- Very narrow effective screens (390 px at 200% zoom) clip some dropdowns.
- Not tested: Safari, Firefox, real phones, screen readers, the install prompt.
- The logo source is low resolution (224x93), so icons are soft.
- One dependency advisory (`zod`, via `@vercel/blob`), not used locally.
- Legal pages are drafts with a contact placeholder.

## e) Things only you can do

1. Rotate the Neon, Blob, Resend, auth and Vercel credentials that sat in iCloud-synced `.env.vercel` and `.env.local` files (names listed in `docs/hosting-plan.md`). I never read or printed their values.
2. Check the Vercel dashboard for anything unexpected.
3. Send a high-resolution logo (1024 px PNG or SVG) of the D monogram, and every icon can be regenerated.
4. Get a legal review (Law 25) of the privacy policy, terms and account deletion, and fill in the contact address.
5. Decide on an AI provider and a monthly budget (or leave the tutor off).
6. Decide the recordings policy, if you want that feature.
7. Provide real course and professor data when you are ready (nothing is invented).

## f) Three most valuable next steps

1. Fix the hosting blockers (shared rate limiting, body-size cap, nonce CSP) and follow `docs/hosting-plan.md` and `docs/launch-checklist.md`.
2. Get a few real students (with consent) to try it on your computer or a private preview, and fix what confuses them.
3. Load one real course with real, rights-cleared material, so the library, passes and practice can be judged on real content.
