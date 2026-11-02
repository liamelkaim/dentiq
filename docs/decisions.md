# Decisions log (finish/dentiq-polish)

- 2026-11-01: Onboarding stores answers in a new additive table `user_profile` (university preset key, program year 1-6, semester 1-3, all optional). Skipping stores an empty row so the questions are not asked again. Presets hold only a key and a name; no unverified UdeM data is baked in.
- 2026-11-01: Help page is static, translated text in `help.*`; no external links beyond the privacy policy.
- 2026-11-01: Tooling choice: all work done directly in the main session; the independent Opus review (Phase 8) is the only planned subagent use.
