# Student emails, verification and the single administrator

Status (2026-11-01): enforced in code and tested; **not yet switched on in production** (needs the owner's go-ahead, see "Turning it on").

## The rules

1. **One administrator.** Only the FIRST address in `ADMIN_EMAILS` becomes the approved administrator when it signs up. Other addresses in that list are ignored. The admin tools cannot promote anyone to administrator (`singleAdmin`). Moderators can still be named by the administrator.
2. **Students must use a UdeM address.** `ALLOWED_EMAIL_DOMAINS=umontreal.ca` accepts `@umontreal.ca` and any subdomain of it (for example a student subdomain). The administrator is exempt, so the owner may sign up with any address.
3. **Every student goes through three checks before seeing anything:**
   - the address is on an allowed domain (checked at sign-up, refused otherwise);
   - the email is verified (a link sent to that address; this proves the person controls the UdeM mailbox);
   - the administrator approves the account (manual check that this is a real student; until then the account is "pending" and sees nothing).
4. Verification is never switched off as a workaround.

## What this does and does not prove

- A UdeM address proves the person has a UdeM mailbox. It does not prove they are a dentistry student: staff, alumni and other faculties have addresses too. The administrator's approval is the real student check. Suggested approval rule: approve only people whose name you can match to the cohort (class list, a classmate you know, or a reply to a message sent to the UdeM address).
- Nothing is looked up in a UdeM system; Dentiq has no access to one and does not pretend to.

## What still blocks real students (needs the owner)

- **Email delivery.** The Resend sandbox sender (`onboarding@resend.dev`) only delivers to the Resend account owner, so students will not receive verification emails. Buy a domain, verify it in Resend (DNS records), set `EMAIL_FROM` to an address on it. Check that UdeM's mail does not put the first emails in spam.
- **Which domains exactly.** Confirm the list of UdeM student address domains with the faculty before launch (the rule matches `umontreal.ca` and subdomains). Add others comma-separated, for example `umontreal.ca,other.example`.
- **Law 25 review** of the sign-up wording (what is collected: name, UdeM email) before real students sign up.

## Turning it on (not done; needs owner approval, then a redeploy)

1. Vercel project `dentiq-app`, production environment: set `ALLOWED_EMAIL_DOMAINS` to `umontreal.ca` (`npx vercel env add ALLOWED_EMAIL_DOMAINS production`).
2. Check `ADMIN_EMAILS` holds exactly one address (the owner's).
3. `npx vercel deploy --prod`, then try a sign-up with a non-UdeM address (must be refused) and with a UdeM address (must get the verification email, once the sender domain is verified).
4. Existing accounts are not changed by this setting; it only filters new sign-ups.

## Where it lives in the code

`src/server/auth/roles.ts` (`isEmailDomainAllowed`, `isBootstrapAdmin`), `src/server/auth/auth.ts` (sign-up hook), `src/server/users/service.ts` (`setUserRole` refuses `admin`). Tests: `tests/auth.test.ts`, `tests/users.test.ts`.
