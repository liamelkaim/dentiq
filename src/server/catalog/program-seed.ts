// Loads a program data file (data/programs/*.json) into the catalog: the program, its VERIFIED courses and the
// academic terms with their breaks and exam periods. Nothing is invented here: every entry in the file names its
// source, and a course is only loaded when its status is VERIFIED (unverified ones are counted and left out).
// Terms and periods load with their status so the calendar can say "verify with your faculty".
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import { academicPeriods, academicTerms, courses, programs } from "@/db/schema";
import { writeAudit } from "@/server/audit";
import { normalizeCourseCode } from "./validation";

const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const source = z.object({ url: z.string().min(1), retrieved: iso }).partial().optional();
const status = z.enum(["VERIFIED", "UNVERIFIED"]).default("UNVERIFIED");

export const programDataSchema = z.object({
  program: z.object({ name_fr: z.string().min(1), name_en: z.string().nullable().optional(), university: z.string().min(1), source, status }),
  terms: z
    .array(
      z.object({
        /** Which calendar the dates belong to (e.g. the faculty's own versus the general university calendar). */
        scope: z.string().optional(),
        academicYear: z.string().regex(/^\d{4}-\d{4}$/),
        term: z.enum(["fall", "winter", "summer"]),
        start: iso.nullable(),
        end: iso.nullable(),
        readingWeek: z.object({ start: iso, end: iso }).nullable().optional(),
        breaks: z.array(z.object({ name_fr: z.string(), name_en: z.string().nullable().optional(), start: iso, end: iso.nullable().optional() })).default([]),
        examPeriods: z.array(z.object({ start: iso, end: iso })).default([]),
        source,
        status,
      }),
    )
    .default([]),
  courses: z
    .array(
      z.object({
        code: z.string().min(1),
        title_fr: z.string().min(1),
        title_en: z.string().nullable().optional(),
        programYear: z.number().int().min(1).max(8).nullable().optional(),
        semester: z.number().int().min(1).max(3).nullable().optional(),
        credits: z.number().nonnegative().nullable().optional(),
        source,
        status,
      }),
    )
    .default([]),
});
export type ProgramData = z.infer<typeof programDataSchema>;

const TERM_BY_SEMESTER = { 1: "fall", 2: "winter", 3: "summer" } as const;

export type SeedSummary = { courses: number; coursesSkippedUnverified: number; terms: number; termsSkippedNoDates: number; periods: number };

/** `institution` is the university preset key (e.g. "udem"); `slug` names the program row. Safe to run twice. */
export async function seedProgram(db: Database, actorId: string, raw: unknown, opts: { institution: string; slug: string; scopePrefix?: string }): Promise<SeedSummary> {
  const data = programDataSchema.parse(raw);
  const summary: SeedSummary = { courses: 0, coursesSkippedUnverified: 0, terms: 0, termsSkippedNoDates: 0, periods: 0 };
  await db.transaction(async (tx) => {
    const src = (s?: { url?: string; retrieved?: string }) => ({ sourceUrl: s?.url ?? null, sourceRetrievedOn: s?.retrieved ?? null });
    const progValues = { slug: opts.slug, nameFr: data.program.name_fr, nameEn: data.program.name_en ?? null, institution: data.program.university, sourceName: "Official university pages", ...src(data.program.source) };
    await tx.insert(programs).values(progValues).onConflictDoUpdate({ target: programs.slug, set: progValues });
    const [program] = await tx.select({ id: programs.id }).from(programs).where(eq(programs.slug, opts.slug));

    for (const c of data.courses) {
      if (c.status !== "VERIFIED") {
        summary.coursesSkippedUnverified++;
        continue;
      }
      const values = {
        code: normalizeCourseCode(c.code),
        titleFr: c.title_fr,
        titleEn: c.title_en ?? null,
        programId: program!.id,
        yearOfStudy: c.programYear ?? null,
        typicalTerm: c.semester ? TERM_BY_SEMESTER[c.semester as 1 | 2 | 3] : null,
        credits: c.credits == null ? null : String(c.credits),
        sourceName: "Official university pages",
        ...src(c.source),
      };
      await tx.insert(courses).values(values).onConflictDoUpdate({ target: courses.code, set: values });
      summary.courses++;
    }

    for (const t of data.terms) {
      // A file can hold several calendars for the same term; only the one named by scopePrefix is loaded.
      if (opts.scopePrefix && !(t.scope ?? "").startsWith(opts.scopePrefix)) continue;
      if (!t.start || !t.end) {
        summary.termsSkippedNoDates++;
        continue;
      }
      const tv = { institution: opts.institution, academicYear: t.academicYear, term: t.term, startDate: t.start, endDate: t.end, status: t.status === "VERIFIED" ? ("verified" as const) : ("unverified" as const), ...src(t.source) };
      const [termRow] = await tx
        .insert(academicTerms)
        .values(tv)
        .onConflictDoUpdate({ target: [academicTerms.institution, academicTerms.academicYear, academicTerms.term], set: tv })
        .returning({ id: academicTerms.id });
      // Replace this term's periods so re-running the seed never duplicates them.
      await tx.delete(academicPeriods).where(eq(academicPeriods.termId, termRow!.id));
      const common = { termId: termRow!.id, status: tv.status, ...src(t.source) };
      const rows = [
        ...(t.readingWeek ? [{ ...common, kind: "reading_week" as const, nameFr: "Semaine de lecture", nameEn: "Reading week", startDate: t.readingWeek.start, endDate: t.readingWeek.end }] : []),
        ...t.breaks.map((b) => ({ ...common, kind: "break" as const, nameFr: b.name_fr, nameEn: b.name_en ?? null, startDate: b.start, endDate: b.end ?? b.start })),
        ...t.examPeriods.map((e) => ({ ...common, kind: "exam_period" as const, nameFr: "Période d’examens", nameEn: "Exam period", startDate: e.start, endDate: e.end })),
      ].filter((r) => r.startDate <= r.endDate);
      if (rows.length) await tx.insert(academicPeriods).values(rows);
      summary.terms++;
      summary.periods += rows.length;
    }
    await writeAudit(tx, { actorId, action: "program.seed", entityType: "program", entityId: program!.id, metadata: { ...summary, slug: opts.slug } });
  });
  return summary;
}
