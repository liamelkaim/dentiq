// The only way to read an uploaded file. Checks the signed-in user's permission on every request;
// files are never reachable through a public URL.
import { getDb } from "@/db/client";
import { getCurrentUser } from "@/server/auth/session";
import { contentDisposition, previewKind } from "@/server/resources/files";
import { getDownload } from "@/server/resources/service";
import { getStorage } from "@/server/storage";

export async function GET(request: Request, { params }: { params: Promise<{ versionId: string }> }) {
  const viewer = await getCurrentUser();
  if (!viewer) return new Response(null, { status: 401 });

  const file = await getDownload(getDb(), viewer, (await params).versionId);
  if (!file) return new Response(null, { status: 404 });

  const bytes = await getStorage().get(file.storageKey);
  if (!bytes) {
    console.error(`[DentOS] Missing stored file for key ${file.storageKey}`);
    return new Response(null, { status: 404 });
  }

  const preview = previewKind(file.mimeType);
  const inline = new URL(request.url).searchParams.get("inline") === "1" && preview !== null;

  return new Response(new Blob([bytes as BlobPart], { type: file.mimeType }), {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": contentDisposition(file.fileName, inline),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      // Previews may be framed by DentOS pages only. Chrome's PDF viewer doesn't work in a
      // sandboxed frame, so the sandbox applies to everything except PDFs.
      "X-Frame-Options": "SAMEORIGIN",
      "Content-Security-Policy":
        preview === "pdf" ? "frame-ancestors 'self'" : "default-src 'none'; img-src 'self'; frame-ancestors 'self'; sandbox",
    },
  });
}
