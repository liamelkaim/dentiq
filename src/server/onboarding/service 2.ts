import { eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { userProfile } from "@/db/schema";
import { writeAudit } from "@/server/audit";
import type { ServiceResult } from "@/server/catalog/service";
import { PROGRAM_YEAR_MAX, SEMESTER_MAX, UNIVERSITY_PRESETS, type OnboardingInput, type UniversityPreset } from "./presets";

export async function getProfile(db: Database, userId: string) {
  const [row] = await db.select().from(userProfile).where(eq(userProfile.userId, userId)).limit(1);
  return row ?? null;
}

function intInRange(raw: string, max: number): number | null | "invalid" {
  if (raw === "") return null;
  if (!/^\d+$/.test(raw)) return "invalid";
  const n = Number(raw);
  return n >= 1 && n <= max ? n : "invalid";
}

/** Saves (or replaces) the student's own onboarding answers. Every field is optional. */
export async function saveOnboarding(db: Database, userId: string, input: OnboardingInput): Promise<ServiceResult<null>> {
  const university = input.university === "" ? null : (UNIVERSITY_PRESETS as readonly string[]).includes(input.university) ? (input.university as UniversityPreset) : "invalid";
  const programYear = intInRange(input.programYear, PROGRAM_YEAR_MAX);
  const semester = intInRange(input.semester, SEMESTER_MAX);
  if (university === "invalid" || programYear === "invalid" || semester === "invalid") return { ok: false, error: "invalid" };
  const values = { universityPreset: university, programYear, semester };
  await db
    .insert(userProfile)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: userProfile.userId, set: { ...values, onboardedAt: new Date() } });
  // The audit entry says that onboarding happened, not what was answered.
  await writeAudit(db, { actorId: userId, action: "user.onboarding.save", entityType: "user", entityId: userId });
  return { ok: true, value: null };
}
