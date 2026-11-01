// Downloads for the study tools (CSV, TSV, Anki text). The signed-in user's permission is checked here and again in
// buildExport, which only ever reads published questions the user may study plus the user's OWN cards and progress.
// Nothing is cached or public.
import { getDb } from "@/db/client";
import { textError } from "@/server/api-errors";
import { getCurrentUser } from "@/server/auth/session";
import { checkRate } from "@/server/rate-limit/guard";
import { RATE_STUDY_EXPORT } from "@/server/rate-limit/limits";
import { contentDisposition } from "@/server/resources/files";
import { canAccessLibrary } from "@/server/resources/service";
import { loadCardLabels } from "@/server/study/card-labels";
import { buildExport, exportFormats, exportKinds, type ExportFormat, type ExportKind } from "@/server/study/export";
import { parseStudyScope } from "@/server/study/scope";

export async function GET(request: Request) {
  const viewer = await getCurrentUser();
  if (!viewer) return new Response(null, { status: 401 });
  if (!canAccessLibrary(viewer)) return new Response(null, { status: 403 });

  const params = new URL(request.url).searchParams;
  const kind = params.get("kind");
  const format = params.get("format") ?? "csv";
  if (!kind || !(exportKinds as readonly string[]).includes(kind)) return textError("unknownExport", 400, { "Cache-Control": "private, no-store" });
  if (!(exportFormats as readonly string[]).includes(format)) return textError("unknownFormat", 400, { "Cache-Control": "private, no-store" });

  const rate = await checkRate(RATE_STUDY_EXPORT, viewer.id);
  if (!rate.allowed) return textError("tooManyRequests", 429, { "Cache-Control": "private, no-store", "Retry-After": String(rate.retryAfterSeconds) });

  const result = await buildExport(
    getDb(),
    viewer,
    { kind: kind as ExportKind, format: format as ExportFormat, scope: parseStudyScope(Object.fromEntries(params)) },
    await loadCardLabels(),
  );
  if (!result.ok) return new Response(null, { status: 403 });

  return new Response(result.value.body, {
    headers: {
      "Content-Type": result.value.contentType,
      "Content-Disposition": contentDisposition(result.value.filename, false),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
