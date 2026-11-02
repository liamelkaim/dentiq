// Intake step 4: decide what every file in a batch is and what should happen to it. Pure: bytes in, plan out. A plan
// never writes anything; `import.ts` is the only part that can, and only when asked explicitly.
import { createHash } from "node:crypto";
import { detectKind, type FileKind } from "./detect";
import { extractText } from "./extract";
import { parseQuestions, type QuestionCandidate } from "./questions";

export type BatchInfo = {
  /** Where the files came from, in the owner's words (e.g. "my own course notes", "classmate X, with permission"). */
  source: string;
  /** The people who own the material agreed to have it shared inside Dentiq. */
  sharedWithPermission: boolean;
  /** The owner confirms the rights checkbox that every upload needs. */
  rightsConfirmed: boolean;
};

export type BatchCheck = { ok: true; batch: BatchInfo } | { ok: false; problems: string[] };

export function checkBatchInfo(raw: unknown): BatchCheck {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const problems: string[] = [];
  if (typeof r.source !== "string" || !r.source.trim()) problems.push("source is missing");
  if (typeof r.sharedWithPermission !== "boolean") problems.push("sharedWithPermission must be true or false");
  if (typeof r.rightsConfirmed !== "boolean") problems.push("rightsConfirmed must be true or false");
  return problems.length ? { ok: false, problems } : { ok: true, batch: { source: String(r.source).trim(), sharedWithPermission: r.sharedWithPermission as boolean, rightsConfirmed: r.rightsConfirmed as boolean } };
}

export type InputFile = { relPath: string; bytes: Uint8Array };
export type Role = "exam" | "notes" | "skipped";
export type Status = "ready" | "review" | "duplicate" | "skipped";

export type PlanItem = {
  relPath: string;
  kind: FileKind;
  sha256: string;
  displayName: string;
  courseCode: string | null;
  courseVia: "folder" | "text" | "none";
  topic: string | null;
  examYear: string | null;
  role: Role;
  status: Status;
  reasons: string[];
  textChars: number;
  questions: QuestionCandidate[];
  duplicateOf: string | null;
};

export type Plan = { items: PlanItem[]; summary: Record<Status, number> & { questions: number; lowConfidenceQuestions: number } };

/** "cours_DEN-10021__notes (final).docx" -> "cours DEN 10021 notes (final)" */
export function normalizeName(relPath: string): string {
  const base = relPath.split("/").pop() ?? relPath;
  return base.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

const codeKey = (s: string) => s.toUpperCase().replace(/\s+/g, " ").trim();

/** Course from the first folder name (exact code), else a known code found in the text. Never invented. */
export function inferCourse(relPath: string, text: string, knownCodes: readonly string[]): { code: string | null; via: PlanItem["courseVia"] } {
  const known = new Set(knownCodes.map(codeKey));
  const folders = relPath.split("/").slice(0, -1);
  for (const f of folders) if (known.has(codeKey(f.replace(/[_-]+/g, " ")))) return { code: codeKey(f.replace(/[_-]+/g, " ")), via: "folder" };
  const found = new Set<string>();
  for (const code of known) if (text.toUpperCase().includes(code)) found.add(code);
  if (found.size === 1) return { code: [...found][0]!, via: "text" };
  return { code: null, via: "none" };
}

/** An academic year such as "2023-2024" from a file name or its first lines. A lone year is not guessed into a range. */
export function inferExamYear(relPath: string, text: string): string | null {
  const m = /(20\d{2})\s*[-_/\u2013]\s*(20\d{2})/.exec(`${relPath}\n${text.slice(0, 800)}`);
  return m && Number(m[2]) === Number(m[1]) + 1 ? `${m[1]}-${m[2]}` : null;
}

const EXAM_NAME = /(pass|exam|examen|qcm|mcq|quiz|test)/i;

const hashBytes = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const hashText = (t: string) => createHash("sha256").update(t.toLowerCase().replace(/\s+/g, " ").trim()).digest("hex");

export function buildPlan(files: readonly InputFile[], opts: { knownCourseCodes: readonly string[] }): Plan {
  const seenBytes = new Map<string, string>();
  const seenText = new Map<string, string>();
  const items: PlanItem[] = [];
  for (const file of [...files].sort((a, b) => a.relPath.localeCompare(b.relPath))) {
    const kind = detectKind(file.relPath, file.bytes);
    const sha256 = hashBytes(file.bytes);
    const base: PlanItem = { relPath: file.relPath, kind, sha256, displayName: normalizeName(file.relPath), courseCode: null, courseVia: "none", topic: null, examYear: null, role: "skipped", status: "skipped", reasons: [], textChars: 0, questions: [], duplicateOf: null };
    const dupBytes = seenBytes.get(sha256);
    if (dupBytes) {
      items.push({ ...base, status: "duplicate", duplicateOf: dupBytes, reasons: ["sameFile"] });
      continue;
    }
    seenBytes.set(sha256, file.relPath);
    const ex = extractText(kind, file.bytes);
    if (!ex.ok) {
      items.push({ ...base, status: "skipped", reasons: [ex.reason] });
      continue;
    }
    const tHash = hashText(ex.text);
    const dupText = seenText.get(tHash);
    if (dupText) {
      items.push({ ...base, status: "duplicate", duplicateOf: dupText, reasons: ["sameText"], textChars: ex.text.length });
      continue;
    }
    seenText.set(tHash, file.relPath);
    const course = inferCourse(file.relPath, ex.text, opts.knownCourseCodes);
    const folders = file.relPath.split("/").slice(0, -1);
    const topic = folders.length >= 2 ? folders[1]!.replace(/[_-]+/g, " ").trim() : null;
    const questions = parseQuestions(ex.text);
    const looksLikeExam = EXAM_NAME.test(file.relPath) ? questions.length >= 1 : questions.filter((q) => q.choices.length >= 2).length >= 3;
    const reasons: string[] = [];
    if (!course.code) reasons.push("courseUnknown");
    let role: Role = looksLikeExam ? "exam" : "notes";
    const examYear = role === "exam" ? inferExamYear(file.relPath, ex.text) : null;
    if (role === "exam") {
      if (!examYear) reasons.push("examYearUnknown");
      if (questions.some((q) => q.confidence === "low")) reasons.push("lowConfidenceQuestions");
    }
    if (ex.text.trim().length < 40) {
      role = "skipped";
      reasons.push("nearlyEmpty");
    }
    items.push({ ...base, courseCode: course.code, courseVia: course.via, topic, examYear, role, status: role === "skipped" ? "skipped" : reasons.length ? "review" : "ready", reasons, textChars: ex.text.length, questions: role === "exam" ? questions : [] });
  }
  const count = (s: Status) => items.filter((i) => i.status === s).length;
  const all = items.flatMap((i) => i.questions);
  return { items, summary: { ready: count("ready"), review: count("review"), duplicate: count("duplicate"), skipped: count("skipped"), questions: all.length, lowConfidenceQuestions: all.filter((q) => q.confidence === "low").length } };
}

/** Markdown report for the owner to read before importing anything. Contains file names and counts, never file text. */
export function renderReport(plan: Plan, batch: BatchCheck, generatedAt: Date): string {
  const lines = [`# Intake report`, ``, `Generated ${generatedAt.toISOString()}. Dry run: nothing was imported.`, ``];
  lines.push(batch.ok ? `Source: ${batch.batch.source}. Shared with permission: ${batch.batch.sharedWithPermission ? "yes" : "no (imports as private)"}. Rights confirmed: ${batch.batch.rightsConfirmed ? "yes" : "no (import refused)"}.` : `BATCH FILE PROBLEMS (import refused): ${batch.problems.join("; ")}.`, ``);
  const s = plan.summary;
  lines.push(`## Summary`, ``, `- ready: ${s.ready}`, `- needs review: ${s.review}`, `- duplicates: ${s.duplicate}`, `- skipped: ${s.skipped}`, `- questions found: ${s.questions} (low confidence: ${s.lowConfidenceQuestions})`, ``, `## Files`, ``);
  for (const i of plan.items) {
    lines.push(`- \`${i.relPath}\` [${i.status}] ${i.role}${i.courseCode ? `, course ${i.courseCode} (${i.courseVia})` : ""}${i.topic ? `, topic "${i.topic}"` : ""}${i.examYear ? `, year ${i.examYear}` : ""}${i.questions.length ? `, ${i.questions.length} questions` : ""}${i.duplicateOf ? `, same as \`${i.duplicateOf}\`` : ""}${i.reasons.length ? ` | ${i.reasons.join(", ")}` : ""}`);
  }
  lines.push(``, `## Questions to review`, ``);
  for (const i of plan.items) for (const q of i.questions) if (q.confidence !== "high") lines.push(`- \`${i.relPath}\` Q${q.number} (${q.confidence}): ${q.flags.join(", ")}`);
  return lines.join("\n") + "\n";
}
