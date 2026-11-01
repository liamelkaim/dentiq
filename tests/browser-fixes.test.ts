// Regression tests for defects found in the browser walkthrough (block I, part 1).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";

const root = join(__dirname, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

type T = (key: string, values?: Record<string, unknown>) => string;
const E = (ns: string) => createTranslator({ locale: "en", messages: en, namespace: ns as never }) as unknown as T;
const F = (ns: string) => createTranslator({ locale: "fr", messages: fr, namespace: ns as never }) as unknown as T;

describe("French quiz score sentences agree with the count", () => {
  it("quiz results breakdown", () => {
    expect(F("studyTools.quizzes.results")("breakdown", { correct: 1, partial: 0, incorrect: 1 })).toBe("1 correcte, 0 en partie juste, 1 incorrecte");
    expect(F("studyTools.quizzes.results")("breakdown", { correct: 3, partial: 2, incorrect: 4 })).toBe("3 correctes, 2 en partie justes, 4 incorrectes");
    expect(E("studyTools.quizzes.results")("breakdown", { correct: 1, partial: 0, incorrect: 1 })).toBe("1 correct, 0 partly right, 1 incorrect");
  });

  it("analytics quiz line takes a number so the plural can be chosen", () => {
    expect(F("analytics")("quizzes.line", { points: 1, scored: 2, percent: 50 })).toMatch(/^1 point sur 2 \(50/);
    expect(F("analytics")("quizzes.line", { points: 2, scored: 4, percent: 50 })).toMatch(/^2 points sur 4/);
    expect(F("analytics")("quizzes.line", { points: 1.5, scored: 2, percent: 75 })).toMatch(/^1,5 point sur 2/);
    expect(E("analytics")("quizzes.line", { points: 1, scored: 2, percent: 50 })).toMatch(/^1 of 2 points/);
    expect(read("src/app/(app)/analytics/page.tsx")).not.toMatch(/quizzes\.line", \{ points: n\(/);
  });
});

describe("quiz taking keeps its own question list", () => {
  it("QuizTake freezes the remaining items, because saving an answer revalidates the page", () => {
    const source = read("src/components/study-forms.tsx");
    const start = source.indexOf("export function QuizTake");
    const body = source.slice(start, source.indexOf("export function QuizRate"));
    expect(body).toMatch(/useState\(\(\) => \(\{ items: liveItems, answeredBefore: liveAnsweredBefore \}\)\)/);
  });
});

describe("dashboard roadmap list", () => {
  it("does not list flashcards as planned: they are live under Study", () => {
    const source = read("src/app/(app)/page.tsx");
    const list = source.slice(source.indexOf("const futureFeatures"), source.indexOf("] as const", source.indexOf("const futureFeatures")));
    expect(list).not.toMatch(/flashcards/);
    expect(list).toMatch(/tutor/);
    expect(list).toMatch(/recordings/);
  });
});
