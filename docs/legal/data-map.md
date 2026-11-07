# Data map (DRAFT)

Source: the database schema (`src/db/schema/*`, migrations in `drizzle/`), the account export (`src/server/account/export.ts`) and deletion (`src/server/account/delete.ts`). "Seen by" is enforced on the server (`requireUser` / `requireRole` plus per-item checks).

Where the data lives: local development uses PGlite and local disk. The hosted plan (Neon database, Vercel Blob files) is **not created**. Region of each provider: **OWNER TO CONFIRM** (see vendor-list.md).

| Data | Table(s) | Personal? | Purpose | Seen by | On account deletion |
|---|---|---|---|---|---|
| Name, email, role, approval status, email verified | `user` | Yes | Account, access control | The person; administrator (name, email, status) | Deleted |
| Password hash, sign-in method | `account` | Yes (secret) | Sign-in | Nobody (never exported or displayed) | Deleted |
| Sessions: IP address, browser, expiry | `session` | Yes | Stay signed in, security | The person (own export) | Deleted |
| Email verification and reset tokens | `verification` | Yes (secret) | Confirm email, reset password | Nobody | Deleted |
| Sign-in rate counters (IP and path key) | `auth_rate_limit`, `rate_limits` | IP address inside the key | Abuse protection | Nobody | Expire on their own; not tied to the account |
| University choice, program year, semester | `user_profile` | Yes | Suggestions | The person | Deleted |
| Class times, followed courses, calendar entries | `user_class_blocks`, `user_courses`, `study_calendar_entries` | Yes | Planning | The person | Deleted |
| Private notes and every version | `course_notes`, `course_note_versions` | Yes (content is the student's) | Study | The person only (notes cannot be shared) | Deleted |
| Study answers, marks, flashcards, quizzes, review history | `study_*` | Yes | Study, progress | The person | Deleted |
| Personal documents | `resources`, `resource_versions` + files | Yes | Personal study | The person | Rows and files deleted |
| Shared documents (after moderation) | same | Author link | Share with approved members | Approved members, moderators | Kept; author link removed |
| Exam questions, choices, images, revisions | `exam_questions` and related + image files | Author link | Practice | Approved members after moderation | Pending/rejected deleted; published/hidden kept without author |
| Reports on documents and questions | `resource_reports`, `exam_question_reports` | Reporter link | Moderation | Moderators | Kept; reporter link removed |
| Appeals against takedowns (text, outcome) | `content_appeals` | Yes | Appeal path | The person; administrators | Deleted (cascade) |
| Recordings and notes (feature OFF by default) | `recordings`, `recording_notes` + files | Yes (voices) | Study | The person | Rows and files deleted |
| AI tutor consent: version, time, language | `tutor_consents` | Yes | Proof of consent | The person | Deleted |
| AI tutor conversations (tutor OFF, nothing stored today) | `tutor_conversations`, `tutor_messages` | Yes | Tutor history | The person only | Deleted |
| AI tutor usage counts (no text) | `tutor_usage` | Counts | Daily limits | The person | Deleted |
| Feedback: message, optional email, page path | `feedback` | Yes | Support | Administrator | Deleted |
| Audit log: actor id, action, entity type and id | `audit_log` | Pseudonymous ids | Security, accountability | Administrator | Kept; actor emptied; rows about the account lose entity id and metadata |
| Settings (limits, domains) | `app_settings` | No | Configuration | Administrator | n/a |
| Course catalog | `courses`, `professors`, `programs`, `academic_*`, `course_offerings`, `offering_instructors` | Professor names (public catalog data) | Reference | Everyone signed in | n/a |

## Sent to third parties (today)
- **Email provider**: recipient address, subject and body of verification, reset and feedback-notice emails (code: `src/server/email.ts`). Only when the Resend option is enabled; locally emails print to the console.
- **AI provider**: nothing. No provider is configured and the tutor is OFF.
- **Analytics, advertising, social widgets**: none. A test (`tests/trust-wiring.test.ts`) checks no analytics package is installed, and the page policy allows connections to the site itself only (`src/lib/security-headers.ts`).

## Not stored
Passwords in clear text, patient data by design (forbidden by the terms and warned about at every upload; **not detectable by the code**, which is why reports and takedowns exist), payment data (there is no payment).

## OWNER TO CONFIRM
Legal basis and purpose wording per row; which rows count as sensitive; provider regions; who the person in charge is.

## Added 2026-11-02
| Calendar subscription link (SHA-256 of a secret token, created/last-used/revoked times) | `calendar_feeds` | Yes (the link grants read access to the person's calendar entries) | Apple Calendar subscription | The person (cannot be re-displayed) | Deleted (cascade) |
