# Launch gates (DRAFT)

A gate is closed only when its evidence exists. "Owner" is who must act; names are **OWNER TO CONFIRM**. Status as of 2026-11-02.

| # | Gate | Owner | Evidence | Status |
|---|---|---|---|---|
| 1 | Lawyer reviews privacy page, terms, cookies page, consent texts (FR and EN) | Product owner + lawyer (OWNER TO CONFIRM) | Signed review note filed here | OPEN |
| 2 | Person in charge named; privacy contact set (`CONTACT_EMAIL`) | Product owner | Address visible on /contact, /privacy and in Settings | OPEN (docs/open-questions.md) |
| 3 | Privacy impact assessment completed and signed | Product owner | `privacy-impact-assessment-template.md` filled and signed | OPEN |
| 4 | Provider regions and contracts decided (database, files, email, hosting) | Product owner | `vendor-list.md` columns filled | OPEN |
| 5 | Backup restore test run on the real host, rollback rehearsed | Product owner / developer | Dated result in `backup-restore-and-rollback.md` | OPEN (procedure written, not run) |
| 6 | Retention job scheduled; 30-day and 100-version defaults confirmed | Product owner | Scheduler entry + `retention-schedule.md` updated | OPEN |
| 7 | Credentials rotated; secrets only in host settings | Developer | Checklist in `docs/go-live-blockers.md` | OPEN |
| 8 | Spend limit set on the host before inviting students | Product owner | Screenshot or note of the limit | OPEN |
| 9 | Email domain verified and a real verification email received | Product owner | Test message record | OPEN |
| 10 | Moderators named and briefed on patient-information reports, takedown and appeals | Product owner | List of moderators; this file updated | OPEN |
| 11 | Real-browser and device checks: Safari, Firefox, phones, screen reader | Developer | Test notes | OPEN (not tested) |
| 12 | Per-account sign-in lockout or second factor decided (see ASVS review) | Product owner | Decision recorded in `asvs-review.md` | OPEN |
| 13 | AI tutor stays OFF unless a provider is named in the consent notice, the notice is reviewed and a budget is set | Product owner | Consent text version raised; this file | CLOSED while OFF (tutor flag default OFF; test `tests/tutor.test.ts`) |
| 14 | Upload warnings, report, takedown and appeal flows in place | Developer | `tests/trust-wiring.test.ts`, `tests/appeals.test.ts`; page walkthrough still to do | CODE DONE, browser check OPEN |
| 15 | University permission, if the product will use the university's name or data | Product owner | Written permission. **Dentiq must not claim approval without it** | OPEN |
