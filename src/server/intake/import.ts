// Intake step 5: write a plan into the LOCAL database through the same services the app uses (so every rule,
// limit and the pending/moderation status still apply). It never uploads anywhere: the caller passes the storage,
// and the CLI refuses anything but the local one. Proposed answers stay proposed; nothing is marked verified.
import { eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { courses } from "@/db/schema";
import { questionInputSchema, submitQuestion } from "@/server/passes/service";
import { createNote, noteInputSchema } from "@/server/library/notes";
import type { Viewer } from "@/server/resources/service";
import type { FileStorage } from "@/server/storage";
import { extractText } from "./extract";
import type { BatchInfo, InputFile, Plan } from "./plan";

export type ImportOptions = { includeLowConfidence?: boolean };
export type ImportResult = { questions: number; questionsSkipped: number; notes: number; notesFailed: number; errors: string[] };

export async function importPlan(db: Database, storage: FileStorage, viewer: Viewer, plan: Plan, batch: BatchInfo, files: readonly InputFile[], opts: ImportOptions = {}): Promise<ImportResult> {
  const result: ImportResult = { questions: 0, questionsSkipped: 0, notes: 0, notesFailed: 0, errors: [] };
  if (!batch.rightsConfirmed) {
    result.errors.push("batch.json: rightsConfirmed is false, nothing imported");
    return result;
  }
  const bytesByPath = new Map(files.map((f) => [f.relPath, f.bytes]));
  for (const item of plan.items) {
    if (item.status !== "ready" || !item.courseCode) continue;
    const [course] = await db.select({ id: courses.id }).from(courses).where(eq(courses.code, item.courseCode));
    if (!course) {
      result.errors.push(`${item.relPath}: course ${item.courseCode} is not in the catalog`);
      continue;
    }
    if (item.role === "exam" && item.examYear) {
      for (const q of item.questions) {
        if (q.confidence === "low" && !opts.includeLowConfidence) {
          result.questionsSkipped++;
          continue;
        }
        const parsed = questionInputSchema.safeParse({
          courseId: course.id,
          examAcademicYear: item.examYear,
          topic: item.topic,
          questionType: q.type,
          questionText: q.text,
          provenance: "recalled",
          confidence: q.confidence === "high" ? "sure" : "unsure",
          rightsConfirmed: true,
          choices: q.choices.map((c) => ({ text: c.text, proposedCorrect: c.proposedCorrect })),
        });
        if (!parsed.success) {
          result.questionsSkipped++;
          result.errors.push(`${item.relPath} Q${q.number}: ${parsed.error.issues[0]?.message ?? "invalid"}`);
          continue;
        }
        const r = await submitQuestion(db, storage, viewer, parsed.data);
        if (r.ok) result.questions++;
        else {
          result.questionsSkipped++;
          result.errors.push(`${item.relPath} Q${q.number}: ${r.error}`);
        }
      }
    } else if (item.role === "notes") {
      // Text notes become the importer's own PRIVATE notes (versioned, searchable). Sharing is a separate, deliberate step
      // in the app; batch.sharedWithPermission is recorded in the report but never publishes anything by itself.
      const bytes = bytesByPath.get(item.relPath);
      const text = bytes ? extractText(item.kind, bytes) : null;
      const input = text?.ok ? noteInputSchema.safeParse({ courseId: course.id, title: item.displayName.slice(0, 200), body: text.text }) : null;
      if (!input?.success) {
        result.notesFailed++;
        result.errors.push(`${item.relPath}: note could not be read`);
        continue;
      }
      const r = await createNote(db, viewer, input.data);
      if (r.ok) result.notes++;
      else {
        result.notesFailed++;
        result.errors.push(`${item.relPath}: ${r.error}`);
      }
    }
  }
  return result;
}
