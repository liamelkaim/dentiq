// Small key/value store for settings an administrator can change without a redeploy.
// Values are validated by the code that reads them (e.g. src/server/passes/settings.ts); a missing or
// invalid value always falls back to safe defaults, never to wider permissions.
import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth";

export const appSettings = pgTable("app_settings", {
  key: text().primaryKey(),
  value: jsonb().$type<Record<string, unknown>>().notNull(),
  updatedBy: text().references(() => user.id, { onDelete: "set null" }),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
