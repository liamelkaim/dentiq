# Audio readiness: recording, upload and transcription

Status: **planned, nothing is built.** The app has a "Recordings" entry marked "soon". No audio is recorded, uploaded, stored or transcribed today, and no code for it exists. This document lists what must be decided and approved before any code is written.

## Why this is separate from the rest

A lecture recording contains a professor's voice, often students' voices (questions in class), and teaching material the professor or the school may own. Transcribing it sends that voice and content to a processor. That makes it the highest-risk feature in the product for privacy, copyright and cost. It must not be added casually.

## What I need from you (the owner)

1. **Who may record, and where.** Does the faculty or the professor allow recording? Get the rule in writing (policy or an email). Without it, the feature should not ship, even as upload-only.
2. **Consent model.** Decide which of these Dentiq supports (the safest is the first):
   - Upload only: a student uploads a recording they made themselves, ticking a rights and consent statement (as is done for documents today).
   - In-app recording: the app records through the microphone. This needs a visible "recording" indicator, a prompt each time, and a rule for what happens when other voices are captured.
3. **Who can hear and read it.** Default proposal: private to the student who uploaded it. Sharing with classmates would need professor consent and moderation. Nothing is shared by default.
4. **Retention.** How long audio and transcripts are kept (proposal: audio deleted after transcription, transcript kept until the student deletes it or the account is deleted, with a fixed maximum such as one year). Deletion must remove the file, the transcript and any derived text.
5. **Provider choice and budget.** No provider is chosen and none may be added without your approval. See "Cost" below.
6. **Languages.** French and English, with Quebec French accents and dental vocabulary. Mixed-language lectures are common.
7. **Law 25 review.** A privacy review by someone qualified (questions below) before any real student or professor voice is processed.

## Consent and rights checklist (before any code)

- Written permission model for professors (per course or per recording).
- A consent statement the student accepts at upload, in French and English, stored with a timestamp (the same pattern as the existing rights confirmation on documents and questions).
- A takedown path: a professor or the school can ask for a recording and its transcript to be removed, and it is removed everywhere, including backups on the retention schedule.
- A rule for third-party voices (classmates): upload only, no redistribution, and removal on request.
- Clear labelling: transcripts are machine-made and may contain errors. They must never be presented as official course material.

## Data and retention design (to decide, not built)

| Item | Proposed default | Notes |
|---|---|---|
| Original audio | Private to uploader; deleted after successful transcription (or on request) | Largest files; storage cost and risk |
| Transcript | Private to uploader; editable by the uploader | Versioned like notes |
| Metadata | Course, date, uploader, language, length | No guessing of speaker identity |
| Consent record | Kept with the item, timestamped | Needed as proof |
| Provider copy | None retained: the provider must not keep or train on the audio | Must be contractual, not assumed |
| Backups | Follow the retention schedule | Needs a documented backup policy |
| Account deletion | Deletes audio, transcript, consent record | Must be added to the existing deletion flow and export |

The own-data export and the account-deletion flow (`docs/account-data.md`) would both need new entries for recordings and transcripts.

## Transcription provider requirements

Any provider must be evaluated against all of these before approval:

- Where the audio is processed and stored (country and region). Data leaving Quebec or Canada needs a documented assessment.
- No retention beyond processing, and no use of the audio or text to train models. Get this in the contract or the published data-processing terms.
- A data processing agreement, and a way to delete data on request.
- Canadian French accuracy, medical and dental vocabulary support, and a custom vocabulary option.
- Pricing model (per audio minute), minimum charges, rate limits and a hard spending cap that Dentiq can enforce itself.
- Reliability, and what happens on failure (the job is retried or refunded to the student's quota, never silently lost).

Options exist as hosted services and as models run on a server you control. A self-hosted model avoids sending audio to a third party but needs a machine with enough power and ongoing maintenance. I have not compared or tested any of them, and I am not recommending one here.

## Cost

I have not priced anything. Cost depends on the provider, audio minutes per student per month and the number of students. To keep it safe:

- Set a monthly budget cap and a per-student monthly minute limit (the AI tutor already has a daily usage table and limits you can copy as a pattern).
- Cap the length of one recording and the file size.
- Show students their remaining allowance honestly.
- Turn the feature off by default behind an admin setting, as the tutor is.
- Estimate with real numbers from the provider's current pricing page before committing. Do not rely on figures written here.

## Accuracy limits to tell students

- Transcripts will contain mistakes, especially with drug names, anatomy terms, numbers, doses and accented or mixed French and English speech.
- Speaker separation (who is talking) is unreliable and should not be shown as fact.
- A transcript must never be used as the answer to an exam question or a clinical decision. It is a study aid only, and it is labelled that way.
- If the AI tutor ever uses transcripts, it must treat them as low-trust student material, never as official sources (see `docs/ai-tutor.md`).

## Law 25 (Quebec) review: questions for the reviewer

1. Is a voice recording of a professor personal information, and what consent is required to process it?
2. Is a student's voice (in questions) personal information, and does the incidental capture of classmates need consent?
3. Does sending audio to a processor outside Quebec require a privacy impact assessment, and what must it contain?
4. What are the retention and deletion obligations, and how long may backups hold the data?
5. What must the privacy policy say, and does the draft in `/privacy` need to change?
6. Do professors have any right to refuse or to request removal that Dentiq must offer?
7. Who is the person responsible for personal information at Dentiq, and what incident process applies if audio leaks?

## Technical work, once approved (outline only)

This is a sequence, not a commitment. No code is written until the decisions above are made.

1. Add a recordings table with owner, course, consent record and status, plus private file storage through `src/server/storage.ts` (never public URLs).
2. An upload route with type, size and duration limits and owner-only access checks, following `/api/files`.
3. A provider interface like `TutorProvider`, with a null provider by default and an admin switch that is off.
4. A job queue with retries and a refund of the student's allowance on failure.
5. Transcript editing and versioning, search integration (private by default), and linking to course topics.
6. Export and deletion entries, audit entries without content, and an updated privacy policy.
7. Tests for permissions, limits, deletion and the off state, and a browser pass at all widths.

## Decisions recorded, not made

- The feature stays **off and unbuilt** until you approve the consent model, the provider and the budget.
- If you want something small first, the lowest-risk option is **upload-only, private to the uploader, transcription off**, so students can attach their own recording to a note without any third party involved.
