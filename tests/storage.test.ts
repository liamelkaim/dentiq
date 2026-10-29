import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkUpload, contentDisposition, detectFileType, MAX_FILE_BYTES, previewKind, sanitizeFileName } from "@/server/resources/files";
import { createLocalStorage } from "@/server/storage";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "dentos-storage-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("local storage", () => {
  it("writes, reads and deletes files with owner-only permissions", async () => {
    const storage = createLocalStorage(root);
    await storage.put("resources/abc-123", new Uint8Array([1, 2, 3]));
    expect(await storage.get("resources/abc-123")).toEqual(new Uint8Array([1, 2, 3]));
    const mode = (await stat(path.join(root, "resources/abc-123"))).mode & 0o777;
    expect(mode).toBe(0o600);
    await storage.delete("resources/abc-123");
    expect(await storage.get("resources/abc-123")).toBeNull();
  });

  it("never overwrites an existing file", async () => {
    const storage = createLocalStorage(root);
    await storage.put("resources/one", new Uint8Array([1]));
    await expect(storage.put("resources/one", new Uint8Array([2]))).rejects.toThrow();
  });

  it("rejects keys that could escape the storage folder", async () => {
    const storage = createLocalStorage(root);
    for (const key of ["../secret", "resources/../../etc/passwd", "/etc/passwd", "resources/A", "resources"]) {
      await expect(storage.put(key, new Uint8Array([1]))).rejects.toThrow(/Invalid storage key/);
    }
    expect(await readdir(root)).toEqual([]);
  });
});

describe("file checks", () => {
  const bytes = (s: string) => new TextEncoder().encode(s);

  it("accepts real PDFs, images and Office files by content and extension", () => {
    expect(detectFileType("a.pdf", bytes("%PDF-1.7"))?.mime).toBe("application/pdf");
    expect(detectFileType("a.PNG", new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))?.mime).toBe("image/png");
    expect(detectFileType("a.jpeg", new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))?.mime).toBe("image/jpeg");
    expect(detectFileType("a.docx", new Uint8Array([0x50, 0x4b, 0x03, 0x04]))?.preview).toBeNull();
  });

  it("rejects mismatches and unsupported types", () => {
    expect(detectFileType("a.pdf", bytes("<html>"))).toBeNull();
    expect(detectFileType("a.html", bytes("%PDF-1.7"))).toBeNull();
    expect(detectFileType("a.zip", new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toBeNull();
    expect(detectFileType("a.svg", bytes("<svg>"))).toBeNull();
  });

  it("enforces the size limit", () => {
    const big = new Uint8Array(MAX_FILE_BYTES + 1);
    big.set(bytes("%PDF-"));
    expect(checkUpload("big.pdf", big)).toEqual({ ok: false, error: "fileTooLarge" });
  });

  it("only previews PDFs and images", () => {
    expect(previewKind("application/pdf")).toBe("pdf");
    expect(previewKind("image/png")).toBe("image");
    expect(previewKind("application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBeNull();
  });

  it("cleans file names and encodes download headers safely", () => {
    expect(sanitizeFileName("../../etc/Notes \u0000de cours\".pdf")).toBe("Notes de cours.pdf");
    expect(sanitizeFileName("C:\\Users\\x\\Plan été.pdf")).toBe("Plan été.pdf");
    const header = contentDisposition("Plan été.pdf", false);
    expect(header).toBe(`attachment; filename="Plan ete.pdf"; filename*=UTF-8''Plan%20%C3%A9t%C3%A9.pdf`);
    expect(contentDisposition("a.pdf", true)).toMatch(/^inline;/);
  });
});
