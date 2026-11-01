/** Escape `\`, `%` and `_` so user text matches literally inside an ILIKE pattern. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** `%text%` pattern for a "contains" search, with the user's wildcards neutralised. */
export function containsPattern(value: string): string {
  return `%${escapeLike(value.trim())}%`;
}

/** A short piece of `text` around the first case-insensitive match of `q` (the start of the text when none). */
export function snippet(text: string, q: string, length = 140): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= length) return flat;
  const at = q.trim() ? flat.toLowerCase().indexOf(q.trim().toLowerCase()) : -1;
  if (at < 0) return `${flat.slice(0, length - 1)}…`;
  const start = Math.max(0, Math.min(at - Math.floor(length / 3), flat.length - length));
  const end = Math.min(flat.length, start + length);
  return `${start > 0 ? "…" : ""}${flat.slice(start, end)}${end < flat.length ? "…" : ""}`;
}
