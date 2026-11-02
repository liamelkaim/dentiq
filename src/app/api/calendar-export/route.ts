// Local file export of the signed-in student's OWN calendar entries as an .ics file. Pure text generated here from the
// student's rows: nothing is sent to any calendar service. The permission is checked on every request; nothing is
// cached or public.
import { getDb } from "@/db/client";
import { textError } from "@/server/api-errors";
import { getCurrentUser } from "@/server/auth/session";
import { buildClassBlocksIcs, buildIcs } from "@/server/calendar/ics";
import { listClassBlocks, loadTermData } from "@/server/calendar/schedule-service";
import { listEntries } from "@/server/calendar/service";
import { checkRate } from "@/server/rate-limit/guard";
import { RATE_CALENDAR_EXPORT } from "@/server/rate-limit/limits";
import { contentDisposition } from "@/server/resources/files";
import { canAccessLibrary } from "@/server/resources/service";
import { getTranslations } from "next-intl/server";

export async function GET(request: Request) {
  const viewer = await getCurrentUser();
  if (!viewer) return new Response(null, { status: 401 });
  if (!canAccessLibrary(viewer)) return new Response(null, { status: 403 });

  const rate = await checkRate(RATE_CALENDAR_EXPORT, viewer.id);
  if (!rate.allowed) return textError("tooManyRequests", 429, { "Cache-Control": "private, no-store", "Retry-After": String(rate.retryAfterSeconds) });

  if (new URL(request.url).searchParams.get("classes") === "1") {
    const db = getDb();
    const blocks = await listClassBlocks(db, viewer);
    const from = blocks.reduce((m, b) => (b.validFrom < m ? b.validFrom : m), "9999-12-31");
    const to = blocks.reduce((m, b) => (b.validTo > m ? b.validTo : m), "0000-01-01");
    const { periods } = blocks.length ? await loadTermData(db, viewer, from, to) : { periods: [] };
    return new Response(buildClassBlocksIcs(blocks, periods), {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": contentDisposition("dentiq-classes.ics", false),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  const entries = await listEntries(getDb(), viewer);
  const kinds = await getTranslations("calendar.kinds");
  const body = buildIcs(
    entries.map((e) => ({ id: e.id, title: e.title, date: e.date, time: e.time, kind: e.kind, note: e.note, courseCode: e.courseCode })),
    { kindLabels: { exam: kinds("exam"), assignment: kinds("assignment"), study_session: kinds("study_session"), other: kinds("other") } },
  );
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": contentDisposition("dentiq-calendar.ics", false),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
