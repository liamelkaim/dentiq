// Export of ONE student's own data as a JSON document.
//
// Safety rules (tested in tests/account.test.ts):
//  - Every query filters on the signed-in user's id (directly, or through a table that the user owns).
//  - Every table is read with an EXPLICIT column list. There is no `select *`, and the auth tables never leave through
//    a spread: password hashes, session tokens, provider tokens, storage keys and file fingerprints are not listed, so
//    they cannot appear.
//  - Moderation internals about other people (who reviewed, who verified, who resolved a report) are not listed.
//  - The result is capped per table and in total size; going over a cap is an error, never a silent cut.
import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "@/db/client";
import {
  account,
  auditLog,
  courseNotes,
  courseNoteVersions,
  courses,
  courseTopics,
  examQuestionChoices,
  examQuestionImages,
  examQuestionReports,
  examQuestionRevisions,
  examQuestions,
  noteQuestionLinks,
  noteTopics,
  resourceReports,
  resources,
  resourceVersions,
  session,
  studyAttempts,
  studyCardReviews,
  studyCalendarEntries,
  studyPersonalCards,
  studyQuestionCards,
  studyQuestionMarks,
  studyQuizItems,
  studyQuizzes,
  tutorConsents,
  contentAppeals,
  tutorConversations,
  tutorMessages,
  feedback,
  tutorUsage,
  user,
  userClassBlocks,
  userCourses,
  userProfile,
  recordingNotes,
  recordings,
} from "@/db/schema";
import type { ServiceResult } from "@/server/catalog/service";
import { EXPORT_MAX_BYTES, EXPORT_MAX_ROWS_PER_TABLE, EXPORT_SCHEMA_VERSION } from "./constants";

/** What the file does not contain, in plain words (also shown on the profile page, translated, and in docs/account-data.md). */
export const EXPORT_NOT_INCLUDED = [
  "Your password and anything derived from it, session tokens and other sign-in secrets.",
  "The bytes of uploaded files and images (only their names, types and sizes are listed).",
  "Other students' data, including their notes, answers, reports and accounts.",
  "Moderation records about other people (who reviewed or verified a contribution, how a report was resolved).",
  "Shared course material written by others, and the catalog, which are not yours.",
  "Technical logs kept by the hosting provider, and backups.",
] as const;

class ExportTooLarge extends Error {}

export type ExportOptions = { now?: Date; maxRowsPerTable?: number; maxBytes?: number };

export type AccountExport = Record<string, unknown>;

export async function buildAccountExport(db: Database, userId: string, options: ExportOptions = {}): Promise<ServiceResult<{ filename: string; json: string }>> {
  const now = options.now ?? new Date();
  const maxRows = options.maxRowsPerTable ?? EXPORT_MAX_ROWS_PER_TABLE;
  const maxBytes = options.maxBytes ?? EXPORT_MAX_BYTES;
  // One more row than allowed is read, so "over the cap" can be told apart from "exactly at the cap".
  const LIMIT = maxRows + 1;
  const capped = <T,>(rows: T[]): T[] => {
    if (rows.length > maxRows) throw new ExportTooLarge();
    return rows;
  };
  try {
    const [profile] = await db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        image: user.image,
        role: user.role,
        approvalStatus: user.approvalStatus,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      })
      .from(user)
      .where(eq(user.id, userId));
    if (!profile) return { ok: false, error: "notFound" };

    // Sign-in records: when and from which browser, but never the token or the row id that identifies the session.
    const sessions = capped(
      await db
        .select({ createdAt: session.createdAt, expiresAt: session.expiresAt, ipAddress: session.ipAddress, userAgent: session.userAgent })
        .from(session)
        .where(eq(session.userId, userId))
        .limit(LIMIT),
    );
    const signInMethods = capped(
      await db.select({ providerId: account.providerId, createdAt: account.createdAt }).from(account).where(eq(account.userId, userId)).limit(LIMIT),
    );

    // Documents the student uploaded, personal or shared.
    const ownResources = capped(
      await db
        .select({
          id: resources.id,
          courseId: resources.courseId,
          offeringId: resources.offeringId,
          kind: resources.kind,
          title: resources.title,
          description: resources.description,
          topic: resources.topic,
          visibility: resources.visibility,
          status: resources.status,
          createdAt: resources.createdAt,
          updatedAt: resources.updatedAt,
        })
        .from(resources)
        .where(eq(resources.createdBy, userId))
        .limit(LIMIT),
    );
    const uploadedVersions = capped(
      await db
        .select({
          id: resourceVersions.id,
          resourceId: resourceVersions.resourceId,
          versionNumber: resourceVersions.versionNumber,
          fileName: resourceVersions.fileName,
          mimeType: resourceVersions.mimeType,
          sizeBytes: resourceVersions.sizeBytes,
          changeNote: resourceVersions.changeNote,
          createdAt: resourceVersions.createdAt,
        })
        .from(resourceVersions)
        .where(eq(resourceVersions.uploadedBy, userId))
        .limit(LIMIT),
    );
    const documentReports = capped(
      await db
        .select({
          id: resourceReports.id,
          resourceId: resourceReports.resourceId,
          reason: resourceReports.reason,
          details: resourceReports.details,
          status: resourceReports.status,
          createdAt: resourceReports.createdAt,
        })
        .from(resourceReports)
        .where(eq(resourceReports.reporterId, userId))
        .limit(LIMIT),
    );

    // Exam questions the student contributed, with the wording and the answer they proposed. The moderator's reason
    // for a rejection is included because the student sees it too; the moderator's identity is not.
    const questions = capped(
      await db
        .select({
          id: examQuestions.id,
          courseId: examQuestions.courseId,
          offeringId: examQuestions.offeringId,
          examAcademicYear: examQuestions.examAcademicYear,
          examTerm: examQuestions.examTerm,
          topic: examQuestions.topic,
          questionType: examQuestions.questionType,
          questionText: examQuestions.questionText,
          explanation: examQuestions.explanation,
          proposedAnswerText: examQuestions.proposedAnswerText,
          provenance: examQuestions.provenance,
          confidence: examQuestions.confidence,
          status: examQuestions.status,
          reviewNote: examQuestions.reviewNote,
          answerStatus: examQuestions.answerStatus,
          createdAt: examQuestions.createdAt,
          updatedAt: examQuestions.updatedAt,
        })
        .from(examQuestions)
        .where(eq(examQuestions.contributedBy, userId))
        .limit(LIMIT),
    );
    const questionIds = questions.map((q) => q.id);
    const questionChoices = questionIds.length
      ? capped(
          await db
            .select({
              questionId: examQuestionChoices.questionId,
              position: examQuestionChoices.position,
              text: examQuestionChoices.text,
              proposedCorrect: examQuestionChoices.proposedCorrect,
            })
            .from(examQuestionChoices)
            .where(inArray(examQuestionChoices.questionId, questionIds))
            .limit(LIMIT),
        )
      : [];
    const questionImages = capped(
      await db
        .select({
          id: examQuestionImages.id,
          questionId: examQuestionImages.questionId,
          position: examQuestionImages.position,
          fileName: examQuestionImages.fileName,
          mimeType: examQuestionImages.mimeType,
          sizeBytes: examQuestionImages.sizeBytes,
          altText: examQuestionImages.altText,
          removedAt: examQuestionImages.removedAt,
          createdAt: examQuestionImages.createdAt,
        })
        .from(examQuestionImages)
        .where(eq(examQuestionImages.uploadedBy, userId))
        .limit(LIMIT),
    );
    const questionRevisions = capped(
      await db
        .select({
          questionId: examQuestionRevisions.questionId,
          revisionNumber: examQuestionRevisions.revisionNumber,
          changeNote: examQuestionRevisions.changeNote,
          createdAt: examQuestionRevisions.createdAt,
        })
        .from(examQuestionRevisions)
        .where(eq(examQuestionRevisions.changedBy, userId))
        .limit(LIMIT),
    );
    const questionReports = capped(
      await db
        .select({
          id: examQuestionReports.id,
          questionId: examQuestionReports.questionId,
          reason: examQuestionReports.reason,
          details: examQuestionReports.details,
          status: examQuestionReports.status,
          createdAt: examQuestionReports.createdAt,
        })
        .from(examQuestionReports)
        .where(eq(examQuestionReports.reporterId, userId))
        .limit(LIMIT),
    );

    // Private notes and every saved version.
    const notes = capped(
      await db
        .select({
          id: courseNotes.id,
          courseId: courseNotes.courseId,
          offeringId: courseNotes.offeringId,
          title: courseNotes.title,
          body: courseNotes.body,
          currentVersion: courseNotes.currentVersion,
          createdAt: courseNotes.createdAt,
          updatedAt: courseNotes.updatedAt,
        })
        .from(courseNotes)
        .where(eq(courseNotes.ownerId, userId))
        .limit(LIMIT),
    );
    const noteVersions = capped(
      await db
        .select({
          noteId: courseNoteVersions.noteId,
          versionNumber: courseNoteVersions.versionNumber,
          title: courseNoteVersions.title,
          body: courseNoteVersions.body,
          changeNote: courseNoteVersions.changeNote,
          restoredFromVersion: courseNoteVersions.restoredFromVersion,
          createdAt: courseNoteVersions.createdAt,
        })
        .from(courseNoteVersions)
        .innerJoin(courseNotes, eq(courseNoteVersions.noteId, courseNotes.id))
        .where(eq(courseNotes.ownerId, userId))
        .limit(LIMIT),
    );
    const noteTopicLinks = capped(
      await db
        .select({ noteId: noteTopics.noteId, topicId: noteTopics.topicId })
        .from(noteTopics)
        .innerJoin(courseNotes, eq(noteTopics.noteId, courseNotes.id))
        .where(eq(courseNotes.ownerId, userId))
        .limit(LIMIT),
    );
    const noteQuestions = capped(
      await db
        .select({ noteId: noteQuestionLinks.noteId, questionId: noteQuestionLinks.questionId })
        .from(noteQuestionLinks)
        .innerJoin(courseNotes, eq(noteQuestionLinks.noteId, courseNotes.id))
        .where(eq(courseNotes.ownerId, userId))
        .limit(LIMIT),
    );

    // Study tools.
    const attempts = capped(
      await db
        .select({
          id: studyAttempts.id,
          questionId: studyAttempts.questionId,
          mode: studyAttempts.mode,
          outcome: studyAttempts.outcome,
          answerBasis: studyAttempts.answerBasis,
          response: studyAttempts.response,
          selfRating: studyAttempts.selfRating,
          createdAt: studyAttempts.createdAt,
        })
        .from(studyAttempts)
        .where(eq(studyAttempts.userId, userId))
        .limit(LIMIT),
    );
    const marks = capped(
      await db
        .select({
          questionId: studyQuestionMarks.questionId,
          flagged: studyQuestionMarks.flagged,
          reviewLater: studyQuestionMarks.reviewLater,
          updatedAt: studyQuestionMarks.updatedAt,
        })
        .from(studyQuestionMarks)
        .where(eq(studyQuestionMarks.userId, userId))
        .limit(LIMIT),
    );
    const personalCards = capped(
      await db
        .select({
          id: studyPersonalCards.id,
          courseId: studyPersonalCards.courseId,
          front: studyPersonalCards.front,
          back: studyPersonalCards.back,
          box: studyPersonalCards.box,
          dueAt: studyPersonalCards.dueAt,
          lastReviewedAt: studyPersonalCards.lastReviewedAt,
          reviewCount: studyPersonalCards.reviewCount,
          lapseCount: studyPersonalCards.lapseCount,
          createdAt: studyPersonalCards.createdAt,
          updatedAt: studyPersonalCards.updatedAt,
        })
        .from(studyPersonalCards)
        .where(eq(studyPersonalCards.userId, userId))
        .limit(LIMIT),
    );
    const questionCards = capped(
      await db
        .select({
          questionId: studyQuestionCards.questionId,
          box: studyQuestionCards.box,
          dueAt: studyQuestionCards.dueAt,
          lastReviewedAt: studyQuestionCards.lastReviewedAt,
          reviewCount: studyQuestionCards.reviewCount,
          lapseCount: studyQuestionCards.lapseCount,
        })
        .from(studyQuestionCards)
        .where(eq(studyQuestionCards.userId, userId))
        .limit(LIMIT),
    );
    const cardReviews = capped(
      await db
        .select({
          id: studyCardReviews.id,
          questionId: studyCardReviews.questionId,
          personalCardId: studyCardReviews.personalCardId,
          rating: studyCardReviews.rating,
          boxBefore: studyCardReviews.boxBefore,
          boxAfter: studyCardReviews.boxAfter,
          createdAt: studyCardReviews.createdAt,
        })
        .from(studyCardReviews)
        .where(eq(studyCardReviews.userId, userId))
        .limit(LIMIT),
    );
    const quizzes = capped(
      await db
        .select({
          id: studyQuizzes.id,
          courseId: studyQuizzes.courseId,
          scope: studyQuizzes.scope,
          requestedCount: studyQuizzes.requestedCount,
          createdAt: studyQuizzes.createdAt,
          completedAt: studyQuizzes.completedAt,
        })
        .from(studyQuizzes)
        .where(eq(studyQuizzes.userId, userId))
        .limit(LIMIT),
    );
    const quizItems = capped(
      await db
        .select({
          quizId: studyQuizItems.quizId,
          position: studyQuizItems.position,
          questionId: studyQuizItems.questionId,
          response: studyQuizItems.response,
          outcome: studyQuizItems.outcome,
          answerBasis: studyQuizItems.answerBasis,
          selfRating: studyQuizItems.selfRating,
          answeredAt: studyQuizItems.answeredAt,
        })
        .from(studyQuizItems)
        .innerJoin(studyQuizzes, eq(studyQuizItems.quizId, studyQuizzes.id))
        .where(eq(studyQuizzes.userId, userId))
        .limit(LIMIT),
    );

    const calendar = capped(
      await db
        .select({
          id: studyCalendarEntries.id,
          title: studyCalendarEntries.title,
          entryDate: studyCalendarEntries.entryDate,
          entryTime: studyCalendarEntries.entryTime,
          courseId: studyCalendarEntries.courseId,
          kind: studyCalendarEntries.kind,
          note: studyCalendarEntries.note,
          createdAt: studyCalendarEntries.createdAt,
          updatedAt: studyCalendarEntries.updatedAt,
        })
        .from(studyCalendarEntries)
        .where(eq(studyCalendarEntries.userId, userId))
        .limit(LIMIT),
    );
    const programProfile = await db.select({ universityPreset: userProfile.universityPreset, programYear: userProfile.programYear, semester: userProfile.semester, onboardedAt: userProfile.onboardedAt }).from(userProfile).where(eq(userProfile.userId, userId));
    const classBlocks = capped(await db.select({ id: userClassBlocks.id, title: userClassBlocks.title, courseId: userClassBlocks.courseId, weekday: userClassBlocks.weekday, startTime: userClassBlocks.startTime, endTime: userClassBlocks.endTime, location: userClassBlocks.location, validFrom: userClassBlocks.validFrom, validTo: userClassBlocks.validTo, createdAt: userClassBlocks.createdAt }).from(userClassBlocks).where(eq(userClassBlocks.userId, userId)).limit(LIMIT));
    const followedCourses = capped(await db.select({ courseId: userCourses.courseId, createdAt: userCourses.createdAt }).from(userCourses).where(eq(userCourses.userId, userId)).limit(LIMIT));
    // Recordings: the file itself is not in this JSON (it can be large); its details and the student's notes on it are.
    const recordingRows = capped(await db.select({ id: recordings.id, title: recordings.title, courseId: recordings.courseId, fileName: recordings.fileName, mimeType: recordings.mimeType, sizeBytes: recordings.sizeBytes, lecturerName: recordings.lecturerName, consentConfirmedAt: recordings.consentConfirmedAt, createdAt: recordings.createdAt }).from(recordings).where(eq(recordings.ownerId, userId)).limit(LIMIT));
    const recordingNoteRows = capped(await db.select({ id: recordingNotes.id, recordingId: recordingNotes.recordingId, atSeconds: recordingNotes.atSeconds, body: recordingNotes.body, createdAt: recordingNotes.createdAt }).from(recordingNotes).where(eq(recordingNotes.ownerId, userId)).limit(LIMIT));
    const tutorConsentRows = await db.select({ version: tutorConsents.version, acceptedAt: tutorConsents.acceptedAt, locale: tutorConsents.locale }).from(tutorConsents).where(eq(tutorConsents.userId, userId));
    const tutorConversationRows = capped(await db.select({ id: tutorConversations.id, title: tutorConversations.title, courseId: tutorConversations.courseId, createdAt: tutorConversations.createdAt, updatedAt: tutorConversations.updatedAt }).from(tutorConversations).where(eq(tutorConversations.userId, userId)).limit(LIMIT));
    const tutorMessageRows = capped(await db.select({ conversationId: tutorMessages.conversationId, role: tutorMessages.role, body: tutorMessages.body, citations: tutorMessages.citations, createdAt: tutorMessages.createdAt }).from(tutorMessages).innerJoin(tutorConversations, eq(tutorMessages.conversationId, tutorConversations.id)).where(eq(tutorConversations.userId, userId)).limit(LIMIT));
    const feedbackRows = capped(await db.select({ type: feedback.type, message: feedback.message, contactEmail: feedback.contactEmail, pagePath: feedback.pagePath, status: feedback.status, createdAt: feedback.createdAt }).from(feedback).where(eq(feedback.userId, userId)).limit(LIMIT));
    const appealRows = capped(await db.select({ entityType: contentAppeals.entityType, message: contentAppeals.message, status: contentAppeals.status, decisionNote: contentAppeals.decisionNote, createdAt: contentAppeals.createdAt, decidedAt: contentAppeals.decidedAt }).from(contentAppeals).where(eq(contentAppeals.appellantId, userId)).limit(LIMIT));
    const tutor = capped(
      await db
        .select({
          usageDate: tutorUsage.usageDate,
          courseId: tutorUsage.courseId,
          contextChars: tutorUsage.contextChars,
          passageCount: tutorUsage.passageCount,
          createdAt: tutorUsage.createdAt,
        })
        .from(tutorUsage)
        .where(eq(tutorUsage.userId, userId))
        .limit(LIMIT),
    );

    // The student's own actions, and changes made to the account itself. No metadata and no other person's id.
    const actionRows = capped(
      await db
        .select({ action: auditLog.action, entityType: auditLog.entityType, entityId: auditLog.entityId, createdAt: auditLog.createdAt })
        .from(auditLog)
        .where(eq(auditLog.actorId, userId))
        .limit(LIMIT),
    );
    // An admin's approval or role change names the OTHER account it was about: that id is left out.
    const actions = actionRows.map((a) => ({ ...a, entityId: a.entityType === "user" ? null : a.entityId }));
    const accountHistory = capped(
      await db
        .select({ action: auditLog.action, createdAt: auditLog.createdAt })
        .from(auditLog)
        .where(and(eq(auditLog.entityType, "user"), eq(auditLog.entityId, userId)))
        .limit(LIMIT),
    );

    // Lookup lists so ids in the file can be read: the catalog entries and topic names the rows point to.
    // These are shared reference data, not personal data.
    const courseIds = [
      ...new Set(
        [
          ...ownResources.map((r) => r.courseId),
          ...questions.map((q) => q.courseId),
          ...notes.map((n) => n.courseId),
          ...personalCards.map((c) => c.courseId),
          ...quizzes.map((q) => q.courseId),
          ...calendar.map((c) => c.courseId),
          ...tutor.map((t) => t.courseId),
        ].filter((id): id is string => Boolean(id)),
      ),
    ];
    const referencedCourses = courseIds.length
      ? await db.select({ id: courses.id, code: courses.code, titleFr: courses.titleFr, titleEn: courses.titleEn }).from(courses).where(inArray(courses.id, courseIds))
      : [];
    const topicIds = [...new Set(noteTopicLinks.map((l) => l.topicId))];
    const referencedTopics = topicIds.length
      ? await db.select({ id: courseTopics.id, courseId: courseTopics.courseId, name: courseTopics.name, nameEn: courseTopics.nameEn }).from(courseTopics).where(inArray(courseTopics.id, topicIds))
      : [];

    const document: AccountExport = {
      schemaVersion: EXPORT_SCHEMA_VERSION,
      exportedAt: now.toISOString(),
      generatedBy: "Dentiq",
      notice: "A copy of your own data from Dentiq. Draft format; see docs/account-data.md in the project for what is and is not included.",
      notIncluded: [...EXPORT_NOT_INCLUDED],
      profile,
      signIns: { sessions, methods: signInMethods },
      documents: { items: ownResources, uploadedFiles: uploadedVersions, reportsFiled: documentReports },
      examQuestions: {
        items: questions,
        choices: questionChoices,
        images: questionImages,
        changes: questionRevisions,
        reportsFiled: questionReports,
      },
      notes: { items: notes, versions: noteVersions, topicLinks: noteTopicLinks, questionLinks: noteQuestions },
      study: { attempts, marks, personalCards, questionCards, cardReviews, quizzes, quizItems },
      calendar: { entries: calendar, classBlocks, followedCourses },
      program: programProfile[0] ?? null,
      feedback: { items: feedbackRows },
      appeals: { items: appealRows },
      recordings: { items: recordingRows, notes: recordingNoteRows },
      tutorUsage: { entries: tutor },
      tutorConversations: { consent: tutorConsentRows[0] ?? null, conversations: tutorConversationRows, messages: tutorMessageRows },
      activity: { yourActions: actions, accountHistory },
      referenced: { courses: referencedCourses, topics: referencedTopics },
    };

    const json = JSON.stringify(document, null, 2);
    if (Buffer.byteLength(json, "utf8") > maxBytes) return { ok: false, error: "tooLarge" };
    const day = now.toISOString().slice(0, 10);
    return { ok: true, value: { filename: `dentiq-my-data-${day}.json`, json } };
  } catch (error) {
    if (error instanceof ExportTooLarge) return { ok: false, error: "tooLarge" };
    throw error;
  }
}
