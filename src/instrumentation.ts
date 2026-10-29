// Runs once when the Next.js server starts.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { validateEnv } = await import("@/server/env");
  validateEnv();

  // The embedded local database is migrated automatically. A hosted Postgres is migrated
  // explicitly with `pnpm db:migrate`, so production schema changes are always deliberate.
  const { migrateDatabase, usesLocalDatabase } = await import("@/db/client");
  if (usesLocalDatabase()) await migrateDatabase();
}
