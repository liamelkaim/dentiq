# Morning handover (2026-11-02)

Branch `finish/dentiq-polish` (about 16 commits on top of `main`). Previous handover: `docs/morning-2026-11-01.md`. Deployment result is in the last section.

## What was done

- **Phase 1** first-run onboarding (university preset, year, semester, skippable), Help page, loading/offline/empty states reviewed; browser QA of 12 pages at 390 and 768 px in both themes and languages.
- **Phase 2** admin email-domain settings with a UdeM preset (umontreal.ca and subdomains, admin exempt), bilingual HTML and text emails, email verification (24 h) with an expired-link page and rate-limited resend, password reset (1 h link, no enumeration, rate limited).
- **Phase 3** UdeM D.M.D. research from official pages only (`data/programs/udem-dmd.json`, `docs/udem-research.md`): 167 verified courses, 5 years, faculty calendar 2026-2027; calendar with class blocks, terms, breaks, exam periods, `.ics` import and export, "verify with your faculty" notes.
- **Phase 4** intake CLI (`pnpm intake`, dry run by default, local-only import; `docs/intake.md`).
- **Phase 5** recordings (private, OFF by default, consent checklist, limits, player, notes; `docs/recordings.md`).
- **Phase 6** AI tutor built and OFF: consent, real-patient refusal, token and cost caps, saved conversations, fake provider (inert in production). Owner decisions at the top of `docs/ai-tutor.md`.
- **Phase 7** per-student upload quota; zod advisory analysed (cannot be installed through the iCloud symlink, exact steps in `docs/go-live-blockers.md`); end-to-end walk in a real browser; accessibility and overflow sweeps.
- **Phase 7B** public welcome page, Feedback button and admin inbox, shared footer, metadata, robots, sitemap, share image, favicon, phone menu drawer.
- **Phase 8** independent Opus review: 0 critical, 3 important, 5 minor; all fixed with failing tests first; re-review said safe to deploy.

## Results

| Check | Result |
|---|---|
| Typecheck, lint | pass (0 warnings) |
| Tests | 731 pass in 40 files |
| Build | pass (a harmless "PGlite failed to initialize" line appears during local builds while `pnpm dev` holds the local database; not seen on a host with `DATABASE_URL`) |
| Browser journeys (scratch DB, real Chrome) | sign-up, email link, onboarding, admin approval, note, exam question, calendar, schedule, recordings (upload with and without consent, Range 206/416, speed control), tutor (off state), feedback (real submit), password reset: all passed |
| Link check | 251 internal links as a student and 29 as admin: no 4xx or 5xx |
| Static accessibility sweep | 28 pages, EN and FR: titles, one h1, lang, labels, link names, alt, duplicate ids: clean |
| Overflow and touch targets | 390 and 768 px, dark and light, EN and FR, public and app pages: no overflow; only checkboxes measure 16 px inside 44 px labels |
| Lighthouse mobile (local production build) | welcome page 100/100/100/100; sign-in 100/100/100/100; course page (signed in) accessibility 97 (fixed), best practices 100, SEO 66 by design (noindex) |

## Screenshots taken (viewed in the session, not saved to the repo)

Home 1440 px vs mockup 09; My schedule (light); Calendar December 2026 with a break marker; Recording player with speed buttons; Welcome page full page (dark).

## UNVERIFIED items (see `docs/open-questions.md`)

UdeM student email domains (`umontreal.ca` preset); D.M.D. exam periods and re-sit dates (not published); 2027-2028 term dates; whether the general UdeM calendar applies to D.M.D. students; two weekday typos in the faculty PDF; onboarding year/semester ranges (generic 1 to 6 and 1 to 3 versus UdeM's 5 years).

## Not tested

Safari, Firefox, real phones, screen readers, real email delivery to students, the tutor with a real provider, recordings on the hosted Blob store, the ask-the-tutor screen in a live browser (production mode makes the fake provider inert), keyboard focus order in the new dialogs beyond the native `<dialog>` behaviour.

## Owner steps still needed

1. **Domain and Resend**: buy a domain, verify it in Resend, set `EMAIL_FROM`; until then mail reaches only the Resend account owner.
2. **Faculty confirmation** of the email domains and the curriculum/calendar data.
3. **Legal review** of the privacy and terms pages (DRAFT banner stays) and a Law 25 review.
4. **Credential rotation** for anything that sat in iCloud-synced env files.
5. **AI provider and budget**, privacy wording and consent text (`docs/ai-tutor.md`); keep the tutor OFF until decided.
6. **Recordings policy** (lecturer permission, storage budget); keep OFF in production (Vercel's 4.5 MB request limit blocks real lectures anyway).
7. **Logo** source at 1024 px or SVG; a contact email (`CONTACT_EMAIL`); spend limit on Vercel.
8. **zod advisory**: copy the project out of iCloud, add the override, `pnpm install`, commit the lockfile.
9. Real testimonials, counters, case studies or photos for the welcome page, only if true (slots listed in `docs/open-questions.md`).

## Ten-line summary

1. Nine phases plus launch polish built on `finish/dentiq-polish`; nothing fabricated: UdeM data comes from official pages with sources.
2. Onboarding, Help, public welcome page, Feedback, phone menu, metadata, robots, sitemap, share image.
3. Email domain preset, bilingual emails, verification and password reset.
4. UdeM D.M.D. courses and faculty calendar, personal schedule, `.ics` import and export.
5. Intake CLI for your own notes and exams (dry run first, local only).
6. Recordings and the AI tutor are built and OFF; no third party receives any data.
7. Independent review fixed: feedback erasure, multi-day `.ics`, reset timing, and more.
8. 731 tests, lint and build green; browser journeys, link check, accessibility and Lighthouse pass.
9. Account export and deletion extended to every new table.
10. Deployment outcome: see the section below.

## Deployment (Phase 9)

(written when Phase 9 ends)
