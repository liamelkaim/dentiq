@AGENTS.md

# DentOS — notes for AI assistants

Read before changing anything: `README.md`, `docs/architecture.md`, `docs/security-privacy.md`, `docs/roadmap.md`.
The owner's full product requirements are in `docs/master-prompt.md` (its section 24 "Immediate task" describes Phase 1, already done; check `docs/roadmap.md` for current status).

- One Next.js app (App Router, TypeScript). No separate API service or monorepo packages unless there is a documented reason.
- Layers: `src/app` (pages) → `src/server/<module>/actions.ts` (auth check + validation) → `src/server/<module>/service.ts` (business logic, takes `db` explicitly) → `src/db` (Drizzle schema).
- Every server action and protected page calls `requireUser()` / `requireRole()` from `src/server/auth/session.ts`. Hiding a button is never enough.
- `pnpm dev` runs PGlite out-of-process (`pglite-server`) — never open PGlite inside the Next.js dev server (it corrupted the database). Uploaded files only via `src/server/storage.ts` and `/api/files`.
- Schema changes: edit `src/db/schema/*`, run `pnpm db:generate`, commit the SQL in `drizzle/`. Additive migrations only; never destructive without explicit approval.
- All UI text goes through `src/messages/fr.json` and `en.json` (same keys — a test enforces it). French is the default.
- Colors only through the tokens in `src/app/globals.css`.
- Never invent courses, professors, credits or exam content. Test data uses `TEST …` / `DEMO …` codes.
- Run `pnpm check` and `pnpm build` before reporting work as done. Update `docs/roadmap.md`.
- Do not deploy, push, create paid services or delete data without explicit approval.
