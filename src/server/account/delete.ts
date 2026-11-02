// Account deletion. One transaction removes the student's private rows, detaches (anonymizes) what was already shared,
// removes the account and its sessions, and writes an audit entry that holds no personal data. Uploaded files are
// removed from storage right after the transaction commits.
//
// What happens to each kind of data (also written in docs/account-data.md; needs a legal review, see Law 25 notes):
//  - DELETED with the account: notes and versions, study data (attempts, marks, cards, reviews, quizzes), calendar
//    entries, tutor usage rows, sign-in records, personal documents (rows AND files), uploads still waiting for review,
//    exam questions still pending or rejected (rows AND images) when nobody else's study data refers to them.
//  - KEPT, DETACHED: published or hidden documents and exam questions, their versions, images, revisions, change notes,
//    reports the student filed, topic and link records. Their author columns already allow "no author" (ON DELETE SET
//    NULL), so no schema change was needed. They are then anonymous: the database no longer says who wrote them.
//  - AUDIT: rows keep their action, type and date; the actor becomes empty. Rows about the account itself, and rows about
//    things deleted here, lose their entity id and metadata.
import { and, eq, inArray, ne, or, sql } from "drizzle-orm";
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core";
import type { Database } from "@/db/client";
import {
  auditLog,
  courseNotes,
  examQuestionImages,
  examQuestions,
  recordings,
  resources,
  resourceVersions,
  session,
  studyAttempts,
  studyCardReviews,
  studyQuestionCards,
  studyQuestionMarks,
  studyQuizItems,
  studyQuizzes,
  user,
  verification,
} from "@/db/schema";
import { writeAudit } from "@/server/audit";
import type { ServiceResult } from "@/server/catalog/service";
import type { FileStorage } from "@/server/storage";
import { hasOtherApprovedAdmin, isRetryableConflict, lockAdminsAnd } from "@/server/users/admin-guard";
import { DELETE_UNSHARED_QUESTION_STATUSES, DELETE_UNSHARED_RESOURCE_STATUSES } from "./constants";

export type DeleteSummary = {
  filesDeleted: number;
  filesFailed: number;
};

/** The typed confirmation is the account's email address. Case and surrounding spaces do not matter. */
export function confirmationMatches(typed: string, email: string): boolean {
  return typed.trim().toLowerCase() === email.trim().toLowerCase();
}

/** True when this account is the only administrator who could still run the site (other admins must be approved). */
export async function isLastAdmin(db: Pick<Database, "select">, userId: string): Promise<boolean> {
  const [self] = await db.select({ role: user.role }).from(user).where(eq(user.id, userId));
  if (self?.role !== "admin") return false;
  const others = await db
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.role, "admin"), eq(user.approvalStatus, "approved"), ne(user.id, userId)))
    .limit(1);
  return others.length === 0;
}

export async function deleteAccount(db: Database, storage: FileStorage, userId: string, typedConfirmation: string): Promise<ServiceResult<DeleteSummary>> {
  try {
    return await deleteAccountOnce(db, storage, userId, typedConfirmation);
  } catch (error) {
    // A deadlock or serialization failure rolled the transaction back: nothing was deleted, so asking to retry is safe.
    if (isRetryableConflict(error)) return { ok: false, error: "tryAgain" };
    throw error;
  }
}

async function deleteAccountOnce(db: Database, storage: FileStorage, userId: string, typedConfirmation: string): Promise<ServiceResult<DeleteSummary>> {
  const outcome = await db.transaction(async (tx) => {
    // Lock every administrator row AND the account row in one statement, sorted by id, the same order every other
    // admin-affecting transaction uses (users/admin-guard.ts). Two admins deleting themselves, or demoting each
    // other, at the same moment then queue up instead of deadlocking, and cannot both pass the "last admin" check.
    const locked = await lockAdminsAnd(tx, userId);
    const self = locked.find((r) => r.id === userId);
    if (!self) return { ok: false as const, error: "notFound" };
    if (!confirmationMatches(typedConfirmation, self.email)) return { ok: false as const, error: "confirmationMismatch" };
    // Same rule as isLastAdmin(): an administrator (approved or not) with no other approved administrator.
    if (self.role === "admin" && !hasOtherApprovedAdmin(locked, userId)) return { ok: false as const, error: "lastAdmin" };

    // 1. Documents the student uploaded that nobody else has seen: personal ones, and shared ones still pending review.
    const unsharedResources = await tx
      .select({ id: resources.id })
      .from(resources)
      .where(
        and(
          eq(resources.createdBy, userId),
          or(eq(resources.visibility, "private"), inArray(resources.status, [...DELETE_UNSHARED_RESOURCE_STATUSES])),
        ),
      );
    const resourceIds = unsharedResources.map((r) => r.id);
    const resourceKeys = resourceIds.length
      ? (await tx.select({ key: resourceVersions.storageKey }).from(resourceVersions).where(inArray(resourceVersions.resourceId, resourceIds))).map((r) => r.key)
      : [];

    // 2. Questions never published. A question that other students' study data already points to is kept (detached),
    //    because deleting it would silently erase their records.
    const usedByOthers = (table: PgTable, userCol: AnyPgColumn, questionCol: AnyPgColumn) =>
      sql`not exists (select 1 from ${table} where ${questionCol} = ${examQuestions.id} and ${userCol} <> ${userId})`;
    const unsharedQuestions = await tx
      .select({ id: examQuestions.id })
      .from(examQuestions)
      .where(
        and(
          eq(examQuestions.contributedBy, userId),
          inArray(examQuestions.status, [...DELETE_UNSHARED_QUESTION_STATUSES]),
          usedByOthers(studyAttempts, studyAttempts.userId, studyAttempts.questionId),
          usedByOthers(studyQuestionMarks, studyQuestionMarks.userId, studyQuestionMarks.questionId),
          usedByOthers(studyQuestionCards, studyQuestionCards.userId, studyQuestionCards.questionId),
          usedByOthers(studyCardReviews, studyCardReviews.userId, studyCardReviews.questionId),
          sql`not exists (select 1 from ${studyQuizItems} join ${studyQuizzes} on ${studyQuizzes.id} = ${studyQuizItems.quizId} where ${studyQuizItems.questionId} = ${examQuestions.id} and ${studyQuizzes.userId} <> ${userId})`,
        ),
      );
    const questionIds = unsharedQuestions.map((q) => q.id);
    const imageKeys = questionIds.length
      ? (await tx.select({ key: examQuestionImages.storageKey }).from(examQuestionImages).where(inArray(examQuestionImages.questionId, questionIds))).map((r) => r.key)
      : [];

    // Recording files live in storage; the rows (and their notes) go with the account, so list the files first.
    const recordingKeys = (await tx.select({ key: recordings.storageKey }).from(recordings).where(eq(recordings.ownerId, userId))).map((r) => r.key);

    const notes = await tx.select({ id: courseNotes.id }).from(courseNotes).where(eq(courseNotes.ownerId, userId));
    const noteIds = notes.map((n) => n.id);

    // What stays, counted before the account goes (the author link is cleared by the database when the row is removed).
    const keptResources = await tx.$count(resources, eq(resources.createdBy, userId));
    const keptQuestions = await tx.$count(examQuestions, eq(examQuestions.contributedBy, userId));

    // 3. Scrub audit rows that describe what is being deleted (they hold ids, and for uploads a file fingerprint).
    //    Ids are random UUIDs, so matching on the id alone is enough whatever the entity type was.
    const deletedEntityIds = [...resourceIds, ...questionIds, ...noteIds];
    if (deletedEntityIds.length) {
      await tx.update(auditLog).set({ entityId: null, metadata: null }).where(inArray(auditLog.entityId, deletedEntityIds));
    }
    await tx.update(auditLog).set({ entityId: null, metadata: null }).where(and(eq(auditLog.entityType, "user"), eq(auditLog.entityId, userId)));

    // 4. Delete the rows. Dependent rows (versions, choices, images, revisions, links, reports) go with their parent.
    if (resourceIds.length) await tx.delete(resources).where(inArray(resources.id, resourceIds));
    if (questionIds.length) await tx.delete(examQuestions).where(inArray(examQuestions.id, questionIds));
    await tx.delete(session).where(eq(session.userId, userId));
    // Pending sign-in or verification links are keyed by the email address.
    await tx.delete(verification).where(sql`lower(${verification.identifier}) = ${self.email.toLowerCase()}`);
    // Removing the account row clears: sign-in records, notes and versions, study data, calendar, tutor usage.
    // Author columns on shared contributions, reports and audit entries become empty (ON DELETE SET NULL).
    await tx.delete(user).where(eq(user.id, userId));

    // 5. One audit entry with counts only.
    await writeAudit(tx, {
      actorId: null,
      action: "account.delete",
      entityType: "account",
      metadata: {
        privateDocumentsDeleted: resourceIds.length,
        unpublishedQuestionsDeleted: questionIds.length,
        notesDeleted: noteIds.length,
        sharedDocumentsKept: keptResources - resourceIds.length,
        questionsKept: keptQuestions - questionIds.length,
      },
    });

    return { ok: true as const, keys: [...resourceKeys, ...imageKeys, ...recordingKeys] };
  });

  if (!outcome.ok) return outcome;

  // Files go after the commit: if the process stops here the account is already gone and only unreachable files
  // remain (listed in an audit entry when a removal fails, so they can be cleaned up).
  let filesDeleted = 0;
  const failed: string[] = [];
  for (const key of outcome.keys) {
    try {
      await storage.delete(key);
      filesDeleted += 1;
    } catch {
      failed.push(key);
    }
  }
  if (failed.length) {
    await writeAudit(db, { actorId: null, action: "account.delete.files_failed", entityType: "account", metadata: { storageKeys: failed } });
  }
  return { ok: true, value: { filesDeleted, filesFailed: failed.length } };
}
