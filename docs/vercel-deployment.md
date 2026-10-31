# Dentiq on Vercel — prepared changes, not yet deployed

This package is staged for review. Installing dependencies, applying it to the selected project,
production checks, service connectivity and deployment are still pending.

## Services and credentials

- A Vercel account and project (the owner must sign in).
- Hosted PostgreSQL, for example a Neon integration from Vercel Marketplace. Use its pooled runtime URL.
- A **private** Vercel Blob store; set BLOB_READ_WRITE_TOKEN server-side.
- A Resend API key and verified sender address in EMAIL_FROM. Resend's testing sender cannot deliver
  verification mail to arbitrary students. Do not disable email verification as a workaround.

Check current provider quotas and plan terms before creating resources. No paid plans or cloud
resources have been created by these changes. No local database, secrets or uploaded files are deployed.

## Deployment sequence

1. Apply the staged files, then `pnpm add @vercel/blob` (private storage requires SDK 2.3 or newer).
   This must update both package.json and pnpm-lock.yaml before deployment.
2. Run `pnpm check` and `pnpm build`. Do not deploy if they fail.
3. Sign in using `pnpm dlx vercel login`, then `pnpm dlx vercel link` from the project folder.
4. Connect the hosted database and private Blob store. Set these in Vercel's environment settings:
   DATABASE_URL, BETTER_AUTH_SECRET (random 32+ characters), BETTER_AUTH_URL (the exact stable HTTPS
   project domain), BLOB_READ_WRITE_TOKEN, RESEND_API_KEY, EMAIL_FROM, ADMIN_EMAILS (owner email).
   Leave ALLOWED_EMAIL_DOMAINS empty to accept any university. Do not set ALLOW_LOCAL_DATABASE.
   Do not paste keys into chat or commit them.
5. Run the additive migrations with `pnpm db:migrate` against the intended hosted database, using
   credentials supplied through your local environment, not command arguments. Use a direct database
   connection for migration if your provider requires it. Migration is not run inside a request or
   automatically in every preview build.
6. Deploy with `pnpm dlx vercel --prod`. For CLI uploads, .vercelignore excludes .data and .env files.
7. Verify sign-up, email delivery, verification, admin bootstrap, catalog creation, a private upload,
   owner preview/download, and denial from a second account before inviting students.

## Limits

- Vercel server uploads are limited to 4 MB to stay below the platform's 4.5 MB function payload cap.
  Local development retains 25 MB. The file form and server enforce the same selected limit.
- Private downloads are streamed through the existing authorization route; Blob tokens are never
  returned to the browser. A public Blob store is not supported.
- Local documents and database records are not automatically migrated. Existing data requires a
  separate reviewed transfer if needed.
- The current auth rate limiter is per function instance. Shared rate limiting, retention, backups,
  privacy documents and the other production items in docs/security-privacy.md still need review.
- Separate preview environments must use separate database/storage credentials and a matching
  auth URL; do not point a test deployment at live student data.

References: https://vercel.com/docs/postgres · https://vercel.com/docs/vercel-blob/private-storage ·
https://vercel.com/docs/errors/function_payload_too_large · https://resend.com/docs/api-reference/emails/send-email
