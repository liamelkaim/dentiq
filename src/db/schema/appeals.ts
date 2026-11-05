// Appeals: the author of a shared item that a moderator hid or rejected can contest the decision once. An administrator
// (not the moderator who took it down) decides. `entityId` points at a resource or an exam question; it has no foreign
// key because it can point at either table, so the service checks the target. Deleted with the appellant's account.
import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";

export const appealEntityTypes = ["resource", "question"] as const;
export type AppealEntityType = (typeof appealEntityTypes)[number];
export const appealStatuses = ["open", "upheld", "denied"] as const;
export type AppealStatus = (typeof appealStatuses)[number];

export const contentAppeals = pgTable(
  "content_appeals",
  {
    id: uuid().primaryKey().defaultRandom(),
    entityType: text({ enum: appealEntityTypes }).notNull(),
    entityId: uuid().notNull(),
    appellantId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    message: text().notNull(),
    status: text({ enum: appealStatuses }).notNull().default("open"),
    decidedBy: text().references(() => user.id, { onDelete: "set null" }),
    decidedAt: timestamp({ withTimezone: true }),
    decisionNote: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index().on(t.status, t.createdAt),
    // One open appeal per item and person.
    uniqueIndex("content_appeals_one_open").on(t.entityType, t.entityId, t.appellantId).where(sql`${t.status} = 'open'`),
    check("content_appeals_message_present", sql`length(btrim(${t.message})) > 0`),
  ],
);
