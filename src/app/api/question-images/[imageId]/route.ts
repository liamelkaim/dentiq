// The only way to read an image attached to an exam question. Checks the signed-in user's permission on every
// request, exactly like /api/files; images are never reachable through a public URL.
import { getDb } from "@/db/client";
import { getCurrentUser } from "@/server/auth/session";
import { getQuestionImageDownload } from "@/server/passes/service";
import { contentDisposition } from "@/server/resources/files";
import { getStorage } from "@/server/storage";

export async function GET(_request: Request, { params }: { params: Promise<{ imageId: string }> }) {
  const viewer = await getCurrentUser();
  if (!viewer) return new Response(null, { status: 401 });

  const image = await getQuestionImageDownload(getDb(), viewer, (await params).imageId);
  if (!image) return new Response(null, { status: 404 });

  const storage = getStorage();
  const stream = storage.getStream ? await storage.getStream(image.storageKey) : null;
  const bytes = storage.getStream ? null : await storage.get(image.storageKey);
  if (!stream && !bytes) {
    console.error(`[Dentiq] Missing stored image for key ${image.storageKey}`);
    return new Response(null, { status: 404 });
  }

  return new Response(stream ?? new Blob([bytes as BlobPart], { type: image.mimeType }), {
    headers: {
      "Content-Type": image.mimeType,
      "Content-Length": String(image.sizeBytes),
      "Content-Disposition": contentDisposition(image.fileName, true),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "X-Frame-Options": "SAMEORIGIN",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; frame-ancestors 'self'; sandbox",
    },
  });
}
