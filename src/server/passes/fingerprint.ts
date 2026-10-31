// A stable fingerprint of a question's wording, used to flag likely duplicates inside a course.
// Two questions with the same fingerprint have the same wording after ignoring case, accents,
// punctuation and spacing; the ORDER of the choices is ignored too (exams often shuffle them).
import { createHash } from "node:crypto";

export function normalizeForFingerprint(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function questionFingerprint(questionText: string, choiceTexts: readonly string[]): string {
  const parts = [normalizeForFingerprint(questionText), ...choiceTexts.map(normalizeForFingerprint).sort()];
  return createHash("sha256").update(parts.join("\u0000")).digest("hex");
}
