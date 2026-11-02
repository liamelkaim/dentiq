# Account data: profile, export and deletion

Status: built 2026-11-01, covered by automated tests (`tests/account.test.ts`, `tests/account-auth.test.ts`, `tests/account-messages.test.ts`), **not yet browser-tested**. The privacy and terms pages that describe this are **drafts, not reviewed by a lawyer**. The deletion rules below **need a legal review (Quebec Law 25) before any public launch**.

Code: `src/server/account/*` (constants, profile, export, delete, rate-limit, errors, actions), pages under `src/app/(app)/profile/`, `src/app/(auth)/account-deleted/`, forms in `src/components/profile-forms.tsx`.

## Profile (`/profile`)

- Shows the viewer's own name, email (with "confirmed" badge), role, approval status and account creation date. The `user` table has **no program or year of study field**, so none is shown (not invented).
- Display name can be edited: trimmed, whitespace collapsed, 1 to 120 characters (`PROFILE_NAME_MAX`, same as sign-up), control characters refused. The audit entry `user.name.update` records the change, never the name. Role, status and email cannot be changed here.
- Email change: **planned, not built** (marked on the page).
- Language and theme use the existing `LanguageSwitcher` (cookie `DENTOS_LOCALE`) and `ThemeSwitcher` (next-themes key `dentos-theme`). The same controls stay in `/settings`; both pages link to each other. No logic was duplicated.
- Reached from the sidebar user block (desktop), from Settings (desktop and phone gear). Privacy and Terms are linked from the profile page, the app footer, and the sign-in, sign-up, verify-email and account-deleted pages (auth layout).

## Data export (`/profile/export`, GET)

A JSON download for the signed-in user only: `getCurrentUser()` (401 if none), `Content-Disposition: attachment`, `Cache-Control: private, no-store`, `nosniff`. File name `dentiq-my-data-YYYY-MM-DD.json`; `schemaVersion: 1`, `exportedAt`.

Every table is read with an **explicit column list** (`src/server/account/export.ts`); there is no `select *` and no spread of auth rows.

| Section | Content (own rows only) |
| --- | --- |
| `profile` | id, name, email, emailVerified, image, role, approvalStatus, createdAt, updatedAt |
| `signIns` | sessions (created, expires, IP address, browser; no token, no id), sign-in methods (provider name, date; no password hash) |
| `documents` | documents the student created (personal and shared, with status), their uploaded versions (file name, type, size, change note; no storage key, no fingerprint, no bytes), reports they filed |
| `examQuestions` | questions they contributed with status, wording, proposed answer, moderator's rejection reason, choices (their proposed correctness only), image details, change history (number, note, date), reports they filed |
| `notes` | notes, every version, topic links, links to questions |
| `study` | attempts, marks, personal cards, question-card schedules, card reviews, quizzes and quiz items |
| `calendar` | calendar entries |
| `tutorUsage` | usage counts rows |
| `activity` | the student's own audit actions (action, type, date; the id of another account an admin acted on is blanked) and changes made to the account (action, date only) |
| `referenced` | catalog courses and topic names that ids in the file point to (shared reference data) |
| `notIncluded` | plain-language list of what is not in the file |

**Not included:** password or any sign-in secret; session tokens; file and image bytes; storage keys and file fingerprints (SHA-256); other students' data; who reviewed, verified or resolved (moderator identities and resolution notes); verified-answer data written by moderators; shared course material written by others; hosting-provider logs and backups.

**Guards (`src/server/account/constants.ts`):** `EXPORT_MAX_ROWS_PER_TABLE = 50000`, `EXPORT_MAX_BYTES = 25 MB`, `EXPORT_MAX_PER_HOUR = 5` (shared counter in the database, 429 over the limit). Going over a row or size cap makes the export **fail with 413**; it is never truncated silently. Tests prove another student's rows, hashes, tokens, storage keys and secret-like field names never appear (`tests/account.test.ts`).

## Account deletion (`/profile/delete`)

Steps (server action `deleteAccountAction`): signed-in user only; at most 5 submissions per 15 minutes (`DELETE_ATTEMPTS_*`); **re-authentication by password** through Better Auth `auth.api.verifyPassword` (checks the stored hash for the current session); then `deleteAccount()` in one database transaction; then `auth.api.signOut` to clear the cookie; redirect to `/account-deleted`. Typed confirmation = the account's own email address (case and surrounding spaces ignored), checked again by the service.

Better Auth's built-in `deleteUser` is deliberately **not enabled** (a test asserts `/api/auth/delete-user` returns 404), so nothing can bypass the last-admin guard, the file cleanup or the audit scrub.

Last administrator: an admin cannot delete the account if no other **approved** admin exists. Admin rows are locked (`FOR UPDATE`) during the check so two admins cannot delete themselves simultaneously. The page shows a warning and disables the form; the service refuses again.

| Data | What happens |
| --- | --- |
| Account, sessions, sign-in methods, pending verification links | Deleted |
| Notes and their versions, topic and question links | Deleted (cascade) |
| Study attempts, marks, personal cards, schedules, reviews, quizzes | Deleted (cascade) |
| Calendar entries, tutor usage rows | Deleted (cascade) |
| Personal (private) documents | Deleted, rows and stored files |
| Shared documents still `pending` review | Deleted, rows and stored files (`DELETE_UNSHARED_RESOURCE_STATUSES`) |
| Exam questions `pending` or `rejected` | Deleted with choices, images (rows and files), revisions, reports, **unless another student's study data already points to the question**, in which case it is kept and detached (`DELETE_UNSHARED_QUESTION_STATUSES`) |
| Published or hidden documents and exam questions, their versions, images, revisions | **Kept, detached**: the author columns (`created_by`, `uploaded_by`, `contributed_by`, `changed_by`) become empty |
| Reports the student filed, review, verification and resolution columns that named them | **Kept, detached** (reporter becomes empty) |
| Audit log | Kept; the actor becomes empty. Rows about the account itself, and rows about things deleted here, lose their entity id and metadata. One new `account.delete` entry holds counts only. |
| Files | Removed from storage after the transaction commits (`src/server/storage.ts`, local disk in dev). A failure writes an `account.delete.files_failed` audit entry with the random storage keys so they can be cleaned up |

**Schema:** no migration was needed. Every author column on shared contributions was already nullable with `ON DELETE SET NULL`, and private rows already cascade. This is the least destructive option: shared work survives without a name, and nothing was made nullable or changed. Moderator screens already treat a missing contributor as "no name shown".

## Open legal questions (for a qualified review)

- Is detaching (not deleting) published contributions acceptable under Law 25 (erasure or de-identification)? Is the content itself personal information? Copyright and the contributor's rights over what they wrote should be settled.
- Is "typed email plus password" enough re-authentication? Should there be a grace period (soft delete for N days) so a mistake or a hijacked session can be undone? Not built.
- Backups: production backups (not set up yet) will contain deleted data until they expire; a retention period must be defined and disclosed.
- Hosting provider logs, and email logs, are outside this app's control.
- The audit log keeps action, type and date without a name; is that adequate and what retention applies?
- Reports and moderation notes written by or about the student that mention others.
- The export lists IP address and browser from sign-in records; confirm that is the right scope for an access request, and who answers requests sent by email (no contact is set up: the privacy page shows a clearly marked placeholder).
- Requests on behalf of a minor or by someone other than the account holder.

## Not built

Email change, soft delete or undo window, deletion of a single contribution by its author, export as CSV or ZIP, scheduled or emailed export, scheduling of the retention job, browser end-to-end tests.

## File retention job (built 2026-11-01, safe defaults, owner has not set a rule)

Code: `src/server/retention/` (`constants.ts`, `service.ts`, `actions.ts`, `cli.ts`), page `/admin/retention` (administrators only, linked from `/admin`), command `scripts/retention.ts`, migration `0010_file_retention.sql` (adds nullable `file_deleted_at` to `exam_question_images` and `resource_versions`). Tests: `tests/retention.test.ts`. Covered by automated tests only; **not browser-tested**.

**Defaults (constants in `src/server/retention/constants.ts`; changing one is a code change, not an admin setting, on purpose):**

| Rule | Value |
| --- | --- |
| Grace period after removal (`RETENTION_GRACE_DAYS`) | 30 days |
| Note versions kept per note (`NOTE_VERSIONS_MAX`) | newest 100; the current version is never deleted |
| Orphan minimum age (`ORPHAN_MIN_AGE_DAYS`) | 7 days |
| Items per category per run (`RETENTION_BATCH_SIZE`) | 200 |
| Orphan scan cap per folder (`ORPHAN_SCAN_MAX_FILES`) | 5000 files |

**What it deletes, and only on apply:**

- Question images with `removed_at` at least 30 days old: the stored file is hard-deleted; the row stays with `file_deleted_at` set, so revision history never points at a missing row. Study data references questions, not images, so attempts are unaffected.
- Documents with status `removed` whose last change (`resources.updated_at`, which every status change bumps, so it can only lengthen the grace) is at least 30 days old: every version's file is deleted; rows stay, marked. **Hidden documents are never touched** (a moderator can restore them). Published and pending documents are never touched.
- Note versions beyond the newest 100 per note: rows deleted, oldest first, never the current version. Only counts are read; no note text is read or logged.
- Orphaned files (a file in `resources/` or `questions/` with no row, at least 7 days old): **reported only**. They are deleted only with `--delete-orphans --apply` (CLI) or the separate tick box on the page.

**Safety:** dry run is the default everywhere (`pnpm retention`); deleting needs `--apply` or the confirmation tick box. Every candidate is re-checked just before its file is deleted. A failed storage delete leaves the row unmarked and counts as failed, so the next run retries it (the CLI exits with code 1). Safe to run again: marked rows are skipped. Each run writes one audit entry (`retention.dry_run` or `retention.apply`) with counts only; opening the page writes nothing. Account deletion still removes a student's own files immediately and is unchanged.

**Limits and what remains:**

- Orphan scan needs the optional `list()` method on the storage backend. Local disk and the in-memory test storage have it; **the Blob backend does not, so the scan reports "unavailable" there** and the Blob backend is untested with this job. A scan is capped (5000 files per folder) and says when it was cut short.
- A permanently failing delete is retried first on every run; more than 200 such rows would block newer ones. Not expected, not handled.
- A removed document keeps its row and report history; only the file goes.
- Backups are not covered: a database or Blob backup keeps deleted data until it expires (see the legal questions above).

**Scheduling later (not set up, no cron config in the repo):** on the host, run `pnpm retention --apply` (without `--delete-orphans`) from a scheduled job, for example weekly, with the same environment as the app (`DATABASE_URL`, and the Blob settings once the Blob backend supports it). On Vercel this would be a Cron Job calling a protected route or a separate worker; both need new code and a decision, so nothing is wired up. Run `pnpm retention` by hand first and read the report.

## Added 2026-11-02

The account export now also contains: program details (onboarding), class times, followed courses, recordings (details and notes, not the files), saved tutor conversations with consent, and feedback the student sent. Deleting the account removes all of these, deletes recording files from storage, erases feedback (text and contact email) and clears the matching audit ids.
