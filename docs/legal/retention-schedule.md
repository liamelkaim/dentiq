# Retention schedule (DRAFT)

"Code" means the rule is implemented and tested. "OWNER TO CONFIRM" means a human decision is needed before launch.

| Data | Kept for | Status / proof |
|---|---|---|
| Account, notes, study data, calendar, profile | Until the person deletes the account | Code: `src/server/account/delete.ts`, `tests/account.test.ts` |
| Session records | Up to 30 days, renewed daily while used; removed at sign-out, password reset, account deletion | Code: `src/server/auth/auth.ts` (`session.expiresIn`, `updateAge`) |
| Email verification link | 24 hours | Code: `VERIFICATION_HOURS` |
| Password reset link | 1 hour; all sessions revoked on reset | Code: `RESET_HOURS`, `revokeSessionsOnPasswordReset` |
| Removed document or question image files | 30 days after removal, then the stored file is deleted (rows stay, marked) | Code: `RETENTION_GRACE_DAYS` in `src/server/retention/constants.ts`. **Not scheduled**: run `pnpm retention --apply` or use /admin/retention. Owner to confirm the 30 days and schedule it |
| Note versions | Newest 100 per note | Code: `NOTE_VERSIONS_MAX`; same job |
| Files with no database row (orphans) | Reported only after 7 days; never deleted automatically | Code: `ORPHAN_MIN_AGE_DAYS`. Blob backend cannot list files, so only the local disk is covered |
| Shared documents and questions after the author deletes the account | Kept without the author's name | Code (see data-map.md). **OWNER TO CONFIRM** with a lawyer |
| Reports | Kept; reporter link removed on deletion | Code. No expiry. **OWNER TO CONFIRM** |
| Appeals | Until the appellant's account is deleted | Code (cascade). Decision note stays with the row until then |
| AI tutor consent record | Until withdrawn or the account is deleted. Withdrawing deletes the row, so proof of the earlier consent is not kept after withdrawal (audit log keeps the action and version) | Code: `src/server/tutor/consent.ts`. **OWNER TO CONFIRM** whether withdrawn consents must be archived |
| AI tutor conversations | Until the student deletes them or the account | Code. Nothing is stored while the tutor is OFF |
| Recordings and notes | Until deleted by the owner or with the account | Code. Feature OFF by default |
| Feedback | Until the account is deleted (anonymous feedback has no expiry) | Code. **OWNER TO CONFIRM** a maximum age |
| Audit log | No expiry; holds ids and action names, no content | Code. **OWNER TO CONFIRM** a maximum age |
| Rate-limit counters | Windows of 1 minute to 1 hour; expired rows are cleaned on use | Code: `src/server/rate-limit/service.ts` |
| Server logs | Hosting provider default | **OWNER TO CONFIRM** after the host is chosen. The app does not log emails, tokens or request bodies (`src/server/email.ts` comments, tests) |
| Database and file backups | Provider default (Neon free tier restore window is 6 hours per its pricing page read on 2026-11-01) | **OWNER TO CONFIRM**. Deleted data remains in backups until they expire; this must be disclosed |
| Incident register | At least 5 years (Law 25 working pack) | **OWNER TO CONFIRM** with a lawyer |
