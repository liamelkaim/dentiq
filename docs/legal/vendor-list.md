# Vendor list (DRAFT)

**No hosted service has been created, bought or connected.** The code can talk to the providers below only when the matching environment settings exist (names from `.env.example`).

| Vendor | Role | Data they would receive | Enabled by | Region | Contract / DPA | Status |
|---|---|---|---|---|---|---|
| Vercel | Hosting of the app | All requests, server logs | Deployment (not done) | Montreal region exists (docs.vercel.com/regions, read 2026-11-01); choice not made | OWNER TO CONFIRM | Planned, `docs/hosting-plan.md` |
| Neon | Postgres database | All database rows | `DATABASE_URL` | UNVERIFIED; no Canadian region listed (neon.com/docs/introduction/regions, read 2026-11-01) | OWNER TO CONFIRM | Planned |
| Vercel Blob (private) | Uploaded files | Documents, images, recordings | `BLOB_READ_WRITE_TOKEN` + `DENTIQ_ENABLE_BLOB` | UNVERIFIED | OWNER TO CONFIRM | Planned; backend implemented, untested against the real service |
| Resend | Email | Address, subject, body | `RESEND_API_KEY`, `EMAIL_FROM`, `DENTIQ_ENABLE_RESEND` or running on Vercel | UNVERIFIED | OWNER TO CONFIRM | Planned; needs a verified domain |
| AI provider | AI tutor | Question and excerpts | None exists in code | n/a | n/a | **None. Tutor OFF.** Must be named in the consent notice before switching on |
| Domain registrar / DNS | Address | none | | | | OWNER TO CONFIRM |

Not used, by design: analytics, advertising, social login, CDN fonts or scripts from other companies (the page policy blocks them: `src/lib/security-headers.ts`).

Credential rule: keys live only in environment settings. Before the first deploy, rotate any credential that was ever on a developer machine (`docs/go-live-blockers.md`).
