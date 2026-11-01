// Shared rate-limit counters, kept in the database so every server instance (serverless included) sees the same count.
// Two tables, two owners:
// - `rate_limits`: Dentiq's own fixed-window counters (src/server/rate-limit/service.ts). Holds only an opaque key such as
//   "export:<user id>", the start of the current window, how long the window lasts and the number of attempts. No content.
// - `auth_rate_limit`: the table Better Auth's `rateLimit.storage: "database"` expects (model "rateLimit": key, count,
//   lastRequest in epoch milliseconds). Better Auth reads and writes it; Dentiq never touches it directly.
import { bigint, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text().primaryKey(),
    windowStart: timestamp({ withTimezone: true }).notNull(),
    windowSeconds: integer().notNull(),
    count: integer().notNull(),
  },
  (t) => [index().on(t.windowStart)],
);

export const authRateLimit = pgTable("auth_rate_limit", {
  id: text()
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  key: text().notNull().unique(),
  count: integer().notNull(),
  lastRequest: bigint({ mode: "number" }).notNull(),
});
