# Decisions log (finish/dentiq-polish)

- 2026-11-01: Onboarding stores answers in a new additive table `user_profile` (university preset key, program year 1-6, semester 1-3, all optional). Skipping stores an empty row so the questions are not asked again. Presets hold only a key and a name; no unverified UdeM data is baked in.
- 2026-11-01: Help page is static, translated text in `help.*`; no external links beyond the privacy policy.
- 2026-11-01: Tooling choice: all work done directly in the main session; the independent Opus review (Phase 8) is the only planned subagent use.
- 2026-11-01 (phase 2): Allowed email domains are stored in app_settings (key `emailDomains`), edited in Admin > Email domains with a one-click UdeM preset (umontreal.ca; subdomains allowed). Stored list wins, else ALLOWED_EMAIL_DOMAINS, else open sign-up (warned in the admin page). The single ADMIN_EMAILS owner stays exempt.
- 2026-11-01 (phase 2): Account emails carry French and English together (language unknown at send time), HTML plus text. Verification links last 24 h, reset links 1 h; resets revoke other sessions. Resend and reset requests are rate limited (3 per minute per IP) by Better Auth's limiter; reset answers are identical for unknown addresses.
