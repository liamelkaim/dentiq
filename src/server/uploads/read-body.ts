// Reads a multipart upload with a hard size cap that does not trust the Content-Length header: bytes are counted as they
// arrive and the read stops the moment the cap is passed, so an oversized or endless body never fills memory.

/** Room for the text fields of an upload form (titles, notes, choices) on top of its files. */
export const FORM_OVERHEAD_BYTES = 512 * 1024;

export type LimitedForm = { ok: true; form: FormData } | { ok: false; reason: "tooLarge" | "invalid" };

export async function readLimitedFormData(request: Request, maxBytes: number): Promise<LimitedForm> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) return { ok: false, reason: "invalid" };

  // A declared size over the cap is refused without reading anything.
  const declared = request.headers.get("content-length");
  if (declared !== null && Number(declared) > maxBytes) return { ok: false, reason: "tooLarge" };
  if (!request.body) return { ok: false, reason: "invalid" };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return { ok: false, reason: "tooLarge" };
    }
    chunks.push(value);
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return { ok: true, form: await new Response(body, { headers: { "content-type": contentType } }).formData() };
  } catch {
    return { ok: false, reason: "invalid" };
  }
}
