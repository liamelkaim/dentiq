// Intake step 1: what kind of file is this? Decided from the extension AND the first bytes, never from the extension alone.
export type FileKind = "text" | "markdown" | "csv" | "docx" | "pdf" | "image" | "unknown";

const startsWith = (b: Uint8Array, sig: number[]) => sig.every((v, i) => b[i] === v);

export function detectKind(name: string, bytes: Uint8Array): FileKind {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) return "pdf";
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) return ext === "docx" ? "docx" : "unknown";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47]) || startsWith(bytes, [0xff, 0xd8, 0xff])) return "image";
  if (["txt", "md", "markdown", "csv", "tsv"].includes(ext)) {
    // A text extension on binary content (NUL bytes) is not text.
    if (bytes.subarray(0, 4096).includes(0)) return "unknown";
    return ext === "md" || ext === "markdown" ? "markdown" : ext === "csv" || ext === "tsv" ? "csv" : "text";
  }
  return "unknown";
}
