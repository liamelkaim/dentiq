// Upload validation. The file type is decided from the file's actual bytes AND its extension —
// a renamed .exe or an HTML page called "notes.pdf" is rejected.
import { createHash } from "node:crypto";

export const MAX_FILE_BYTES = 25 * 1024 * 1024;

type FileType = { mime: string; extensions: string[]; signature: number[]; preview: "pdf" | "image" | null };

const ZIP = [0x50, 0x4b, 0x03, 0x04];

export const allowedFileTypes: FileType[] = [
  { mime: "application/pdf", extensions: ["pdf"], signature: [0x25, 0x50, 0x44, 0x46, 0x2d], preview: "pdf" },
  { mime: "image/png", extensions: ["png"], signature: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], preview: "image" },
  { mime: "image/jpeg", extensions: ["jpg", "jpeg"], signature: [0xff, 0xd8, 0xff], preview: "image" },
  {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    extensions: ["docx"],
    signature: ZIP,
    preview: null,
  },
  {
    mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    extensions: ["pptx"],
    signature: ZIP,
    preview: null,
  },
];

export const ACCEPT_ATTRIBUTE = allowedFileTypes.flatMap((t) => t.extensions.map((e) => `.${e}`)).join(",");

function extensionOf(fileName: string): string {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

export function detectFileType(fileName: string, bytes: Uint8Array): FileType | null {
  const ext = extensionOf(fileName);
  return (
    allowedFileTypes.find(
      (type) => type.extensions.includes(ext) && type.signature.every((byte, i) => bytes[i] === byte),
    ) ?? null
  );
}

export function previewKind(mimeType: string): "pdf" | "image" | null {
  return allowedFileTypes.find((t) => t.mime === mimeType)?.preview ?? null;
}

/** Keeps a readable name for downloads: no folders, control characters or odd symbols. */
export function sanitizeFileName(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? "file";
  const cleaned = base
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f"<>:|?*]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const ext = extensionOf(cleaned);
  const stem = cleaned.slice(0, cleaned.length - ext.length - 1).slice(0, 120) || "document";
  return ext ? `${stem}.${ext}` : stem;
}

export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export type UploadCheck =
  | { ok: true; mime: string; fileName: string; hash: string }
  | { ok: false; error: "fileMissing" | "fileTooLarge" | "fileType" };

export function checkUpload(fileName: string, bytes: Uint8Array): UploadCheck {
  if (bytes.byteLength === 0) return { ok: false, error: "fileMissing" };
  if (bytes.byteLength > MAX_FILE_BYTES) return { ok: false, error: "fileTooLarge" };
  const type = detectFileType(fileName, bytes);
  if (!type) return { ok: false, error: "fileType" };
  return { ok: true, mime: type.mime, fileName: sanitizeFileName(fileName), hash: sha256(bytes) };
}

/** RFC 6266 Content-Disposition with a UTF-8 filename (accents survive) and an ASCII fallback. */
export function contentDisposition(fileName: string, inline: boolean): string {
  const ascii = fileName.normalize("NFD").replace(/[^\x20-\x7e]/g, "").replace(/["\\]/g, "") || "document";
  return `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
