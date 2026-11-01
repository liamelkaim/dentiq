// CSV / TSV writing as pure functions. Exports are opened in spreadsheets, so every cell is made safe against
// formula injection: a cell that starts with = + - @ (or a tab or carriage return) gets a leading apostrophe, so a
// spreadsheet shows it as text instead of running it (OWASP "CSV injection"). Cells containing the delimiter, a
// quote or a line break are quoted, with quotes doubled.

const FORMULA_START = /^[=+\-@\t\r]/;

/** Makes one cell safe to open in a spreadsheet. The text itself is otherwise unchanged. */
export function guardCell(value: string): string {
  return FORMULA_START.test(value) ? `'${value}` : value;
}

export type Delimiter = "," | "\t";

function encodeCell(value: string, delimiter: Delimiter): string {
  const safe = guardCell(value);
  return safe.includes(delimiter) || /["\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/** Rows of text cells to CSV (comma, CRLF) or TSV (tab, LF). */
export function toDelimited(rows: readonly (readonly string[])[], delimiter: Delimiter): string {
  const eol = delimiter === "," ? "\r\n" : "\n";
  return rows.map((row) => row.map((cell) => encodeCell(cell, delimiter)).join(delimiter)).join(eol) + eol;
}

/**
 * One field of an Anki text import. Anki fields may contain HTML, so the text is escaped and line breaks become
 * <br>; tabs would split the field, so they become spaces. (Anki compatibility is UNVERIFIED: not tested in Anki.)
 */
export function ankiField(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\t", " ")
    .replace(/\r\n|\r|\n/g, "<br>");
}

/** Anki tags are separated by spaces, so a tag cannot contain any. */
export function ankiTag(text: string): string {
  return text.trim().replace(/\s+/g, "_");
}
