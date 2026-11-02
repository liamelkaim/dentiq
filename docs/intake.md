# Intake: bringing your own notes and past exams into Dentiq

A local command-line tool. It reads a folder on your computer, writes a report, and imports only when you ask. It never uploads anything and calls no network service.

## Layout (the `intake/` folder is gitignored)

```
intake/my-batch/batch.json
intake/my-batch/DEN 10021/Anatomie/notes cours 1.docx
intake/my-batch/DEN 10021/Passes/examen 2024-2025.txt
```

`batch.json` records where the files came from (required, one per batch):

```json
{ "source": "my own course notes", "sharedWithPermission": false, "rightsConfirmed": true }
```

- `sharedWithPermission`: the owners agreed to share the material inside Dentiq. Recorded in the report. Imported notes are always the importer's private notes; sharing stays a deliberate step in the app.
- `rightsConfirmed`: you confirm you have the right to use the files. If it is not `true`, nothing is imported.

The first folder name should be the course code exactly as in the catalog (`DEN 10021`); the second is the topic. If there is no folder, a single known course code found in the text is used; otherwise the file is flagged "courseUnknown". Course codes are never guessed.

## Dry run (default)

```
pnpm intake intake/my-batch
```

Writes `intake/reports/my-batch.md` with, per file: kind, course, topic, exam year, status (ready, review, duplicate, skipped) and reasons. The report lists file names and counts, never the text of your files. To match course codes against the catalog, run it with the local database URL (below).

## What it understands

- `.txt`, `.md`, `.csv`, `.docx` (read locally). PDFs and images are listed as "needsManual": there is no OCR, nothing is guessed.
- Exam papers: numbered questions, choices `A)`/`A.`/`(A)`, and an answer line `Réponse : B` / `Answer: A, C`. The answer is stored as a PROPOSED answer only; nothing becomes verified. Missing answers, very short questions, answers outside the choices and choice-less questions are flagged. Low-confidence questions are not imported unless `--include-low`.
- Duplicates: same bytes, or same text after ignoring case and spacing.
- Exam year comes only from a real `2024-2025` style range in the file name or first lines.

## Import (local database only)

```
pnpm dev                      # leave running: it serves the local database on port 54329
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54329/postgres \
  pnpm intake intake/my-batch --import --as you@example.com
```

Refused unless `DATABASE_URL` points at this computer and cloud storage is off. `--as` is an existing local account (admin or approved). Questions go through the normal pass service (pending moderation, rules and limits apply); text notes become that account's private notes. Re-running a batch is safe for exact duplicates only: review the report before importing twice.

## Not covered

PDF and scanned papers, images inside questions, true/false (KPRIM) statements, and "released" provenance (everything imports as "recalled" until you say otherwise). Tests use synthetic fixtures only.
