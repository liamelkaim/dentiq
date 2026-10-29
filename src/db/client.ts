import { mkdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

const MIGRATIONS_FOLDER = "./drizzle";
const LOCAL_DATA_DIR = process.env.PGLITE_DATA_DIR || "./.data/pglite";

/** True when no DATABASE_URL is set and the embedded local Postgres is used. */
export function usesLocalDatabase(): boolean {
  return !process.env.DATABASE_URL;
}

function createDatabase(): Database {
  const url = process.env.DATABASE_URL;
  if (url) {
    return drizzlePostgres(postgres(url, { max: 10 }), { schema, casing: "snake_case" });
  }
  mkdirSync(LOCAL_DATA_DIR, { recursive: true });
  return drizzlePglite(new PGlite(LOCAL_DATA_DIR), { schema, casing: "snake_case" });
}

// One instance per process, surviving Next.js dev reloads. PGlite allows a single process
// per data folder, so opening it twice would fail.
const globalForDb = globalThis as unknown as { dentosDb?: Database };

export function getDb(): Database {
  globalForDb.dentosDb ??= createDatabase();
  return globalForDb.dentosDb;
}

/** Fresh in-memory Postgres with all migrations applied. For tests. */
export async function createTestDatabase(): Promise<Database> {
  const db = drizzlePglite(new PGlite(), { schema, casing: "snake_case" });
  await migratePglite(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return db;
}

export async function migrateDatabase(db: Database = getDb()): Promise<void> {
  if (process.env.DATABASE_URL) {
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    await migrate(db as Parameters<typeof migrate>[0], { migrationsFolder: MIGRATIONS_FOLDER });
  } else {
    await migratePglite(db as Parameters<typeof migratePglite>[0], {
      migrationsFolder: MIGRATIONS_FOLDER,
    });
  }
}
