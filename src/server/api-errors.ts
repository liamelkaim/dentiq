// Plain-text error bodies for download routes, in the visitor's language (the same cookie / Accept-Language rule as
// the pages). Keys live under "apiErrors" in src/messages/{fr,en}.json.
import { getTranslations } from "next-intl/server";

export type ApiErrorKey = "tooManyExports" | "tooManyRequests" | "exportTooLarge" | "notFound" | "unknownExport" | "unknownFormat";

export async function textError(key: ApiErrorKey, status: number, headers: Record<string, string> = {}): Promise<Response> {
  const t = await getTranslations("apiErrors");
  return new Response(t(key), { status, headers: { "Content-Type": "text/plain; charset=utf-8", ...headers } });
}
