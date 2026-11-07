import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type Staged = {
  status: string;
  inventory: { filename: string; state: string; sha256?: string }[];
  candidates: { code: string; programYear: number; term: string; academicCredits: number; progressiveCredits: number }[];
  diff: { inPdfsNotInSeed: string[]; inSeedNotInPdfs: string[] };
};
const staged: Staged = JSON.parse(readFileSync("data/staging/udem-2026-2027.staged.json", "utf8"));
const seed = JSON.parse(readFileSync("data/programs/udem-dmd.json", "utf8")) as { courses: { code: string }[] };

describe("staged UdeM 2026-2027 data (provisional)", () => {
  it("is marked provisional and inventories all 17 PDFs with hashes", () => {
    expect(staged.status).toMatch(/PROVISIONAL/);
    expect(staged.inventory).toHaveLength(17);
    for (const f of staged.inventory) expect(f.state === "missing" || /^[0-9a-f]{64}$/.test(f.sha256 ?? "")).toBe(true);
  });
  it("matches the reviewed seed course codes with no unexplained differences", () => {
    expect(staged.diff.inPdfsNotInSeed).toEqual([]);
    expect(staged.diff.inSeedNotInPdfs).toEqual([]);
    expect(new Set(staged.candidates.map((c) => c.code))).toEqual(new Set(seed.courses.map((c) => c.code)));
  });
  it("keeps academic and progressive credits separate and reconciles year totals with the printed ones", () => {
    const sum = (y: number, k: "academicCredits" | "progressiveCredits") => staged.candidates.filter((c) => c.programYear === y).reduce((a, c) => a + c[k], 0);
    expect([1, 2, 3, 4, 5].map((y) => sum(y, "academicCredits"))).toEqual([40, 41.5, 41, 60.5, 36]);
    const c = staged.candidates.find((x) => x.code === "DEN 10021");
    expect([c?.academicCredits, c?.progressiveCredits]).toEqual([0, 0.5]);
  });
});
