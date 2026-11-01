// Uploads live in /api/uploads, not in server actions, so the global server-action body limit can stay small.
// Fake data only.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeUploadAction } from "@/lib/upload-client";
import { FORM_OVERHEAD_BYTES, readLimitedFormData } from "@/server/uploads/read-body";

const root = process.cwd();
const read = (...parts: string[]) => readFileSync(join(root, ...parts), "utf8");

/** A multipart body as plain bytes, so the same upload can be sent more than once. */
async function multipartBytes(parts: Record<string, string | File>) {
  const form = new FormData();
  for (const [k, v] of Object.entries(parts)) form.set(k, v);
  const response = new Response(form);
  return { bytes: new Uint8Array(await response.arrayBuffer()), contentType: response.headers.get("content-type")! };
}
const post = (bytes: Uint8Array, contentType: string, headers: Record<string, string> = {}) =>
  new Request("http://localhost:3000/api/uploads/resource", { method: "POST", headers: { "content-type": contentType, ...headers }, body: bytes as BodyInit });

describe("readLimitedFormData", () => {
  it("reads a normal upload with its file and fields", async () => {
    const { bytes, contentType } = await multipartBytes({ title: "TEST notes", file: new File([new Uint8Array(1000)], "a.pdf", { type: "application/pdf" }) });
    const result = await readLimitedFormData(post(bytes, contentType), 100_000);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.form.get("title")).toBe("TEST notes");
    expect((result.form.get("file") as File).size).toBe(1000);
  });

  it("refuses a body over the cap, by the declared size and by the bytes actually received", async () => {
    const { bytes, contentType } = await multipartBytes({ file: new File([new Uint8Array(50_000)], "big.pdf") });
    expect(await readLimitedFormData(post(bytes, contentType), 10_000)).toEqual({ ok: false, reason: "tooLarge" });
    // A lying Content-Length: the bytes are counted as they arrive.
    expect(await readLimitedFormData(post(bytes, contentType, { "content-length": "10" }), 10_000)).toEqual({ ok: false, reason: "tooLarge" });
  });

  it("accepts a body exactly at the cap and refuses one byte more", async () => {
    const { bytes, contentType } = await multipartBytes({ file: new File([new Uint8Array(2000)], "a.pdf") });
    expect((await readLimitedFormData(post(bytes, contentType), bytes.byteLength)).ok).toBe(true);
    expect(await readLimitedFormData(post(bytes, contentType), bytes.byteLength - 1)).toEqual({ ok: false, reason: "tooLarge" });
  });

  it("refuses anything that is not multipart form data", async () => {
    const json = new Request("http://localhost:3000/api/uploads/resource", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    expect(await readLimitedFormData(json, 10_000)).toEqual({ ok: false, reason: "invalid" });
    const broken = new Request("http://localhost:3000/api/uploads/resource", { method: "POST", headers: { "content-type": "multipart/form-data; boundary=x" }, body: "not multipart" });
    expect(await readLimitedFormData(broken, 10_000)).toEqual({ ok: false, reason: "invalid" });
  });

  it("leaves room for the text fields of a form", () => {
    expect(FORM_OVERHEAD_BYTES).toBeGreaterThanOrEqual(256 * 1024);
  });
});

describe("body limits", () => {
  it("server actions are capped at 2 MB or less; uploads no longer ride on them", () => {
    const config = read("next.config.ts");
    const limit = config.match(/bodySizeLimit:\s*"(\d+)mb"/);
    expect(limit).not.toBeNull();
    expect(Number(limit![1])).toBeLessThanOrEqual(2);
    // The CSV import (1 MB) still fits through a server action.
    expect(Number(limit![1])).toBeGreaterThanOrEqual(2);
  });

  it("no server action reads an uploaded document or question image any more", () => {
    expect(read("src", "server", "resources", "actions.ts")).not.toMatch(/uploadResourceAction|addVersionAction/);
    expect(read("src", "server", "passes", "actions.ts")).not.toMatch(/submitQuestionAction|editQuestionAction|parseImages/);
  });

  it("the forms post files to /api/uploads through the shared client", () => {
    const resourceForms = read("src", "components", "resource-forms.tsx");
    expect(resourceForms).toContain('makeUploadAction<ResourceFormState>("resource"');
    expect(resourceForms).toContain('makeUploadAction<ResourceFormState>("resource-version"');
    const passForms = read("src", "components", "pass-forms.tsx");
    expect(passForms).toContain('makeUploadAction<PassFormState>("question"');
    expect(passForms).toContain('makeUploadAction<PassFormState>("question-edit"');
  });

  it("the upload route checks the session and the origin before it reads the body, and caps each kind", () => {
    const route = read("src", "app", "api", "uploads", "[kind]", "route.ts");
    expect(route.indexOf("getCurrentUser()")).toBeGreaterThan(-1);
    expect(route.indexOf("getCurrentUser()")).toBeLessThan(route.indexOf("readLimitedFormData(request"));
    expect(route.indexOf("origin")).toBeLessThan(route.indexOf("readLimitedFormData(request"));
    expect(route).toContain("413");
    const kinds = read("src", "server", "uploads", "kinds.ts");
    for (const name of ['resource:', '"resource-version":', 'question:', '"question-edit":']) expect(kinds).toContain(name);
    expect(kinds).toContain("getMaxFileBytes() + FORM_OVERHEAD_BYTES");
  });
});

describe("upload client", () => {
  type S = { status: string; message?: string };
  const fallback: { tooLarge: S; failed: S } = { tooLarge: { status: "error", message: "too-large" }, failed: { status: "error", message: "failed" } };
  const idle: S = { status: "idle" };
  const makeAction = (kind: string) => makeUploadAction<S>(kind, fallback);
  const assign = vi.fn();

  afterEach(() => {
    vi.unstubAllGlobals();
    assign.mockReset();
  });

  function stub(response: Response | Error) {
    vi.stubGlobal("window", { location: { assign } });
    vi.stubGlobal("fetch", vi.fn(async () => (response instanceof Error ? Promise.reject(response) : response)));
  }

  it("shows the state the server answered with", async () => {
    stub(Response.json({ state: { status: "error", message: "errors.uploadType" } }));
    expect(await makeAction("resource")(idle, new FormData())).toEqual({ status: "error", message: "errors.uploadType" });
    expect(assign).not.toHaveBeenCalled();
  });

  it("shows a friendly message when the body is over the limit (413), even without a readable answer", async () => {
    stub(new Response("Payload Too Large", { status: 413 }));
    expect(await makeAction("resource")(idle, new FormData())).toEqual(fallback.tooLarge);
    stub(Response.json({ state: { status: "error", message: "errors.uploadTooLarge" } }, { status: 413 }));
    expect(await makeAction("resource")(idle, new FormData())).toEqual({ status: "error", message: "errors.uploadTooLarge" });
  });

  it("shows a generic failure when offline or when the server breaks", async () => {
    stub(new Error("network down"));
    expect(await makeAction("resource")(idle, new FormData())).toEqual(fallback.failed);
    stub(new Response("oops", { status: 500 }));
    expect(await makeAction("resource")(idle, new FormData())).toEqual(fallback.failed);
  });

  it("follows a same-site redirect with a full page load and stays 'sending' meanwhile", async () => {
    stub(Response.json({ state: { status: "success" }, redirectTo: "/resources/abc" }));
    const result = await Promise.race([makeAction("resource")(idle, new FormData()), new Promise((r) => setTimeout(() => r("still-sending"), 50))]);
    expect(result).toBe("still-sending");
    expect(assign).toHaveBeenCalledWith("/resources/abc");
  });

  it("never follows an off-site redirect", async () => {
    for (const redirectTo of ["https://evil.example.com/", "//evil.example.com/"]) {
      stub(Response.json({ state: { status: "success" }, redirectTo }));
      await makeAction("resource")(idle, new FormData());
    }
    expect(assign).not.toHaveBeenCalled();
  });
});
