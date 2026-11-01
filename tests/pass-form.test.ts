// Parsing of the Passes forms and list filters, the error-code messages, and the recent-years list.
// No database: these pieces turn browser input into the objects the service validates.
import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";
import { currentAcademicYear, recentAcademicYears } from "@/server/passes/academic-year";
import { PAGE_SIZE, parseBrowseParams, paramsToQuery, toQuestionFilters } from "@/server/passes/browse";
import { PASS_ERROR_CODES, passErrorField, passErrorKey } from "@/server/passes/errors";
import { hasOversizedImage, parseImages, parseMarks, parseNewQuestion, parseQuestionFields, parseSettingsForm, parseVerifiedAnswer } from "@/server/passes/form";
import { questionInputSchema } from "@/server/passes/service";

function form(entries: [string, string | Blob][]) {
  const data = new FormData();
  for (const [key, value] of entries) data.append(key, value);
  return data;
}
const png = (name: string, size = 10) => new File([new Uint8Array(size)], name, { type: "image/png" });
const COURSE = "11111111-1111-4111-8111-111111111111";

describe("parseMarks", () => {
  it("single/multiple choice: nothing selected means 'I don't remember' (all null)", () => {
    expect(parseMarks(form([]), "single", 3, "correct")).toEqual([null, null, null]);
    expect(parseMarks(form([]), "multiple", 2, "correct")).toEqual([null, null]);
  });
  it("single/multiple choice: selected rows are true, the rest false", () => {
    expect(parseMarks(form([["correct", "1"]]), "single", 3, "correct")).toEqual([false, true, false]);
    expect(parseMarks(form([["correct", "0"], ["correct", "2"]]), "multiple", 3, "correct")).toEqual([true, false, true]);
  });
  it("four statements: per-row true / false / blank", () => {
    const f = form([["correct-0", "true"], ["correct-1", "false"], ["correct-2", ""]]);
    expect(parseMarks(f, "perChoice", 4, "correct")).toEqual([true, false, null, null]);
  });
  it("open answers have no marks", () => {
    expect(parseMarks(form([["correct", "0"]]), "text", 0, "correct")).toEqual([]);
  });
});

describe("parseQuestionFields / parseNewQuestion", () => {
  it("builds a single-choice question and ignores blank choice rows", () => {
    const f = form([
      ["courseId", COURSE],
      ["questionType", "sc"],
      ["questionText", "Which?"],
      ["examAcademicYear", "2025-2026"],
      ["choiceText", "A"],
      ["choiceText", ""],
      ["choiceText", "B"],
      ["correct", "2"],
      ["rightsConfirmed", "on"],
    ]);
    const fields = parseQuestionFields(f);
    expect(fields.choices).toEqual([
      { text: "A", proposedCorrect: false },
      { text: "B", proposedCorrect: true },
    ]);
    expect(questionInputSchema.safeParse(parseNewQuestion(f)).success).toBe(true);
  });

  it("an older year typed in the optional field overrides the list", () => {
    const f = form([["examAcademicYear", "2025-2026"], ["examYearOlder", " 2017-2018 "], ["questionType", "open"]]);
    expect(parseQuestionFields(f).examAcademicYear).toBe("2017-2018");
  });

  it("open answers keep the written proposal and drop choices", () => {
    const f = form([["questionType", "open"], ["choiceText", "ignored"], ["proposedAnswerText", "Because."]]);
    const fields = parseQuestionFields(f);
    expect(fields.choices).toEqual([]);
    expect(fields.proposedAnswerText).toBe("Because.");
  });

  it("choice types never carry a written answer", () => {
    const f = form([["questionType", "mc"], ["proposedAnswerText", "stray"]]);
    expect(parseQuestionFields(f).proposedAnswerText).toBeUndefined();
  });

  it("the rights confirmation must be ticked", () => {
    const f = form([["courseId", COURSE], ["questionType", "open"], ["questionText", "Q"], ["examAcademicYear", "2025-2026"]]);
    const result = questionInputSchema.safeParse(parseNewQuestion(f));
    expect(result.success).toBe(false);
    expect(!result.success && result.error.issues.some((i) => i.message === "rightsRequired")).toBe(true);
  });

  it("four statements with a missing verdict keep every statement", () => {
    const f = form([["questionType", "kprim"], ...[0, 1, 2, 3].map((i) => ["choiceText", `S${i}`] as [string, string]), ["correct-0", "true"], ["correct-1", "false"]]);
    expect(parseQuestionFields(f).choices.map((c) => c.proposedCorrect)).toEqual([true, false, null, null]);
  });
});

describe("parseVerifiedAnswer", () => {
  it("single choice: the selected row is the verified one", () => {
    expect(parseVerifiedAnswer(form([["verified", "2"]]), "single", 3)).toEqual({ choices: [false, false, true] });
  });
  it("multiple choice with nothing selected stays empty so the service rejects it", () => {
    expect(parseVerifiedAnswer(form([]), "multiple", 3)).toEqual({ choices: [false, false, false] });
  });
  it("four statements need a verdict on every row, otherwise no answer is passed", () => {
    expect(parseVerifiedAnswer(form([["verified-0", "true"], ["verified-1", "false"], ["verified-2", "true"]]), "perChoice", 4)).toEqual({});
    const all = form([0, 1, 2, 3].map((i) => [`verified-${i}`, i % 2 ? "true" : "false"] as [string, string]));
    expect(parseVerifiedAnswer(all, "perChoice", 4)).toEqual({ choices: [false, true, false, true] });
  });
  it("open answers pass the written text", () => {
    expect(parseVerifiedAnswer(form([["verifiedText", "Done"]]), "text", 0)).toEqual({ text: "Done" });
  });
});

describe("images", () => {
  it("reads filled slots with their alt text and skips empty ones", async () => {
    const f = form([["image0", png("a.png")], ["imageAlt0", "Panoramic view"], ["image1", new File([], "")], ["image2", png("c.png")], ["imageAlt2", "Bitewing"]]);
    const images = await parseImages(f);
    expect(images.map((i) => [i.name, i.altText, i.bytes.byteLength])).toEqual([
      ["a.png", "Panoramic view", 10],
      ["c.png", "Bitewing", 10],
    ]);
  });
  it("flags an oversized image before it is read", () => {
    const f = form([["image0", png("big.png", 2000)]]);
    expect(hasOversizedImage(f, 1000)).toBe(true);
    expect(hasOversizedImage(f, 5000)).toBe(false);
  });
});

describe("parseSettingsForm", () => {
  const base: [string, string][] = [["minNoteLength", "10"], ["maxImages", "4"], ["maxImageMB", "5"], ["maxPending", "25"]];
  it("converts megabytes to bytes and reads the checkboxes", () => {
    const patch = parseSettingsForm(form([...base, ["questionTypes", "sc"], ["questionTypes", "open"], ["verifierRoles", "admin"], ["verifierRoles", "moderator"], ["requireNote", "on"]]));
    expect(patch.enabledQuestionTypes).toEqual(["sc", "open"]);
    expect(patch.verification).toEqual({ allowedRoles: ["admin", "moderator"], requireNote: true, minNoteLength: 10 });
    expect(patch.images).toEqual({ maxPerQuestion: 4, maxBytes: 5 * 1024 * 1024 });
    expect(patch.limits).toEqual({ maxPendingPerUser: 25 });
    expect(patch.invalidNumber).toBe(false);
  });
  it("an unticked 'require note' box means false, and a bad number is flagged", () => {
    const patch = parseSettingsForm(form([["minNoteLength", "ten"], ["maxImages", "4"], ["maxImageMB", "5"], ["maxPending", "25"]]));
    expect(patch.verification?.requireNote).toBe(false);
    expect(patch.invalidNumber).toBe(true);
  });
});

describe("list filters from the address", () => {
  const base = { moderator: false };
  it("defaults to every period and ignores anything invalid", () => {
    const p = parseBrowseParams({ scope: "bogus", year: "2025-2027", type: "nope", answer: "x", course: "not-a-uuid", page: "-3" }, base);
    expect(p).toMatchObject({ scope: "all", year: undefined, type: undefined, answer: undefined, course: undefined, page: 1 });
  });
  it("keeps valid values", () => {
    const p = parseBrowseParams({ scope: "previous", year: "2024-2025", type: "kprim", answer: "verified", course: COURSE, q: " caries ", page: "3" }, base);
    expect(p).toMatchObject({ scope: "previous", year: "2024-2025", type: "kprim", answer: "verified", course: COURSE, q: "caries", page: 3 });
  });
  it("only moderators can filter by review status", () => {
    expect(parseBrowseParams({ status: "pending" }, { moderator: false }).status).toBeUndefined();
    expect(parseBrowseParams({ status: "pending" }, { moderator: true }).status).toBe("pending");
  });
  it("a course page's own course id wins over the address", () => {
    const own = "22222222-2222-4222-8222-222222222222";
    const filters = toQuestionFilters(parseBrowseParams({ course: COURSE, offering: own, scope: "current", page: "2" }, base), own);
    expect(filters).toMatchObject({ courseId: own, offeringId: own, category: "current", limit: PAGE_SIZE, offset: PAGE_SIZE });
  });
  it("round-trips to link parameters without defaults", () => {
    expect(paramsToQuery(parseBrowseParams({}, base))).toEqual({
      scope: undefined, q: undefined, year: undefined, type: undefined, answer: undefined, status: undefined,
      course: undefined, offering: undefined, professor: undefined, topic: undefined, page: undefined,
    });
  });
});

describe("error messages", () => {
  const messages = { fr: fr.passes.errors as Record<string, string>, en: en.passes.errors as Record<string, string> };
  it("every error code has a French and an English message", () => {
    for (const code of PASS_ERROR_CODES) {
      expect(messages.fr[code], `fr ${code}`).toBeTruthy();
      expect(messages.en[code], `en ${code}`).toBeTruthy();
    }
  });
  it("has no message for a code that doesn't exist", () => {
    expect(Object.keys(messages.fr).sort()).toEqual([...PASS_ERROR_CODES].sort());
  });
  it("an unknown code falls back to the generic message", () => {
    expect(passErrorKey("somethingNew")).toBe("errors.generic");
    expect(passErrorKey("duplicateQuestion")).toBe("passes.errors.duplicateQuestion");
  });
  it("points errors at the field they belong to", () => {
    expect(passErrorField("duplicateQuestion")).toBe("questionText");
    expect(passErrorField("noteTooShort")).toBe("note");
    expect(passErrorField("forbidden")).toBeUndefined();
  });
});

describe("recentAcademicYears", () => {
  it("lists the current academic year first and goes back eight years", () => {
    const now = new Date("2026-10-31T12:00:00Z");
    const years = recentAcademicYears(8, now);
    expect(years[0]).toBe(currentAcademicYear(now));
    expect(years).toHaveLength(8);
    expect(years.slice(0, 3)).toEqual(["2026-2027", "2025-2026", "2024-2025"]);
    expect(years.at(-1)).toBe("2019-2020");
  });
  it("still shows last year's range before the August switch", () => {
    expect(recentAcademicYears(2, new Date("2026-07-15T12:00:00Z"))).toEqual(["2025-2026", "2024-2025"]);
  });
});
