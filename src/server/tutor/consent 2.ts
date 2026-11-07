// Explicit consent before any content leaves the app. The student must accept the CURRENT consent text (version below)
// on the tutor page before a question can reach a provider. Changing the wording means raising the version, which asks
// everyone again. Withdrawing deletes the row. Stored per student; deleted with the account.
import { eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { tutorConsents } from "@/db/schema";
import { writeAudit } from "@/server/audit";

/** Raise when the consent text (tutor.consent.* in the message files) changes in substance. */
export const TUTOR_CONSENT_VERSION = 1;

export async function hasTutorConsent(db: Database, userId: string): Promise<boolean> {
  const [row] = await db.select({ v: tutorConsents.version }).from(tutorConsents).where(eq(tutorConsents.userId, userId));
  return row?.v === TUTOR_CONSENT_VERSION;
}

export async function acceptTutorConsent(db: Database, userId: string): Promise<void> {
  await db
    .insert(tutorConsents)
    .values({ userId, version: TUTOR_CONSENT_VERSION })
    .onConflictDoUpdate({ target: tutorConsents.userId, set: { version: TUTOR_CONSENT_VERSION, acceptedAt: new Date() } });
  await writeAudit(db, { actorId: userId, action: "tutor_consent.accept", entityType: "user", entityId: userId, metadata: { version: TUTOR_CONSENT_VERSION } });
}

export async function withdrawTutorConsent(db: Database, userId: string): Promise<void> {
  await db.delete(tutorConsents).where(eq(tutorConsents.userId, userId));
  await writeAudit(db, { actorId: userId, action: "tutor_consent.withdraw", entityType: "user", entityId: userId });
}
