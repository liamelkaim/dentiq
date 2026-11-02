// Feedback: validation, storage, the administrator's notice and the admin list. Nothing is sent to a third party; the
// notice goes through the app's own mailer (console locally, Resend when configured) to the administrator only.
import { desc, eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { feedback, feedbackTypes, type FeedbackType } from "@/db/schema";
import { writeAudit } from "@/server/audit";
import { hasRole } from "@/server/auth/roles";
import { getMailer, type Mailer } from "@/server/email";
import type { Viewer } from "@/server/resources/service";

export const FEEDBACK_MESSAGE_MIN = 5;
import { FEEDBACK_MESSAGE_MAX as MAX } from "./constants";
export const FEEDBACK_MESSAGE_MAX = MAX;
export const FEEDBACK_OPEN_MAX = 500;

export type FeedbackInput = { type?: unknown; message?: unknown; email?: unknown; pageUrl?: unknown; locale?: unknown };
export type FeedbackResult = { ok: true } | { ok: false; error: "invalidType" | "messageTooShort" | "messageTooLong" | "invalidEmail" | "tooMany" };

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;

/** "/courses/DEN%2010021?token=abc#x" or "https://host/privacy?x=1" -> "/courses/DEN%2010021" / "/privacy". Anything else -> "/". */
export function pathOnly(raw: unknown): string {
  if (typeof raw !== "string") return "/";
  try {
    const u = new URL(raw, "http://local.invalid");
    return u.pathname.startsWith("/") ? u.pathname.slice(0, 200) : "/";
  } catch {
    return "/";
  }
}

export function parseFeedback(input: FeedbackInput) {
  const type = typeof input.type === "string" && (feedbackTypes as readonly string[]).includes(input.type) ? (input.type as FeedbackType) : null;
  if (!type) return { ok: false as const, error: "invalidType" as const };
  const message = (typeof input.message === "string" ? input.message : "").replace(/\r\n/g, "\n").trim();
  if (message.length < FEEDBACK_MESSAGE_MIN) return { ok: false as const, error: "messageTooShort" as const };
  if (message.length > FEEDBACK_MESSAGE_MAX) return { ok: false as const, error: "messageTooLong" as const };
  const email = (typeof input.email === "string" ? input.email : "").trim();
  if (email && !EMAIL.test(email)) return { ok: false as const, error: "invalidEmail" as const };
  return { ok: true as const, value: { type, message, email: email || null, pagePath: pathOnly(input.pageUrl), locale: input.locale === "en" ? "en" : "fr" } };
}

/** Stores one piece of feedback and tells the administrator. A failure to send the notice never loses the feedback. */
export async function submitFeedback(db: Database, viewerId: string | null, input: FeedbackInput, mailer: Mailer = getMailer(), adminEmail = process.env.ADMIN_EMAILS?.split(",")[0]?.trim()): Promise<FeedbackResult> {
  const parsed = parseFeedback(input);
  if (!parsed.ok) return parsed;
  const v = parsed.value;
  const [row] = await db.insert(feedback).values({ userId: viewerId, type: v.type, message: v.message, contactEmail: v.email, pagePath: v.pagePath, locale: v.locale }).returning({ id: feedback.id });
  if (adminEmail) {
    try {
      await mailer.send({ to: adminEmail, subject: `Dentiq feedback (${v.type})`, text: `Type: ${v.type}\nPage: ${v.pagePath}\nLanguage: ${v.locale}\nReply to: ${v.email ?? "not given"}\n\n${v.message}\n\nRead and close it in Admin > Feedback.` });
    } catch {
      /* the feedback is saved; the admin will see it in the list */
    }
  }
  await writeAudit(db, { actorId: viewerId, action: "feedback.submit", entityType: "feedback", entityId: row!.id });
  return { ok: true };
}

export async function listFeedback(db: Database, viewer: Viewer, filter: "new" | "all" = "new") {
  if (!hasRole(viewer, "admin")) return [];
  const q = db.select().from(feedback);
  return (filter === "new" ? q.where(eq(feedback.status, "new")) : q).orderBy(desc(feedback.createdAt)).limit(FEEDBACK_OPEN_MAX);
}

export async function setFeedbackDone(db: Database, viewer: Viewer, id: string, done: boolean): Promise<boolean> {
  if (!hasRole(viewer, "admin")) return false;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return false;
  const rows = await db.update(feedback).set({ status: done ? "done" : "new", doneAt: done ? new Date() : null, doneBy: done ? viewer.id : null }).where(eq(feedback.id, id)).returning({ id: feedback.id });
  if (rows.length) await writeAudit(db, { actorId: viewer.id, action: done ? "feedback.done" : "feedback.reopen", entityType: "feedback", entityId: id });
  return rows.length > 0;
}
