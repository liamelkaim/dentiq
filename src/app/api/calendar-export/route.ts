// Local file export of the signed-in student's OWN calendar entries as an .ics file. Pure text generated here from the
// student's rows: nothing is sent to any calendar service. The permission is checked on every request; nothing is
// cached or public.
import { getDb } from "@/db/client";
import { getCurrentUser } from "@/server/auth/session";
import { buildIcs } from "@/server/calendar/ics";
import { listEntries } from "@/server/calendar/service";
import { contentDisposition } from "@/server/resources/files";
import { canAccessLibrary } from "@/server/resources/service";
import { getTranslations } from "next-intl/server";

export async function GET() {
  const viewer = await getCurrentUser();
  if (!viewer) return new Response(null, { status: 401 });
  if (!canAccessLibrary(viewer)) return new Response(null, { status: 403 });

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
