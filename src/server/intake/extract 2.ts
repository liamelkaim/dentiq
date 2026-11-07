// Intake step 2: text out of a file, locally. Plain text and Markdown are read as UTF-8; .docx is a zip whose
// word/document.xml is read with node:zlib (no library, no network). PDFs and images are NOT read here: they are
// reported as "needs a person" so nothing is guessed (no OCR service is ever called).
import { inflateRawSync } from "node:zlib";
import type { FileKind } from "./detect";

export type Extraction = { ok: true; text: string } | { ok: false; reason: "needsManual" | "unreadable" | "tooLarge" };

export const INTAKE_MAX_FILE_BYTES = 25 * 1024 * 1024;

/** Reads one entry of a zip file from its central directory. Returns null when it is missing or uses an unsupported method. */
export function readZipEntry(zip: Uint8Array, wanted: string): Uint8Array | null {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  for (let n = 0; n < count && p + 46 <= zip.length; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) return null;
    const method = view.getUint16(p + 10, true);
    const compressed = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const name = new TextDecoder().decode(zip.subarray(p + 46, p + 46 + nameLen));
    if (name === wanted) {
      const lNameLen = view.getUint16(local + 26, true);
      const lExtraLen = view.getUint16(local + 28, true);
      const start = local + 30 + lNameLen + lExtraLen;
      const data = zip.subarray(start, start + compressed);
      if (method === 0) return data;
      if (method === 8) {
        try {
          return inflateRawSync(data, { maxOutputLength: 50 * 1024 * 1024 });
        } catch {
          return null;
        }
      }
      return null;
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

const entities: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" };

/** Paragraphs of a word/document.xml, one per line; tabs and line breaks kept, every other tag dropped. */
export function docxXmlToText(xml: string): string {
  return xml
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<w:br\/>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(amp|lt|gt|quot|apos);/g, (m) => entities[m] ?? m)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function extractText(kind: FileKind, bytes: Uint8Array): Extraction {
  if (bytes.length > INTAKE_MAX_FILE_BYTES) return { ok: false, reason: "tooLarge" };
  if (kind === "text" || kind === "markdown" || kind === "csv") return { ok: true, text: new TextDecoder("utf-8").decode(bytes).replace(/\r\n?/g, "\n") };
  if (kind === "docx") {
    const xml = readZipEntry(bytes, "word/document.xml");
    return xml ? { ok: true, text: docxXmlToText(new TextDecoder().decode(xml)) } : { ok: false, reason: "unreadable" };
  }
  return { ok: false, reason: "needsManual" };
}
