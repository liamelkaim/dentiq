// Feedback sent from the Feedback button. Visitors may be signed out, so userId is optional. Only the PATH of the page is
// stored (never the query string, which can hold tokens). Read and closed by the administrator.
import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";

export const feedbackTypes = ["bug", "idea", "question", "other"] as const;
export type FeedbackType = (typeof feedbackTypes)[number];

export const feedback = pgTable(
  "feedback",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text().references(() => user.id, { onDelete: "set null" }),
    type: text({ enum: feedbackTypes }).notNull(),
    message: text().notNull(),
    contactEmail: text(),
    pagePath: text().notNull(),
    locale: text().notNull(),
    status: text({ enum: ["new", "done"] }).notNull().default("new"),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    doneAt: timestamp({ withTimezone: true }),
    doneBy: text().references(() => user.id, { onDelete: "set null" }),
  },
  (t) => [index().on(t.status, t.createdAt), check("feedback_message_present", sql`length(btrim(${t.message})) > 0`)],
);
