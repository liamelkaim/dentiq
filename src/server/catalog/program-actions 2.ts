"use server";

// Admin action: load the bundled UdeM D.M.D. data file (courses, terms, breaks) into the catalog. Idempotent.
import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import udemDmd from "../../../data/programs/udem-dmd.json";
import { requireRole } from "@/server/auth/session";
import { seedProgram, type SeedSummary } from "./program-seed";

export type ProgramSeedState = { status: "idle" | "success" | "error"; summary?: SeedSummary };

export async function loadUdemProgramAction(): Promise<ProgramSeedState> {
  const viewer = await requireRole("admin");
  try {
    const summary = await seedProgram(getDb(), viewer.id, udemDmd, { institution: "udem", slug: "udem-dmd", scopePrefix: "D.M.D." });
    revalidatePath("/admin/program");
    revalidatePath("/courses");
    return { status: "success", summary };
  } catch {
    return { status: "error" };
  }
}
