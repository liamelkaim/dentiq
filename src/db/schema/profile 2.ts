// What a student told us during first-run onboarding. Optional everywhere: skipping stores only onboardedAt.
import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth";

export const userProfile = pgTable("user_profile", {
  userId: text()
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  /** Key of a university preset (see src/server/onboarding/presets.ts), or null when skipped. */
  universityPreset: text(),
  programYear: integer(),
  semester: integer(),
  onboardedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
