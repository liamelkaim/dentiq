# Quebec Law 25 working pack (DRAFT, not legal advice)

Prepared 2026-11-02 from what the app actually does. A lawyer or privacy professional must review it before launch. Nothing here claims compliance.

## 1. Person in charge of personal information (OWNER TO FILL IN)
Name, title, contact address: ______ (the owner is the default person in charge for a sole-operator project). Publish the title and contact on the privacy page by setting `CONTACT_EMAIL`.

## 2. Inventory of personal information
| Data | Where | Purpose | Who sees it | Deleted with account |
|---|---|---|---|---|
| Name, email, password hash, sessions | database (Neon) | accounts | the person; admin sees name, email, status | yes |
| Program year, semester, university choice | `user_profile` | suggestions | the person | yes |
| Notes and versions | database | study | the owner only | yes |
| Exam questions, documents | database, Blob | shared study material | approved users after moderation | author link removed; shared items may stay without name |
| Calendar, class times, followed courses | database | planning | the owner only | yes |
| Flashcards, quizzes, analytics | database | study | the owner only | yes |
| Recordings and notes | Blob, database | study (OFF by default) | the owner only | yes, files deleted |
| Tutor consent and conversations | database (OFF) | tutor | the owner only | yes |
| Feedback (text, optional email, page path) | database + email to admin | support | admin | yes |
| Audit log (ids, action names) | database | security | admin | ids scrubbed |

## 3. Service providers and cross-border transfer (TO CONFIRM)
Vercel (hosting, Blob), Neon (database), Resend (email). Regions: UNVERIFIED (Neon has no Canadian region). Law 25 requires a privacy impact assessment before communicating personal information outside Quebec. Complete section 4 first.

## 4. Privacy impact assessment outline (to complete)
1. Purpose and necessity of each data item above. 2. Sensitivity: study notes are low to moderate; recordings and any health content are higher (patient data is forbidden by the terms). 3. Providers, regions, contracts and retention. 4. Safeguards: HTTPS, owner-only filters, rate limits, hashing, no analytics, tutor and recordings OFF. 5. Residual risks and decision (owner signs and dates).

## 5. Rights requests procedure
Access and portability: profile > download my data (JSON). Rectification: profile and settings. Deletion: profile > delete account. Other requests: answer within 30 days; record the request, date and outcome in the register below.

## 6. Incident register and response
Detect, contain, assess risk of serious harm. If serious: notify the Commission d'accès à l'information and the people affected promptly; keep the register for at least 5 years. Template: date found | what happened | data and people affected | risk assessment | notices sent (who, when) | fix.

## 7. Consent
No cookie banner is needed (essential cookies only, no analytics or ads). The tutor and recordings each require explicit consent before any content is processed beyond the owner's own use; both are OFF by default.

## 8. Retention
Account data until deletion; removed files 30 days grace then hard-deleted; note versions capped at 100 per note; audit rows without content. Provider backups expire on their own schedule (confirm each).

## 9. Open items for the owner
Person in charge, contact address, provider regions and contracts, completed impact assessment, lawyer review of the privacy page and terms, incident register kept offline, whether a French-first review by a Quebec lawyer is wanted.
