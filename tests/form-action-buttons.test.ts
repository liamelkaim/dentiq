import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// React drops `name` and `value` on a button with a server `formAction` (the markup carries the action id instead),
// so the value never reaches the action; bind it instead: formAction={action.bind(null, value)}.
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith(".tsx") && !/ 2\./.test(p) ? [p] : [];
  });
}

describe("server-action buttons", () => {
  it("never combine formAction with name/value", () => {
    const bad = files("src").filter((p) => readFileSync(p, "utf8").split("\n").some((l) => /formAction=\{/.test(l) && /\bname=/.test(l)));
    expect(bad).toEqual([]);
  });
});
