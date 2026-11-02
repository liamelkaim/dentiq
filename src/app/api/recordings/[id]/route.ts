// The only way to play a recording. Owner only, checked on every request; supports HTTP Range so the browser can seek
// and the player's speed control and scrubbing work. Never cached, never public.
import { getDb } from "@/db/client";
import { getCurrentUser } from "@/server/auth/session";
import { parseRange } from "@/server/recordings/range";
import { getRecordingFile } from "@/server/recordings/service";
import { getStorage } from "@/server/storage";

const HEADERS = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "Accept-Ranges": "bytes", "Content-Security-Policy": "default-src 'none'; sandbox" };

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getCurrentUser();
  if (!viewer) return new Response(null, { status: 401 });
  const file = await getRecordingFile(getDb(), viewer, (await params).id);
  if (!file) return new Response(null, { status: 404 });
  const bytes = await getStorage().get(file.storageKey);
  if (!bytes) return new Response(null, { status: 404 });

  const total = bytes.byteLength;
  const range = parseRange(request.headers.get("range"), total);
  if (range === "invalid") return new Response(null, { status: 416, headers: { ...HEADERS, "Content-Range": `bytes */${total}` } });
  if (range) {
    const { start, end } = range;
    return new Response(new Blob([bytes.subarray(start, end + 1) as BlobPart]), { status: 206, headers: { ...HEADERS, "Content-Type": file.mimeType, "Content-Length": String(end - start + 1), "Content-Range": `bytes ${start}-${end}/${total}` } });
  }
  return new Response(new Blob([bytes as BlobPart], { type: file.mimeType }), { headers: { ...HEADERS, "Content-Type": file.mimeType, "Content-Length": String(total) } });
}
