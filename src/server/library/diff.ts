// A small line-by-line text comparison for note history. Pure functions, no database.
import { DIFF_MAX_LINES } from "./constants";

export type DiffOp = { type: "same" | "add" | "del"; text: string };

export type DiffResult = {
  ops: DiffOp[];
  added: number;
  removed: number;
  /** True when the texts were too long to compare; `ops` is empty and the counts are zero. */
  tooLarge: boolean;
};

const lines = (text: string) => (text === "" ? [] : text.replace(/\r\n/g, "\n").split("\n"));

/** Longest-common-subsequence diff of two texts by line. Common start and end lines are skipped first. */
export function diffLines(before: string, after: string, maxLines = DIFF_MAX_LINES): DiffResult {
  const a = lines(before);
  const b = lines(after);

  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;
  let tail = 0;
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;

  const midA = a.slice(head, a.length - tail);
  const midB = b.slice(head, b.length - tail);
  if (midA.length > maxLines || midB.length > maxLines) return { ops: [], added: 0, removed: 0, tooLarge: true };

  // table[i][j] = length of the longest common subsequence of midA[i..] and midB[j..]
  const table = Array.from({ length: midA.length + 1 }, () => new Uint32Array(midB.length + 1));
  for (let i = midA.length - 1; i >= 0; i--) {
    for (let j = midB.length - 1; j >= 0; j--) {
      table[i]![j] = midA[i] === midB[j] ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
    }
  }

  const ops: DiffOp[] = a.slice(0, head).map((text) => ({ type: "same", text }));
  let i = 0;
  let j = 0;
  let added = 0;
  let removed = 0;
  while (i < midA.length || j < midB.length) {
    if (i < midA.length && j < midB.length && midA[i] === midB[j]) {
      ops.push({ type: "same", text: midA[i]! });
      i++;
      j++;
    } else if (i < midA.length && (j === midB.length || table[i + 1]![j]! >= table[i]![j + 1]!)) {
      ops.push({ type: "del", text: midA[i]! });
      removed++;
      i++;
    } else {
      ops.push({ type: "add", text: midB[j]! });
      added++;
      j++;
    }
  }
  for (const text of a.slice(a.length - tail)) ops.push({ type: "same", text });
  return { ops, added, removed, tooLarge: false };
}

export type VersionChange = { titleChanged: boolean; bodyChanged: boolean; added: number; removed: number; tooLarge: boolean };

/** What changed between two versions of a note, at the level the history page shows. */
export function describeChange(
  before: { title: string; body: string } | null,
  after: { title: string; body: string },
): VersionChange {
  if (!before) return { titleChanged: false, bodyChanged: false, added: lines(after.body).length, removed: 0, tooLarge: false };
  const body = diffLines(before.body, after.body);
  return {
    titleChanged: before.title !== after.title,
    bodyChanged: before.body !== after.body,
    added: body.added,
    removed: body.removed,
    tooLarge: body.tooLarge,
  };
}
