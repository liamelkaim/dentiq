// .ics (iCalendar, RFC 5545) text generation for the student's OWN calendar entries. Pure text: no network, no
// calendar service, nothing is sent anywhere; the student downloads a file and may import it where they like.
//  - Entries without a time are all-day events; entries with a time use "floating" local time (no time zone is
//    claimed, because the student never gave one).
//  - Text values are escaped (backslash, semicolon, comma, line breaks) and control characters are removed, so an
//    entry title can never add its own iCalendar properties.
//  - Lines are folded at 75 octets (never inside a UTF-8 character) and end with CRLF.
import type { CalendarEntryKind } from "@/db/schema";
import { addDays, parseIsoDate } from "./dates";

export type IcsEntry = {
  id: string;
  title: string;
  /** "YYYY-MM-DD" */
  date: string;
  /** "HH:MM" or null (all day) */
  time: string | null;
  kind: CalendarEntryKind;
  note: string | null;
  courseCode: string | null;
};

const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/** Escapes a TEXT value: backslash first, then semicolon, comma and line breaks. */
export function escapeIcsText(value: string): string {
  return value
    .replace(CONTROL, "")
    .replace(/\r\n|\r/g, "\n")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

const encoder = new TextEncoder();

/** Folds one content line at 75 octets; continuation lines start with one space. Never splits a character. */
export function foldIcsLine(line: string): string {
  if (encoder.encode(line).length <= 75) return line;
  const out: string[] = [];
  let current = "";
  let size = 0;
  let limit = 75;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    if (size + bytes > limit) {
      out.push(current);
      current = " ";
      size = 1;
      limit = 75;
    }
    current += char;
    size += bytes;
  }
  out.push(current);
  return out.join("\r\n");
}

const compactDate = (iso: string) => iso.replaceAll("-", "");
const compactTime = (time: string) => `${time.replace(":", "")}00`;

function utcStamp(now: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getUTCFullYear()}${p(now.getUTCMonth() + 1)}${p(now.getUTCDate())}T${p(now.getUTCHours())}${p(now.getUTCMinutes())}${p(now.getUTCSeconds())}Z`;
}

export function buildIcs(entries: readonly IcsEntry[], options: { now?: Date; kindLabels?: Partial<Record<CalendarEntryKind, string>> } = {}): string {
  const stamp = utcStamp(options.now ?? new Date());
  const lines: string[] = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Dentiq//Study calendar//EN", "CALSCALE:GREGORIAN", "X-WR-CALNAME:Dentiq"];
  for (const entry of entries) {
    // A row with an impossible date (cannot happen through the service, but this is a pure function) is skipped.
    if (!parseIsoDate(entry.date)) continue;
    lines.push("BEGIN:VEVENT", `UID:${entry.id.replace(/[^A-Za-z0-9-]/g, "")}@dentiq.local`, `DTSTAMP:${stamp}`);
    if (entry.time && /^([01]\d|2[0-3]):[0-5]\d$/.test(entry.time)) {
      lines.push(`DTSTART:${compactDate(entry.date)}T${compactTime(entry.time)}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${compactDate(entry.date)}`, `DTEND;VALUE=DATE:${compactDate(addDays(entry.date, 1))}`);
    }
    lines.push(`SUMMARY:${escapeIcsText(entry.title)}`);
    const description = [entry.courseCode, entry.note].filter((part): part is string => Boolean(part && part.trim())).join("\n");
    if (description) lines.push(`DESCRIPTION:${escapeIcsText(description)}`);
    const category = options.kindLabels?.[entry.kind];
    if (category) lines.push(`CATEGORIES:${escapeIcsText(category)}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldIcsLine).join("\r\n") + "\r\n";
}
