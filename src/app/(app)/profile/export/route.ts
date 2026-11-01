// Download of the signed-in student's own data as JSON. The session is checked here and buildAccountExport only reads
// rows that belong to that user. Never cached, never public.
import { getDb } from "@/db/client";
import { buildAccountExport } from "@/server/account/export";
import { textError } from "@/server/api-errors";
import { getCurrentUser } from "@/server/auth/session";
import { checkRate } from "@/server/rate-limit/guard";
import { RATE_ACCOUNT_EXPORT } from "@/server/rate-limit/limits";
import { contentDisposition } from "@/server/resources/files";

const NO_STORE = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

export async function GET() {
  const viewer = await getCurrentUser();
  if (!viewer) return new Response(null, { status: 401, headers: NO_STORE });

  const rate = await checkRate(RATE_ACCOUNT_EXPORT, viewer.id);
  if (!rate.allowed) return textError("tooManyExports", 429, { ...NO_STORE, "Retry-After": String(rate.retryAfterSeconds) });

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
