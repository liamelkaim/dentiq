# Backup restore test and rollback (DRAFT)

Two layers: (A) what is **already proven by an automated test**, and (B) what the owner must run on the real host before launch. Nothing is hosted yet, so (B) has **not been run**.

## A. Proven now (local, synthetic data)
`tests/backup-restore.test.ts`:
1. Builds the full schema from the migrations, inserts synthetic rows, dumps the database, loads the dump into a fresh server and checks the rows and a database constraint survived. Re-running the migrations on the restored copy changes nothing.
2. Fails if any migration drops, renames or retypes a table, column, constraint or index. Because migrations only add, the previous app version keeps working against the newer schema, so rolling the app back does not need a data rollback.

This proves the app's schema and migrations survive dump and restore. It does **not** prove a provider's backups exist, are recent or restore correctly.

## B. Restore test to run on the real host (OWNER / developer; not yet run)
Do it once before inviting students, and again after any change of provider or plan. Record the result in the table at the end.

1. **Know the window.** Write down the provider's restore window for your plan (Neon free: 6 hours per its pricing page, read 2026-11-01; paid plans longer). If it is shorter than your tolerance, choose a plan or schedule a periodic dump.
2. **Make something recognisable.** Sign in as a test account (`TEST …` data), create a note titled `RESTORE-CHECK <date>`, upload a small private file, note the time.
3. **Back up.** Create a database branch or snapshot (copy-on-write) and, for files, export or list the file store. Note the backup name and time.
4. **Damage on purpose, on the copy only.** On the restored copy, never on production: delete the note.
5. **Restore** into a new branch or database at the time noted in step 3. Point a local shell `DATABASE_URL` (not on the command line) at it and run the app locally.
6. **Verify**: sign in, the note is back; row counts of `user`, `course_notes`, `resources` match the source; `pnpm db:migrate` reports nothing to do; the private file opens (files are NOT restored by a database restore: check the file store separately).
7. **Time it.** Write down how long steps 5 and 6 took. That is your real recovery time.
8. **Deleted-data rule.** Account deletions are not undone by a restore: after any restore, re-run the deletions requested since the backup (keep the request register for this: `incident-register.md`). Backups keep deleted data until they expire; the privacy page must say so (**OWNER TO CONFIRM** wording).

## C. Rollback
Same as `docs/hosting-plan.md` ("Safe database migration procedure" and "Rollback plan"), in short:
- **Bad deploy**: promote the previous production deployment in the host's dashboard. No data change is needed because migrations are additive.
- **Bad migration**: roll the app back first. Only if data was damaged, restore from the branch made just before migrating (step 3 above). Never drop columns by hand to undo.
- **Bad setting or leaked secret**: revert the setting, rotate the secret, redeploy.
- **Everything wrong**: pause the project; no data is lost by pausing.
- Keep times: last good deploy, migration start, backup name.

## Result log
| Date | Who | Host and plan | Backup name | Restore time | Result | Notes |
|---|---|---|---|---|---|---|
| (not run) | | | | | | |
