import { describe, expect, it } from "vitest";
import { questionFingerprint } from "@/server/passes/fingerprint";
import {
  describeQuestionType,
  getQuestionType,
  knownQuestionTypes,
  QUESTION_TYPES,
  validateQuestionShape,
  validateVerifiedAnswer,
} from "@/server/passes/question-types";

const choices = (n: number, proposed: (boolean | null)[] = []) =>
  Array.from({ length: n }, (_, i) => ({ text: `Choix ${i + 1}`, proposedCorrect: proposed[i] ?? null }));

describe("the registry", () => {
  it("defines every kind of question in one place", () => {
    expect(knownQuestionTypes.sort()).toEqual(["kprim", "mc", "open", "sc"]);
    for (const key of knownQuestionTypes) expect(QUESTION_TYPES[key].key).toBe(key);
  });

  it("never mistakes inherited object keys for question types", () => {
    for (const key of ["toString", "constructor", "__proto__", "hasOwnProperty", "", "SC"]) {
      expect(getQuestionType(key), key).toBeNull();
    }
  });

  it("describes a retired or unknown type without failing, flagged as unknown", () => {
    expect(describeQuestionType("sc")).toMatchObject({ key: "sc", known: true });
    expect(describeQuestionType("legacy_type")).toMatchObject({ key: "legacy_type", known: false });
  });
});

describe("validating a question's shape (the contributor's proposal)", () => {
  it("single choice: 2-10 choices, at most one marked correct, a proposal is optional", () => {
    expect(validateQuestionShape("sc", "Q ?", choices(2, [true, false]))).toEqual({ ok: true });
    expect(validateQuestionShape("sc", "Q ?", choices(4))).toEqual({ ok: true });
    expect(validateQuestionShape("sc", "Q ?", choices(1))).toEqual({ ok: false, error: "choiceCount" });
    expect(validateQuestionShape("sc", "Q ?", choices(11))).toEqual({ ok: false, error: "choiceCount" });
    expect(validateQuestionShape("sc", "Q ?", choices(3, [true, true, false]))).toEqual({ ok: false, error: "answerCount" });
  });

  it("multiple choice: any number marked correct", () => {
    expect(validateQuestionShape("mc", "Q ?", choices(4, [true, true, false, true]))).toEqual({ ok: true });
    expect(validateQuestionShape("mc", "Q ?", choices(4, [false, false, false, false]))).toEqual({ ok: true });
  });

  it("four-statement true/false: exactly four statements; a proposal is all-or-nothing", () => {
    expect(validateQuestionShape("kprim", "Q ?", choices(4, [true, false, true, false]))).toEqual({ ok: true });
    expect(validateQuestionShape("kprim", "Q ?", choices(4))).toEqual({ ok: true });
    expect(validateQuestionShape("kprim", "Q ?", choices(3))).toEqual({ ok: false, error: "choiceCount" });
    expect(validateQuestionShape("kprim", "Q ?", choices(5))).toEqual({ ok: false, error: "choiceCount" });
    expect(validateQuestionShape("kprim", "Q ?", choices(4, [true, false, null, false]))).toEqual({ ok: false, error: "answerIncomplete" });
  });

  it("open answer: no choices, an optional written proposal", () => {
    expect(validateQuestionShape("open", "Décrivez ...", [])).toEqual({ ok: true });
    expect(validateQuestionShape("open", "Décrivez ...", [], "Réponse proposée")).toEqual({ ok: true });
    expect(validateQuestionShape("open", "Décrivez ...", choices(2))).toEqual({ ok: false, error: "choiceCount" });
    expect(validateQuestionShape("open", "Décrivez ...", [], "x".repeat(4001))).toEqual({ ok: false, error: "answerTooLong" });
  });

  it("choice questions can't carry a written answer", () => {
    expect(validateQuestionShape("sc", "Q ?", choices(2), "texte")).toEqual({ ok: false, error: "answerTextNotAllowed" });
  });

  it("rejects blank wording, blank or oversized choices, and unknown types", () => {
    expect(validateQuestionShape("sc", "   ", choices(2))).toEqual({ ok: false, error: "questionTextInvalid" });
    expect(validateQuestionShape("sc", "x".repeat(4001), choices(2))).toEqual({ ok: false, error: "questionTextInvalid" });
    expect(validateQuestionShape("sc", "Q ?", [{ text: "A" }, { text: "  " }])).toEqual({ ok: false, error: "emptyChoice" });
    expect(validateQuestionShape("sc", "Q ?", [{ text: "A" }, { text: "x".repeat(1001) }])).toEqual({ ok: false, error: "choiceTooLong" });
    expect(validateQuestionShape("essay", "Q ?", [])).toEqual({ ok: false, error: "unknownType" });
  });
});

describe("validating a verified answer (stricter: it must be complete)", () => {
  it("single choice needs exactly one correct choice", () => {
    expect(validateVerifiedAnswer("sc", 3, [false, true, false])).toEqual({ ok: true });
    expect(validateVerifiedAnswer("sc", 3, [false, false, false])).toEqual({ ok: false, error: "answerCount" });
    expect(validateVerifiedAnswer("sc", 3, [true, true, false])).toEqual({ ok: false, error: "answerCount" });
  });

  it("multiple choice needs at least one correct choice", () => {
    expect(validateVerifiedAnswer("mc", 3, [true, true, false])).toEqual({ ok: true });
    expect(validateVerifiedAnswer("mc", 3, [false, false, false])).toEqual({ ok: false, error: "answerCount" });
  });

  it("four-statement true/false needs a verdict for every statement", () => {
    expect(validateVerifiedAnswer("kprim", 4, [true, false, false, true])).toEqual({ ok: true });
    expect(validateVerifiedAnswer("kprim", 4, [true, false, true])).toEqual({ ok: false, error: "answerIncomplete" });
    expect(validateVerifiedAnswer("kprim", 4, undefined)).toEqual({ ok: false, error: "answerIncomplete" });
  });

  it("open answer needs written text; choice questions can't have it", () => {
    expect(validateVerifiedAnswer("open", 0, undefined, "La pulpe dentaire.")).toEqual({ ok: true });
    expect(validateVerifiedAnswer("open", 0, undefined, "   ")).toEqual({ ok: false, error: "answerIncomplete" });
    expect(validateVerifiedAnswer("sc", 2, [true, false], "texte")).toEqual({ ok: false, error: "answerTextNotAllowed" });
    expect(validateVerifiedAnswer("essay", 0, [])).toEqual({ ok: false, error: "unknownType" });
  });
});

describe("duplicate fingerprint", () => {
  const base = questionFingerprint("Quelle est la dent la plus antérieure ?", ["Incisive", "Canine", "Molaire"]);

  it("ignores case, accents, punctuation, spacing and the order of the choices", () => {
    expect(questionFingerprint("QUELLE est la dent la plus anterieure??", ["molaire", "Incisive ", "canine"])).toBe(base);
    expect(questionFingerprint("  Quelle   est la dent la plus antérieure", ["Canine", "Molaire", "Incisive"])).toBe(base);
  });

  it("differs when the wording or a choice differs", () => {
    expect(questionFingerprint("Quelle est la dent la plus postérieure ?", ["Incisive", "Canine", "Molaire"])).not.toBe(base);
    expect(questionFingerprint("Quelle est la dent la plus antérieure ?", ["Incisive", "Canine", "Prémolaire"])).not.toBe(base);
  });
});
