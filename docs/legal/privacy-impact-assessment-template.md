# Privacy impact assessment (template, DRAFT)

Law 25 working note: an assessment is expected before personal information is communicated outside Quebec and before launching a system that handles personal information. **OWNER TO CONFIRM** with a lawyer which duties apply. Complete this before the hosted launch.

## 1. The project
- Name: Dentiq. Independent student project, not affiliated with or approved by any university (the footer and terms say so).
- Person in charge: **OWNER TO CONFIRM**. Date of this assessment: ______
- Purpose: study tools for dental-medicine students (notes, practice, calendar, shared material with moderation).

## 2. Data (from data-map.md)
Summarise categories. Facts proven by code: no analytics, no advertising, no payment data, tutor and recordings OFF by default, patient data forbidden by terms and warned about at every upload. Sensitivity: study notes low to moderate; recordings (voices) and any accidental patient information higher.

## 3. Necessity (one line per category: why is it needed, could less be collected)
______ **OWNER TO CONFIRM**

## 4. Flows outside Quebec / to third parties
| Provider | Data | Region | Contract / DPA | Safeguards |
|---|---|---|---|---|
| Database host (planned: Neon) | All database rows | UNVERIFIED (Neon lists no Canadian region on the page read 2026-11-01) | OWNER TO CONFIRM | Encrypted in transit; access by credentials only |
| File host (planned: Vercel Blob, private) | Uploaded files | UNVERIFIED | OWNER TO CONFIRM | Private access; every download passes a permission check |
| App host (planned: Vercel) | Requests, logs | Vercel lists a Montreal region (page read 2026-11-01) | OWNER TO CONFIRM | |
| Email (planned: Resend) | Address, message | UNVERIFIED | OWNER TO CONFIRM | |
| AI provider | None today | n/a | Must be named in the consent notice before the tutor is switched on | |

## 5. Safeguards in the code (each is tested; see asvs-review.md)
Server-side access checks, password hashing, rate limits, upload type and size checks, CSP with nonces, private file serving, audit log, export and deletion of own data, consent before any AI use.

## 6. Risks and mitigations
| Risk | Likelihood | Impact | Mitigation | Residual |
|---|---|---|---|---|
| Identifiable patient information uploaded | OWNER TO CONFIRM | High | Warning at each upload, confirmation checkbox, moderation, report and takedown, appeal path | |
| Hosting outside Quebec | | | Region choice, contract | |
| Backups keep deleted data | | | Disclosed retention | |
| Account takeover | | | Rate limits, email verification, hashed passwords. No per-account lockout or multi-factor (see asvs-review.md) | |

## 7. Decision
Go / go with conditions / no go: ______ Signed: ______ Date: ______ (OWNER)
