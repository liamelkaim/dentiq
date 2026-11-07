// Explicit consent before any content leaves the app. The student must accept the CURRENT consent text (version below)
// on the tutor page before a question can reach a provider. Changing the wording means raising the version, which asks
// everyone again. Withdrawing deletes the row. Stored per student; deleted with the account.
import { eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { tutorConsents } from "@/db/schema";
import { writeAudit } from "@/server/audit";

/** Raise when the consent text (tutor.consent.* in the message files) changes in substance. */
export const TUTOR_CONSENT_VERSION = 2;

export async function hasTutorConsent(db: Database, userId: string): Promise<boolean> {
  const [row] = await db.select({ v: tutorConsents.version }).from(tutorConsents).where(eq(tutorConsents.userId, userId));
  return row?.v === TUTOR_CONSENT_VERSION;
}

/** Stores the proof of consent: who, when, the version of the wording and the language the student actually saw. */
export async function acceptTutorConsent(db: Database, userId: string, locale: string = "fr"): Promise<void> {
  const lang = locale === "en" ? "en" : "fr";
  await db
    .insert(tutorConsents)
    .values({ userId, version: TUTOR_CONSENT_VERSION, locale: lang })
    .onConflictDoUpdate({ target: tutorConsents.userId, set: { version: TUTOR_CONSENT_VERSION, acceptedAt: new Date(), locale: lang } });
  await writeAudit(db, { actorId: userId, action: "tutor_consent.accept", entityType: "user", entityId: userId, metadata: { version: TUTOR_CONSENT_VERSION, locale: lang } });
}

export async function getTutorConsent(db: Database, userId: string) {
  const [row] = await db.select({ version: tutorConsents.version, acceptedAt: tutorConsents.acceptedAt, locale: tutorConsents.locale }).from(tutorConsents).where(eq(tutorConsents.userId, userId));
  return row ?? null;
}

export async function withdrawTutorConsent(db: Database, userId: string): Promise<void> {
  await db.delete(tutorConsents).where(eq(tutorConsents.userId, userId));
  await writeAudit(db, { actorId: userId, action: "tutor_consent.withdraw", entityType: "user", entityId: userId });
}
