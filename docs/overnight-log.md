# Overnight log

> Final summary goes at the top when the run finishes (block M). Until then this is a running log.
> Started 2026-11-01. Phase 3 screens were committed first as `9ddb7a0`.

## Rules for every block (from the owner)

- Never: push, deploy, merge, touch Vercel/Neon/Blob/Resend, add paid services or paid AI/transcription providers, use real student data (`example.com` test accounts only), move the project folder, delete anything outside the scratch folder.
- Never present an unfinished feature as working. Planned features stay clearly marked as planned.
- Every block: French and English text (same keys in `fr.json` and `en.json`), light and dark themes (tokens only), phone/tablet/desktop layouts, server-side permission checks, private-by-default student material, source attribution, brand rules (no purple gradients, no emoji icons, no em dashes in UI copy, no fake numbers).
- Don't rebuild working features. Open decisions: pick a default, make it changeable in settings or constants, record it here.
- After each block: typecheck, lint, tests, build, then a local commit. Before each commit confirm no `.env*`, `.nosync`, `.data`, `.vercel` is staged.

## Block status

| Block | Status | Commit |
|---|---|---|
| Phase 3 screens (carried over) | committed | 9ddb7a0 |
| A. Passes polish | built; typecheck, lint, 212 tests, build all clean; not yet browser-tested | see git log |

## Decisions made for the owner

- A: search page shows the 10 most recent matching questions (`SEARCH_QUESTION_LIMIT` in `src/server/passes/queries.ts`).
- A: dashboard search now opens `/search?q=` (documents plus published questions) instead of `/resources`.

## Noted for later blocks

- Four UI strings still contain em dashes (`soonLabel`, `fileHint`, FR and EN). Fix in block G copy pass.
- No logo file of 1024 px or more in the project; a kit sits in Downloads (outside the project).
- `pnpm audit`: 1 high advisory, `zod` below 4.6.6, transitive via `@vercel/blob`. Not used locally.

## Findings and fixes (review blocks)

(none yet)

## Skipped / failed

(none yet)
