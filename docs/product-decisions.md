# Dentiq — confirmed direction and implementation boundaries

## Sources and precedence

The owner's request on 2026-10-29 selects the existing Claude Dentiq app as the implementation,
and the ChatGPT React prototype as reference only. Existing uncommitted changes are preserved.
The supplied DentOS images guide visual design; they are not evidence of functioning features.

The latest explicit answers in **Dentiq Product Questions** confirm:

1. Dental students at any university are the intended audience.
2. Home combines a dashboard, assistant and courses.
3. Study materials include personal uploads and shared course libraries.
4. Tutor, flashcards and practice exams should form one connected study system.

Round 2 questions had no recorded answers. Course organization, sharing policy, AI source policy,
and expanded language support must not be represented as confirmed choices. Existing moderation
and English/French foundations remain in place while these decisions are open.

The attached DentOS master prompts and `docs/master-prompt.md` provide the engineering constraints:
local-first setup, preserve existing work, coherent architecture, genuine functionality, bilingual
UI, explicit planned features, tests, and no deployment or paid APIs without approval.
The separate **Dentiq Master Prompt** task links a ChatGPT Library document, but its complete text
was not available in the retrieved task. No unseen requirements from that file are claimed here.

## What works now

- Existing secure account foundation, catalog, shared document upload, moderation and versions.
- Existing responsive Dentiq shell, dashboard, light/dark themes, English/French UI and focused reader.
- Added owner-only personal document upload and version access, visibility filters and labels.
- Fixed mobile reader drawer state and selection behavior, plus keyboard preference navigation.

## Remaining product work

- University-specific catalogs, memberships and isolated shared libraries (current catalog is global).
- Student-selected courses and course creation policy.
- Course-grounded tutor and citations, flashcards/Anki exports, practice exams and shared learning progress.
- Approved AI provider, usage budget and source policy before enabling generation.
- Production email, hosting, privacy review, backups and operational safeguards.

No synthetic academic data was inserted into the owner's database. Browser QA uses a separate
temporary database and source copy with clearly labeled DEMO courses and example.com accounts.

## Local-first guard and legal pages (2026-10-31)

- Cloud integrations are off on a developer computer even when their keys are present in a local `.env` file.
  Vercel Blob runs only when `VERCEL=1` or `DENTIQ_ENABLE_BLOB=true`. Resend email runs only when
  `VERCEL=1` or `DENTIQ_ENABLE_RESEND=true`. Local development uses the embedded database, local file
  storage and console email. No Neon, Blob or Resend account use is needed to develop.
- Neon, Blob and Resend are not approved for use. They stay inactive until the owner checks the Vercel dashboard.
- Added draft English and French Privacy and Terms pages (`/privacy`, `/terms`), linked from the sign-in
  screens. They describe what the app stores today, are marked as draft, and make no legal-compliance claim.
  A contact address for data requests and a legal review are required before public launch.
