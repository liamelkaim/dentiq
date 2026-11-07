// Download of the signed-in student's own saved tutor conversations (JSON). Owner only; never cached.
import { getDb } from "@/db/client";
import { getCurrentUser } from "@/server/auth/session";
import { checkRate } from "@/server/rate-limit/guard";
import { RATE_ACCOUNT_EXPORT } from "@/server/rate-limit/limits";
import { contentDisposition } from "@/server/resources/files";
import { exportConversations } from "@/server/tutor/conversations";

export async function GET() {
  const viewer = await getCurrentUser();
  if (!viewer) return new Response(null, { status: 401 });
  if (!(await checkRate(RATE_ACCOUNT_EXPORT, viewer.id)).allowed) return new Response(null, { status: 429, headers: { "Cache-Control": "private, no-store" } });
  const { filename, json } = await exportConversations(getDb(), viewer.id);
  return new Response(json, { headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": contentDisposition(filename, false), "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
