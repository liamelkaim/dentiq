// Turns a question into flashcard text (front and back) and export columns. Pure: the labels come from the caller
// (the translation files), so the same code serves the screen, CSV and Anki exports in both languages.
//
// Honesty: the back of a card shows the VERIFIED answer when there is one. A student's proposal is shown only
// with an explicit "unverified" label, and no answer at all says so. A proposal is never presented as the truth.
import type { AnswerBasis } from "@/db/schema";
import { buildReveal, type GradableQuestion } from "./grading";

export type CardLabels = {
  verified: string;
  proposedUnverified: string;
  noAnswer: string;
  trueWord: string;
  falseWord: string;
  explanation: string;
  source: string;
  recalled: string;
  released: string;
};

export type CardQuestion = GradableQuestion & {
  questionText: string;
  explanation: string | null;
  courseCode: string;
  examAcademicYear: string;
  examTerm: string | null;
  provenance: "recalled" | "released";
  topic: string | null;
};

const letter = (i: number) => String.fromCharCode(65 + i);

/** Question wording followed by lettered choices (statements for true/false questions). */
export function cardFront(q: CardQuestion): string {
  if (q.choices.length === 0) return q.questionText;
  return [q.questionText, "", ...q.choices.map((c, i) => `${letter(i)}. ${c.text}`)].join("\n");
}

/** The answer as plain text: the verified one, or the proposal. Null when that kind of answer does not exist. */
export function answerSummary(q: CardQuestion, labels: CardLabels, kind: "verified" | "proposed"): string | null {
  const reveal = buildReveal(q);
  if (reveal.basis !== kind) return null;
  if (q.rule === "text") return reveal.text ?? "";
  if (q.rule === "perChoice") return reveal.choices.map((c, i) => `${letter(i)}. ${c.text}: ${c.correct ? labels.trueWord : labels.falseWord}`).join("\n");
  return reveal.choices
    .map((c, i) => (c.correct ? `${letter(i)}. ${c.text}` : null))
    .filter((line): line is string => line !== null)
    .join("\n");
}

/** Answer text, the explanation and a source line, with a clear label of what the answer is based on. */
export function cardBack(q: CardQuestion, labels: CardLabels): string {
  const basis = buildReveal(q).basis;
  const lines: string[] = [];
  if (basis === "none") {
    lines.push(labels.noAnswer);
  } else {
    lines.push(basis === "verified" ? labels.verified : labels.proposedUnverified, answerSummary(q, labels, basis) ?? "");
  }
  if (q.explanation) lines.push("", `${labels.explanation}: ${q.explanation}`);
  lines.push("", cardSource(q, labels));
  return lines.join("\n");
}

/** "DMD 1234, 2025-2026, fall (recalled)": where the question comes from. */
export function cardSource(q: Pick<CardQuestion, "courseCode" | "examAcademicYear" | "examTerm" | "provenance">, labels: CardLabels): string {
  const how = q.provenance === "released" ? labels.released : labels.recalled;
  return `${labels.source}: ${[q.courseCode, q.examAcademicYear, q.examTerm].filter(Boolean).join(", ")} (${how})`;
}

/** Plain-language answer status for export columns. */
export function answerStatusWord(basis: AnswerBasis): "verified" | "proposed_unverified" | "none" {
  return basis === "verified" ? "verified" : basis === "proposed" ? "proposed_unverified" : "none";
}
