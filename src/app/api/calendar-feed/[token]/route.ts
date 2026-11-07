// Read-only subscription feed of ONE student's own calendar entries, opened by calendar apps that cannot sign in. The
// secret token in the address is the credential: unknown, revoked or malformed tokens all answer the same 404.
import { getDb } from "@/db/client";
import { buildIcs } from "@/server/calendar/ics";
import { resolveFeed } from "@/server/calendar/feed";
import { listEntries } from "@/server/calendar/service";
import { checkRate } from "@/server/rate-limit/guard";
import { RATE_CALENDAR_FEED } from "@/server/rate-limit/limits";
import { canAccessLibrary } from "@/server/resources/service";
import { getTranslations } from "next-intl/server";

const HEADERS = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex" };

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const db = getDb();
  const viewer = await resolveFeed(db, (await params).token);
  if (!viewer || !canAccessLibrary(viewer)) return new Response(null, { status: 404, headers: HEADERS });
  const rate = await checkRate(RATE_CALENDAR_FEED, viewer.id);
  if (!rate.allowed) return new Response(null, { status: 429, headers: { ...HEADERS, "Retry-After": String(rate.retryAfterSeconds) } });

  const entries = await listEntries(db, viewer);
  const kinds = await getTranslations("calendar.kinds");
  const body = buildIcs(
    entries.map((e) => ({ id: e.id, title: e.title, date: e.date, time: e.time, kind: e.kind, note: e.note, courseCode: e.courseCode })),
    { kindLabels: { exam: kinds("exam"), assignment: kinds("assignment"), study_session: kinds("study_session"), other: kinds("other") } },
  );
  return new Response(body, { headers: { ...HEADERS, "Content-Type": "text/calendar; charset=utf-8" } });
}
