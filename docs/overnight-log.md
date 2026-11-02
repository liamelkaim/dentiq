# Overnight log

## FINAL SUMMARY (2026-11-01)

**Built (all committed locally, nothing pushed or deployed):** passes polish, study tools (practice, progress, flashcards, quizzes, export), course library (topics, notes with history, links, search, current vs previous), calendar and analytics, AI tutor grounding layer (OFF, no provider), profile/data export/account deletion, platform quality (PWA shell, CSP, accessibility, error pages). Then an independent security+correctness review (no critical or high findings; 20 fixes), two browser passes (functional walkthrough and a 800-load responsive/theme/language matrix, keyboard, reduced motion, zoom), a clean-database walkthrough, and the launch checklist and hosting plan.

**Final checks (run once more at the end):** typecheck exit 0, lint exit 0, tests 29 files / 543 passed, production build exit 0. Tracked-file scan: only `.env.example` and `.vercelignore` match the sensitive names; no secret-shaped strings found by the reviewer.

**Commits tonight:** 9ddb7a0 (Phase 3 screens), d990d7c (A), 72d3700 (B), c3b1a3f (C), 4a0fbc4 (D), 4ade38a (E), e9a830c (F), b6b2837 (G), 65dc482 (H fixes), 761b0c8 (I1 fixes), 16c789b (I2 fixes + audio plan). The setup guide, roadmap table, launch checklist, hosting plan, MORNING.md and this summary are committed in the final commit.

**Failed or skipped:** logo swap skipped (no 1024 px file in the project; a kit sits in Downloads, outside the project, and its SVGs wrap the same low-res raster). Not tested: Safari, Firefox, real phones, screen readers, PWA install prompt, download dialogs, native select popups. Anki "All in One" compatibility and `.ics` import into calendar apps UNVERIFIED. The 195 px effective viewport (390 px at 200% zoom) still clips some selects. Two usage-limit interruptions paused agents; both resumed from saved work.

**Decisions made for you:** see "Decisions made for the owner" below (constants and defaults, all changeable in code or settings).

**You must do yourself:** rotate Neon, Blob, Resend, auth secret and Vercel credentials that sat in iCloud-synced files; check the Vercel dashboard; send a 1024 px PNG or SVG logo; get a legal (Law 25) review of privacy, terms and account deletion; decide an AI provider and budget; decide recordings policy. Full list in `docs/MORNING.md` and `docs/launch-checklist.md`.

---

> Final summary goes at the top when the run finishes (block M). Until then this is a running log.
> Started 2026-11-01. Phase 3 screens were committed first as `9ddb7a0`.

## Rules for every block (from the owner)

- Never: push, deploy, merge, touch Vercel/Neon/Blob/Resend, add paid services or paid AI/transcription providers, use real student data (`example.com` test accounts only), move the project folder, delete anything outside the scratch folder.
- Never present an unfinished feature as working. Planned features stay clearly marked as planned.
- Every block: French and English text (same keys in `fr.json` and `en.json`), light and dark themes (tokens only), phone/tablet/desktop layouts, server-side permission checks, private-by-default student material, source attribution, brand rules (no purple gradients, no emoji icons, no em dashes in UI copy, no fake numbers).
- Don't rebuild working features. Open decisions: pick a default, make it changeable in settings or constants, record it here.
- After each block: typecheck, lint, tests, build, then a local commit. Before each commit confirm no `.env*`, `.nosync`, `.data`, `.vercel` is staged.

## Block status

| Block | Status | Commit |
|---|---|---|
| Phase 3 screens (carried over) | committed | 9ddb7a0 |
| A. Passes polish | built; typecheck, lint, 212 tests, build all clean; not yet browser-tested | d990d7c |
| B. Study tools (practice, progress, flashcards, quizzes, export) | built; typecheck, lint, 269 tests, build clean; not yet browser-tested; Anki All in One compatibility UNVERIFIED | 72d3700 |
| C. Notes and course library (topics, links, note versions, search, current vs previous) | built; typecheck, lint, 303 tests, build clean; not yet browser-tested | c3b1a3f |
| D. Calendar and analytics (local only) | built; typecheck, lint, 375 tests, build clean; not yet browser-tested; .ics import into calendar apps UNVERIFIED | 4a0fbc4 |
| E. Course-grounded AI tutor shell (retrieval, citations, provider interface; OFF, no provider) | built; typecheck, lint, 439 tests, build clean; not yet browser-tested | 4ade38a |
| F. Profile and account (profile, own-data JSON export, account deletion, legal draft banners) | built; typecheck, lint, 468 tests, build clean; not yet browser-tested; deletion semantics need Law 25 legal review | e9a830c |
| G. Platform quality (PWA shell, CSP, focus, touch targets, loading/error pages, em dash cleanup) | built; typecheck, lint, 496 tests, build clean; needs a browser to verify install, offline page, CSP hydration, safe areas | b6b2837 |
| H. Independent review (security + correctness) and fixes (20 items) | done; typecheck, lint, 533 tests, build clean | 65dc482 |
| I1. Browser walkthrough, clean scratch DB, desktop, FR then EN spot-check (student, moderator, admin) | done; ~40 steps PASS, 3 defects found and fixed; 537 tests, build clean | 761b0c8 |
| I2. Responsive/theme/language/keyboard/motion/zoom matrix + paths part 1 skipped | done; 543 tests, build clean | 16c789b |
| K. docs/audio-readiness.md (plan only) | written | see git log |

## Decisions made for the owner

- A: search page shows the 10 most recent matching questions (`SEARCH_QUESTION_LIMIT` in `src/server/passes/queries.ts`).
- A: dashboard search now opens `/search?q=` (documents plus published questions) instead of `/resources`.
- B: Leitner schedule with six boxes (10 min, 1, 3, 7, 14, 30 days) in `src/server/study/schedule.ts`; other limits in `src/server/study/constants.ts` (10 questions per practice or quiz, max 50; 30 cards per review; 2000 personal cards; 5000 export rows); partly right = half a point (`PARTIAL_CREDIT`).
- B: attempts on unverified answers are stored as unscored and never counted as correct (database CHECK plus tests). Quiz scores are fixed when answered.
- B: still-"soon" nav item renamed "Analytics" so it does not clash with the new Progress page. Flashcards "soon" replaced by a live Study entry (`/practice`).
- B: new migration `drizzle/0005_study_tools.sql` (7 tables, additive).
- C: notes are private to the owner only (no sharing); shared material goes through the document library. Topics are per course, FR name plus optional EN, staff-managed, archived not deleted. Limits in `src/server/library/constants.ts`.
- C: when a course has topics the upload form uses the picker instead of free text; legacy free-text topics stay readable with a badge.
- C: migration `drizzle/0006_library_topics.sql` (8 tables, additive).
- C not done: no topic picker inside question submit/edit forms, no note delete/share, no "My notes" in main nav, search not accent-insensitive.
- D: no per-user time zone yet; one constant `CALENDAR_TIME_ZONE = "America/Toronto"` in `src/server/calendar/constants.ts` decides "today". Change it if wrong.
- D: calendar never pre-fills dates; 1000 entries per student; analytics counts only the viewer's rows, excludes unscored answers, names weak topics only from 5 scored answers (constants in `src/server/analytics/constants.ts`).
- D: migration `drizzle/0007_study_calendar.sql` (1 table, additive). Dashboard "progress coming soon" card replaced by an Analytics link.
- D not built: reminders, recurring entries, .ics import/feed, per-user time zone.
- E: tutor is OFF by default and needs BOTH an admin flag and a configured provider; `PROVIDER_FACTORIES` is empty on purpose, so it cannot turn on. No AI SDK, no key, no network call (checked: no AI package in `package.json`, no `fetch` in `src/server/tutor`). `/tutor` offers plain "search the course sources" with citations, labelled as search, not as an AI answer.
- E: constants in `src/server/tutor/constants.ts`: 10 questions per student per day (admin-changeable 1 to 200), context 6000 characters, unverified answers excluded (`INCLUDE_UNVERIFIED_ANSWERS = false`), previous offerings excluded unless ticked. Documents are matched on title/topic/description only (no extracted text exists; no PDF parser added).
- E: migration `drizzle/0008_ai_tutor_usage.sql` (1 table, counts only, no question text).
- OWNER DECISION STILL OPEN: AI provider choice and budget (see `docs/ai-tutor.md`).
- F: no migration needed (author columns already nullable with SET NULL). Deletion removes private data and detaches (anonymizes) published contributions; typed email plus password re-check; last-admin guard. Constants in `src/server/account/constants.ts` (export cap 25 MB / 50,000 rows per table, 5 exports per hour, 5 deletion attempts per 15 minutes; the limiter is in-memory per server instance, so it needs a shared store before multi-instance hosting).
- F: Better Auth's own deleteUser stays disabled. Better Auth's verify-password endpoint answers over HTTP for the caller's own password (checks only the caller); left as is.
- F: privacy and terms keep a DRAFT banner and a contact placeholder marked TO FILL IN (no address invented). Email change is marked planned.
- G: CSP uses `'unsafe-inline'` for scripts and styles (nonce-based CSP not confirmed safe without a browser); everything external is blocked (`src/lib/security-headers.ts`). HSTS only in production, no includeSubDomains/preload until the domain is known.
- G: service worker (`public/sw.js`) caches only the offline page, manifest and icons; never pages, API, files or images. Recordings is the only remaining "soon" item. The tutor course tab now links to /tutor with an "Off" badge.
- G could not check at runtime: `/manifest.webmanifest` and 404 on a production start (needs a DATABASE_URL; I do not read or set env values). Block I covers them in the dev server.

## Noted for later blocks

- (Fixed in G) the four em-dash strings; a test now blocks em/en dashes in messages and code.
- No logo file of 1024 px or more in the project; a kit sits in Downloads (outside the project).
- `pnpm audit`: 1 high advisory, `zod` below 4.6.6, transitive via `@vercel/blob`. Not used locally.

## Findings and fixes (review blocks)

### H. Independent review (two fresh read-only reviewers, no knowledge of the build)

Security reviewer: no critical or high findings. Every server action, route handler and page checks auth or ownership server-side; all SQL templates parameterized; no raw HTML sinks; exports guarded against CSV/ICS/header injection; service worker caches no authenticated content; no secrets in tracked files. Code reviewer: typecheck, lint and 496 tests clean; schema and migrations match; FR/EN keys equal (1537 each).

Fixed (all 20 items; 19 partial: our limiter now evicts expired keys, Better Auth already prunes its own map). Result: 533 tests pass: form input lost on server error (notes, calendar, cards); `.ics` semicolon escaping bug (the old test encoded the bug); touch targets still 40px in places; all-day ordering; selected day not exposed to assistive tech; plural grammar; English-only API error bodies; stale docs and unused exports; `decodeURIComponent` 500 on malformed `%`; non-UUID topic ids causing 500; last-admin deadlock and missing last-admin guard on role/approval changes; note save race; Anki export mangling cards starting with `-`; fragile `selectedTopicIds`; quiz completion race; analytics X of N inconsistency; page beyond last page; focus management after practice actions; rate-limit map eviction.

NOT fixed here, needs a decision or hosting (owner list):
- Shared rate-limit store: all limiters (login via Better Auth, account export, account deletion) are in memory per instance and do nothing useful on serverless or multi-instance hosting. Use Better Auth `rateLimit.storage: "database"` and a database-backed counter before going live; configure the trusted client-IP header.
- Every server action accepts a 26 MB body before auth (`next.config.ts`); cap non-upload paths at the edge or move uploads to a dedicated route before launch.
- Expensive authenticated reads (tutor search, study export, search) have no per-user cost limit; add one with the shared store.
- CSP keeps `'unsafe-inline'` for scripts; move to nonce-based CSP once testable in a browser.
- Retention policy for removed files (question images set `removedAt` but the file stays; kept contributions keep their files). Law 25 review.
- Stale password-reset rows on account deletion (password reset not built yet; revisit then).
- Possible header conflict on question images (config `X-Frame-Options: DENY` vs route `SAMEORIGIN`); only matters if images are ever framed. Check with curl in block I.
- Note versions are unbounded per note; a heavy user could exceed the 25 MB export cap (fails with a clear 413, never truncates silently).
- Scored attempts stay as recorded when a question is later edited or un-verified (documented choice, "fixed when answered").


## Skipped / failed

(none yet)


## Block I part 1: browser results (scratch DB, fake example.com accounts, desktop 1440px, light)

PASS: sign-up, console email verification, unverified sign-in blocked, domain and password rules, approval, role promotion, moderator denied admin pages, sign-in/out, course and offering creation, upload validation (fake PDF, .exe, 27 MB blocked), moderated publish and inline PDF, all four question types with image upload and rejection of fake or oversize images, moderator verification, practice (verified scored; kprim/open shown as unverified and unscored), progress numbers, flashcards, exports (CSV, TSV, Anki, progress; no author names), My contributions, search, topics, notes with history and restore, calendar with .ics, analytics (empty then with data), tutor OFF state with cited search and no AI answer, profile rename, own-data JSON export (no password or token fields), account deletion with a throwaway account, privacy and terms DRAFT banners, /offline, manifest, sw.js, 404, security headers, unauthenticated API routes return 401, foreign-origin sign-in POST returns 403, no requests left localhost, no console errors.

Defects found and fixed: (1) quiz skipped questions and went blank at the end (list changed after revalidation; `QuizTake` now freezes its list); (2) French plural errors ("1 correctes", "1 points sur 2"); (3) dashboard listed flashcards as planned though live.

Not fixed (cosmetic or already listed): Période select text cut off on the practice form; 404 page title is just "Dentiq"; sidebar scrolls for admins at ~780 px height; stale "Question published" message after verifying; a request over 26 MB bypassing the client check shows the generic error page (listed under review items).

Not tested: service worker registration and real offline fallback (production only); pending-user contribution block; moderator reject/hide/report paths; question edit; PWA install prompt; downloads through the browser dialog; dark theme and phone/tablet widths (part 2). Anki All in One compatibility remains unverified.

## Block I part 2: matrix results (production build on scratch DB, real Chrome)

800 page loads (40 pages x 20 width/theme/language combos). Before fixes: overflow 30, phone targets under 44px 246, low contrast 363, clipped text 104. After fixes (520-load re-check of affected pages): overflow 0, phone targets under 44px 0, low contrast 0, tab bar covering content 0, console/network errors 0. Remaining by design: 50 loads at 768px with 36 to 40px controls (desktop density kept on tablets). Cosmetic: long French offering option ellipsized in the upload select.
Fixed: 320px overflow (auth/legal headers, tab bar, grids from grid-cols-1, tabs, theme switcher, catalog form); light-theme contrast (--text-subtle, --accent darkened to 4.5:1); missing focus ring on text inputs (focus:outline-none masked by a weak test); focus lost after a server error; clipped selects; 44px minimum widths; 404/403 titles; stale "Question published" notice.
Keyboard: all PASS (0 stops without visible focus, 0 traps, skip link works, keyboard-only question submission works). Reduced motion: PASS (0 running animations on 8 pages). Zoom 200%: PASS at 720px and 320px; at a 195px viewport (390px at 200%) selects clipped on 5 of 14 pages and one calendar link overflowed: NOT fixed (below WCAG minimum width).
Paths: pending user blocked server-side on question creation (replay of the server action); moderator reject/hide/publish/verify/report-resolve, author edit and history, image upload errors: PASS. Dismiss button on a report not clicked. Other server actions for a pending user not replayed.
Production: manifest 200; service worker registers; cache holds only the 6 allowlisted public files after visiting authenticated pages and question images; with the server stopped, pages show only the offline page.
Not tested: Safari, Firefox, real devices, screen readers, native select popup and validation bubbles, PWA install prompt, download dialogs.

## finish/dentiq-polish, phase 1 (part)
Added first-run onboarding (additive `user_profile` table, skippable, dashboard redirects once), a Help page and a Settings link. Check, tests (609) and build pass.
Not done yet in phase 1: browser comparison of every screen at 390/768/1440 px in both themes and languages, loading and offline states review. Phases 2 to 9 not started.

## finish/dentiq-polish, phase 1 (rest) and phase 2
Phase 1 browser QA: 12 pages x 390/768 px x light/dark x EN/FR on a scratch DB, no overflow, theme and language correct, targets 44 px (one inline text link exempt). Window resizing does not change the viewport in the Chrome tool; popups opened by script give real widths. Home compared to mockup 09 at 1440 px.
Phase 2: admin email-domain settings with UdeM preset, bilingual HTML/text verification and reset emails, forgot/reset pages, expired-link page with resend, rate limits. 15 new tests; 624 pass; build passes; reset flow walked in the browser.

## finish/dentiq-polish, phase 3
Research (Opus subagent, official UdeM pages only): 167 verified courses, 5-year D.M.D., faculty calendar for 2026-2027; 3 unverified terms (2027-2028) left empty. See docs/udem-research.md.
Built: terms/periods/class-block/followed-course tables (migration 0012), schedule expansion and markers, .ics export of classes and import, My schedule page, calendar shows classes, terms, breaks with a "verify with your faculty" note, admin loader. 653 tests pass, build passes, loaded and viewed in the browser.
