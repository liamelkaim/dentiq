// Applies pending migrations from ./drizzle. Usage: pnpm db:migrate
// With the local database (no DATABASE_URL), stop `pnpm dev` first: only one process can open it.
// (`pnpm dev` already migrates the local database automatically.)
import "dotenv/config";
import { migrateDatabase, usesLocalDatabase } from "../src/db/client";

await migrateDatabase();
console.info(
  `Migrations applied (${usesLocalDatabase() ? `local PGlite in ${process.env.PGLITE_DATA_DIR || "./.data/pglite"}` : "DATABASE_URL"}).`,
);
process.exit(0);
