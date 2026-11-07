// The student's saved tutor conversations. A conversation exists only because a provider answered; every query filters
// on the student's own id (another student's conversation behaves as "not found"). The student can delete one, delete
// all, or download everything as JSON. Nothing here is visible to administrators or moderators.
import { and, asc, count, desc, eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { tutorConversations, tutorMessages, type TutorCitation } from "@/db/schema";
import { writeAudit } from "@/server/audit";

export const CONVERSATIONS_PER_USER_MAX = 100;
export const MESSAGES_PER_CONVERSATION_MAX = 200;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Saves one question and its answer. Starts a conversation (titled with the question's first words) when none is given. */
export async function saveExchange(
  db: Database,
  userId: string,
  input: { conversationId?: string | null; courseId: string; question: string; answer: string; citations: TutorCitation[] },
): Promise<{ conversationId: string } | null> {
  return db.transaction(async (tx) => {
    let id = input.conversationId ?? null;
    if (id) {
      if (!UUID.test(id)) return null;
      const [own] = await tx.select({ id: tutorConversations.id }).from(tutorConversations).where(and(eq(tutorConversations.id, id), eq(tutorConversations.userId, userId)));
      if (!own) return null;
      const [n] = await tx.select({ n: count() }).from(tutorMessages).where(eq(tutorMessages.conversationId, id));
      if (Number(n?.n ?? 0) + 2 > MESSAGES_PER_CONVERSATION_MAX) return null;
    } else {
      const [n] = await tx.select({ n: count() }).from(tutorConversations).where(eq(tutorConversations.userId, userId));
      if (Number(n?.n ?? 0) >= CONVERSATIONS_PER_USER_MAX) return null;
      const [created] = await tx.insert(tutorConversations).values({ userId, courseId: input.courseId, title: input.question.slice(0, 80) }).returning({ id: tutorConversations.id });
      id = created!.id;
    }
    const now = new Date();
    await tx.insert(tutorMessages).values([
      { conversationId: id, role: "user", body: input.question, citations: [], createdAt: now },
      { conversationId: id, role: "assistant", body: input.answer, citations: input.citations, createdAt: new Date(now.getTime() + 1) },
    ]);
    await tx.update(tutorConversations).set({ updatedAt: now }).where(eq(tutorConversations.id, id));
    return { conversationId: id };
  });
}

export async function listConversations(db: Database, userId: string) {
  return db.select({ id: tutorConversations.id, title: tutorConversations.title, courseId: tutorConversations.courseId, updatedAt: tutorConversations.updatedAt }).from(tutorConversations).where(eq(tutorConversations.userId, userId)).orderBy(desc(tutorConversations.updatedAt));
}

export async function getConversation(db: Database, userId: string, id: string) {
  if (!UUID.test(id)) return null;
  const [conversation] = await db.select().from(tutorConversations).where(and(eq(tutorConversations.id, id), eq(tutorConversations.userId, userId)));
  if (!conversation) return null;
  const messages = await db.select().from(tutorMessages).where(eq(tutorMessages.conversationId, id)).orderBy(asc(tutorMessages.createdAt));
  return { ...conversation, messages };
}

export async function deleteConversation(db: Database, userId: string, id: string): Promise<boolean> {
  if (!UUID.test(id)) return false;
  const rows = await db.delete(tutorConversations).where(and(eq(tutorConversations.id, id), eq(tutorConversations.userId, userId))).returning({ id: tutorConversations.id });
  if (rows.length) await writeAudit(db, { actorId: userId, action: "tutor_conversation.delete", entityType: "tutor_conversation", entityId: id });
  return rows.length > 0;
}

export async function deleteAllConversations(db: Database, userId: string): Promise<number> {
  const rows = await db.delete(tutorConversations).where(eq(tutorConversations.userId, userId)).returning({ id: tutorConversations.id });
  if (rows.length) await writeAudit(db, { actorId: userId, action: "tutor_conversation.delete_all", entityType: "user", entityId: userId, metadata: { count: rows.length } });
  return rows.length;
}

/** Everything the student has saved, as a JSON document for download. */
export async function exportConversations(db: Database, userId: string, now: Date = new Date()): Promise<{ filename: string; json: string }> {
  const conversations = await listConversations(db, userId);
  const full = [];
  for (const c of conversations) {
    const conv = await getConversation(db, userId, c.id);
    if (conv) full.push({ id: conv.id, title: conv.title, courseId: conv.courseId, createdAt: conv.createdAt, updatedAt: conv.updatedAt, messages: conv.messages.map((m) => ({ role: m.role, text: m.body, citations: m.citations, at: m.createdAt })) });
  }
  return { filename: `dentiq-tutor-${now.toISOString().slice(0, 10)}.json`, json: JSON.stringify({ exportedAt: now.toISOString(), note: "Answers are generated text and may be wrong.", conversations: full }, null, 2) };
}
