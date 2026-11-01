// Grading of a student's answer, as pure functions (no database). THE rule that matters:
//
//   An answer is scored (correct / partial / incorrect) ONLY against a VERIFIED answer.
//   Against a student's proposal, or when there is no answer at all, the attempt is "unscored".
//   A verified answer that is incomplete or inconsistent (should not happen: the database and the verify
//   service prevent it) is also treated as "not verified" here, so a broken record is never scored.
//
// How each question type is graded (see QUESTION_TYPES in src/server/passes/question-types.ts):
//   single    (sc)     correct when the chosen option is the verified one
//   multiple  (mc)     correct when the chosen set equals the verified set exactly (no partial credit)
//   perChoice (kprim)  correct when every statement's True/False matches (no partial credit)
//   text      (open)   not auto-graded: the student reads the verified answer and rates themselves
//                      (got it = correct, partly = partial, missed = incorrect). Marked as self-rated.
import { z } from "zod";
import { selfRatings, type AnswerBasis, type AttemptOutcome, type SelfRating } from "@/db/schema";
import { MAX_ANSWER_TEXT, type AnswerRule } from "@/server/passes/question-types";

export type GradableChoice = {
  position: number;
  text: string;
  proposedCorrect: boolean | null;
  /** Must already be null when the question's answer is not verified (the loader guarantees it). */
  verifiedCorrect: boolean | null;
};

export type GradableQuestion = {
  rule: AnswerRule;
  answerStatus: "proposed" | "verified";
  choices: GradableChoice[];
  proposedAnswerText: string | null;
  verifiedAnswerText: string | null;
};

export const studyResponseSchema = z.object({
  selected: z.array(z.number().int().min(1).max(10)).max(10).optional(),
  verdicts: z.record(z.string().regex(/^\d{1,2}$/), z.boolean()).optional(),
  text: z.string().max(MAX_ANSWER_TEXT).optional(),
  selfRating: z.enum(selfRatings).optional(),
});
export type StudyResponse = z.output<typeof studyResponseSchema>;

export type ResponseError = "answerRequired" | "invalidAnswer";

/**
 * Is the response complete and about real choices of this question? `requireSelfRating` is true when an open
 * question is submitted in practice mode (the student has seen the answer and rated themselves).
 */
export function validateResponse(q: GradableQuestion, r: StudyResponse, options: { requireSelfRating: boolean }): ResponseError | null {
  const positions = new Set(q.choices.map((c) => c.position));
  switch (q.rule) {
    case "single": {
      const sel = r.selected ?? [];
      if (sel.length === 0) return "answerRequired";
      if (sel.length !== 1 || !positions.has(sel[0]!)) return "invalidAnswer";
      return null;
    }
    case "multiple": {
      const sel = r.selected ?? [];
      if (sel.length === 0) return "answerRequired";
      if (new Set(sel).size !== sel.length || sel.some((p) => !positions.has(p))) return "invalidAnswer";
      return null;
    }
    case "perChoice": {
      const verdicts = r.verdicts ?? {};
      const keys = Object.keys(verdicts);
      if (keys.length === 0) return "answerRequired";
      if (keys.some((k) => !positions.has(Number(k)))) return "invalidAnswer";
      if (keys.length !== positions.size) return "answerRequired";
      return null;
    }
    case "text":
      if (options.requireSelfRating && !r.selfRating) return "answerRequired";
      return null;
  }
}

/** True when the verified answer is complete enough to score against. */
export function hasUsableVerifiedAnswer(q: GradableQuestion): boolean {
  if (q.answerStatus !== "verified") return false;
  if (q.rule === "text") return Boolean(q.verifiedAnswerText?.trim());
  if (q.choices.length === 0 || q.choices.some((c) => c.verifiedCorrect === null)) return false;
  const trues = q.choices.filter((c) => c.verifiedCorrect === true).length;
  if (q.rule === "single") return trues === 1;
  if (q.rule === "multiple") return trues >= 1;
  return true;
}

/** What the answer is based on right now: verified, only a student's proposal, or nothing. */
export function answerBasisOf(q: GradableQuestion): AnswerBasis {
  if (hasUsableVerifiedAnswer(q)) return "verified";
  const proposed = q.rule === "text" ? Boolean(q.proposedAnswerText?.trim()) : q.choices.some((c) => c.proposedCorrect !== null);
  return proposed ? "proposed" : "none";
}

const RATING_OUTCOME: Record<SelfRating, AttemptOutcome> = { got_it: "correct", partly: "partial", missed: "incorrect" };

/**
 * The outcome of an answer. `unscored` unless the question has a usable verified answer.
 * For an open question with a verified answer and no self-rating yet, `outcome` is null (still pending).
 */
export function gradeResponse(q: GradableQuestion, r: StudyResponse): { outcome: AttemptOutcome | null; answerBasis: AnswerBasis } {
  const answerBasis = answerBasisOf(q);
  if (answerBasis !== "verified") return { outcome: "unscored", answerBasis };

  switch (q.rule) {
    case "single":
    case "multiple": {
      const chosen = new Set(r.selected ?? []);
      const correct = new Set(q.choices.filter((c) => c.verifiedCorrect === true).map((c) => c.position));
      const same = chosen.size === correct.size && [...chosen].every((p) => correct.has(p));
      return { outcome: same ? "correct" : "incorrect", answerBasis };
    }
    case "perChoice": {
      const verdicts = r.verdicts ?? {};
      const all = q.choices.every((c) => verdicts[String(c.position)] === c.verifiedCorrect);
      return { outcome: all ? "correct" : "incorrect", answerBasis };
    }
    case "text":
      return { outcome: r.selfRating ? RATING_OUTCOME[r.selfRating] : null, answerBasis };
  }
}

/** Outcome of a self-rating on an open question that has a verified answer. */
export const outcomeForSelfRating = (rating: SelfRating): AttemptOutcome => RATING_OUTCOME[rating];

// ---------- What is shown after answering ----------

export type Reveal = {
  /** Which answer these marks come from. "proposed" must always be labelled as unverified in the UI. */
  basis: AnswerBasis;
  choices: { position: number; text: string; correct: boolean | null }[];
  text: string | null;
  explanation: string | null;
};

/** The answer to show: the verified one when usable, otherwise the labelled proposal, otherwise nothing. */
export function buildReveal(q: GradableQuestion & { explanation: string | null }): Reveal {
  const basis = answerBasisOf(q);
  const field = basis === "verified" ? "verifiedCorrect" : "proposedCorrect";
  return {
    basis,
    choices:
      q.rule === "text" ? [] : q.choices.map((c) => ({ position: c.position, text: c.text, correct: basis === "none" ? null : c[field] })),
    text: q.rule === "text" ? (basis === "verified" ? q.verifiedAnswerText : basis === "proposed" ? q.proposedAnswerText : null) : null,
    explanation: q.explanation,
  };
}

// ---------- Quiz score ----------

/** A partly-right open answer earns this fraction of a point. */
export const PARTIAL_CREDIT = 0.5;

export type ScoredItem = { answered: boolean; outcome: AttemptOutcome | null };

export type QuizScore = {
  /** Items scored against a verified answer (correct + partial + incorrect). */
  scored: number;
  correct: number;
  partial: number;
  incorrect: number;
  /** Answered, but no verified answer to score against. Never counted in the score. */
  unscored: number;
  /** Open questions with a verified answer still waiting for the student's self-rating. */
  awaitingRating: number;
  unanswered: number;
  /** correct + PARTIAL_CREDIT * partial */
  points: number;
  /** points / scored as a whole percentage, or null when nothing could be scored (no fake 0%). */
  percent: number | null;
};

/** The score comes ONLY from items scored against a verified answer; unscored items are listed apart. */
export function scoreQuiz(items: readonly ScoredItem[]): QuizScore {
  let correct = 0;
  let partial = 0;
  let incorrect = 0;
  let unscored = 0;
  let awaitingRating = 0;
  let unanswered = 0;
  for (const item of items) {
    if (!item.answered) unanswered++;
    else if (item.outcome === null) awaitingRating++;
    else if (item.outcome === "correct") correct++;
    else if (item.outcome === "partial") partial++;
    else if (item.outcome === "incorrect") incorrect++;
    else unscored++;
  }
  const scored = correct + partial + incorrect;
  const points = correct + PARTIAL_CREDIT * partial;
  return { scored, correct, partial, incorrect, unscored, awaitingRating, unanswered, points, percent: scored === 0 ? null : Math.round((points / scored) * 100) };
}
