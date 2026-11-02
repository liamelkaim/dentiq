// First-run onboarding answers. Fake data only.
import { beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase, type Database } from "@/db/client";
import { user } from "@/db/schema";
import { getProfile, saveOnboarding } from "@/server/onboarding/service";

let db: Database;
beforeEach(async () => {
  db = await createTestDatabase();
  await db.insert(user).values({ id: "u1", name: "TEST Student", email: "u1@example.com" });
});

describe("onboarding", () => {
  it("has no profile before onboarding", async () => {
    expect(await getProfile(db, "u1")).toBeNull();
  });
  it("saves and replaces answers", async () => {
    expect((await saveOnboarding(db, "u1", { university: "udem", programYear: "2", semester: "1" })).ok).toBe(true);
    expect(await getProfile(db, "u1")).toMatchObject({ universityPreset: "udem", programYear: 2, semester: 1 });
    await saveOnboarding(db, "u1", { university: "other", programYear: "3", semester: "" });
    expect(await getProfile(db, "u1")).toMatchObject({ universityPreset: "other", programYear: 3, semester: null });
  });
  it("skipping stores an empty profile so the question is not asked again", async () => {
    await saveOnboarding(db, "u1", { university: "", programYear: "", semester: "" });
    expect(await getProfile(db, "u1")).toMatchObject({ universityPreset: null, programYear: null });
  });
  it.each([
    { university: "mit", programYear: "", semester: "" },
    { university: "", programYear: "0", semester: "" },
    { university: "", programYear: "7", semester: "" },
    { university: "", programYear: "1.5", semester: "" },
    { university: "", programYear: "", semester: "4" },
  ])("rejects %j", async (input) => {
    expect(await saveOnboarding(db, "u1", input)).toEqual({ ok: false, error: "invalid" });
    expect(await getProfile(db, "u1")).toBeNull();
  });
});
