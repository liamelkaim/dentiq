// Runs once when the Next.js server starts.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { validateEnv } = await import("@/server/env");
  validateEnv();

  // In development the database is migrated automatically. In production, migrations are applied
  // explicitly with `pnpm db:migrate`, so schema changes are always deliberate.
  if (process.env.NODE_ENV === "development") {
    const { migrateDatabase } = await import("@/db/client");
    await migrateDatabase();
  }
}
