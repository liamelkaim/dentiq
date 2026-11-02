// Intake: file detection, text extraction, question parsing, planning, dedupe and import. Synthetic fixtures only.
import { deflateRawSync } from "node:zlib";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase, type Database } from "@/db/client";
import { courseNotes, courses, examQuestions, resources, user } from "@/db/schema";
import { detectKind } from "@/server/intake/detect";
import { docxXmlToText, extractText, readZipEntry } from "@/server/intake/extract";
import { importPlan } from "@/server/intake/import";
import { buildPlan, checkBatchInfo, inferCourse, inferExamYear, normalizeName, renderReport } from "@/server/intake/plan";
import { parseQuestions } from "@/server/intake/questions";
import { createMemoryStorage } from "@/server/storage";

const enc = (s: string) => new TextEncoder().encode(s);

/** A tiny valid zip with one entry (deflate or stored), enough for the reader. */
function zip(name: string, content: string, deflate: boolean): Uint8Array {
  const raw = enc(content);
  const data = deflate ? deflateRawSync(raw) : raw;
  const nameBytes = enc(name);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(deflate ? 8 : 0, 8);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(raw.length, 22);
  local.writeUInt16LE(nameBytes.length, 26);
  const cd = Buffer.alloc(46);
  cd.writeUInt32LE(0x02014b50, 0);
  cd.writeUInt16LE(deflate ? 8 : 0, 10);
  cd.writeUInt32LE(data.length, 20);
  cd.writeUInt32LE(raw.length, 24);
  cd.writeUInt16LE(nameBytes.length, 28);
  cd.writeUInt32LE(0, 42);
  const localPart = Buffer.concat([local, Buffer.from(nameBytes), Buffer.from(data)]);
  const cdPart = Buffer.concat([cd, Buffer.from(nameBytes)]);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(cdPart.length, 12);
  end.writeUInt32LE(localPart.length, 16);
  return new Uint8Array(Buffer.concat([localPart, cdPart, end]));
}

const EXAM = `Examen TEST 101 2030-2031
1. Quel est le diagnostic le plus probable pour une lésion blanche non détachable ?
A) Candidose
B) Leucoplasie
C) Lichen plan
Réponse : B
2. Which findings are expected in this synthetic case?
A. Alpha
B. Beta
C. Gamma
Answer: A, C
3. Une question sans réponse indiquée mais avec choix
A) Un
B) Deux
4. Court
`;

describe("detectKind", () => {
  it("trusts the bytes over the extension", () => {
    expect(detectKind("a.txt", enc("hello"))).toBe("text");
    expect(detectKind("a.md", enc("# t"))).toBe("markdown");
    expect(detectKind("renamed.txt", enc("%PDF-1.7 ..."))).toBe("pdf");
    expect(detectKind("a.txt", new Uint8Array([104, 0, 105]))).toBe("unknown");
    expect(detectKind("a.docx", zip("x", "y", false))).toBe("docx");
    expect(detectKind("a.zip", zip("x", "y", false))).toBe("unknown");
    expect(detectKind("a.png", new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe("image");
  });
});

describe("extractText", () => {
  it("reads docx (deflated and stored) and strips tags", () => {
    const xml = '<w:document><w:p><w:r><w:t>Titre &amp; suite</w:t></w:r></w:p><w:p><w:r><w:t>Deux</w:t></w:r></w:p></w:document>';
    expect(extractText("docx", zip("word/document.xml", xml, true))).toEqual({ ok: true, text: "Titre & suite\nDeux" });
    expect(readZipEntry(zip("word/document.xml", xml, false), "word/document.xml")).not.toBeNull();
    expect(docxXmlToText("<w:p>a<w:tab/>b</w:p>")).toBe("a\tb");
  });
  it("does not read PDFs or images (no OCR), and reports unreadable docx", () => {
    expect(extractText("pdf", enc("%PDF"))).toEqual({ ok: false, reason: "needsManual" });
    expect(extractText("image", enc("x"))).toEqual({ ok: false, reason: "needsManual" });
    expect(extractText("docx", enc("PK\u0003\u0004 broken"))).toEqual({ ok: false, reason: "unreadable" });
  });
});

describe("parseQuestions", () => {
  const q = parseQuestions(EXAM);
  it("finds questions, choices and PROPOSED answers", () => {
    expect(q).toHaveLength(4);
    expect(q[0]).toMatchObject({ number: 1, type: "sc", confidence: "high", proposedLetters: ["B"] });
    expect(q[0]!.choices.map((c) => c.proposedCorrect)).toEqual([false, true, false]);
    expect(q[1]).toMatchObject({ type: "mc", proposedLetters: ["A", "C"], confidence: "high" });
  });
  it("flags missing answers and short or choice-less questions for review", () => {
    expect(q[2]).toMatchObject({ confidence: "medium", flags: ["noAnswerFound"] });
    expect(q[2]!.choices.every((c) => c.proposedCorrect === null)).toBe(true);
    expect(q[3]!.confidence).toBe("low");
  });
  it("flags an answer letter that is not among the choices", () => {
    expect(parseQuestions("1. Une question assez longue ici?\nA) x\nB) y\nRéponse: D")[0]!.flags).toContain("answerNotInChoices");
  });
});

describe("planning helpers", () => {
  it("normalizes names", () => expect(normalizeName("TEST 101/notes/cours_DEN-10021__final (v2).docx")).toBe("cours DEN 10021 final (v2)"));
  it("infers course from the folder first, then a single known code in the text, never a guess", () => {
    const known = ["TEST 101", "TEST 202"];
    expect(inferCourse("test_101/topic/a.txt", "", known)).toEqual({ code: "TEST 101", via: "folder" });
    expect(inferCourse("misc/a.txt", "this is TEST 202 content", known)).toEqual({ code: "TEST 202", via: "text" });
    expect(inferCourse("misc/a.txt", "TEST 101 and TEST 202", known)).toEqual({ code: null, via: "none" });
    expect(inferCourse("misc/a.txt", "nothing", known)).toEqual({ code: null, via: "none" });
  });
  it("reads an academic year only when it is a real range", () => {
    expect(inferExamYear("exam 2024-2025.txt", "")).toBe("2024-2025");
    expect(inferExamYear("exam.txt", "2030 - 2032")).toBeNull();
    expect(inferExamYear("exam 2030.txt", "")).toBeNull();
  });
  it("validates batch.json", () => {
    expect(checkBatchInfo({ source: "mine", sharedWithPermission: false, rightsConfirmed: true }).ok).toBe(true);
    expect(checkBatchInfo({ source: "", sharedWithPermission: "yes" })).toMatchObject({ ok: false });
    expect(checkBatchInfo(null)).toMatchObject({ ok: false });
  });
});

describe("buildPlan", () => {
  const files = [
    { relPath: "TEST 101/Pathologie/passes 2030-2031.txt", bytes: enc(EXAM) },
    { relPath: "TEST 101/Pathologie/zz copy of passes.txt", bytes: enc(EXAM) },
    { relPath: "TEST 101/Pathologie/reformatted.txt", bytes: enc(EXAM.replace(/\n/g, "\n\n").toUpperCase()) },
    { relPath: "TEST 101/Pathologie/notes.md", bytes: enc("# Notes\n\nSynthetic lecture notes about nothing real, long enough to count as content.") },
    { relPath: "loose/unknown.txt", bytes: enc("Synthetic text with no course code anywhere in it, but long enough.") },
    { relPath: "TEST 101/scan.pdf", bytes: enc("%PDF-1.4 fake") },
    { relPath: "TEST 101/empty.txt", bytes: enc("hi") },
  ];
  const plan = buildPlan(files, { knownCourseCodes: ["TEST 101"] });
  const by = (p: string) => plan.items.find((i) => i.relPath.endsWith(p))!;

  it("classifies exam papers, notes and what needs a person", () => {
    expect(by("passes 2030-2031.txt")).toMatchObject({ role: "exam", courseCode: "TEST 101", courseVia: "folder", topic: "Pathologie", examYear: "2030-2031", status: "review" });
    expect(by("passes 2030-2031.txt").reasons).toContain("lowConfidenceQuestions");
    expect(by("notes.md")).toMatchObject({ role: "notes", status: "ready", courseCode: "TEST 101" });
    expect(by("unknown.txt")).toMatchObject({ status: "review", reasons: ["courseUnknown"] });
    expect(by("scan.pdf")).toMatchObject({ status: "skipped", reasons: ["needsManual"] });
    expect(by("empty.txt")).toMatchObject({ status: "skipped", reasons: ["nearlyEmpty"] });
  });
  it("dedupes identical files and files with the same text", () => {
    expect(by("zz copy of passes.txt")).toMatchObject({ status: "duplicate", reasons: ["sameFile"], duplicateOf: "TEST 101/Pathologie/passes 2030-2031.txt" });
    expect(by("reformatted.txt")).toMatchObject({ status: "duplicate", reasons: ["sameText"] });
  });
  it("counts questions and the report never contains file text", () => {
    expect(plan.summary).toMatchObject({ duplicate: 2, skipped: 2, questions: 4, lowConfidenceQuestions: 1 });
    const report = renderReport(plan, { ok: true, batch: { source: "synthetic", sharedWithPermission: false, rightsConfirmed: true } }, new Date("2030-01-01T00:00:00Z"));
    expect(report).toContain("Dry run: nothing was imported");
    expect(report).toContain("TEST 101/Pathologie/notes.md");
    expect(report).not.toContain("Leucoplasie");
    expect(report).not.toContain("lecture notes");
  });
});

describe("importPlan", () => {
  let db: Database;
  const viewer = { id: "u1", role: "admin" as const, emailVerified: true, approvalStatus: "approved" as const };
  const batch = { source: "synthetic", sharedWithPermission: false, rightsConfirmed: true };
  const exam = EXAM.split("4. Court")[0]!;
  const files = [
    { relPath: "TEST 101/Patho/exam 2024-2025.txt", bytes: enc(exam) },
    { relPath: "TEST 101/Patho/notes.md", bytes: enc("# Synthetic\n\nA note that is long enough to be kept as a document, nothing real.") },
  ];
  beforeEach(async () => {
    db = await createTestDatabase();
    await db.insert(user).values({ id: "u1", name: "A", email: "a@example.com", role: "admin", approvalStatus: "approved", emailVerified: true });
    await db.insert(courses).values({ code: "TEST 101", titleFr: "TEST Cours" });
  });

  it("imports ready notes as the importer's private notes and questions as proposals (never verified), skipping low confidence", async () => {
    const plan = buildPlan(files, { knownCourseCodes: ["TEST 101"] });
    const storage = createMemoryStorage();
    const r = await importPlan(db, storage, viewer, plan, batch, files);
    expect(r.errors).toEqual([]);
    expect(r).toMatchObject({ notes: 1, notesFailed: 0 });
    const q = await db.select().from(examQuestions);
    expect(q.length).toBe(r.questions);
    expect(q.every((row) => row.answerStatus !== "verified")).toBe(true);
    const owned = await db.select().from(courseNotes);
    expect(owned).toHaveLength(1);
    expect(owned[0]!.ownerId).toBe("u1");
    expect(await db.select().from(resources)).toHaveLength(0);
  });
  it("imports nothing when rights are not confirmed", async () => {
    const plan = buildPlan(files, { knownCourseCodes: ["TEST 101"] });
    const r = await importPlan(db, createMemoryStorage(), viewer, plan, { ...batch, rightsConfirmed: false }, files);
    expect(r).toMatchObject({ questions: 0, notes: 0 });
    expect(await db.select().from(courseNotes)).toHaveLength(0);
  });
  it("reports a course that is not in the catalog instead of creating it", async () => {
    await db.delete(courses).where(eq(courses.code, "TEST 101"));
    const plan = buildPlan(files, { knownCourseCodes: ["TEST 101"] });
    const r = await importPlan(db, createMemoryStorage(), viewer, plan, batch, files);
    expect(r.errors.join(" ")).toContain("not in the catalog");
    expect(await db.select().from(courses)).toHaveLength(0);
  });
});
