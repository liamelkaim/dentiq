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

// ---------------------------------------------------------------------------------------------------------------
// Class blocks (weekly) and import. Export writes one recurring VEVENT per block (RRULE with UNTIL, EXDATE for class-free
// days). Import reads a file the student chose: one-off events become calendar entries, WEEKLY rules become class
// blocks. Nothing is fetched from a URL; unknown properties are ignored; oversized files are refused by the caller.
import { CALENDAR_TIME_ZONE } from "./constants";
import { addDays as addIsoDays, weekdayIndex } from "./dates";
import type { ClassBlock, PeriodInfo } from "./schedule";
import { CLASS_FREE_KINDS } from "./schedule";

/** First date on or after `from` that falls on `weekday` (Monday = 1). */
function firstWeekdayOnOrAfter(from: string, weekday: number): string {
  return addIsoDays(from, (weekday - 1 - weekdayIndex(from) + 7) % 7);
}

export function buildClassBlocksIcs(blocks: readonly ClassBlock[], periods: readonly PeriodInfo[], options: { now?: Date } = {}): string {
  const stamp = utcStamp(options.now ?? new Date());
  const lines: string[] = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Dentiq//Class schedule//EN", "CALSCALE:GREGORIAN", "X-WR-CALNAME:Dentiq classes"];
  const free = periods.filter((p) => CLASS_FREE_KINDS.includes(p.kind));
  for (const b of blocks) {
    const first = firstWeekdayOnOrAfter(b.validFrom, b.weekday);
    if (first > b.validTo) continue;
    lines.push("BEGIN:VEVENT", `UID:${b.id.replace(/[^A-Za-z0-9-]/g, "")}@dentiq.local`, `DTSTAMP:${stamp}`);
    lines.push(`DTSTART:${compactDate(first)}T${compactTime(b.startTime)}`, `DTEND:${compactDate(first)}T${compactTime(b.endTime)}`);
    lines.push(`RRULE:FREQ=WEEKLY;UNTIL=${compactDate(b.validTo)}T235959`);
    const skipped: string[] = [];
    for (let d = first; d <= b.validTo; d = addIsoDays(d, 7)) if (free.some((p) => d >= p.start && d <= p.end)) skipped.push(`${compactDate(d)}T${compactTime(b.startTime)}`);
    if (skipped.length) lines.push(`EXDATE:${skipped.join(",")}`);
    lines.push(`SUMMARY:${escapeIcsText(b.title)}`);
    if (b.location) lines.push(`LOCATION:${escapeIcsText(b.location)}`);
    if (b.courseCode) lines.push(`DESCRIPTION:${escapeIcsText(b.courseCode)}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldIcsLine).join("\r\n") + "\r\n";
}

export type ParsedEvent = {
  title: string;
  date: string;
  /** "HH:MM" or null for all-day events */
  time: string | null;
  endTime: string | null;
  description: string | null;
  location: string | null;
  /** Present only for FREQ=WEEKLY rules: the last date (or null when unbounded or COUNT-limited, see `count`). */
  weekly: { until: string | null; count: number | null; /** Monday = 1 ... Sunday = 7; null when the rule names no day (the start date's weekday is used). */ days: number[] | null } | null;
};

export type ParseResult = { events: ParsedEvent[]; skipped: number };

export const ICS_MAX_BYTES = 512 * 1024;
export const ICS_MAX_EVENTS = 500;

function unfold(text: string): string[] {
  return text.replace(/\r\n|\r/g, "\n").replace(/\n[ \t]/g, "").split("\n");
}

function unescapeIcsText(value: string): string {
  return value.replace(/\\([nN,;\\])/g, (_m, c: string) => (c === "n" || c === "N" ? "\n" : c)).replace(CONTROL, "");
}

/** "20261102" or "20261102T093000(Z)" to date and time. Z (UTC) values are converted to the calendar's zone. */
function parseDateTime(value: string, params: string): { date: string; time: string | null } | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value.trim());
  if (!m) return null;
  if (m[4] !== undefined && (Number(m[4]) > 23 || Number(m[5]) > 59)) return null;
  const date = `${m[1]}-${m[2]}-${m[3]}`;
  if (!parseIsoDate(date)) return null;
  if (m[4] === undefined || /VALUE=DATE(?!-)/i.test(params)) return { date, time: null };
  if (m[7]) {
    const utc = new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +m[4]!, +m[5]!));
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: CALENDAR_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(utc);
    const get = (t: string) => parts.find((p) => p.type === t)!.value;
    return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
  }
  return { date, time: `${m[4]}:${m[5]}` };
}

export function parseIcs(text: string): ParseResult {
  const events: ParsedEvent[] = [];
  let skipped = 0;
  let current: Record<string, { value: string; params: string }> | null = null;
  for (const raw of unfold(text)) {
    const line = raw.trimEnd();
    if (line === "BEGIN:VEVENT") current = {};
    else if (line === "END:VEVENT" && current) {
      const done = current;
      current = null;
      const start = done.DTSTART && parseDateTime(done.DTSTART.value, done.DTSTART.params);
      const title = done.SUMMARY ? unescapeIcsText(done.SUMMARY.value).replace(/\s+/g, " ").trim() : "";
      if (!start || !title || events.length >= ICS_MAX_EVENTS) {
        skipped++;
        continue;
      }
      const end = done.DTEND ? parseDateTime(done.DTEND.value, done.DTEND.params) : null;
      let weekly: ParsedEvent["weekly"] = null;
      if (done.RRULE) {
        const rule = Object.fromEntries(done.RRULE.value.split(";").map((p) => p.split("=") as [string, string]));
        if (rule.FREQ === "WEEKLY" && (!rule.INTERVAL || rule.INTERVAL === "1")) {
          const until = rule.UNTIL ? parseDateTime(rule.UNTIL, "") : null;
          const names = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
          const days = rule.BYDAY ? rule.BYDAY.split(",").map((d) => names.indexOf(d) + 1) : null;
          // Ordinals ("1MO") and unknown day names are not guessed: the event is skipped and counted.
          if (days && (days.length === 0 || days.some((d) => d === 0))) {
            skipped++;
            continue;
          }
          weekly = { until: until?.date ?? null, count: rule.COUNT && /^\d{1,3}$/.test(rule.COUNT) ? Number(rule.COUNT) : null, days };
        } else {
          skipped++; // a rule we do not understand: do not guess
          continue;
        }
      }
      events.push({
        title: title.slice(0, 120),
        date: start.date,
        time: start.time,
        endTime: end && end.date === start.date ? end.time : null,
        description: done.DESCRIPTION ? unescapeIcsText(done.DESCRIPTION.value).trim().slice(0, 1000) || null : null,
        location: done.LOCATION ? unescapeIcsText(done.LOCATION.value).replace(/\s+/g, " ").trim().slice(0, 120) || null : null,
        weekly,
      });
    } else if (current) {
      const colon = line.indexOf(":");
      if (colon < 1) continue;
      const [name, ...params] = line.slice(0, colon).split(";");
      const key = name!.toUpperCase();
      if (!(key in current)) current[key] = { value: line.slice(colon + 1), params: params.join(";") };
    }
  }
  return { events, skipped };
}
