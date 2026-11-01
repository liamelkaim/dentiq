// Fake data only (TEST course, example.com accounts). Covers the Passes polish helpers: course count, own contributions, search.
import { beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase, type Database } from "@/db/client";
import { courses, user } from "@/db/schema";
import { currentAcademicYear } from "@/server/passes/academic-year";
import { publishedQuestionCount, searchPublishedQuestions } from "@/server/passes/queries";
import { listMyQuestions, moderateQuestion, questionInputSchema, submitQuestion } from "@/server/passes/service";
import type { Viewer } from "@/server/resources/service";
import { createMemoryStorage } from "@/server/storage";

const viewer = (id: string, role: Viewer["role"]): Viewer => ({ id, role, emailVerified: true, approvalStatus: "approved" });
const alice = viewer("alice", "student");
const bob = viewer("bob", "student");
const mod = viewer("mod", "moderator");

let db: Database;
let courseId: string;
const storage = createMemoryStorage();

async function submit(who: Viewer, text: string) {
  const input = questionInputSchema.parse({
    courseId,
    examAcademicYear: currentAcademicYear(),
    questionType: "sc",
    questionText: text,
    rightsConfirmed: true,
    choices: [
      { text: "A", proposedCorrect: true },
      { text: "B", proposedCorrect: false },
    ],
  });
  const r = await submitQuestion(db, storage, who, input, []);
  if (!r.ok) throw new Error(r.error);
  return r.value.id;
}

beforeEach(async () => {
  db = await createTestDatabase();
  await db.insert(user).values(
    [alice, bob, mod].map((v) => ({ id: v.id, name: v.id, email: `${v.id}@example.com`, emailVerified: true, role: v.role, approvalStatus: v.approvalStatus })),
  );
  const [c] = await db.insert(courses).values({ code: "TEST 1001", titleFr: "Cours fictif" }).returning();
  courseId = c!.id;
});

describe("passes polish", () => {
  it("counts only published questions, even the viewer's own pending ones are left out", async () => {
    await submit(alice, "Question en attente alpha");
    await submit(mod, "Question publiee beta");
    expect(await publishedQuestionCount(db, alice, courseId)).toBe(1);
    expect(await publishedQuestionCount(db, bob, courseId)).toBe(1);
  });

  it("lists own questions in every status, never someone else's", async () => {
    const pending = await submit(alice, "Mine pending");
    const other = await submit(alice, "Mine to hide");
    await submit(bob, "Bob's question");
    await moderateQuestion(db, mod, other, "hide", null);
    const mine = await listMyQuestions(db, alice);
    expect(mine.map((q) => q.questionText).sort()).toEqual(["Mine pending", "Mine to hide"]);
    expect(mine.find((q) => q.id === pending)).toMatchObject({ status: "pending", openable: true });
    expect(mine.find((q) => q.id === other)).toMatchObject({ status: "hidden", openable: false });
    expect(await listMyQuestions(db, { ...alice, approvalStatus: "pending" })).toEqual([]);
  });

  it("searches published questions only and ignores blank text", async () => {
    await submit(alice, "Searchable pending gamma");
    await submit(mod, "Searchable published gamma");
    const found = await searchPublishedQuestions(db, alice, "gamma");
    expect(found.items.map((q) => q.questionText)).toEqual(["Searchable published gamma"]);
    expect((await searchPublishedQuestions(db, alice, "   ")).items).toEqual([]);
  });
});
