// Download of the signed-in student's own data as JSON. The session is checked here and buildAccountExport only reads
// rows that belong to that user. Never cached, never public.
import { getDb } from "@/db/client";
import { EXPORT_MAX_PER_HOUR } from "@/server/account/constants";
import { buildAccountExport } from "@/server/account/export";
import { allowAttempt } from "@/server/account/rate-limit";
import { textError } from "@/server/api-errors";
import { getCurrentUser } from "@/server/auth/session";
import { contentDisposition } from "@/server/resources/files";

const NO_STORE = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

export async function GET() {
  const viewer = await getCurrentUser();
  if (!viewer) return new Response(null, { status: 401, headers: NO_STORE });

  if (!allowAttempt(`export:${viewer.id}`, EXPORT_MAX_PER_HOUR, 60 * 60 * 1000)) {
    return textError("tooManyExports", 429, { ...NO_STORE, "Retry-After": "3600" });
  }

  const result = await buildAccountExport(getDb(), viewer.id);
  if (!result.ok) {
    return result.error === "tooLarge" ? textError("exportTooLarge", 413, NO_STORE) : textError("notFound", 404, NO_STORE);
  }
  return new Response(result.value.json, {
    headers: {
      ...NO_STORE,
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": contentDisposition(result.value.filename, false),
    },
  });
}
