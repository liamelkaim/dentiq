// Applies pending migrations from ./drizzle. Usage: pnpm db:migrate
// With PGlite (no DATABASE_URL), stop the dev server first: only one process can open the local database.
import "dotenv/config";
import { migrateDatabase, usesLocalDatabase } from "../src/db/client";

await migrateDatabase();
console.info(`Migrations applied (${usesLocalDatabase() ? "local PGlite in ./.data/pglite" : "DATABASE_URL"}).`);
process.exit(0);
