// Fake data only (TEST course codes, example.com accounts). These tests check that the DATABASE itself
// refuses bad data, independent of any form validation added later.
import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase, type Database } from "@/db/client";
import {
  courseOfferings,
  courses,
  examQuestionChoices,
  examQuestionReports,
  examQuestionRevisions,
  examQuestions,
  professors,
  user,
} from "@/db/schema";

let db: Database;
let courseId: string;
let offeringId: string;
let professorId: string;

const valid = () => ({
  courseId,
  examAcademicYear: "2025-2026",
  questionType: "sc" as const,
  questionText: "Question fictive ?",
  rightsConfirmed: true,
  fingerprint: "fp-1",
});

async function addQuestion(overrides: Partial<typeof examQuestions.$inferInsert> = {}) {
  const [row] = await db
    .insert(examQuestions)
    .values({ ...valid(), ...overrides })
    .returning();
  return row!;
}

/** The database must refuse the operation, and name the rule that stopped it. */
async function refuses(operation: Promise<unknown>, rule: string) {
  const error = await operation.then(
    () => null,
    (e: { message?: string; cause?: { message?: string; constraint?: string } }) => e,
  );
  expect(error, `the database accepted something it should refuse (${rule})`).not.toBeNull();
  expect(`${error?.message} ${error?.cause?.message} ${error?.cause?.constraint}`).toContain(rule);
}

beforeEach(async () => {
  db = await createTestDatabase();
  await db.insert(user).values([
    { id: "alice", name: "Alice", email: "alice@example.com" },
    { id: "bob", name: "Bob", email: "bob@example.com" },
    { id: "mod", name: "Mod", email: "mod@example.com", role: "moderator" },
  ]);
  const [course] = await db.insert(courses).values({ code: "TEST 1001", titleFr: "Cours fictif" }).returning();
  courseId = course!.id;
  const [offering] = await db.insert(courseOfferings).values({ courseId, academicYear: "2025-2026", term: "fall" }).returning();
  offeringId = offering!.id;
  const [professor] = await db.insert(professors).values({ fullName: "Prof Fictif" }).returning();
  professorId = professor!.id;
});

describe("what a question keeps", () => {
  it("stores the real exam year, course, offering, professor, type and statuses", async () => {
    const q = await addQuestion({ offeringId, professorId, examTerm: "fall", topic: "Occlusion", questionType: "kprim" });
    expect(q).toMatchObject({
      courseId,
      offeringId,
      professorId,
      examAcademicYear: "2025-2026",
      examTerm: "fall",
      questionType: "kprim",
      status: "pending",
      answerStatus: "proposed",
      provenance: "recalled",
      verifiedAt: null,
      duplicateOfId: null,
    });
  });

  it("does not store the current/previous category anywhere (it is derived)", async () => {
    const result = await db.execute(
      sql`select column_name from information_schema.columns where table_name = 'exam_questions' and column_name ilike '%categor%'`,
    );
    expect((result as unknown as { rows: unknown[] }).rows).toEqual([]);
  });

  it("allows questions without an offering or professor (when they are not known)", async () => {
    const q = await addQuestion();
    expect(q.offeringId).toBeNull();
    expect(q.professorId).toBeNull();
  });
});

describe("rules the database enforces", () => {
  it("only accepts an exam year of two consecutive years", async () => {
    await addQuestion({ examAcademicYear: "2019-2020" });
    for (const bad of ["2025-2027", "2026-2025", "2025-26", "abcd-efgh", "2025-2026 ", ""]) {
      await refuses(addQuestion({ examAcademicYear: bad, fingerprint: `fp-${bad}` }), "exam_questions_year_valid");
    }
  });

  it("requires the contributor's rights confirmation", async () => {
    await refuses(addQuestion({ rightsConfirmed: false }), "exam_questions_rights_confirmed");
  });

  it("does not allow 'verified' without a verification date", async () => {
    await refuses(addQuestion({ answerStatus: "verified" }), "exam_questions_verified_has_date");
    const ok = await addQuestion({ answerStatus: "verified", verifiedBy: "mod", verifiedAt: new Date(), verificationNote: "Vérifié" });
    expect(ok.answerStatus).toBe("verified");
  });

  it("keeps the verification date when the verifier's account is deleted", async () => {
    const q = await addQuestion({ answerStatus: "verified", verifiedBy: "mod", verifiedAt: new Date() });
    await db.delete(user).where(eq(user.id, "mod"));
    const [after] = await db.select().from(examQuestions).where(eq(examQuestions.id, q.id));
    expect(after).toMatchObject({ answerStatus: "verified", verifiedBy: null });
    expect(after?.verifiedAt).toBeInstanceOf(Date);
  });
});

describe("duplicates", () => {
  it("lets a moderator point a question at its canonical version, but not at itself", async () => {
    const canonical = await addQuestion({ fingerprint: "same" });
    const repeat = await addQuestion({ fingerprint: "same" });
    await db.update(examQuestions).set({ duplicateOfId: canonical.id }).where(eq(examQuestions.id, repeat.id));
    await refuses(
      db.update(examQuestions).set({ duplicateOfId: canonical.id }).where(eq(examQuestions.id, canonical.id)),
      "exam_questions_not_own_duplicate",
    );
  });

  it("clears the link if the canonical question is deleted, keeping the repeat", async () => {
    const canonical = await addQuestion({ fingerprint: "same" });
    const repeat = await addQuestion({ fingerprint: "same", duplicateOfId: canonical.id });
    await db.delete(examQuestions).where(eq(examQuestions.id, canonical.id));
    const [after] = await db.select().from(examQuestions).where(eq(examQuestions.id, repeat.id));
    expect(after?.duplicateOfId).toBeNull();
  });
});

describe("choices, revisions and reports", () => {
  it("keeps proposed and verified answers apart, one row per position", async () => {
    const q = await addQuestion();
    await db.insert(examQuestionChoices).values([
      { questionId: q.id, position: 1, text: "A", proposedCorrect: true, verifiedCorrect: null },
      { questionId: q.id, position: 2, text: "B", proposedCorrect: null, verifiedCorrect: null },
    ]);
    await refuses(db.insert(examQuestionChoices).values({ questionId: q.id, position: 1, text: "dup" }), "exam_question_choices_questionId_position_unique");
    await refuses(db.insert(examQuestionChoices).values({ questionId: q.id, position: 0, text: "x" }), "exam_question_choices_position_range");
    await refuses(db.insert(examQuestionChoices).values({ questionId: q.id, position: 11, text: "x" }), "exam_question_choices_position_range");
    const rows = await db.select().from(examQuestionChoices).where(eq(examQuestionChoices.questionId, q.id));
    expect(rows.find((r) => r.position === 1)).toMatchObject({ proposedCorrect: true, verifiedCorrect: null });
  });

  it("never repeats a revision number for the same question", async () => {
    const q = await addQuestion();
    await db.insert(examQuestionRevisions).values({ questionId: q.id, revisionNumber: 1, snapshot: { questionText: "v1" }, changedBy: "alice" });
    await db.insert(examQuestionRevisions).values({ questionId: q.id, revisionNumber: 2, snapshot: { questionText: "v2" }, changeNote: "Correction" });
    await refuses(
      db.insert(examQuestionRevisions).values({ questionId: q.id, revisionNumber: 2, snapshot: {} }),
      "exam_question_revisions_questionId_revisionNumber_unique",
    );
    await refuses(
      db.insert(examQuestionRevisions).values({ questionId: q.id, revisionNumber: 0, snapshot: {} }),
      "exam_question_revisions_number_positive",
    );
  });

  it("allows one open report per person per question", async () => {
    const q = await addQuestion();
    const report = { questionId: q.id, reporterId: "bob", reason: "wrong_answer" as const };
    await db.insert(examQuestionReports).values(report);
    await refuses(db.insert(examQuestionReports).values(report), "exam_question_reports_one_open_per_reporter");
    await db.insert(examQuestionReports).values({ ...report, reporterId: "alice" }); // another person is fine
    await db.update(examQuestionReports).set({ status: "resolved" }).where(eq(examQuestionReports.reporterId, "bob"));
    await db.insert(examQuestionReports).values(report); // after it is resolved, Bob may report again
  });

  it("deletes choices, revisions and reports together with their question", async () => {
    const q = await addQuestion();
    await db.insert(examQuestionChoices).values({ questionId: q.id, position: 1, text: "A" });
    await db.insert(examQuestionRevisions).values({ questionId: q.id, revisionNumber: 1, snapshot: {} });
    await db.insert(examQuestionReports).values({ questionId: q.id, reporterId: "bob", reason: "other" });
    await db.delete(examQuestions).where(eq(examQuestions.id, q.id));
    for (const table of [examQuestionChoices, examQuestionRevisions, examQuestionReports]) {
      expect(await db.select().from(table)).toEqual([]);
    }
  });
});

describe("history and privacy", () => {
  it("won't let a course, offering or professor be deleted while questions depend on them", async () => {
    await addQuestion({ offeringId, professorId });
    await refuses(db.delete(courseOfferings).where(eq(courseOfferings.id, offeringId)), "exam_questions_offering_id_course_offerings_id_fk");
    await refuses(db.delete(professors).where(eq(professors.id, professorId)), "exam_questions_professor_id_professors_id_fk");
    await refuses(db.delete(courses).where(eq(courses.id, courseId)), "exam_questions_course_id_courses_id_fk");
  });

  it("keeps a question (without the author's link) if the contributor deletes their account", async () => {
    const q = await addQuestion({ contributedBy: "alice" });
    await db.delete(user).where(eq(user.id, "alice"));
    const [after] = await db.select().from(examQuestions).where(eq(examQuestions.id, q.id));
    expect(after).toMatchObject({ id: q.id, contributedBy: null });
  });
});
