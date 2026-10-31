// Private Vercel Blob adapter. Authorization remains in the file route/service.
import type { FileStorage } from "./storage";
import { assertValidKey } from "./storage";

type BlobClient = {
  put(path: string, body: Uint8Array, options: { access: "private"; token: string; addRandomSuffix: boolean; allowOverwrite: boolean; contentType: string }): Promise<unknown>;
  get(path: string, options: { access: "private"; token: string }): Promise<{ statusCode: number; stream: ReadableStream<Uint8Array> | null } | null>;
  del(path: string, options: { token: string }): Promise<unknown>;
};

export function createBlobStorage(token: string, client?: BlobClient): FileStorage {
  if (!token) throw new Error("BLOB_READ_WRITE_TOKEN is required");
  const sdk = async (): Promise<BlobClient> => {
    if (client) return client;
    const blob = await import("@vercel/blob");
    return {
      put: (key, data, options) => blob.put(key, Buffer.from(data), options),
      get: (key, options) => blob.get(key, options),
      del: (key, options) => blob.del(key, options),
    };
  };
  const stream = async (key: string) => {
    assertValidKey(key);
    const result = await (await sdk()).get(key, { access: "private", token });
    if (!result) return null;
    if (result.statusCode !== 200 || !result.stream) throw new Error("Unexpected private storage response");
    return result.stream;
  };
  return {
    async put(key, data) {
      assertValidKey(key);
      await (await sdk()).put(key, data, {
        access: "private", token, addRandomSuffix: false, allowOverwrite: false,
        contentType: "application/octet-stream",
      });
    },
    async get(key) {
      const body = await stream(key);
      return body ? new Uint8Array(await new Response(body).arrayBuffer()) : null;
    },
    getStream: stream,
    async delete(key) {
      assertValidKey(key);
      await (await sdk()).del(key, { token });
    },
  };
}
